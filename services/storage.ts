
import { Project, WBSNode } from '../types';
import { db, handleFirestoreError, OperationType, auth } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { LOCAL_MODE, SUPABASE_MODE } from './mode';
import * as localProjects from './localProjects';
import * as supabaseProjects from './supabaseProjects';

const safeJsonParse = <T>(val: unknown, fallback: T): T => {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val as T;
  try {
    return JSON.parse(val);
  } catch (e) {
    console.warn("safeJsonParse error:", e);
    return fallback;
  }
};

const createDefaultRootWBS = (projectName: string): WBSNode => ({
  id: 'root',
  code: '',
  name: projectName || 'Progetto',
  level: 0,
  children: [],
  items: []
});

// Campi gerarchici/strutturati serializzati in JSON su Firestore.
const JSON_FIELDS = [
  'rootWBS',
  'priceBooks',
  'sals',
  'collaborators',
  'memberPermissions',
  'contractorDetails',
  'offers',
  'offerComparisonSettings',
  'schedule',
  'variants',
  'quadroEconomico',
  'cloudFolderUrl',
  'rfqRequests',
  'suppliers',
  'signatures',
  'invoiceSettings',
] as const;

const hydrateProject = (id: string, d: Record<string, any>): Project => {
  const parsedRoot = safeJsonParse<WBSNode | null>(d.rootWBS, null);
  return {
    ...d,
    id,
    rootWBS: parsedRoot && typeof parsedRoot === 'object' ? parsedRoot : createDefaultRootWBS(d.name),
    priceBooks: safeJsonParse(d.priceBooks, d.priceBooks || null),
    sals: safeJsonParse(d.sals, d.sals || null),
    collaborators: safeJsonParse(d.collaborators, d.collaborators || null),
    memberPermissions: safeJsonParse(d.memberPermissions, d.memberPermissions || null),
    contractorDetails: safeJsonParse(d.contractorDetails, d.contractorDetails || null),
    offers: safeJsonParse(d.offers, d.offers || null),
    offerComparisonSettings: safeJsonParse(d.offerComparisonSettings, d.offerComparisonSettings || null),
    schedule: safeJsonParse(d.schedule, d.schedule || null),
    variants: safeJsonParse(d.variants, d.variants || null),
    quadroEconomico: safeJsonParse(d.quadroEconomico, d.quadroEconomico || null),
    cloudFolderUrl: safeJsonParse(d.cloudFolderUrl, d.cloudFolderUrl || null),
    rfqRequests: safeJsonParse(d.rfqRequests, d.rfqRequests || null),
    suppliers: safeJsonParse(d.suppliers, d.suppliers || null),
    signatures: safeJsonParse(d.signatures, d.signatures || null),
    invoiceSettings: safeJsonParse(d.invoiceSettings, d.invoiceSettings || null),
  } as Project;
};

export const getProjects = async (): Promise<{ data: Project[], error: any }> => {
  if (SUPABASE_MODE) return supabaseProjects.getProjectsWithCache();
  if (LOCAL_MODE) return localProjects.getProjects();

  try {
    const userId = auth.currentUser?.uid;
    const userEmail = auth.currentUser?.email;
    if (!userId) return { data: [], error: 'Not authenticated' };

    const projectsRef = collection(db, 'projects');
    
    // First query: projects owned by the user
    const q1 = query(projectsRef, where('userId', '==', userId));
    const snapshot1 = await getDocs(q1);
    const projects: Project[] = snapshot1.docs.map(doc => hydrateProject(doc.id, doc.data()));
    
    // Second query: projects shared with the user
    if (userEmail) {
      try {
        // Query using both exact case and lowercase to prevent casing mismatches in Firestore search
        const emailsToQuery = Array.from(new Set([userEmail.trim(), userEmail.trim().toLowerCase()]));
        
        const snapshots = await Promise.all(
          emailsToQuery.map(email => 
            getDocs(query(projectsRef, where('sharedWithEmails', 'array-contains', email)))
          )
        );
        
        const existingIds = new Set(projects.map(p => p.id));
        snapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            if (!existingIds.has(doc.id)) {
              existingIds.add(doc.id);
              projects.push(hydrateProject(doc.id, doc.data()));
            }
          });
        });
      } catch (e) {
        console.warn("Could not fetch shared projects", e);
      }
    }
    
    // Sort by last modified descending
    projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    
    return { data: projects, error: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'projects');
    return { data: [], error: "Errore nel caricamento dei progetti" };
  }
};

export const saveProject = async (project: Project): Promise<void> => {
  if (SUPABASE_MODE) return supabaseProjects.saveProjectWithCache(project);
  if (LOCAL_MODE) return localProjects.saveProject(project);

  try {
    const userId = auth.currentUser?.uid;
    const userEmail = auth.currentUser?.email;
    if (!userId) throw new Error('Not authenticated');

    const createdByLower = (project.createdBy || '').toLowerCase();
    const userEmailLower = (userEmail || '').toLowerCase();

    if (!project.userId || (userEmailLower && createdByLower === userEmailLower)) {
      project.userId = userId;
    }
    project.lastModified = Date.now();

    // Ensure sharedWithEmails contains both exact and lowercase emails from all sources
    const emailsSet = new Set<string>();
    if (Array.isArray(project.sharedWithEmails)) {
      project.sharedWithEmails.forEach(e => {
        if (typeof e === 'string' && e.trim()) {
          emailsSet.add(e.trim());
          emailsSet.add(e.trim().toLowerCase());
        }
      });
    }
    if (project.collaborators) {
      Object.keys(project.collaborators).forEach(e => {
        if (typeof e === 'string' && e.trim()) {
          emailsSet.add(e.trim());
          emailsSet.add(e.trim().toLowerCase());
        }
      });
    }
    if (project.memberPermissions) {
      Object.keys(project.memberPermissions).forEach(e => {
        if (typeof e === 'string' && e.trim()) {
          emailsSet.add(e.trim());
          emailsSet.add(e.trim().toLowerCase());
        }
      });
    }
    project.sharedWithEmails = Array.from(emailsSet);
    
    // Stringify hierarchical fields to avoid Firestore recursion limits and map keys with dots (e.g. emails)
    const dbPayload: Record<string, any> = {
      id: project.id,
      name: project.name,
      description: project.description || '',
      lastModified: project.lastModified,
      createdBy: project.createdBy,
      userId: project.userId,
      sharedWithEmails: project.sharedWithEmails || [],
    };

    JSON_FIELDS.forEach((key) => {
      const value = project[key];
      dbPayload[key] = value === undefined || value === null ? null : JSON.stringify(value);
    });

    // Remove any undefined keys to avoid Firestore rejection
    Object.keys(dbPayload).forEach(key => {
      if (dbPayload[key] === undefined) {
        delete dbPayload[key];
      }
    });
    
    await setDoc(doc(db, 'projects', project.id), dbPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `projects/${project.id}`);
  }
};

export const deleteProject = async (projectId: string): Promise<void> => {
  if (SUPABASE_MODE) return supabaseProjects.deleteProjectWithCache(projectId);
  if (LOCAL_MODE) return localProjects.deleteProject(projectId);

  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
  }
};
