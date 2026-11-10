import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase.
 *
 * L'app diventa "cloud SQL" solo quando sono configurate entrambe le variabili:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Senza queste variabili continua a funzionare come prima (IndexedDB locale
 * in sviluppo, Firebase in produzione).
 */
const env = (import.meta as any).env || {};

export const SUPABASE_URL: string = (env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY: string = (env.VITE_SUPABASE_ANON_KEY || '').trim();

export const SUPABASE_MODE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = SUPABASE_MODE
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
