export const currency = (value: number) =>
  `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dateLabel = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('it-IT') : '—');

export const toDateInput = (ts?: number) => {
  if (!ts) return '';
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateInput = (value: string): number | undefined => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const daysUntil = (ts?: number): number | null => {
  if (!ts) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(ts);
  const date = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((date - start) / 86400000);
};

export const expiryTone = (ts?: number): 'ok' | 'warning' | 'danger' | 'none' => {
  const days = daysUntil(ts);
  if (days === null) return 'none';
  if (days < 0) return 'danger';
  if (days <= 30) return 'warning';
  return 'ok';
};

export const expiryLabel = (ts?: number): string => {
  const days = daysUntil(ts);
  if (days === null) return '—';
  if (days < 0) return `Scaduto da ${Math.abs(days)} gg`;
  if (days === 0) return 'Scade oggi';
  if (days <= 30) return `Tra ${days} gg`;
  return dateLabel(ts);
};

export const makeId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
