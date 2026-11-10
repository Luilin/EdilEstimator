import React, { useMemo } from 'react';
import { CostItem, Project, QuadroEconomicoSettings, WBSNode } from '../types';
import { X, Landmark, Printer, Download, Save, Info, AlertTriangle } from 'lucide-react';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
  onClose: () => void;
}

const SOA_CODES = [
  'OG1', 'OG2', 'OG3', 'OG4', 'OG5', 'OG6', 'OG7', 'OG8', 'OG9', 'OG10', 'OG11', 'OG12', 'OG13',
  'OS1', 'OS2', 'OS3', 'OS4', 'OS5', 'OS6', 'OS7', 'OS8', 'OS9', 'OS10', 'OS11', 'OS12', 'OS13',
  'OS14', 'OS15', 'OS16', 'OS17', 'OS18', 'OS19', 'OS20', 'OS21', 'OS22', 'OS23', 'OS24', 'OS25',
  'OS26', 'OS27', 'OS28', 'OS29', 'OS30', 'OS31', 'OS32', 'OS33', 'OS34', 'OS35',
];

const DEFAULT_SETTINGS: QuadroEconomicoSettings = {
  ivaPercent: 22,
  imprevistiPercent: 5,
  accantonamentiPercent: 1,
  speseTecnichePercent: 2,
  oneriSicurezzaMode: 'auto',
  oneriSicurezzaPercent: 0,
  ribassoPercent: 0,
  sogliaAnomaliaPercent: 20,
  categorySoa: {},
};

