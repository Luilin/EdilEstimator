import { Project } from '../types';
import { getCurrentUser } from './auth';
import {
  STORE_PROJECTS,
  STORE_SYNC_QUEUE,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
} from './idb';
import { supabase } from './supabase';
import * as localProjects from './localProjects';

/**
 * Archivio progetti su Supabase (Postgres).
 *
 * - I progetti vivono nella tabella `projects` (payload completo in jsonb,
 *   colonne indicizzate per query e RLS).
 * - La condivisione per email usa la tabella `project_members`.
 * - IndexedDB resta la cache locale: si può lavorare offline e le modifiche
 *   vengono inviate appena torna la connessione (coda persistente).
 */

interface ProjectRow {
  id: string;
  owner_id: string;
  owner_email: string | null;
  name: string;
  last_modified: number | string | null;
  payload: Project | null;
}

interface SyncQueueEntry {
  projectId: string;
  op: 'upsert' | 'delete';
  queuedAt: number;
}

const requireClient = () => {
  if (!supabase) throw new Error('Supabase non configurato.');
  return supabase;
};

const toProject = (row: ProjectRow): Project => {
  const base = (row.payload || {}) as Project;
  return {
    ...base,
    id: row.id,
    userId: row.owner_id,
    lastModified: Number(row.last_modified) || base.lastModified || 0,
  };
};

export async function fetchRemoteProjects(): Promise<Project[]> {
  const client = requireClient();
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  // Le policy RLS restituiscono solo i progetti dell'utente e quelli condivisi.
  const { data, error } = await client
    .from('projects')
    .select('id, owner_id, owner_email, name, last_modified, payload')
    .order('last_modified', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as ProjectRow[] | null || []).map(toProject);
}

export async function upsertRemoteProject(project: Project): Promise<void> {
  const client = requireClient();
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const ownerId = project.userId || user.uid;

  const { error } = await client.from('projects').upsert(
    {
      id: project.id,
      owner_id: ownerId,
      owner_email: user.email || null,
      name: project.name,
      last_modified: project.lastModified,
      payload: project,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);

  // I membri possono essere gestiti solo dal proprietario del progetto.
  if (ownerId === user.uid) {
    const emails = Array.from(
      new Set(
        (project.sharedWithEmails || [])
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    const { error: deleteError } = await client
      .from('project_members')
      .delete()
      .eq('project_id', project.id);
    if (deleteError) throw new Error(deleteError.message);

    if (emails.length > 0) {
      const { error: insertError } = await client
        .from('project_members')
        .insert(emails.map((email) => ({ project_id: project.id, email })));
      if (insertError) throw new Error(insertError.message);
    }
  }
}

export async function deleteRemoteProject(projectId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('projects').delete().eq('id', projectId);
  if (error) throw new Error(error.message);
}

async function cacheProjects(projects: Project[]): Promise<void> {
  for (const project of projects) {
    await idbPut(STORE_PROJECTS, JSON.parse(JSON.stringify(project)) as Project);
  }
}

export async function enqueueSync(projectId: string, op: 'upsert' | 'delete'): Promise<void> {
  const entry: SyncQueueEntry = { projectId, op, queuedAt: Date.now() };
  await idbPut(STORE_SYNC_QUEUE, entry);
}

/** Invia le modifiche rimaste in coda (dopo un periodo offline). */
export async function flushSyncQueue(): Promise<void> {
  if (!supabase) return;

  const entries = await idbGetAll<SyncQueueEntry>(STORE_SYNC_QUEUE);
  for (const entry of entries) {
    try {
      if (entry.op === 'delete') {
        await deleteRemoteProject(entry.projectId);
      } else {
        const project = await idbGet<Project>(STORE_PROJECTS, entry.projectId);
        if (project) await upsertRemoteProject(project);
      }
      await idbDelete(STORE_SYNC_QUEUE, entry.projectId);
    } catch (error) {
      // Probabilmente offline: si riprova al prossimo giro.
      console.warn('Sincronizzazione rimandata:', error);
      break;
    }
  }
}

export async function getProjectsWithCache(): Promise<{ data: Project[]; error: any }> {
  const user = getCurrentUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  await flushSyncQueue();

  try {
    const remote = await fetchRemoteProjects();

    // Primo collegamento al cloud: se il database è vuoto, carica i progetti
    // che esistono già in locale (una sola volta per utente).
    const migrationKey = `stimia_cloud_migrated_${user.uid}`;
    const alreadyMigrated = typeof window !== 'undefined'
      && window.localStorage.getItem(migrationKey) === '1';

    if (remote.length === 0 && !alreadyMigrated) {
      const cached = await localProjects.getProjects();
      if (cached.data.length === 0) {
        if (typeof window !== 'undefined') window.localStorage.setItem(migrationKey, '1');
      } else {
        const migrated: Project[] = [];
        let failed = false;
        for (const project of cached.data) {
          try {
            const clone = {
              ...(JSON.parse(JSON.stringify(project)) as Project),
              userId: user.uid,
            };
            await upsertRemoteProject(clone);
            await idbPut(STORE_PROJECTS, clone);
            migrated.push(clone);
          } catch (migrationError) {
            failed = true;
            console.warn('Migrazione progetto non riuscita:', project.id, migrationError);
          }
        }
        if (!failed) {
          if (typeof window !== 'undefined') window.localStorage.setItem(migrationKey, '1');
        }
        if (migrated.length > 0) {
          return { data: migrated, error: null };
        }
      }
    }

    await cacheProjects(remote);
    return { data: remote, error: null };
  } catch (error) {
    console.warn('Database cloud non raggiungibile, uso la cache locale.', error);
    const cached = await localProjects.getProjects();
    return { data: cached.data, error: null };
  }
}

export async function saveProjectWithCache(project: Project): Promise<void> {
  // Prima in locale (immediato e funziona offline)...
  await localProjects.saveProject(project);

  try {
    // ...poi sul database SQL.
    await upsertRemoteProject(project);
    await idbDelete(STORE_SYNC_QUEUE, project.id);
  } catch (error) {
    console.warn('Salvataggio sul cloud rimandato:', error);
    await enqueueSync(project.id, 'upsert');
  }
}

export async function deleteProjectWithCache(projectId: string): Promise<void> {
  await localProjects.deleteProject(projectId);

  try {
    await deleteRemoteProject(projectId);
    await idbDelete(STORE_SYNC_QUEUE, projectId);
  } catch (error) {
    console.warn('Cancellazione sul cloud rimandata:', error);
    await enqueueSync(projectId, 'delete');
  }
}
