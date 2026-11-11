
import React, { useState, useEffect } from 'react';
import { Project, ViewState, EffectivePermissions, FULL_PERMISSIONS, MemberPermission } from './types';
import { Editor } from './components/Editor';
import { TeamManagementModal } from './components/TeamManagementModal';
import { getProjects, saveProject, deleteProject } from './services/storage';
import { deleteProjectAttachments } from './services/attachments';
import { deleteProjectVersions } from './services/projectVersions';
import {
  deleteProjectPriceBooks,
  duplicateProjectPriceBooks,
  externalizePriceBooks,
  hydratePriceBooks,
} from './services/priceBooksStorage';
import { Users, LogIn, Plus, Trash2, FolderOpen, X, Loader2, AlertCircle, HardDrive, Pencil, Download, Upload, Copy, WifiOff, Smartphone, Cloud } from 'lucide-react';
import { db } from './services/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import { AuthUser, onAuthStateChanged, signInWithEmail, signInWithGoogle, signOut } from './services/auth';
import { LOCAL_MODE, SUPABASE_MODE } from './services/mode';
import { flushSyncQueue } from './services/supabaseProjects';

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
if (!LOCAL_MODE && !SUPABASE_MODE) {
  testConnection();
}

function findMemberPermission(project: Project, email: string): MemberPermission | undefined {
  if (!email || !project.memberPermissions) return undefined;
  const lower = email.toLowerCase();
  const key = Object.keys(project.memberPermissions).find((k) => k.toLowerCase() === lower);
  return key ? project.memberPermissions[key] : undefined;
}

function permissionsForProject(project: Project, currentUser: { uid: string; email?: string | null }): EffectivePermissions {
  const email = (currentUser.email || '').toLowerCase();
  const isOwner = project.userId === currentUser.uid || (project.createdBy || '').toLowerCase() === email;
  if (isOwner) return FULL_PERMISSIONS;

  const memberPerm = findMemberPermission(project, email);
  if (memberPerm) {
    return {
      canRead: memberPerm.canRead,
      canWrite: memberPerm.canWrite,
      canManageMembers: memberPerm.canManageMembers,
      canEditSAL: memberPerm.canEditSAL,
      canEditPriceBooks: memberPerm.canEditPriceBooks,
      canExport: memberPerm.canExport,
    };
  }

  const collabRole = project.collaborators?.[email] ||
    Object.entries(project.collaborators || {}).find(([k]) => k.toLowerCase() === email)?.[1];

  if (collabRole === 'editor') {
    return { canRead: true, canWrite: true, canManageMembers: false, canEditSAL: true, canEditPriceBooks: true, canExport: true };
  }
  if (collabRole === 'ditta') {
    return { canRead: true, canWrite: false, canManageMembers: false, canEditSAL: false, canEditPriceBooks: false, canExport: true };
  }
  return { canRead: true, canWrite: false, canManageMembers: false, canEditSAL: false, canEditPriceBooks: false, canExport: true };
}

