import React, { useMemo, useState } from 'react';
import { CostItem, InvoiceSettings, Project, WBSNode } from '../../types';
import { Download, Eye, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { buildFatturaPA, downloadFatturaPA } from '../../services/fatturaPA';
import { currency } from './shared';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
}

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultSettings = (): InvoiceSettings => ({
  companyName: '',
  vatNumber: '',
  taxCode: '',
  address: '',
  postalCode: '',
  city: '',
  province: '',
  country: 'IT',
  regimeFiscale: 'RF01',
  iban: '',
  invoiceNumber: `1/${new Date().getFullYear()}`,
  invoiceDate: today(),
  invoiceType: 'TD01',
  vatPercent: 22,
  splitPayment: false,
  ritenutaPercent: 0,
  cassaPercent: 0,
  bollo: false,
  clientName: '',
  clientVatNumber: '',
  clientTaxCode: '',
  clientAddress: '',
  clientPostalCode: '',
  clientCity: '',
  clientProvince: '',
  clientCodeDestinatario: '0000000',
  clientPec: '',
  paymentTerms: 'TP02',
});

const collectItems = (node: WBSNode): CostItem[] => {
  const items = [...node.items];
  node.children.forEach(child => items.push(...collectItems(child)));
  return items;
};

interface FieldProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  className?: string;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, disabled, type = 'text', placeholder, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-[11px] font-semibold text-slate-600">{label}</span>
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      className="field"
    />
  </label>
);

