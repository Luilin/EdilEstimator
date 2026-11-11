import { Project } from '../types';
import { getCurrentUser } from './auth';
import {
  STORE_PROJECTS,
  idbDelete,
  idbDeleteMany,
  idbGetAll,
  idbPut,
} from './idb';

/**
 * Archivio progetti per la modalità locale.
 * I dati sono salvati in IndexedDB (database del browser) e non più in
 * localStorage, così non c'è il limite di pochi MB e i prezzari grandi
 * possono convivere con i computi.
 */

/** Progetti salvati nel vecchio formato localStorage, da importare in IndexedDB. */
const LEGACY_PROJECTS_KEY = 'stimia_local_projects_v1';

let migrationPromise: Promise<void> | null = null;

function emailVariants(value: string): string[] {
  const trimmed = value.trim();
  return trimmed ? [trimmed, trimmed.toLowerCase()] : [];
}

function canSeeProject(project: Project, uid: string, email: string): boolean {
  if (project.userId === uid) return true;

  const userEmail = email.trim().toLowerCase();
  if (!userEmail) return false;

  if ((project.sharedWithEmails || []).some((e) => e.trim().toLowerCase() === userEmail)) {
    return true;
  }

  if (project.collaborators && Object.keys(project.collaborators).some((e) => e.toLowerCase() === userEmail)) {
    return true;
  }

  if (project.memberPermissions && Object.keys(project.memberPermissions).some((e) => e.toLowerCase() === userEmail)) {
    return true;
  }

  return false;
}

/** Migrazione una tantum dei vecchi progetti salvati in localStorage. */
async function migrateLegacyProjects(): Promise<void> {
  if (typeof window === 'undefined') return;

  let legacy: Project[] = [];
  try {
    const raw = window.localStorage.getItem(LEGACY_PROJECTS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    legacy = parsed as Project[];
  } catch (error) {
    console.warn('Impossibile leggere i progetti legacy da localStorage:', error);
    return;
  }

  if (legacy.length === 0) {
    window.localStorage.removeItem(LEGACY_PROJECTS_KEY);
    return;
  }

  const existing = await idbGetAll<Project>(STORE_PROJECTS);
  const existingIds = new Set(existing.map(project => project.id));

  for (const project of legacy) {
    if (!project || !project.id || existingIds.has(project.id)) continue;
    await idbPut(STORE_PROJECTS, project);
  }

  // Rimuove la copia solo dopo che tutti i progetti sono stati scritti.
  window.localStorage.removeItem(LEGACY_PROJECTS_KEY);
}

async function ensureReady(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyProjects().catch(error => {
      console.error('Migrazione progetti su IndexedDB non riuscita:', error);
    });
  }
  return migrationPromise;
}

export async function getProjects(): Promise<{ data: Project[]; error: any }> {
  const user = getCurrentUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  await ensureReady();
  const projects = (await idbGetAll<Project>(STORE_PROJECTS))
    .filter((project) => canSeeProject(project, user.uid, user.email))
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

  return { data: projects, error: null };
}

export async function saveProject(project: Project): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  await ensureReady();

  const createdByLower = (project.createdBy || '').toLowerCase();
  const userEmailLower = (user.email || '').toLowerCase();

  if (!project.userId || (userEmailLower && createdByLower === userEmailLower)) {
    project.userId = user.uid;
  }
  project.lastModified = Date.now();

  // Mantiene coerenti gli elenchi usati per la condivisione, come nella versione cloud.
  const emails = new Set<string>();
  (project.sharedWithEmails || []).forEach((email) => {
    emailVariants(email).forEach((value) => emails.add(value));
  });
  Object.keys(project.collaborators || {}).forEach((email) => {
    emailVariants(email).forEach((value) => emails.add(value));
  });
  Object.keys(project.memberPermissions || {}).forEach((email) => {
    emailVariants(email).forEach((value) => emails.add(value));
  });
  project.sharedWithEmails = Array.from(emails);

  const snapshot = JSON.parse(JSON.stringify(project)) as Project;
  await idbPut(STORE_PROJECTS, snapshot);
}

export async function deleteProject(projectId: string): Promise<void> {
  await ensureReady();
  await idbDelete(STORE_PROJECTS, projectId);
}

/** Utile per un pulsante "ripristina dati demo" o dalla console del browser. */
export async function clearLocalProjects(): Promise<void> {
  await ensureReady();
  const projects = await idbGetAll<Project>(STORE_PROJECTS);
  await idbDeleteMany(STORE_PROJECTS, projects.map(project => project.id));
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_PROJECTS_KEY);
  }
}
