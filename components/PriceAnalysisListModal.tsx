import React, { useMemo, useState } from 'react';
import { CostItem, PriceAnalysisRowType, Project, WBSNode } from '../types';
import { X, FlaskConical, Download, Printer, Search, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

interface Props {
  project: Project;
  canExport: boolean;
  onClose: () => void;
}

type FlatEntry = { categoryCode: string; categoryName: string; item: CostItem };

const TYPE_LABELS: Record<PriceAnalysisRowType, string> = {
  material: 'Materiali',
  labor: 'Manodopera',
  equipment: 'Noli e attrezzature',
  safety: 'Sicurezza',
  other: 'Altro',
};

const currency = (value: number) =>
  `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const round2 = (value: number) => Math.round(value * 100) / 100;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] as string));

const flattenItems = (root: WBSNode): FlatEntry[] => {
  const out: FlatEntry[] = [];
  const walk = (node: WBSNode) => {
    const currentCode = node.level === 0 ? '' : node.code;
    const currentName = node.level === 0 ? '' : node.name;
    node.items.forEach(item => out.push({ categoryCode: currentCode, categoryName: currentName, item }));
    node.children.forEach(walk);
  };
  walk(root);
  return out;
};

const computeAnalysisTotals = (item: CostItem) => {
  const analysis = item.priceAnalysis;
  if (!analysis) return { direct: 0, overheads: 0, profit: 0, epu: 0, byType: {} as Record<PriceAnalysisRowType, number> };

  const byType = { material: 0, labor: 0, equipment: 0, safety: 0, other: 0 } as Record<PriceAnalysisRowType, number>;
  const direct = analysis.rows.reduce((sum, row) => {
    const line = (row.quantity || 0) * (row.unitPrice || 0);
    byType[row.type] += line;
    return sum + line;
  }, 0);

  const overheads = direct * (analysis.overheadsPercent || 0) / 100;
  const profit = (direct + overheads) * (analysis.profitPercent || 0) / 100;

  return { direct, overheads, profit, epu: direct + overheads + profit, byType };
};

export const PriceAnalysisListModal: React.FC<Props> = ({ project, canExport, onClose }) => {
  const entries = useMemo(() => flattenItems(project.rootWBS), [project.rootWBS]);
  const [search, setSearch] = useState('');
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  const analyzed = useMemo(
    () => entries.filter(({ item }) => item.priceAnalysis && item.priceAnalysis.rows.length > 0),
    [entries]
  );
  const missing = useMemo(
    () => entries.filter(({ item }) => !item.priceAnalysis || item.priceAnalysis.rows.length === 0),
    [entries]
  );

  const totals = useMemo(() => {
    let epuTotal = 0;
    let directTotal = 0;
    analyzed.forEach(({ item }) => {
      const totals = computeAnalysisTotals(item);
      epuTotal += totals.epu;
      directTotal += totals.direct;
    });
    return { epuTotal, directTotal };
  }, [analyzed]);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = showMissingOnly ? missing : entries;
    if (!query) return base;
    return base.filter(({ item, categoryCode, categoryName }) =>
      item.code.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      categoryCode.toLowerCase().includes(query) ||
      categoryName.toLowerCase().includes(query)
    );
  }, [entries, missing, search, showMissingOnly]);

  const handleExport = async () => {
    if (!canExport) return;

    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    // Riepilogo
    const summaryRows: unknown[][] = [
      ['ELENCO ANALISI PREZZI'],
      [`Progetto: ${project.name}`],
      [`Data esportazione: ${new Date().toLocaleDateString('it-IT')}`],
      [`Voci totali: ${entries.length} · Analizzate: ${analyzed.length} · Da analizzare: ${missing.length}`],
      [],
      ['Codice', 'Categoria', 'Descrizione', 'U.M.', 'Q.tà', 'Prezzo computo (€)', 'Costo diretto (€)', 'Spese generali (€)', 'Utile (€)', 'Prezzo EPU (€)', 'Δ vs computo (%)', 'Materiali (%)', 'Manodopera (%)', 'Stato'],
    ];

    entries.forEach(({ item, categoryCode, categoryName }) => {
      const analysisTotals = computeAnalysisTotals(item);
      const hasAnalysis = item.priceAnalysis && item.priceAnalysis.rows.length > 0;
      const delta = hasAnalysis && item.price > 0 ? ((analysisTotals.epu - item.price) / item.price) * 100 : null;
      const matPct = analysisTotals.direct > 0 ? (analysisTotals.byType.material / analysisTotals.direct) * 100 : 0;
      const labPct = analysisTotals.direct > 0 ? (analysisTotals.byType.labor / analysisTotals.direct) * 100 : 0;
      summaryRows.push([
        item.code,
        `${categoryCode}${categoryCode ? ' - ' : ''}${categoryName}`,
        item.description,
        item.uom,
        item.qty,
        round2(item.price),
        hasAnalysis ? round2(analysisTotals.direct) : '',
        hasAnalysis ? round2(analysisTotals.overheads) : '',
        hasAnalysis ? round2(analysisTotals.profit) : '',
        hasAnalysis ? round2(analysisTotals.epu) : '',
        delta !== null ? Number(delta.toFixed(1)) : '',
        hasAnalysis ? Number(matPct.toFixed(1)) : '',
        hasAnalysis ? Number(labPct.toFixed(1)) : '',
        hasAnalysis ? 'Analizzata' : 'Da analizzare',
      ]);
    });

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [
      { wch: 14 }, { wch: 24 }, { wch: 50 }, { wch: 8 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Elenco Analisi');

    // Dettaglio
    const detailRows: unknown[][] = [
      ['DETTAGLIO ANALISI PREZZI'],
      [`Progetto: ${project.name}`],
      [],
      ['Codice voce', 'Descrizione voce', 'Tipologia', 'Descrizione componente', 'U.M.', 'Q.tà', 'Prezzo unitario (€)', 'Importo (€)'],
    ];

    analyzed.forEach(({ item }) => {
      const analysis = item.priceAnalysis!;
      analysis.rows.forEach(row => {
        detailRows.push([
          item.code,
          item.description,
          TYPE_LABELS[row.type],
          row.description,
          row.uom,
          row.quantity,
          round2(row.unitPrice),
          round2((row.quantity || 0) * (row.unitPrice || 0)),
        ]);
      });

      const totals = computeAnalysisTotals(item);
      detailRows.push(['', '', 'Costo diretto', '', '', '', '', round2(totals.direct)]);
      detailRows.push(['', '', `Spese generali (${analysis.overheadsPercent || 0}%)`, '', '', '', '', round2(totals.overheads)]);
      detailRows.push(['', '', `Utile (${analysis.profitPercent || 0}%)`, '', '', '', '', round2(totals.profit)]);
      detailRows.push(['', '', 'PREZZO EPU', '', '', '', '', round2(totals.epu)]);
      detailRows.push([]);
    });

    const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
    detailSheet['!cols'] = [
      { wch: 14 }, { wch: 50 }, { wch: 22 }, { wch: 46 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Dettaglio Analisi');

    const cleanName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    XLSX.writeFile(workbook, `${cleanName}_analisi_prezzi.xlsx`);
  };

  const handlePrint = () => {
    if (!canExport) return;

    const summaryHtml = analyzed.map(({ item }) => {
      const totals = computeAnalysisTotals(item);
      const delta = item.price > 0 ? ((totals.epu - item.price) / item.price) * 100 : null;
      return `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.uom)}</td>
          <td class="num">${item.price.toFixed(2)}</td>
          <td class="num">${totals.direct.toFixed(2)}</td>
          <td class="num">${totals.epu.toFixed(2)}</td>
          <td class="num">${delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : '—'}</td>
        </tr>
      `;
    }).join('');

    const blocksHtml = analyzed.map(({ item }) => {
      const analysis = item.priceAnalysis!;
      const totals = computeAnalysisTotals(item);
      const rowsHtml = analysis.rows.map(row => `
        <tr>
          <td>${escapeHtml(TYPE_LABELS[row.type])}</td>
          <td>${escapeHtml(row.description || '—')}</td>
          <td>${escapeHtml(row.uom || '—')}</td>
          <td class="num">${row.quantity.toLocaleString('it-IT')}</td>
          <td class="num">${(row.unitPrice || 0).toFixed(2)}</td>
          <td class="num">${((row.quantity || 0) * (row.unitPrice || 0)).toFixed(2)}</td>
        </tr>
      `).join('');

      return `
        <div class="analysis">
          <h3>${escapeHtml(item.code)} — ${escapeHtml(item.description)}</h3>
          <div class="meta">U.M. ${escapeHtml(item.uom)} · Quantità ${item.qty.toLocaleString('it-IT')} · Prezzo computo ${item.price.toFixed(2)} €</div>
          <table>
            <thead>
              <tr>
                <th>Tipologia</th>
                <th>Descrizione</th>
                <th>U.M.</th>
                <th class="num">Q.tà</th>
                <th class="num">Prezzo unit. (€)</th>
                <th class="num">Importo (€)</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr><td colspan="5" class="num">Costo diretto</td><td class="num">${totals.direct.toFixed(2)}</td></tr>
              <tr><td colspan="5" class="num">Spese generali (${analysis.overheadsPercent || 0}%)</td><td class="num">${totals.overheads.toFixed(2)}</td></tr>
              <tr><td colspan="5" class="num">Utile (${analysis.profitPercent || 0}%)</td><td class="num">${totals.profit.toFixed(2)}</td></tr>
              <tr class="epu"><td colspan="5" class="num">Prezzo EPU</td><td class="num">${totals.epu.toFixed(2)}</td></tr>
            </tfoot>
          </table>
          ${analysis.notes ? `<div class="notes">Note: ${escapeHtml(analysis.notes)}</div>` : ''}
        </div>
      `;
    }).join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Elenco analisi prezzi - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 9.5px; line-height: 1.4; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 3px; text-transform: uppercase; }
  h2 { font-size: 11px; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
  h3 { font-size: 10.5px; margin: 0 0 2px; }
  .subtitle { text-align: center; color: #475569; font-size: 10px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 3px; }
  th, td { border: 1px solid #94a3b8; padding: 3px 5px; vertical-align: top; }
  th { background: #e2e8f0; font-size: 8px; text-transform: uppercase; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tfoot td { background: #f1f5f9; }
  tfoot .epu td { font-weight: bold; background: #d1fae5; }
  .analysis { margin-top: 14px; page-break-inside: avoid; }
  .meta { color: #475569; font-size: 8.5px; margin-bottom: 3px; }
  .notes { margin-top: 3px; font-size: 8.5px; color: #334155; }
  .muted { color: #64748b; font-size: 8.5px; }
</style>
</head>
<body>
  <h1>Elenco Analisi Prezzi</h1>
  <div class="subtitle">
    Progetto: <b>${escapeHtml(project.name)}</b> — Data: ${new Date().toLocaleDateString('it-IT')}<br/>
    Voci totali: ${entries.length} · Analizzate: ${analyzed.length} · Da analizzare: ${missing.length}
  </div>

  <h2>Riepilogo</h2>
  <table>
    <thead>
      <tr>
        <th>Codice</th>
        <th>Descrizione</th>
        <th>U.M.</th>
        <th class="num">Prezzo computo (€)</th>
        <th class="num">Costo diretto (€)</th>
        <th class="num">Prezzo EPU (€)</th>
        <th class="num">Δ</th>
      </tr>
    </thead>
    <tbody>${summaryHtml}</tbody>
  </table>

  ${analyzed.length > 0 ? `<h2>Dettaglio analisi</h2>${blocksHtml}` : '<p class="muted">Nessuna analisi disponibile.</p>'}

  <p class="muted" style="margin-top:12px">Documento generato da EdilEstimator il ${new Date().toLocaleString('it-IT')}.</p>
</body>
</html>`;

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

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <FlaskConical size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Elenco Analisi Prezzi</h2>
              <p className="truncate text-xs text-slate-300">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Voci totali</div>
              <div className="text-lg font-bold text-slate-800">{entries.length}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Analizzate</div>
              <div className="text-lg font-bold text-emerald-700">{analyzed.length}</div>
            </div>
            <div className={`rounded-xl border p-3 shadow-sm ${missing.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wide ${missing.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Da analizzare</div>
              <div className={`text-lg font-bold ${missing.length > 0 ? 'text-amber-700' : 'text-slate-800'}`}>{missing.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Totale EPU</div>
              <div className="text-sm font-bold text-slate-800">{currency(totals.epuTotal)}</div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca voce o categoria..."
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="checkbox"
                checked={showMissingOnly}
                onChange={e => setShowMissingOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Mostra solo voci senza analisi
            </label>

            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={handleExport} disabled={!canExport} className="btn btn-neutral">
                <Download size={16} /> Esporta Excel
              </button>
              <button type="button" onClick={handlePrint} disabled={!canExport || analyzed.length === 0} className="btn btn-primary">
                <Printer size={16} /> Stampa / PDF
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[52vh] overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Codice</th>
                    <th className="px-2 py-2 text-left font-semibold">Descrizione</th>
                    <th className="px-2 py-2 text-center font-semibold">U.M.</th>
                    <th className="px-2 py-2 text-right font-semibold">Q.tà</th>
                    <th className="px-2 py-2 text-right font-semibold">Prezzo computo</th>
                    <th className="px-2 py-2 text-right font-semibold">Prezzo EPU</th>
                    <th className="px-2 py-2 text-right font-semibold">Δ</th>
                    <th className="px-2 py-2 text-right font-semibold">Materiali</th>
                    <th className="px-2 py-2 text-right font-semibold">Manodopera</th>
                    <th className="px-2 py-2 text-center font-semibold">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map(({ item }) => {
                    const hasAnalysis = !!item.priceAnalysis && item.priceAnalysis.rows.length > 0;
                    const analysisTotals = computeAnalysisTotals(item);
                    const delta = hasAnalysis && item.price > 0 ? ((analysisTotals.epu - item.price) / item.price) * 100 : null;
                    const matPct = analysisTotals.direct > 0 ? (analysisTotals.byType.material / analysisTotals.direct) * 100 : 0;
                    const labPct = analysisTotals.direct > 0 ? (analysisTotals.byType.labor / analysisTotals.direct) * 100 : 0;

                    return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                        <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">
                          {item.code}
                        </td>
                        <td className="max-w-[420px] px-2 py-1.5 text-slate-700">
                          <span className="line-clamp-2">{item.description}</span>
                        </td>
                        <td className="px-2 py-1.5 text-center text-slate-500">{item.uom}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{item.qty.toLocaleString('it-IT', { maximumFractionDigits: 3 })}</td>
                        <td className="px-2 py-1.5 text-right text-slate-600">{currency(item.price)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {hasAnalysis ? <span className="text-emerald-700">{currency(analysisTotals.epu)}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {delta !== null ? (
                            <span className={`font-semibold ${delta < 0 ? 'text-emerald-700' : delta > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                              {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600">
                          {hasAnalysis ? `${matPct.toFixed(1)}%` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600">
                          {hasAnalysis ? `${labPct.toFixed(1)}%` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {hasAnalysis ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 size={11} /> Analizzata
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              <AlertTriangle size={11} /> Da analizzare
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleEntries.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                        Nessuna voce corrisponde ai filtri selezionati.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info size={13} className="mt-0.5 shrink-0" />
            L'elenco comprende tutte le voci del computo. Usa il filtro “Mostra solo voci senza analisi” per individuare quelle ancora da compilare.
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            {analyzed.length} analisi · {missing.length} voci da analizzare
          </span>
          <button onClick={onClose} className="btn btn-primary sm:ml-auto">Chiudi</button>
        </div>
      </div>
    </div>
  );
};