export const InvoicePanel: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject }) => {
  const settings = project.invoiceSettings || defaultSettings();
  const [salId, setSalId] = useState(project.sals?.[0]?.id || '');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const update = (partial: Partial<InvoiceSettings>) => {
    if (!canEdit) return;
    onUpdateProject({ ...project, invoiceSettings: { ...settings, ...partial } });
  };

  const selectedSal = (project.sals || []).find(sal => sal.id === salId);

  const salTotal = useMemo(() => {
    if (!selectedSal) return 0;
    const items = collectItems(project.rootWBS);
    const byId = new Map(items.map(item => [item.id, item]));
    return selectedSal.rows.reduce((sum, row) => {
      const item = byId.get(row.costItemId);
      return sum + (item ? item.price * row.qty : 0);
    }, 0);
  }, [selectedSal, project.rootWBS]);

  const handleDownload = () => {
    if (!canExport || !selectedSal) return;
    setMessage(null);
    try {
      downloadFatturaPA(project, selectedSal, settings);
      setMessage({ type: 'success', text: 'Fattura elettronica generata.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Errore nella generazione della fattura.' });
    }
  };

  const handlePreview = () => {
    if (!selectedSal) return;
    setMessage(null);
    try {
      setPreview(buildFatturaPA(project, selectedSal.id, settings));
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Errore nella generazione della fattura.' });
    }
  };

  const missingSal = !selectedSal;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Fattura elettronica da SAL</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Genera il file XML FatturaPA (FPR12) dalle quantità del SAL selezionato.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">SAL da fatturare</span>
            <select value={salId} onChange={e => setSalId(e.target.value)} className="field min-w-[220px]">
              {(project.sals || []).map(sal => <option key={sal.id} value={sal.id}>{sal.code} — {sal.name}</option>)}
              {(project.sals || []).length === 0 && <option value="">Nessun SAL disponibile</option>}
            </select>
          </label>
          <button type="button" onClick={handlePreview} disabled={missingSal} className="btn btn-neutral">
            <Eye size={16} /> Anteprima
          </button>
          <button type="button" onClick={handleDownload} disabled={!canExport || missingSal} className="btn btn-primary">
            <Download size={16} /> Scarica XML
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">SAL selezionato</div>
          <div className="text-lg font-bold text-slate-800">{selectedSal ? `${selectedSal.code}` : '—'}</div>
          <div className="text-[10px] text-slate-400">{selectedSal ? selectedSal.name : 'Nessun SAL'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Imponibile SAL</div>
          <div className="text-lg font-bold text-slate-800">{currency(salTotal)}</div>
          <div className="text-[10px] text-slate-400">{selectedSal?.rows.length || 0} righe</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Totale con IVA</div>
          <div className="text-lg font-bold text-emerald-800">{currency(salTotal * (1 + settings.vatPercent / 100))}</div>
          <div className="text-[10px] text-emerald-600">IVA {settings.vatPercent}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-2 text-sm font-bold text-slate-800">Cedente / Prestatore</h4>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ragione sociale *" value={settings.companyName} onChange={value => update({ companyName: value })} disabled={!canEdit} className="col-span-2" />
            <Field label="P.IVA *" value={settings.vatNumber} onChange={value => update({ vatNumber: value })} disabled={!canEdit} placeholder="IT01234567890" />
            <Field label="Codice fiscale" value={settings.taxCode || ''} onChange={value => update({ taxCode: value })} disabled={!canEdit} />
            <Field label="Indirizzo *" value={settings.address} onChange={value => update({ address: value })} disabled={!canEdit} className="col-span-2" />
            <Field label="CAP *" value={settings.postalCode} onChange={value => update({ postalCode: value })} disabled={!canEdit} />
            <Field label="Comune *" value={settings.city} onChange={value => update({ city: value })} disabled={!canEdit} />
            <Field label="Provincia *" value={settings.province} onChange={value => update({ province: value })} disabled={!canEdit} placeholder="RM" />
            <Field label="IBAN" value={settings.iban || ''} onChange={value => update({ iban: value })} disabled={!canEdit} className="col-span-2" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="mb-2 text-sm font-bold text-slate-800">Committente / Cessionario</h4>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ragione sociale *" value={settings.clientName} onChange={value => update({ clientName: value })} disabled={!canEdit} className="col-span-2" />
            <Field label="P.IVA *" value={settings.clientVatNumber} onChange={value => update({ clientVatNumber: value })} disabled={!canEdit} />
            <Field label="Codice fiscale" value={settings.clientTaxCode || ''} onChange={value => update({ clientTaxCode: value })} disabled={!canEdit} />
            <Field label="Indirizzo *" value={settings.clientAddress} onChange={value => update({ clientAddress: value })} disabled={!canEdit} className="col-span-2" />
            <Field label="CAP *" value={settings.clientPostalCode} onChange={value => update({ clientPostalCode: value })} disabled={!canEdit} />
            <Field label="Comune *" value={settings.clientCity} onChange={value => update({ clientCity: value })} disabled={!canEdit} />
            <Field label="Provincia *" value={settings.clientProvince} onChange={value => update({ clientProvince: value })} disabled={!canEdit} placeholder="RM" />
            <Field label="Codice destinatario" value={settings.clientCodeDestinatario || ''} onChange={value => update({ clientCodeDestinatario: value })} disabled={!canEdit} placeholder="0000000" />
            <Field label="PEC destinatario" value={settings.clientPec || ''} onChange={value => update({ clientPec: value })} disabled={!canEdit} className="col-span-2" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-bold text-slate-800">Dati documento</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Numero *" value={settings.invoiceNumber} onChange={value => update({ invoiceNumber: value })} disabled={!canEdit} />
          <Field label="Data *" type="date" value={settings.invoiceDate} onChange={value => update({ invoiceDate: value })} disabled={!canEdit} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Tipo documento</span>
            <select value={settings.invoiceType} disabled={!canEdit} onChange={e => update({ invoiceType: e.target.value })} className="field">
              <option value="TD01">TD01 — Fattura</option>
              <option value="TD06">TD06 — Parcella</option>
              <option value="TD24">TD24 — Fattura differita</option>
            </select>
          </label>
          <Field label="Aliquota IVA (%)" type="number" value={settings.vatPercent} onChange={value => update({ vatPercent: parseFloat(value) || 0 })} disabled={!canEdit} />
          <Field label="Ritenuta (%)" type="number" value={settings.ritenutaPercent} onChange={value => update({ ritenutaPercent: parseFloat(value) || 0 })} disabled={!canEdit} />
          <Field label="Cassa previdenziale (%)" type="number" value={settings.cassaPercent} onChange={value => update({ cassaPercent: parseFloat(value) || 0 })} disabled={!canEdit} />
          <label className="flex items-center gap-2 pt-5 text-xs text-slate-600">
            <input type="checkbox" checked={settings.splitPayment} disabled={!canEdit} onChange={e => update({ splitPayment: e.target.checked })} />
            Split payment
          </label>
          <label className="flex items-center gap-2 pt-5 text-xs text-slate-600">
            <input type="checkbox" checked={settings.bollo} disabled={!canEdit} onChange={e => update({ bollo: e.target.checked })} />
            Bollo virtuale (2 €)
          </label>
        </div>
      </div>

      {message && (
        <p className={`flex items-start gap-1.5 rounded-lg p-2 text-[11px] ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {message.type === 'success' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
          {message.text}
        </p>
      )}

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-800">Anteprima XML</h4>
            <button type="button" onClick={() => setPreview(null)} className="text-xs text-slate-500 hover:text-slate-800">Chiudi</button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-[10px] leading-relaxed text-emerald-100">{preview}</pre>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
        <Info size={13} className="mt-0.5 shrink-0" />
        Il file generato è una base FatturaPA FPR12. Verifica sempre i dati fiscali e la conformità al tracciato del tuo commercialista prima dell'invio al SDI.
      </p>
    </div>
  );
};
