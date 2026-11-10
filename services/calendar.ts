import { Project } from '../types';

export interface CalendarEvent {
  id: string;
  date: number;
  title: string;
  description?: string;
  source: 'SAL' | 'Offerta' | 'Richiesta preventivo' | 'Fornitore' | 'Cronoprogramma' | 'Variante';
}

const DAY_MS = 86400000;

const dateOnly = (ts: number): Date => {
  const date = new Date(ts);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export function projectDeadlines(project: Project): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  (project.sals || []).forEach(sal => {
    events.push({
      id: `sal_${sal.id}`,
      date: sal.date,
      title: `SAL ${sal.code} — ${sal.name}`,
      description: `Stato di avanzamento ${sal.status === 'CLOSED' ? 'chiuso' : 'aperto'}.`,
      source: 'SAL',
    });
  });

  (project.offers || []).forEach(offer => {
    if (!offer.validityDays) return;
    events.push({
      id: `offer_${offer.id}`,
      date: offer.date + offer.validityDays * DAY_MS,
      title: `Scadenza validità offerta — ${offer.companyName}`,
      description: `Offerta del ${new Date(offer.date).toLocaleDateString('it-IT')}, valida ${offer.validityDays} giorni.`,
      source: 'Offerta',
    });
  });

  (project.rfqRequests || []).forEach(request => {
    if (!request.deadline) return;
    events.push({
      id: `rfq_${request.id}`,
      date: request.deadline,
      title: `Termine risposta preventivo — ${request.companyName}`,
      description: request.notes || 'Richiesta preventivo.',
      source: 'Richiesta preventivo',
    });
  });

  (project.suppliers || []).forEach(supplier => {
    if (supplier.durcExpiry) {
      events.push({
        id: `durc_${supplier.id}`,
        date: supplier.durcExpiry,
        title: `Scadenza DURC — ${supplier.companyName}`,
        description: supplier.type === 'subappaltatore' ? 'Subappaltatore' : 'Fornitore',
        source: 'Fornitore',
      });
    }
    if (supplier.policyExpiry) {
      events.push({
        id: `policy_${supplier.id}`,
        date: supplier.policyExpiry,
        title: `Scadenza polizza — ${supplier.companyName}`,
        description: supplier.notes || 'Polizza assicurativa.',
        source: 'Fornitore',
      });
    }
  });

  const activities = project.schedule?.activities || [];
  if (activities.length > 0) {
    const end = Math.max(...activities.map(activity => activity.start + Math.max(1, activity.durationDays) * DAY_MS));
    events.push({
      id: 'schedule_end',
      date: end,
      title: 'Fine prevista cronoprogramma',
      description: `${activities.length} attività pianificate.`,
      source: 'Cronoprogramma',
    });
  }

  (project.variants || []).forEach(variant => {
    events.push({
      id: `variant_${variant.id}`,
      date: variant.date,
      title: `${variant.type === 'perizia' ? 'Perizia' : 'Variante'} ${variant.code} — ${variant.name}`,
      description: variant.notes || variant.description || '',
      source: 'Variante',
    });
  });

  return events.sort((a, b) => a.date - b.date);
}

const icsEscape = (value: string) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join('\r\n');
};

const icsDate = (ts: number): string => {
  const date = dateOnly(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

export function buildIcs(_project: Project, events: CalendarEvent[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stimia//Scadenze progetto//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  events.forEach(event => {
    const start = icsDate(event.date);
    const end = icsDate(event.date + DAY_MS);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@stimia`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:${icsEscape(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

export function downloadIcs(project: Project, events: CalendarEvent[]): void {
  const content = buildIcs(project, events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[^\w.-]+/g, '_') || 'scadenze'}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const start = icsDate(event.date);
  const end = icsDate(event.date + DAY_MS);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
