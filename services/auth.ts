import { LOCAL_MODE, SUPABASE_MODE } from './mode';
import { supabase } from './supabase';
import { auth } from './firebase';
import {
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';

/**
 * Utente semplificato usato dall'interfaccia. In modalità cloud viene mappato
 * da FirebaseUser, in modalità locale viene salvato nel browser.
 */
export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string | null;
  isLocal?: boolean;
}

type AuthListener = (user: AuthUser | null) => void;

const SESSION_KEY = 'edil_local_session';

const localListeners = new Set<AuthListener>();

/** Utente Supabase correntemente autenticato (aggiornato dagli eventi auth). */
let cloudUser: AuthUser | null = null;

function mapSupabaseUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any> | null;
}): AuthUser {
  const metadata = user.user_metadata || {};
  return {
    uid: user.id,
    email: user.email || '',
    displayName: metadata.full_name || metadata.name || null,
  };
}

// Recupera subito la sessione salvata, così la dashboard non "sfarfalla"
// al primo render.
if (SUPABASE_MODE && supabase) {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      cloudUser = data.session?.user ? mapSupabaseUser(data.session.user) : null;
      emitLocal(cloudUser);
    })
    .catch(() => {
      cloudUser = null;
    });
}

function mapFirebaseUser(user: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): AuthUser {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName,
  };
}

function emitLocal(user: AuthUser | null) {
  localListeners.forEach((listener) => listener(user));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function localUidForEmail(email: string): string {
  // UID stabile e leggibile, sufficiente per la modalità locale.
  let hash = 0;
  const value = normalizeEmail(email);
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `local-${Math.abs(hash).toString(36)}-${value.length}`;
}

function readLocalSession(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed || typeof parsed.email !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalSession(user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

export function getCurrentUser(): AuthUser | null {
  if (SUPABASE_MODE) return cloudUser;
  if (LOCAL_MODE) return readLocalSession();
  return auth.currentUser ? mapFirebaseUser(auth.currentUser) : null;
}

export function onAuthStateChanged(listener: AuthListener): () => void {
  if (SUPABASE_MODE) {
    localListeners.add(listener);
    let unsubscribe: (() => void) | null = null;

    if (supabase) {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          cloudUser = data.session?.user ? mapSupabaseUser(data.session.user) : null;
          if (localListeners.has(listener)) listener(cloudUser);
        })
        .catch(() => {
          if (localListeners.has(listener)) listener(null);
        });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        cloudUser = session?.user ? mapSupabaseUser(session.user) : null;
        if (localListeners.has(listener)) listener(cloudUser);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } else {
      Promise.resolve().then(() => {
        if (localListeners.has(listener)) listener(null);
      });
    }

    return () => {
      localListeners.delete(listener);
      unsubscribe?.();
    };
  }

  if (LOCAL_MODE) {
    localListeners.add(listener);
    // Chiamata asincrona per imitare il comportamento di Firebase.
    Promise.resolve().then(() => {
      if (localListeners.has(listener)) listener(readLocalSession());
    });
    return () => {
      localListeners.delete(listener);
    };
  }

  return firebaseOnAuthStateChanged(auth, (user) => {
    listener(user ? mapFirebaseUser(user) : null);
  });
}

export async function signInWithEmail(
  email: string,
  password: string,
  register = false,
): Promise<AuthUser> {
  if (SUPABASE_MODE) {
    if (!supabase) throw new Error('Supabase non configurato.');
    if (!email.trim() || password.length < 6) {
      throw new Error('Inserisci una email valida e una password di almeno 6 caratteri.');
    }

    if (register) {
      const { data, error } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
      });
      if (error) throw new Error(error.message);
      if (!data.session || !data.user) {
        throw new Error('Registrazione inviata: conferma l’indirizzo dalla mail, poi accedi.');
      }
      const user = mapSupabaseUser(data.user);
      cloudUser = user;
      emitLocal(user);
      return user;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Accesso non riuscito.');
    const user = mapSupabaseUser(data.user);
    cloudUser = user;
    emitLocal(user);
    return user;
  }

  if (LOCAL_MODE) {
    if (!email.trim() || password.length < 6) {
      throw new Error('Inserisci una email valida e una password di almeno 6 caratteri.');
    }
    const user: AuthUser = {
      uid: localUidForEmail(email),
      email: normalizeEmail(email),
      displayName: null,
      isLocal: true,
    };
    writeLocalSession(user);
    emitLocal(user);
    return user;
  }

  const credential = register
    ? await createUserWithEmailAndPassword(auth, email, password)
    : await signInWithEmailAndPassword(auth, email, password);

  return mapFirebaseUser(credential.user);
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (SUPABASE_MODE) {
    if (!supabase) throw new Error('Supabase non configurato.');
    const redirectTo = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);
    // Il browser viene reindirizzato a Google: la sessione arriva al ritorno.
    return cloudUser || { uid: '', email: '', displayName: null };
  }

  if (LOCAL_MODE) {
    // In locale non serve un popup: si entra con un account demo.
    const user: AuthUser = {
      uid: localUidForEmail('demo@locale.it'),
      email: 'demo@locale.it',
      displayName: 'Utente Demo',
      isLocal: true,
    };
    writeLocalSession(user);
    emitLocal(user);
    return user;
  }

  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return mapFirebaseUser(credential.user);
}

export async function signOut(): Promise<void> {
  if (SUPABASE_MODE) {
    if (supabase) await supabase.auth.signOut();
    cloudUser = null;
    emitLocal(null);
    return;
  }
  if (LOCAL_MODE) {
    writeLocalSession(null);
    emitLocal(null);
    return;
  }
  await firebaseSignOut(auth);
}

