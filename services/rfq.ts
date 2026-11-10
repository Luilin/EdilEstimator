import { Project, RfqRequest } from '../types';

const dateLabel = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('it-IT') : '—');

export function buildRfqEmail(project: Project, request: RfqRequest): { subject: string; body: string } {
  const deadline = request.deadline ? dateLabel(request.deadline) : 'da concordare';
  const subject = `Richiesta preventivo — ${project.name}`;
  const body = `Gentile ${request.contactName || request.companyName},

siamo a richiedere la Vostra migliore offerta per il progetto "${project.name}".
${project.description ? `\nOggetto: ${project.description}\n` : ''}
Termine per la presentazione dell'offerta: ${deadline}.

Vi chiediamo di compilare il modulo "Preventivo Ditte" (computo in bianco) indicando per ogni voce:
- prezzo unitario offerto;
- eventuali tempi di esecuzione;
- note, marche o varianti.

È possibile richiedere il modulo in formato Excel oppure concordare un sopralluogo.

Restiamo a disposizione per qualsiasi chiarimento.

Cordiali saluti,
${project.createdBy || ''}`;

  return { subject, body };
}

export function rfqMailto(project: Project, request: RfqRequest): string {
  const { subject, body } = buildRfqEmail(project, request);
  const recipient = request.pec || request.email || '';
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const base64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const wrapBase64 = (value: string): string => value.replace(/(.{76})/g, '$1\r\n');

export function buildRfqEml(project: Project, request: RfqRequest): string {
  const { subject, body } = buildRfqEmail(project, request);
  const recipient = request.pec || request.email || '';
  const from = project.createdBy || 'noreply@stimia.local';
  const date = new Date().toUTCString();

  return [
    'X-Unsent: 1',
    `From: ${from}`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(base64(body)),
    '',
  ].join('\r\n');
}

export function downloadRfqEml(project: Project, request: RfqRequest): void {
  const content = buildRfqEml(project, request);
  const blob = new Blob([content], { type: 'message/rfc822;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const clean = request.companyName.replace(/[^\w.-]+/g, '_') || 'richiesta';
  link.href = url;
  link.download = `richiesta_preventivo_${clean}.eml`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
