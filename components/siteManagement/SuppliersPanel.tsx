import React, { useMemo, useState } from 'react';
import { Project, Supplier } from '../../types';
import { Save, Trash2, Pencil, Search, Download, AlertTriangle, Truck, HardHat } from 'lucide-react';
import { currency, dateLabel, expiryLabel, expiryTone, makeId, parseDateInput, toDateInput } from './shared';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
}

const emptyForm = {
  id: null as string | null,
  companyName: '',
  vatNumber: '',
  type: 'fornitore' as Supplier['type'],
  email: '',
  pec: '',
  phone: '',
  soa: '',
  contractAmount: '',
  durcExpiry: '',
  policyExpiry: '',
  notes: '',
};

const toneClass: Record<string, string> = {
  danger: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  none: 'bg-slate-50 text-slate-500 border-slate-200',
};

export const SuppliersPanel: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject }) => {
  const suppliers = project.suppliers || [];
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter(supplier =>
      [supplier.companyName, supplier.vatNumber, supplier.soa, supplier.email, supplier.pec]
        .some(value => (value || '').toLowerCase().includes(query))
    );
  }, [suppliers, search]);

  const reset = () => setForm(emptyForm);

  const handleSave = () => {
    if (!canEdit || !form.companyName.trim()) return;
    const supplier: Supplier = {
      id: form.id || makeId('sup'),
      companyName: form.companyName.trim(),
      vatNumber: form.vatNumber.trim() || undefined,
      type: form.type,
      email: form.email.trim() || undefined,
      pec: form.pec.trim() || undefined,
      phone: form.phone.trim() || undefined,
      soa: form.soa.trim() || undefined,
      contractAmount: form.contractAmount ? (parseFloat(form.contractAmount) || 0) : undefined,
      durcExpiry: parseDateInput(form.durcExpiry),
      policyExpiry: parseDateInput(form.policyExpiry),
      notes: form.notes.trim() || undefined,
    };

    const next = form.id
      ? suppliers.map(item => (item.id === form.id ? supplier : item))
      : [...suppliers, supplier];

    onUpdateProject({ ...project, suppliers: next });
    setMessage(form.id ? 'Fornitore aggiornato.' : 'Fornitore aggiunto.');
    reset();
  };

  const handleEdit = (supplier: Supplier) => {
    setForm({
      id: supplier.id,
      companyName: supplier.companyName,
      vatNumber: supplier.vatNumber || '',
      type: supplier.type,
      email: supplier.email || '',
      pec: supplier.pec || '',
      phone: supplier.phone || '',
      soa: supplier.soa || '',
      contractAmount: supplier.contractAmount !== undefined ? String(supplier.contractAmount) : '',
      durcExpiry: toDateInput(supplier.durcExpiry),
      policyExpiry: toDateInput(supplier.policyExpiry),
      notes: supplier.notes || '',
    });
    setMessage(null);
  };

  const handleDelete = (supplier: Supplier) => {
    if (!canEdit) return;
    if (!window.confirm(`Eliminare "${supplier.companyName}" dall'elenco?`)) return;
    onUpdateProject({ ...project, suppliers: suppliers.filter(item => item.id !== supplier.id) });
    if (form.id === supplier.id) reset();
  };

  const handleExport = async () => {
    if (!canExport) return;
    const XLSX = await import('xlsx');
    const rows: unknown[][] = [
      ['FORNITORI E SUBAPPALTATORI'],
      [`Progetto: ${project.name}`],
      [],
      ['Azienda', 'P.IVA', 'Tipo', 'Email', 'PEC', 'Telefono', 'SOA', 'Importo contratto', 'Scadenza DURC', 'Scadenza polizza', 'Note'],
      ...suppliers.map(supplier => [
        supplier.companyName,
        supplier.vatNumber || '',
        supplier.type,
        supplier.email || '',
        supplier.pec || '',
        supplier.phone || '',
        supplier.soa || '',
        supplier.contractAmount ?? '',
        dateLabel(supplier.durcExpiry),
        dateLabel(supplier.policyExpiry),
        supplier.notes || '',
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Fornitori');
    XLSX.writeFile(workbook, `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_fornitori.xlsx`);
  };

  const totalContracts = suppliers.reduce((sum, supplier) => sum + (supplier.contractAmount || 0), 0);
  const expiring = suppliers.filter(supplier =>
    ['danger', 'warning'].includes(expiryTone(supplier.durcExpiry)) ||
    ['danger', 'warning'].includes(expiryTone(supplier.policyExpiry))
  ).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">{form.id ? 'Modifica fornitore' : 'Nuovo fornitore'}</h3>
          {form.id && <button type="button" onClick={reset} className="text-xs text-slate-500 hover:text-slate-800">Annulla</button>}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Ragione sociale *</span>
          <input value={form.companyName} disabled={!canEdit} onChange={e => setForm({ ...form, companyName: e.target.value })} className="field" placeholder="Impresa Rossi S.r.l." />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">P.IVA</span>
            <input value={form.vatNumber} disabled={!canEdit} onChange={e => setForm({ ...form, vatNumber: e.target.value })} className="field" placeholder="IT01234567890" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Tipo</span>
            <select value={form.type} disabled={!canEdit} onChange={e => setForm({ ...form, type: e.target.value as Supplier['type'] })} className="field">
              <option value="fornitore">Fornitore</option>
              <option value="subappaltatore">Subappaltatore</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Email</span>
            <input type="email" value={form.email} disabled={!canEdit} onChange={e => setForm({ ...form, email: e.target.value })} className="field" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">PEC</span>
            <input type="email" value={form.pec} disabled={!canEdit} onChange={e => setForm({ ...form, pec: e.target.value })} className="field" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Telefono</span>
            <input value={form.phone} disabled={!canEdit} onChange={e => setForm({ ...form, phone: e.target.value })} className="field" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">SOA</span>
            <input value={form.soa} disabled={!canEdit} onChange={e => setForm({ ...form, soa: e.target.value })} className="field" placeholder="OG1, OS6..." />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Importo contratto (€)</span>
          <input type="number" step="0.01" value={form.contractAmount} disabled={!canEdit} onChange={e => setForm({ ...form, contractAmount: e.target.value })} className="field" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Scadenza DURC</span>
            <input type="date" value={form.durcExpiry} disabled={!canEdit} onChange={e => setForm({ ...form, durcExpiry: e.target.value })} className="field" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Scadenza polizza</span>
            <input type="date" value={form.policyExpiry} disabled={!canEdit} onChange={e => setForm({ ...form, policyExpiry: e.target.value })} className="field" />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Note</span>
          <textarea value={form.notes} disabled={!canEdit} onChange={e => setForm({ ...form, notes: e.target.value })} className="field h-16 resize-none" />
        </label>

        <button type="button" onClick={handleSave} disabled={!canEdit || !form.companyName.trim()} className="btn btn-primary w-full">
          <Save size={16} /> {form.id ? 'Aggiorna' : 'Aggiungi fornitore'}
        </button>

        {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
      </div>

      <div className="space-y-3 lg:col-span-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fornitori</div>
            <div className="text-lg font-bold text-slate-800">{suppliers.length}</div>
            <div className="text-[10px] text-slate-400">{currency(totalContracts)} contratti</div>
          </div>
          <div className={`rounded-xl border p-3 shadow-sm ${expiring > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Scadenze vicine</div>
            <div className={`text-lg font-bold ${expiring > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{expiring}</div>
            <div className="text-[10px] text-slate-400">DURC o polizze entro 30 gg</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca azienda, P.IVA, SOA..." className="field pl-8" />
          </div>
          <button type="button" onClick={handleExport} disabled={!canExport || suppliers.length === 0} className="btn btn-neutral">
            <Download size={16} /> Excel
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">Azienda</th>
                <th className="px-2 py-2 text-left font-semibold">Tipo</th>
                <th className="px-2 py-2 text-left font-semibold">DURC</th>
                <th className="px-2 py-2 text-left font-semibold">Polizza</th>
                <th className="px-2 py-2 text-right font-semibold">Contratto</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(supplier => (
                <tr key={supplier.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 text-slate-700">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {supplier.type === 'subappaltatore' ? <HardHat size={13} className="text-amber-600" /> : <Truck size={13} className="text-slate-400" />}
                      {supplier.companyName}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {supplier.vatNumber || '—'}{supplier.soa ? ` · ${supplier.soa}` : ''}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 capitalize text-slate-600">{supplier.type}</td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClass[expiryTone(supplier.durcExpiry)]}`}>
                      {expiryLabel(supplier.durcExpiry)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClass[expiryTone(supplier.policyExpiry)]}`}>
                      {expiryLabel(supplier.policyExpiry)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-700">
                    {supplier.contractAmount !== undefined ? currency(supplier.contractAmount) : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    {canEdit && (
                      <div className="flex justify-end gap-0.5">
                        <button type="button" onClick={() => handleEdit(supplier)} className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" title="Modifica">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => handleDelete(supplier)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Elimina">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                    <Truck size={24} className="mx-auto mb-2 text-slate-300" />
                    Nessun fornitore registrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {expiring > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {expiring} fornitori hanno DURC o polizze in scadenza entro 30 giorni.
          </p>
        )}
      </div>
    </div>
  );
};