const currency = (value: number) =>
  `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] as string));

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

const collectItems = (node: WBSNode): CostItem[] => {
  const items = [...node.items];
  node.children.forEach(child => items.push(...collectItems(child)));
  return items;
};

const itemSafetyUnit = (item: CostItem): number =>
  item.priceAnalysis
    ? item.priceAnalysis.rows
        .filter(row => row.type === 'safety')
        .reduce((sum, row) => sum + (row.quantity || 0) * (row.unitPrice || 0), 0)
    : 0;

export const QuadroEconomicoModal: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject, onClose }) => {
  const settings = project.quadroEconomico || DEFAULT_SETTINGS;

  const update = (partial: Partial<QuadroEconomicoSettings>) => {
    if (!canEdit) return;
    onUpdateProject({ ...project, quadroEconomico: { ...settings, ...partial } });
  };

  const totals = useMemo(() => {
    const allItems = collectItems(project.rootWBS);
    const lavori = allItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const sicurezzaAuto = allItems.reduce((sum, item) => sum + itemSafetyUnit(item) * (item.qty || 0), 0);
    const oneriSicurezza = settings.oneriSicurezzaMode === 'auto'
      ? Math.min(sicurezzaAuto, lavori)
      : lavori * (settings.oneriSicurezzaPercent || 0) / 100;
    const lavoriNetto = Math.max(0, lavori - oneriSicurezza);

    const imprevisti = lavoriNetto * (settings.imprevistiPercent || 0) / 100;
    const accantonamenti = lavoriNetto * (settings.accantonamentiPercent || 0) / 100;
    const speseTecniche = (lavoriNetto + oneriSicurezza) * (settings.speseTecnichePercent || 0) / 100;
    const imponibile = lavoriNetto + oneriSicurezza + imprevisti + accantonamenti + speseTecniche;
    const iva = imponibile * (settings.ivaPercent || 0) / 100;
    const totale = imponibile + iva;

    const baseGara = lavoriNetto + oneriSicurezza;
    const ribassoImporto = baseGara * (settings.ribassoPercent || 0) / 100;
    const importoNetto = baseGara - ribassoImporto;
    const sogliaAnomalia = baseGara * (1 - (settings.sogliaAnomaliaPercent || 0) / 100);

    const offerTotals = (project.offers || []).map(offer => ({
      offer,
      total: allItems.reduce((sum, item) => sum + (offer.items[item.id]?.price ?? 0) * item.qty, 0),
    }));
    const validOffers = offerTotals.filter(entry => entry.total > 0);
    const bestOffer = validOffers.length > 0
      ? validOffers.reduce((best, entry) => (entry.total < best.total ? entry : best))
      : null;
    const bestRibasso = bestOffer && baseGara > 0 ? ((baseGara - bestOffer.total) / baseGara) * 100 : null;
    const bestAnomala = bestOffer ? bestOffer.total < sogliaAnomalia : false;

    return {
      lavori,
      sicurezzaAuto,
      oneriSicurezza,
      lavoriNetto,
      imprevisti,
      accantonamenti,
      speseTecniche,
      imponibile,
      iva,
      totale,
      baseGara,
      ribassoImporto,
      importoNetto,
      sogliaAnomalia,
      bestOffer,
      bestRibasso,
      bestAnomala,
      items: allItems.length,
    };
  }, [project.rootWBS, project.offers, settings]);

  const categoryBreakdown = useMemo(() => {
    return project.rootWBS.children.map(node => {
      const items = collectItems(node);
      return {
        node,
        amount: items.reduce((sum, item) => sum + (item.amount || 0), 0),
        count: items.length,
        soa: settings.categorySoa?.[node.id] || '',
      };
    });
  }, [project.rootWBS, settings.categorySoa]);

  const soaTotals = useMemo(() => {
    const map = new Map<string, number>();
    categoryBreakdown.forEach(entry => {
      if (!entry.soa) return;
      map.set(entry.soa, (map.get(entry.soa) || 0) + entry.amount);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [categoryBreakdown]);

  const rows = [
    { label: 'Lavori a misura', value: totals.lavoriNetto },
    { label: 'Oneri della sicurezza', value: totals.oneriSicurezza },
    { label: 'Imprevisti', value: totals.imprevisti },
    { label: 'Accantonamenti', value: totals.accantonamenti },
    { label: 'Spese tecniche', value: totals.speseTecniche },
    { label: 'Imponibile', value: totals.imponibile, strong: true },
    { label: `IVA (${settings.ivaPercent}%)`, value: totals.iva },
    { label: 'Totale quadro economico', value: totals.totale, strong: true },
  ];

  const handleExportExcel = async () => {
    if (!canExport) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    const summary: unknown[][] = [
      ['QUADRO ECONOMICO'],
      [`Progetto: ${project.name}`],
      [`Data: ${new Date().toLocaleDateString('it-IT')}`],
      [],
      ['Voce', 'Importo (€)'],
      ...rows.map(row => [row.label, Number(row.value.toFixed(2))]),
      [],
      ['Base gara', Number(totals.baseGara.toFixed(2))],
      [`Ribasso (${settings.ribassoPercent}%)`, Number(totals.ribassoImporto.toFixed(2))],
      ['Importo netto', Number(totals.importoNetto.toFixed(2))],
      [`Soglia anomalia (${settings.sogliaAnomaliaPercent}%)`, Number(totals.sogliaAnomalia.toFixed(2))],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Quadro Economico');

    const soaRows: unknown[][] = [
      ['Categoria', 'Codice', 'SOA', 'Voci', 'Importo (€)'],
      ...categoryBreakdown.map(entry => [
        entry.node.name,
        entry.node.code,
        entry.soa || '—',
        entry.count,
        Number(entry.amount.toFixed(2)),
      ]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(soaRows), 'Categorie SOA');

    const cleanName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    XLSX.writeFile(workbook, `${cleanName}_quadro_economico.xlsx`);
  };

  const handlePrint = () => {
    if (!canExport) return;

    const rowsHtml = rows.map(row => `
      <tr class="${row.strong ? 'strong' : ''}">
        <td>${escapeHtml(row.label)}</td>
        <td class="num">${currency(row.value)}</td>
      </tr>`).join('');

    const soaHtml = categoryBreakdown.map(entry => `
      <tr>
        <td>${escapeHtml(entry.node.code)} — ${escapeHtml(entry.node.name)}</td>
        <td>${escapeHtml(entry.soa || '—')}</td>
        <td class="num">${entry.count}</td>
        <td class="num">${currency(entry.amount)}</td>
      </tr>`).join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Quadro Economico - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.45; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 3px; text-transform: uppercase; }
  .subtitle { text-align: center; color: #475569; font-size: 10px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #94a3b8; padding: 4px 6px; }
  th { background: #e2e8f0; font-size: 8.5px; text-transform: uppercase; text-align: left; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.strong td { background: #f1f5f9; font-weight: bold; }
  h2 { font-size: 11px; margin: 14px 0 5px; color: #1e293b; }
  .note { border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; font-size: 9px; color: #475569; }
  .footer { margin-top: 14px; font-size: 8px; color: #94a3b8; text-align: right; }
</style>
</head>
<body>
  <h1>Quadro Economico</h1>
  <div class="subtitle">Progetto: <b>${escapeHtml(project.name)}</b> — Data: ${new Date().toLocaleDateString('it-IT')}</div>

  <table>
    <thead><tr><th>Voce</th><th class="num">Importo</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <h2>Riepilogo gara</h2>
  <table>
    <tbody>
      <tr><td>Base gara (lavori + sicurezza)</td><td class="num">${currency(totals.baseGara)}</td></tr>
      <tr><td>Ribasso applicato (${settings.ribassoPercent}%)</td><td class="num">${currency(totals.ribassoImporto)}</td></tr>
      <tr class="strong"><td>Importo netto</td><td class="num">${currency(totals.importoNetto)}</td></tr>
      <tr><td>Soglia di anomalia (${settings.sogliaAnomaliaPercent}%)</td><td class="num">${currency(totals.sogliaAnomalia)}</td></tr>
    </tbody>
  </table>

  <h2>Categorie e categorie SOA</h2>
  <table>
    <thead><tr><th>Categoria</th><th>SOA</th><th class="num">Voci</th><th class="num">Importo</th></tr></thead>
    <tbody>${soaHtml}</tbody>
  </table>

  ${settings.notes ? `<div class="note">${escapeHtml(settings.notes)}</div>` : ''}
  <div class="footer">Documento generato da Stimia il ${new Date().toLocaleString('it-IT')}</div>
</body>
</html>`;

    printHtmlDocument(html);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <Landmark size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Quadro Economico</h2>
              <p className="truncate text-xs text-slate-300">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Lavori</div>
              <div className="text-lg font-bold text-slate-800">{currency(totals.lavori)}</div>
              <div className="text-[10px] text-slate-400">{totals.items} voci</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Oneri sicurezza</div>
              <div className="text-lg font-bold text-slate-800">{currency(totals.oneriSicurezza)}</div>
              <div className="text-[10px] text-slate-400">{settings.oneriSicurezzaMode === 'auto' ? 'da analisi EPU' : `${settings.oneriSicurezzaPercent}%`}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Imponibile</div>
              <div className="text-lg font-bold text-emerald-800">{currency(totals.imponibile)}</div>
              <div className="text-[10px] text-emerald-600">IVA {settings.ivaPercent}%</div>
            </div>
            <div className="rounded-xl border border-emerald-300 bg-emerald-600 p-3 text-white shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-100">Totale QE</div>
              <div className="text-lg font-bold">{currency(totals.totale)}</div>
              <div className="text-[10px] text-emerald-100">IVA inclusa</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800">Parametri</h3>
              <p className="mt-0.5 text-xs text-slate-500">Le modifiche vengono salvate nel computo.</p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">IVA (%)</span>
                  <input type="number" step="0.1" disabled={!canEdit} value={settings.ivaPercent} onChange={e => update({ ivaPercent: parseFloat(e.target.value) || 0 })} className="field" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Imprevisti (%)</span>
                  <input type="number" step="0.1" disabled={!canEdit} value={settings.imprevistiPercent} onChange={e => update({ imprevistiPercent: parseFloat(e.target.value) || 0 })} className="field" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Accantonamenti (%)</span>
                  <input type="number" step="0.1" disabled={!canEdit} value={settings.accantonamentiPercent} onChange={e => update({ accantonamentiPercent: parseFloat(e.target.value) || 0 })} className="field" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Spese tecniche (%)</span>
                  <input type="number" step="0.1" disabled={!canEdit} value={settings.speseTecnichePercent} onChange={e => update({ speseTecnichePercent: parseFloat(e.target.value) || 0 })} className="field" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Oneri sicurezza</span>
                  <select disabled={!canEdit} value={settings.oneriSicurezzaMode} onChange={e => update({ oneriSicurezzaMode: e.target.value as 'auto' | 'percent' })} className="field">
                    <option value="auto">Automatico da EPU</option>
                    <option value="percent">Percentuale sui lavori</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">% Oneri sicurezza</span>
                  <input type="number" step="0.1" disabled={!canEdit || settings.oneriSicurezzaMode === 'auto'} value={settings.oneriSicurezzaPercent} onChange={e => update({ oneriSicurezzaPercent: parseFloat(e.target.value) || 0 })} className="field" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Ribasso (%)</span>
                  <input type="number" step="0.1" disabled={!canEdit} value={settings.ribassoPercent} onChange={e => update({ ribassoPercent: parseFloat(e.target.value) || 0 })} className="field" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">Soglia anomalia (%)</span>
                  <input type="number" step="0.1" disabled={!canEdit} value={settings.sogliaAnomaliaPercent} onChange={e => update({ sogliaAnomaliaPercent: parseFloat(e.target.value) || 0 })} className="field" />
                </label>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Note</span>
                <textarea disabled={!canEdit} value={settings.notes || ''} onChange={e => update({ notes: e.target.value })} className="field h-16 resize-none" placeholder="Annotazioni del quadro economico" />
              </label>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Base gara</div>
                  <div className="font-bold text-slate-800">{currency(totals.baseGara)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Importo netto</div>
                  <div className="font-bold text-slate-800">{currency(totals.importoNetto)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Soglia anomalia</div>
                  <div className="font-bold text-slate-800">{currency(totals.sogliaAnomalia)}</div>
                </div>
                <div className={`rounded-lg p-2.5 ${totals.bestAnomala ? 'bg-red-50' : 'bg-emerald-50'}`}>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Migliore offerta</div>
                  <div className={`font-bold ${totals.bestAnomala ? 'text-red-700' : 'text-emerald-700'}`}>
                    {totals.bestOffer ? currency(totals.bestOffer.total) : '—'}
                  </div>
                  {totals.bestRibasso !== null && (
                    <div className="text-[10px] text-slate-500">ribasso {totals.bestRibasso.toFixed(1)}%</div>
                  )}
                </div>
              </div>

              {totals.bestAnomala && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-red-600">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  L’offerta migliore è sotto la soglia di anomalia impostata.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800">Categorie SOA</h3>
              <p className="mt-0.5 text-xs text-slate-500">Assegna una categoria a ogni capitolo principale.</p>

              <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">Categoria</th>
                      <th className="px-2 py-2 text-left font-semibold">SOA</th>
                      <th className="px-2 py-2 text-right font-semibold">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryBreakdown.map(entry => (
                      <tr key={entry.node.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-700">
                          <div className="font-semibold">{entry.node.name}</div>
                          <div className="text-[10px] text-slate-400">{entry.count} voci</div>
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            disabled={!canEdit}
                            value={entry.soa}
                            onChange={e => update({ categorySoa: { ...(settings.categorySoa || {}), [entry.node.id]: e.target.value } })}
                            className="field h-8 py-0 text-xs"
                          >
                            <option value="">—</option>
                            {SOA_CODES.map(code => <option key={code} value={code}>{code}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{currency(entry.amount)}</td>
                      </tr>
                    ))}
                    {categoryBreakdown.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-400">Nessuna categoria nel computo.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {soaTotals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {soaTotals.map(([code, amount]) => (
                    <span key={code} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {code}: {currency(amount)}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.label} className={`border-b border-slate-100 last:border-0 ${row.strong ? 'bg-slate-50 font-bold' : ''}`}>
                        <td className="px-2 py-1.5 text-slate-600">{row.label}</td>
                        <td className="px-2 py-1.5 text-right text-slate-800">{currency(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info size={13} className="mt-0.5 shrink-0" />
            La soglia di anomalia è un valore percentuale di riferimento configurabile; per le gare pubbliche verifica sempre il criterio previsto dal bando.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button onClick={handleExportExcel} disabled={!canExport} className="btn btn-neutral"><Download size={16} /> Esporta Excel</button>
          <button onClick={handlePrint} disabled={!canExport} className="btn btn-neutral"><Printer size={16} /> Stampa / PDF</button>
          <button onClick={onClose} className="btn btn-primary"><Save size={16} /> Chiudi</button>
        </div>
      </div>
    </div>
  );
};
