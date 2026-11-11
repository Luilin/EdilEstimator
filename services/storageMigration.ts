/**
 * Migrazione delle preferenze salvate in localStorage dal vecchio prefisso
 * "edil_" al nuovo "stimia_". Va eseguita una volta all'avvio, prima che
 * il resto dell'app legga le chiavi.
 *
 * Le chiavi vecchie vengono rimosse solo dopo aver copiato il valore.
 */

const KEY_MAP: Array<[string, string]> = [
  ['edil_local_session', 'stimia_local_session'],
  ['edil_uoms', 'stimia_uoms'],
  ['edil_editor_sidebar_width', 'stimia_editor_sidebar_width'],
  ['edil_price_books', 'stimia_price_books'],
  ['edil_emailjs_service_id', 'stimia_emailjs_service_id'],
  ['edil_emailjs_template_id', 'stimia_emailjs_template_id'],
  ['edil_emailjs_public_key', 'stimia_emailjs_public_key'],
  ['edil_emailjs_enabled', 'stimia_emailjs_enabled'],
  ['edil_local_projects_v1', 'stimia_local_projects_v1'],
];

const PREFIX_MAP: Array<[string, string]> = [
  ['edil_cloud_migrated_', 'stimia_cloud_migrated_'],
];

export function migrateLegacyStorageKeys(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    for (const [oldKey, newKey] of KEY_MAP) {
      const value = window.localStorage.getItem(oldKey);
      if (value === null) continue;
      if (window.localStorage.getItem(newKey) === null) {
        window.localStorage.setItem(newKey, value);
      }
      window.localStorage.removeItem(oldKey);
    }

    for (const key of Object.keys(window.localStorage)) {
      for (const [oldPrefix, newPrefix] of PREFIX_MAP) {
        if (!key.startsWith(oldPrefix)) continue;
        const newKey = newPrefix + key.slice(oldPrefix.length);
        const value = window.localStorage.getItem(key);
        if (value !== null && window.localStorage.getItem(newKey) === null) {
          window.localStorage.setItem(newKey, value);
        }
        window.localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('Migrazione delle preferenze locali non riuscita:', error);
  }
}
