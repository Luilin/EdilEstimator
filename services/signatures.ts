import { Project, SignatureRecord } from '../types';

interface SignInput {
  project: Project;
  documentType: SignatureRecord['documentType'];
  documentLabel: string;
  signerName: string;
  signerEmail?: string;
  signerRole?: string;
  notes?: string;
  data?: unknown;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

export async function signDocument(input: SignInput): Promise<SignatureRecord> {
  if (!input.signerName.trim()) throw new Error('Inserisci il nome del firmatario.');
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('La firma con impronta SHA-256 richiede un browser aggiornato o una connessione sicura.');
  }

  const payload = JSON.stringify({
    projectId: input.project.id,
    name: input.project.name,
    documentType: input.documentType,
    documentLabel: input.documentLabel,
    data: input.data ?? null,
  });

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));

  return {
    id: newId(),
    documentType: input.documentType,
    documentLabel: input.documentLabel,
    signerName: input.signerName.trim(),
    signerEmail: input.signerEmail?.trim() || undefined,
    signerRole: input.signerRole?.trim() || undefined,
    signedAt: Date.now(),
    hash: toHex(digest),
    algorithm: 'SHA-256',
    notes: input.notes?.trim() || undefined,
  };
}

const escapeHtml = (value: string) =>
  String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] as string));

export function printSignatureReceipt(record: SignatureRecord, project: Project): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Ricevuta di firma - ${escapeHtml(record.documentLabel)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.5; }
  h1 { font-size: 18px; text-align: center; text-transform: uppercase; margin: 0 0 4px; }
  .subtitle { text-align: center; color: #475569; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
  td { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: top; }
  td.label { width: 32%; background: #f1f5f9; font-weight: bold; }
  .hash { font-family: Consolas, monospace; font-size: 10px; word-break: break-all; }
  .note { border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 12px; font-size: 10px; color: #475569; margin-top: 14px; }
  .signature { margin-top: 36px; display: flex; justify-content: space-between; }
  .signature div { width: 45%; border-top: 1px solid #0f172a; padding-top: 6px; text-align: center; }
  .footer { margin-top: 22px; font-size: 8px; color: #94a3b8; text-align: right; }
</style>
</head>
<body>
  <h1>Ricevuta di firma elettronica</h1>
  <div class="subtitle">Progetto: <b>${escapeHtml(project.name)}</b></div>

  <table>
    <tr><td class="label">Documento</td><td>${escapeHtml(record.documentLabel)}</td></tr>
    <tr><td class="label">Tipo documento</td><td>${escapeHtml(record.documentType)}</td></tr>
    <tr><td class="label">Firmatario</td><td>${escapeHtml(record.signerName)}${record.signerRole ? ` — ${escapeHtml(record.signerRole)}` : ''}</td></tr>
    <tr><td class="label">Email</td><td>${escapeHtml(record.signerEmail || '—')}</td></tr>
    <tr><td class="label">Data e ora</td><td>${new Date(record.signedAt).toLocaleString('it-IT')}</td></tr>
    <tr><td class="label">Algoritmo</td><td>${record.algorithm}</td></tr>
    <tr><td class="label">Impronta digitale</td><td class="hash">${record.hash}</td></tr>
    ${record.notes ? `<tr><td class="label">Note</td><td>${escapeHtml(record.notes)}</td></tr>` : ''}
  </table>

  <div class="note">
    La presente ricevuta attesta la firma elettronica semplice del documento tramite impronta crittografica SHA-256
    e marca temporale locale. Non sostituisce una firma digitale qualificata (PAdES/CAdES) emessa da un prestatore
    di servizi fiduciari accreditato.
  </div>

  <div class="signature">
    <div>Firma del firmatario<br/><b>${escapeHtml(record.signerName)}</b></div>
    <div>Luogo e data<br/><b>${new Date(record.signedAt).toLocaleDateString('it-IT')}</b></div>
  </div>

  <div class="footer">Documento generato da Stimia il ${new Date().toLocaleString('it-IT')}</div>
</body>
</html>`;

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    iframe.remove();
    window.print();
    return;
  }

  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();
  window.setTimeout(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      window.print();
    }
  }, 200);
  window.setTimeout(() => iframe.remove(), 60000);
}