export default function App() {
  const [viewState, setViewState] = useState<ViewState>(ViewState.LOGIN);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Modal and form inputs
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // Modifica nome/descrizione di un computo esistente
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDesc, setEditProjectDesc] = useState('');

  // Backup / ripristino
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const backupInputRef = React.useRef<HTMLInputElement>(null);

  // PWA / stato rete
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);

  // Sharing
  const [shareProject, setShareProject] = useState<Project | null>(null);

  // Incrementato quando torna la connessione: forza un riallineamento con il cloud.
  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      setViewState((previous) => {
        if (user && previous === ViewState.LOGIN) return ViewState.DASHBOARD;
        if (!user) return ViewState.LOGIN;
        return previous;
      });
    });

    return () => unsubscribe();
  }, []);

  // Carica progetti quando si entra nella Dashboard
  useEffect(() => {
    if (viewState === ViewState.DASHBOARD && currentUser) {
      loadProjects();
    }
  }, [viewState, currentUser, syncTick]);

  // Stato rete e prompt di installazione PWA
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      if (SUPABASE_MODE) {
        flushSyncQueue()
          .catch(() => undefined)
          .finally(() => setSyncTick((tick) => tick + 1));
      }
    };
    const goOffline = () => setIsOnline(false);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as unknown as { prompt: () => Promise<void> });
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
    };
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await getProjects();
      if (error) {
        console.error(error);
      }
      const visible = (data || []).filter((p) => {
        if (!currentUser) return true;
        if (p.userId === currentUser.uid) return true;
        if ((p.createdBy || '').toLowerCase() === (currentUser.email || '').toLowerCase()) return true;
        const perm = findMemberPermission(p, currentUser.email || '');
        if (perm) return perm.canRead;
        return true;
      });
      setProjects(visible);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Error during sign in:", error);
      setAuthError('Errore durante il login con Google: ' + (error.message || 'Errore sconosciuto'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!email || !password) {
      setAuthError("Inserisci email e password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email, password, isRegistering);
    } catch (error: any) {
      console.error("Auth error:", error);
      setAuthError((isRegistering ? 'Errore durante la registrazione: ' : 'Errore durante il login: ') + (error.message || 'Errore sconosciuto'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim() && currentUser) {
      const newProject: Project = {
        id: 'temp-' + Math.random().toString(36).substr(2, 9),
        name: newProjectName.trim(),
        description: newProjectDesc.trim(),
        lastModified: Date.now(),
        createdBy: currentUser.email || 'unknown',
        userId: currentUser.uid,
        rootWBS: {
          id: 'root',
          code: "",
          name: newProjectName.trim(),
          level: 0,
          children: [],
          items: []
        }
      };

      await saveProject(newProject);
      await loadProjects();
      setShowNewProjectModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
    }
  };

  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const handleExportBackup = async () => {
    try {
      const fullProjects = await Promise.all(projects.map(async project => ({
        ...project,
        priceBooks: await hydratePriceBooks(project.id, project.priceBooks || []),
      })));

      const payload = {
        app: 'Stimia',
        version: 1,
        exportedAt: new Date().toISOString(),
        projects: fullProjects,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stimia_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupMessage(`Backup esportato: ${projects.length} ${projects.length === 1 ? 'computo' : 'computi'}.`);
    } catch (error) {
      console.error('Errore export backup:', error);
      setBackupMessage('Errore durante l’esportazione del backup.');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser) return;

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const incoming: Project[] = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.projects) ? parsed.projects : []);

      const valid = incoming.filter(project => project && project.id && project.name && project.rootWBS);
      if (valid.length === 0) {
        setBackupMessage('File di backup non valido: nessun computo riconosciuto.');
        return;
      }

      for (const project of valid) {
        const restored: Project = {
          ...project,
          userId: currentUser.uid,
          createdBy: currentUser.email || project.createdBy,
          lastModified: Date.now(),
        };
        restored.priceBooks = await externalizePriceBooks(restored.id, restored.priceBooks || []);
        await saveProject(restored);
      }

      await loadProjects();
      setBackupMessage(`Ripristinati ${valid.length} ${valid.length === 1 ? 'computo' : 'computi'} dal backup.`);
    } catch (error) {
      console.error('Errore ripristino backup:', error);
      setBackupMessage('Errore durante il ripristino del backup. Verifica che il file JSON sia valido.');
    }
  };

  const handleDuplicateProject = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;

    try {
      const copy: Project = JSON.parse(JSON.stringify(project));
      copy.id = `temp-${Math.random().toString(36).slice(2, 11)}`;
      copy.name = `${project.name} (copia)`;
      copy.userId = currentUser.uid;
      copy.createdBy = currentUser.email || project.createdBy;
      copy.lastModified = Date.now();
      delete copy.collaborators;
      delete copy.memberPermissions;
      delete copy.sharedWithEmails;

      copy.priceBooks = await duplicateProjectPriceBooks(project.id, copy.id, project.priceBooks || []);

      await saveProject(copy);
      await loadProjects();
      setBackupMessage(`Computo duplicato: "${copy.name}".`);
    } catch (error) {
      console.error('Errore duplicazione computo:', error);
    }
  };

  const openEditProject = (p: Project) => {
    setProjectToEdit(p);
    setEditProjectName(p.name);
    setEditProjectDesc(p.description || '');
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToEdit || !editProjectName.trim()) return;
    const updatedProject: Project = {
      ...projectToEdit,
      name: editProjectName.trim(),
      description: editProjectDesc.trim(),
      lastModified: Date.now(),
    };
    try {
      await saveProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      setSelectedProject(prev => prev && prev.id === updatedProject.id ? updatedProject : prev);
      setProjectToEdit(null);
    } catch (err) {
      console.error("Errore modifica computo:", err);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete);
      await Promise.allSettled([
        deleteProjectAttachments(projectToDelete),
        deleteProjectVersions(projectToDelete),
        deleteProjectPriceBooks(projectToDelete),
      ]);
      await loadProjects();
    } catch (err) {
      console.error("Errore cancellazione computo:", err);
    } finally {
      setProjectToDelete(null);
    }
  };

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
    } catch (err) {
      console.warn('Installazione PWA non riuscita:', err);
    } finally {
      setInstallPrompt(null);
    }
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(id);
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setViewState(ViewState.LOGIN);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-emerald-600" size={40} />
      </div>
    );
  }

  if (viewState === ViewState.LOGIN) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}brand/stimia-badge.png`}
              alt="Stimia"
              className="h-12 w-12 shrink-0 rounded-xl shadow-sm"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Stimia</h1>
              <p className="text-xs text-slate-500">Computi metrici e contabilità lavori</p>
            </div>
          </div>

          <p className="mb-5 text-sm text-slate-500">
            {SUPABASE_MODE
              ? 'Accedi ai tuoi computi salvati sul database SQL'
              : LOCAL_MODE
                ? 'Modalità locale — i dati restano su questo browser'
                : 'Accedi ai tuoi computi salvati sul cloud'}
          </p>

          {LOCAL_MODE && !SUPABASE_MODE && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <HardDrive size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                Nessun dato viene inviato al cloud. Puoi accedere con qualsiasi email e una password di almeno 6 caratteri.
              </span>
            </div>
          )}
          
          {authError && (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="field"
                placeholder="nome@email.it"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="field"
                required
                minLength={6}
              />
            </div>
            <button disabled={loading} type="submit" className="btn btn-primary h-11 w-full text-sm">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              {isRegistering ? 'Registrati' : 'Accedi'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button 
              type="button" 
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(null); }} 
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              {isRegistering ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
            </button>
          </div>
          
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-slate-400">Oppure</span>
            </div>
          </div>

          <div className="space-y-4">
            <button type="button" disabled={loading} onClick={handleGoogleLogin} className="btn btn-neutral h-11 w-full text-sm">
              {LOCAL_MODE && !SUPABASE_MODE ? (
                <HardDrive size={18} className="text-slate-500" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  <path fill="none" d="M1 1h22v22H1z" />
                </svg>
              )}
              {LOCAL_MODE && !SUPABASE_MODE ? 'Accedi come utente demo' : 'Accedi con Google'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === ViewState.DASHBOARD) {
    return (
      <div className="min-h-screen bg-slate-100">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
               <img
                 src={`${import.meta.env.BASE_URL}brand/stimia-badge.png`}
                 alt="Stimia"
                 className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
               />
               <div className="min-w-0">
                 <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">I miei computi</h1>
                 <p className="hidden text-xs text-slate-500 sm:block">Panoramica progetti e collaborazioni</p>
               </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {SUPABASE_MODE && (
                <span
                  className={`hidden items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                    isOnline
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                  title={
                    isOnline
                      ? 'Progetti sincronizzati con il database SQL (Supabase)'
                      : 'Offline: le modifiche restano in coda e vengono sincronizzate al ritorno online'
                  }
                >
                  <Cloud size={12} /> {isOnline ? 'Cloud SQL' : 'Offline'}
                </span>
              )}
              {LOCAL_MODE && !SUPABASE_MODE && (
                <span className="hidden items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 sm:inline-flex" title="Dati salvati solo in questo browser">
                  <HardDrive size={12} /> Locale
                </span>
              )}
              {!isOnline && !SUPABASE_MODE && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700" title="Le modifiche restano in coda e verranno sincronizzate al ritorno online">
                  <WifiOff size={12} /> Offline
                </span>
              )}
              {installPrompt && (
                <button onClick={handleInstallApp} className="btn btn-neutral" title="Installa Stimia sul dispositivo">
                  <Smartphone size={16} /> <span className="hidden sm:inline">Installa</span>
                </button>
              )}
              <span className="hidden max-w-[220px] truncate text-xs text-slate-500 md:inline">Utente: <b className="text-slate-700">{currentUser?.email}</b></span>
              <button onClick={handleExportBackup} className="btn btn-neutral" title="Esporta un backup JSON di tutti i computi">
                <Download size={16} /> <span className="hidden sm:inline">Backup</span>
              </button>
              <button onClick={() => backupInputRef.current?.click()} className="btn btn-neutral" title="Ripristina i computi da un backup JSON">
                <Upload size={16} /> <span className="hidden sm:inline">Ripristina</span>
              </button>
              <input ref={backupInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportBackup} />
              <button onClick={handleLogout} className="btn btn-neutral">Esci</button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {backupMessage && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
              <span>{backupMessage}</span>
              <button onClick={() => setBackupMessage(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="Chiudi messaggio"><X size={14} /></button>
            </div>
          )}
          {loading ? (
             <div className="flex justify-center p-12"><Loader2 className="animate-spin text-emerald-600" size={40} /></div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Progetti</h2>
                <span className="text-xs text-slate-400">{projects.length} {projects.length === 1 ? 'computo' : 'computi'}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <button 
                  onClick={() => setShowNewProjectModal(true)}
                  className="group flex min-h-[170px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white/60 p-6 text-slate-500 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-white group-hover:text-emerald-600">
                    <Plus size={24} />
                  </div>
                  <span className="text-sm font-semibold">Nuovo Computo</span>
                  <span className="mt-1 text-xs text-slate-400">Crea un nuovo progetto</span>
                </button>

                {projects.map(p => {
                  const isOwner = p.userId === currentUser?.uid;
                  const cardPerms = permissionsForProject(p, currentUser || { uid: '', email: '' });
                  const canEditProject = isOwner || cardPerms.canWrite;
                  
                  return (
                  <div 
                    key={p.id} 
                    onClick={() => { setSelectedProject(p); setViewState(ViewState.EDITOR); }}
                    className="group relative flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><FolderOpen size={18} /></div>
                        {!isOwner && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Condiviso</span>}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                        {canEditProject && (
                            <button 
                                onClick={(e) => handleDuplicateProject(p, e)} 
                                className="btn btn-ghost btn-icon"
                                title="Duplica computo"
                            >
                                <Copy size={16} />
                            </button>
                        )}
                        {canEditProject && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); openEditProject(p); }} 
                                className="btn btn-ghost btn-icon"
                                title="Modifica nome e descrizione"
                            >
                                <Pencil size={16} />
                            </button>
                        )}
                        {isOwner && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShareProject(p); }} 
                                className="btn btn-ghost btn-icon"
                                title="Condividi e Gestisci Team"
                            >
                                <Users size={17} />
                            </button>
                        )}
                        {isOwner && <button onClick={(e) => handleDeleteProject(p.id, e)} className="btn btn-ghost btn-icon hover:!text-red-600" title="Elimina computo"><Trash2 size={17} /></button>}
                      </div>
                    </div>
                    <h3 className="mb-1 truncate text-base font-bold text-slate-900">{p.name}</h3>
                    <p className="mb-4 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">{p.description || "Nessuna descrizione"}</p>
                    <div className="mt-auto text-[11px] text-slate-400">Ultima modifica: {new Date(p.lastModified).toLocaleString()}</div>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </main>

        {showNewProjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <h3 className="text-base font-bold text-slate-900">Nuovo Computo</h3>
                <button onClick={() => setShowNewProjectModal(false)} className="btn btn-ghost btn-icon" title="Chiudi"><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateProject} className="space-y-4 overflow-y-auto p-4 sm:p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Nome Progetto</label>
                  <input autoFocus type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} className="field" required />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Descrizione</label>
                  <textarea value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)} className="field h-24 resize-none" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowNewProjectModal(false)} className="btn btn-neutral">Annulla</button>
                  <button type="submit" className="btn btn-primary">Crea</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {projectToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <h3 className="text-base font-bold text-red-600">Elimina Computo</h3>
                <button onClick={() => setProjectToDelete(null)} className="btn btn-ghost btn-icon" title="Chiudi"><X size={18} /></button>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <p className="text-sm text-slate-600">Sei sicuro di voler eliminare questo computo? Questa operazione non può essere annullata.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setProjectToDelete(null)} className="btn btn-neutral">Annulla</button>
                  <button onClick={confirmDeleteProject} className="btn bg-red-600 text-white hover:bg-red-700">Elimina</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {projectToEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <Pencil size={17} className="text-emerald-600" />
                  <h3 className="text-base font-bold text-slate-900">Modifica Computo</h3>
                </div>
                <button onClick={() => setProjectToEdit(null)} className="btn btn-ghost btn-icon" title="Chiudi"><X size={18} /></button>
              </div>
              <form onSubmit={handleEditProject} className="space-y-4 overflow-y-auto p-4 sm:p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Nome Progetto</label>
                  <input autoFocus type="text" value={editProjectName} onChange={e => setEditProjectName(e.target.value)} className="field" required />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Descrizione</label>
                  <textarea value={editProjectDesc} onChange={e => setEditProjectDesc(e.target.value)} className="field h-24 resize-none" placeholder="Descrizione del computo" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setProjectToEdit(null)} className="btn btn-neutral">Annulla</button>
                  <button type="submit" className="btn btn-primary">Salva modifiche</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {shareProject && (
          <TeamManagementModal 
            project={shareProject} 
            currentUserEmail={currentUser?.email || ''} 
            onSave={async (updatedProject) => {
              try {
                await saveProject(updatedProject);
                setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
              } catch (err) {
                console.error("Errore salvataggio permessi:", err);
              }
            }} 
            onClose={() => setShareProject(null)} 
          />
        )}
      </div>
    );
  }

  if (viewState === ViewState.EDITOR && selectedProject) {
    const emailLower = (currentUser?.email || '').toLowerCase();
    const isOwner = selectedProject.userId === currentUser?.uid || (selectedProject.createdBy || '').toLowerCase() === emailLower;
    const userRoleInCollab = selectedProject.collaborators?.[emailLower] ||
      Object.entries(selectedProject.collaborators || {}).find(([k]) => k.toLowerCase() === emailLower)?.[1];
    const isDittaRole = userRoleInCollab === 'ditta';
    const perms = permissionsForProject(selectedProject, currentUser || { uid: '', email: '' });
    const isReadOnly = !perms.canWrite && !perms.canEditSAL && !perms.canEditPriceBooks && !isDittaRole;

    const activeUserRole: 'owner' | 'editor' | 'viewer' | 'ditta' = isOwner
      ? 'owner'
      : (userRoleInCollab || 'viewer');

    return (
      <Editor 
        project={selectedProject} 
        currentUser={currentUser?.email || ''} 
        onClose={() => setViewState(ViewState.DASHBOARD)} 
        isReadOnly={isReadOnly}
        userRole={activeUserRole}
        permissions={perms}
      />
    );
  }

  return null;
}
