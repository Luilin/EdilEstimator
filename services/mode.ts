/**
 * Modalità dell'applicazione.
 *
 * - In sviluppo (`npm run dev`) la modalità locale è attiva per default:
 *   autenticazione simulata e progetti salvati nel browser (IndexedDB).
 *   Non viene toccato nessun dato su Firebase.
 * - Nelle build di produzione la modalità locale è disattivata e viene usato Firebase.
 *
 * È possibile forzare il comportamento con la variabile d'ambiente VITE_LOCAL_MODE:
 *   VITE_LOCAL_MODE=true   -> modalità locale
 *   VITE_LOCAL_MODE=false  -> modalità Firebase anche in sviluppo
 */
const env = (import.meta as any).env || {};

export const LOCAL_MODE: boolean =
  env.VITE_LOCAL_MODE === 'true' ||
  (Boolean(env.DEV) && env.VITE_LOCAL_MODE !== 'false');

/** Il database SQL remoto (Supabase) è attivo solo se configurato. */
export const SUPABASE_MODE: boolean = Boolean(
  (env.VITE_SUPABASE_URL || '').trim() && (env.VITE_SUPABASE_ANON_KEY || '').trim()
);
