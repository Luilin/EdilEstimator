import React from 'react';
import { CostItem, Project, WBSNode } from '../types';
import { X, FileText, BookOpen, Printer, Info } from 'lucide-react';

interface Props {
  project: Project;
  canExport: boolean;
  onClose: () => void;
}

type Entry = { categoryCode: string; categoryName: string; item: CostItem };

const flattenItems = (root: WBSNode): Entry[] => {
  const out: Entry[] = [];
  const walk = (node: WBSNode) => {
    const currentCode = node.level === 0 ? '' : node.code;
    const currentName = node.level === 0 ? '' : node.name;
    node.items.forEach(item => out.push({ categoryCode: currentCode, categoryName: currentName, item }));
    node.children.forEach(walk);
  };
  walk(root);
  return out;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] as string));

const currency = (value: number) =>
  value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const printHtmlDocument = (html: string) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

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
};

export const DocumentsModal: React.FC<Props> = ({ project, canExport, onClose }) => {
  const entries = flattenItems(project.rootWBS);

  const handlePrintPriceList = () => {
    if (!canExport || entries.length === 0) return;

    let lastCategory = '';
    const rowsHtml = entries.map(({ categoryCode, categoryName, item }) => {
      const categoryLabel = `${categoryCode}${categoryCode ? ' — ' : ''}${categoryName}`;
      const categoryRow = categoryLabel !== lastCategory
        ? `<tr class="category"><td colspan="4">${escapeHtml(categoryLabel)}</td></tr>`
        : '';
      lastCategory = categoryLabel;
      return `${categoryRow}
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.uom)}</td>
          <td class="num">${currency(item.price)}</td>
        </tr>`;
    }).join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Elenco prezzi - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.4; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 3px; text-transform: uppercase; }
  .subtitle { text-align: center; color: #475569; font-size: 10px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #94a3b8; padding: 3px 5px; vertical-align: top; }
  th { background: #e2e8f0; font-size: 8px; text-transform: uppercase; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.category td { background: #f1f5f9; font-weight: bold; font-size: 9.5px; }
  tbody tr:nth-child(even):not(.category) td { background: #fcfcfd; }
  .footer { margin-top: 10px; font-size: 8px; color: #94a3b8; text-align: right; }
</style>
</head>
<body>
  <h1>Elenco Prezzi Unitari</h1>
  <div class="subtitle">Progetto: <b>${escapeHtml(project.name)}</b> — Data: ${new Date().toLocaleDateString('it-IT')}<br/>${project.description ? escapeHtml(project.description) : ''}</div>
  <table>
    <thead>
      <tr>
        <th style="width: 14%">Codice</th>
        <th>Descrizione</th>
        <th style="width: 9%">U.M.</th>
        <th style="width: 16%" class="num">Prezzo unitario (€)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Documento generato da Stimia il ${new Date().toLocaleString('it-IT')}</div>
</body>
</html>`;

    printHtmlDocument(html);
  };

  const handlePrintCapitolato = () => {
    if (!canExport || entries.length === 0) return;

    const grouped = new Map<string, { code: string; name: string; items: CostItem[] }>();
    entries.forEach(({ categoryCode, categoryName, item }) => {
      const key = `${categoryCode}|${categoryName}`;
      if (!grouped.has(key)) grouped.set(key, { code: categoryCode, name: categoryName, items: [] });
      grouped.get(key)!.items.push(item);
    });

    let article = 0;
    const sectionsHtml = Array.from(grouped.values()).map(group => {
      article += 1;
      const itemsHtml = group.items.map(item => `
        <div class="item">
          <div class="item-title">${escapeHtml(item.code)} — ${escapeHtml(item.description)}</div>
          <div class="item-meta">Unità di misura: ${escapeHtml(item.uom)} · Prezzo unitario: € ${currency(item.price)} · Quantità: ${item.qty.toLocaleString('it-IT')}</div>
        </div>
      `).join('');

      return `
        <section>
          <h2>Art. ${article} — ${escapeHtml(group.code)} ${escapeHtml(group.name)}</h2>
          <p>Le lavorazioni di seguito elencate dovranno essere eseguite secondo le regole dell'arte, con materiali e mezzi idonei, nel rispetto delle normative vigenti e delle indicazioni della Direzione Lavori.</p>
          ${itemsHtml}
        </section>
      `;
    }).join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Capitolato speciale - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.5; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 3px; text-transform: uppercase; }
  .subtitle { text-align: center; color: #475569; font-size: 10px; margin-bottom: 14px; }
  h2 { font-size: 11px; margin: 16px 0 5px; color: #1e293b; }
  p { margin: 4px 0; }
  .intro { border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; margin-bottom: 8px; }
  .item { margin: 6px 0 8px 0; padding-left: 8px; border-left: 2px solid #cbd5e1; page-break-inside: avoid; }
  .item-title { font-weight: bold; }
  .item-meta { color: #475569; font-size: 9px; }
  section { page-break-inside: auto; }
  .footer { margin-top: 18px; font-size: 8px; color: #94a3b8; text-align: right; }
</style>
</head>
<body>
  <h1>Capitolato Speciale d'Appalto</h1>
  <div class="subtitle">Progetto: <b>${escapeHtml(project.name)}</b> — Data: ${new Date().toLocaleDateString('it-IT')}</div>

  <div class="intro">
    <p><b>Oggetto:</b> ${escapeHtml(project.description || project.name)}</p>
    <p>Il presente capitolato disciplina le modalità di esecuzione delle lavorazioni previste nel computo metrico estimativo allegato.
    I prezzi unitari indicati si intendono comprensivi di materiali, manodopera, noli, attrezzature, spese generali e utile d'impresa,
    salvo diversa specificazione. L'Impresa è tenuta al rispetto delle norme tecniche, di sicurezza e ambientali applicabili.</p>
  </div>

  ${sectionsHtml}

  <div class="footer">Documento generato da Stimia il ${new Date().toLocaleString('it-IT')}</div>
</body>
</html>`;

    printHtmlDocument(html);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight sm:text-lg">Documenti del computo</h2>
              <p className="text-xs text-slate-300">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileText size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-800">Elenco Prezzi Unitari</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Elenco completo delle voci del computo raggruppate per categoria, con unità di misura e prezzi unitari.
              </p>
            </div>
            <button type="button" onClick={handlePrintPriceList} disabled={!canExport || entries.length === 0} className="btn btn-primary shrink-0">
              <Printer size={16} /> Stampa / PDF
            </button>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <BookOpen size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-800">Capitolato Speciale d'Appalto</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Documento descrittivo con premessa, articoli per categoria e specifiche delle singole lavorazioni.
              </p>
            </div>
            <button type="button" onClick={handlePrintCapitolato} disabled={!canExport || entries.length === 0} className="btn btn-primary shrink-0">
              <Printer size={16} /> Stampa / PDF
            </button>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info size={13} className="mt-0.5 shrink-0" />
            La stampa usa il dialogo del browser: puoi stampare direttamente oppure scegliere “Salva come PDF”.
          </p>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-4 py-3 sm:px-6">
          <button onClick={onClose} className="btn btn-neutral">Chiudi</button>
        </div>
      </div>
    </div>
  );
};
