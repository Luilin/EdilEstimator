import React, { useMemo, useState } from 'react';
import { CostItem, PriceAnalysis, PriceAnalysisRow, PriceAnalysisRowType } from '../types';
import { X, Plus, Trash2, FlaskConical, Printer, Info } from 'lucide-react';

interface Props {
  item: CostItem;
  canEdit: boolean;
  canExport: boolean;
  onClose: () => void;
  onSave: (analysis: PriceAnalysis, applyPrice: boolean) => void;
}

const TYPE_LABELS: Record<PriceAnalysisRowType, string> = {
  material: 'Materiali',
  labor: 'Manodopera',
  equipment: 'Noli e attrezzature',
  safety: 'Sicurezza',
  other: 'Altro',
};

const TYPE_OPTIONS: PriceAnalysisRowType[] = ['material', 'labor', 'equipment', 'safety', 'other'];

const TYPE_DOTS: Record<PriceAnalysisRowType, string> = {
  material: 'bg-emerald-500',
  labor: 'bg-amber-500',
  equipment: 'bg-slate-500',
  safety: 'bg-red-400',
  other: 'bg-slate-400',
};

const newRow = (type: PriceAnalysisRowType, uom: string): PriceAnalysisRow => ({
  id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  type,
  description: '',
  uom,
  quantity: 1,
  unitPrice: 0,
});

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

export const PriceAnalysisModal: React.FC<Props> = ({ item, canEdit, canExport, onClose, onSave }) => {
  const initial = useMemo(() => {
    const existing = item.priceAnalysis;
    if (existing && existing.rows.length > 0) {
      return {
        rows: existing.rows.map(row => ({ ...row })),
        overheads: existing.overheadsPercent || 0,
        profit: existing.profitPercent || 0,
        notes: existing.notes || '',
      };
    }

    const seeded: PriceAnalysisRow[] = [];
    if ((item.materialPrice || 0) > 0) {
      seeded.push({ ...newRow('material', item.uom), description: 'Materiali', unitPrice: item.materialPrice || 0 });
    }
    if ((item.laborPrice || 0) > 0) {
      seeded.push({ ...newRow('labor', item.uom), description: 'Manodopera', unitPrice: item.laborPrice || 0 });
    }
    if (seeded.length === 0) seeded.push(newRow('material', item.uom));

    return {
      rows: seeded,
      overheads: existing?.overheadsPercent ?? 0,
      profit: existing?.profitPercent ?? 0,
      notes: existing?.notes || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rows, setRows] = useState<PriceAnalysisRow[]>(initial.rows);
  const [overheads, setOverheads] = useState<number>(initial.overheads);
  const [profit, setProfit] = useState<number>(initial.profit);
  const [notes, setNotes] = useState<string>(initial.notes);

  const directCost = rows.reduce((sum, row) => sum + (row.quantity || 0) * (row.unitPrice || 0), 0);
  const overheadValue = directCost * (overheads || 0) / 100;
  const profitValue = (directCost + overheadValue) * (profit || 0) / 100;
  const epu = directCost + overheadValue + profitValue;

  const typeTotals = rows.reduce<Record<PriceAnalysisRowType, number>>((acc, row) => {
    acc[row.type] += (row.quantity || 0) * (row.unitPrice || 0);
    return acc;
  }, { material: 0, labor: 0, equipment: 0, safety: 0, other: 0 });

  const incidence = (value: number) => (directCost > 0 ? (value / directCost) * 100 : 0);

  const updateRow = (id: string, field: keyof PriceAnalysisRow, value: string | number) => {
    setRows(previous => previous.map(row => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addRow = (type: PriceAnalysisRowType) => {
    setRows(previous => [...previous, newRow(type, item.uom)]);
  };

  const removeRow = (id: string) => {
    setRows(previous => (previous.length > 1 ? previous.filter(row => row.id !== id) : previous));
  };

  const buildAnalysis = (): PriceAnalysis => ({
    rows: rows.filter(row => row.description.trim() !== '' || row.unitPrice !== 0 || row.quantity !== 1),
    overheadsPercent: overheads || 0,
    profitPercent: profit || 0,
    notes: notes.trim() || undefined,
    updatedAt: Date.now(),
  });

  const handlePrint = () => {
    if (!canExport) return;

    const rowsHtml = rows.map(row => `
      <tr>
        <td>${escapeHtml(TYPE_LABELS[row.type])}</td>
        <td>${escapeHtml(row.description || '—')}</td>
        <td>${escapeHtml(row.uom || '—')}</td>
        <td class="num">${row.quantity.toLocaleString('it-IT')}</td>
        <td class="num">${(row.unitPrice || 0).toFixed(2)}</td>
        <td class="num">${((row.quantity || 0) * (row.unitPrice || 0)).toFixed(2)}</td>
      </tr>
    `).join('');

    const incidenceHtml = TYPE_OPTIONS
      .filter(type => typeTotals[type] > 0)
      .map(type => `<li>${TYPE_LABELS[type]}: ${incidence(typeTotals[type]).toFixed(1)}%</li>`)
      .join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Analisi prezzo - ${escapeHtml(item.code)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 10.5px; line-height: 1.45; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 3px; text-transform: uppercase; }
  .subtitle { text-align: center; color: #475569; font-size: 10px; margin-bottom: 14px; }
  h2 { font-size: 11px; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #94a3b8; padding: 4px 6px; vertical-align: top; }
  th { background: #e2e8f0; font-size: 9px; text-transform: uppercase; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .summary { margin-top: 10px; width: 60%; margin-left: auto; }
  .summary td { border: none; padding: 2px 4px; }
  .summary .label { color: #475569; }
  .summary .total { border-top: 2px solid #0f172a; font-weight: bold; font-size: 12px; }
  .muted { color: #64748b; font-size: 9px; }
  .notes { margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 8px; }
</style>
</head>
<body>
  <h1>Analisi del Prezzo Unitario</h1>
  <div class="subtitle">
    ${escapeHtml(item.code)} — ${escapeHtml(item.description)}<br/>
    U.M.: ${escapeHtml(item.uom)} · Quantità: ${item.qty.toLocaleString('it-IT')} · Data: ${new Date().toLocaleDateString('it-IT')}
  </div>

  <h2>Composizione del prezzo</h2>
  <table>
    <thead>
      <tr>
        <th>Tipologia</th>
        <th>Descrizione</th>
        <th>U.M.</th>
        <th class="num">Quantità</th>
        <th class="num">Prezzo unitario (€)</th>
        <th class="num">Importo (€)</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <table class="summary">
    <tr><td class="label">Costo diretto</td><td class="num">${directCost.toFixed(2)}</td></tr>
    <tr><td class="label">Spese generali (${overheads || 0}%)</td><td class="num">${overheadValue.toFixed(2)}</td></tr>
    <tr><td class="label">Utile (${profit || 0}%)</td><td class="num">${profitValue.toFixed(2)}</td></tr>
    <tr><td class="label total">Prezzo unitario EPU</td><td class="num total">${epu.toFixed(2)}</td></tr>
    <tr><td class="label">Prezzo attuale in computo</td><td class="num">${(item.price || 0).toFixed(2)}</td></tr>
  </table>

  ${incidenceHtml ? `<h2>Incidenza sul costo diretto</h2><ul>${incidenceHtml}</ul>` : ''}
  ${notes.trim() ? `<h2>Note</h2><div class="notes">${escapeHtml(notes.trim())}</div>` : ''}

  <p class="muted" style="margin-top:16px">Documento generato da Stimia il ${new Date().toLocaleString('it-IT')}.</p>
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
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <FlaskConical size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Analisi del Prezzo Unitario (EPU)</h2>
              <p className="truncate text-xs text-slate-300">{item.code} — {item.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm sm:grid-cols-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Unità di misura</div>
              <div className="font-semibold text-slate-700">{item.uom}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quantità</div>
              <div className="font-semibold text-slate-700">{item.qty.toLocaleString('it-IT')}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Prezzo in computo</div>
              <div className="font-semibold text-slate-700">{currency(item.price)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Prezzo EPU</div>
              <div className="font-bold text-emerald-700">{currency(epu)}</div>
            </div>
          </div>

          {/* Rows */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
              <h3 className="text-sm font-bold text-slate-800">Voci della composizione</h3>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {TYPE_OPTIONS.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => addRow(type)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      title={`Aggiungi ${TYPE_LABELS[type]}`}
                    >
                      <Plus size={12} /> {TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="max-h-[42vh] overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Tipologia</th>
                    <th className="px-2 py-2 text-left font-semibold">Descrizione</th>
                    <th className="px-2 py-2 text-center font-semibold">U.M.</th>
                    <th className="px-2 py-2 text-right font-semibold">Q.tà</th>
                    <th className="px-2 py-2 text-right font-semibold">Prezzo unit. (€)</th>
                    <th className="px-2 py-2 text-right font-semibold">Importo (€)</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_DOTS[row.type]}`}></span>
                          <select
                            value={row.type}
                            disabled={!canEdit}
                            onChange={e => updateRow(row.id, 'type', e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                          >
                            {TYPE_OPTIONS.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={row.description}
                          disabled={!canEdit}
                          onChange={e => updateRow(row.id, 'description', e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                          placeholder="Es. malta premiscelata, operaio specializzato..."
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={row.uom}
                          disabled={!canEdit}
                          onChange={e => updateRow(row.id, 'uom', e.target.value)}
                          className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.quantity}
                          disabled={!canEdit}
                          onChange={e => updateRow(row.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unitPrice}
                          disabled={!canEdit}
                          onChange={e => updateRow(row.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-slate-700">
                        {currency((row.quantity || 0) * (row.unitPrice || 0))}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length <= 1}
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                            title="Rimuovi riga"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        Nessuna voce. Aggiungi materiali, manodopera, noli o sicurezza.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Percentuali e riepilogo */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">Spese e utile</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Spese generali (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={overheads}
                    disabled={!canEdit}
                    onChange={e => setOverheads(parseFloat(e.target.value) || 0)}
                    className="field"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-600">Utile d'impresa (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={profit}
                    disabled={!canEdit}
                    onChange={e => setProfit(parseFloat(e.target.value) || 0)}
                    className="field"
                  />
                </div>
              </div>

              <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Costo diretto</span><b className="text-slate-700">{currency(directCost)}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Spese generali ({overheads || 0}%)</span><span className="text-slate-700">{currency(overheadValue)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Utile ({profit || 0}%)</span><span className="text-slate-700">{currency(profitValue)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm">
                  <b className="text-slate-700">Prezzo EPU</b>
                  <b className="text-emerald-700">{currency(epu)}</b>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Prezzo attuale in computo</span>
                  <span className={Math.abs(epu - item.price) < 0.005 ? 'text-slate-500' : 'font-semibold text-amber-700'}>
                    {currency(item.price)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-slate-800">Incidenza sul costo diretto</h3>
              <div className="space-y-2">
                {TYPE_OPTIONS.map(type => {
                  const value = typeTotals[type];
                  const pct = incidence(value);
                  return (
                    <div key={type}>
                      <div className="mb-0.5 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <span className={`h-2 w-2 rounded-full ${TYPE_DOTS[type]}`}></span>
                          {TYPE_LABELS[type]}
                        </span>
                        <span className="font-semibold text-slate-700">{pct.toFixed(1)}% · {currency(value)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${TYPE_DOTS[type]}`} style={{ width: `${Math.min(100, pct)}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-[11px] font-semibold text-slate-600">Note dell'analisi</label>
                <textarea
                  value={notes}
                  disabled={!canEdit}
                  onChange={e => setNotes(e.target.value)}
                  className="field h-20 resize-none text-xs"
                  placeholder="Eventuali annotazioni, riferimenti a listini o condizioni"
                />
              </div>
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info size={13} className="mt-0.5 shrink-0" />
            Il prezzo EPU è calcolato come costo diretto + spese generali + utile. Puoi applicarlo al prezzo unitario della voce del computo.
          </p>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!canExport}
              className="btn btn-neutral"
              title="Stampa o salva in PDF l'analisi del prezzo"
            >
              <Printer size={16} /> Stampa / PDF
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn btn-neutral">Chiudi</button>
            {canEdit && (
              <>
                <button type="button" onClick={() => onSave(buildAnalysis(), false)} className="btn btn-neutral">
                  Salva analisi
                </button>
                <button type="button" onClick={() => onSave(buildAnalysis(), true)} className="btn btn-primary">
                  Salva e applica prezzo
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
