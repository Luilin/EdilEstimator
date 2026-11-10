import React, { useState } from 'react';
import { Project, RfqRequest } from '../../types';
import { Mail, Send, Trash2, Pencil, Save, Download, Copy, Clock, AlertTriangle } from 'lucide-react';
import { buildRfqEmail, downloadRfqEml, rfqMailto } from '../../services/rfq';
import { dateLabel, makeId, parseDateInput, toDateInput } from './shared';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
}

const DEFAULT_DAYS = 14;

const defaultForm = () => {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + DEFAULT_DAYS);
  return {
    id: null as string | null,
    companyName: '',
    contactName: '',
    email: '',
    pec: '',
    deadline: toDateInput(deadline.getTime()),
    status: 'da_inviare' as RfqRequest['status'],
    notes: '',
  };
};

const statusClass: Record<RfqRequest['status'], string> = {
  da_inviare: 'bg-amber-50 text-amber-700 border-amber-200',
  inviata: 'bg-sky-50 text-sky-700 border-sky-200',
  risposta: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const RfqPanel: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject }) => {
  const requests = project.rfqRequests || [];
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState<string | null>(null);

  const reset = () => setForm(defaultForm());

  const save = () => {
    if (!canEdit || !form.companyName.trim()) return;
    const request: RfqRequest = {
      id: form.id || makeId('rfq'),
      companyName: form.companyName.trim(),
      contactName: form.contactName.trim() || undefined,
      email: form.email.trim() || undefined,
      pec: form.pec.trim() || undefined,
      deadline: parseDateInput(form.deadline),
      sentAt: requests.find(item => item.id === form.id)?.sentAt,
      status: form.status,
      notes: form.notes.trim() || undefined,
    };

    const next = form.id
      ? requests.map(item => (item.id === form.id ? request : item))
      : [...requests, request];

    onUpdateProject({ ...project, rfqRequests: next });
    setMessage(form.id ? 'Richiesta aggiornata.' : 'Richiesta aggiunta.');
    reset();
  };

  const edit = (request: RfqRequest) => {
    setForm({
      id: request.id,
      companyName: request.companyName,
      contactName: request.contactName || '',
      email: request.email || '',
      pec: request.pec || '',
      deadline: toDateInput(request.deadline),
      status: request.status,
      notes: request.notes || '',
    });
    setMessage(null);
  };

  const remove = (request: RfqRequest) => {
    if (!canEdit) return;
    if (!window.confirm(`Eliminare la richiesta per "${request.companyName}"?`)) return;
    onUpdateProject({ ...project, rfqRequests: requests.filter(item => item.id !== request.id) });
    if (form.id === request.id) reset();
  };

  const markSent = (request: RfqRequest) => {
    if (!canEdit) return;
    const next = requests.map(item => item.id === request.id
      ? { ...item, status: 'inviata' as const, sentAt: Date.now() }
      : item
    );
    onUpdateProject({ ...project, rfqRequests: next });
  };

  const updateStatus = (request: RfqRequest, status: RfqRequest['status']) => {
    if (!canEdit) return;
    const next = requests.map(item => item.id === request.id
      ? { ...item, status, sentAt: status !== 'da_inviare' ? (item.sentAt || Date.now()) : item.sentAt }
      : item
    );
    onUpdateProject({ ...project, rfqRequests: next });
  };

  const openEmail = (request: RfqRequest) => {
    if (!request.email && !request.pec) {
      setMessage('Inserisci un indirizzo email o PEC prima di inviare.');
      return;
    }
    window.location.href = rfqMailto(project, request);
    if (request.status === 'da_inviare') markSent(request);
  };

  const copyText = async (request: RfqRequest) => {
    const { subject, body } = buildRfqEmail(project, request);
    try {
      await navigator.clipboard.writeText(`Oggetto: ${subject}\n\n${body}`);
      setMessage('Testo email copiato negli appunti.');
    } catch {
      setMessage('Impossibile copiare negli appunti.');
    }
  };

  const sent = requests.filter(request => request.status !== 'da_inviare').length;
  const answered = requests.filter(request => request.status === 'risposta').length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">{form.id ? 'Modifica richiesta' : 'Nuova richiesta preventivo'}</h3>
          {form.id && <button type="button" onClick={reset} className="text-xs text-slate-500 hover:text-slate-800">Annulla</button>}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Ditta / Impresa *</span>
          <input value={form.companyName} disabled={!canEdit} onChange={e => setForm({ ...form, companyName: e.target.value })} className="field" placeholder="Impresa Rossi S.r.l." />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Referente</span>
          <input value={form.contactName} disabled={!canEdit} onChange={e => setForm({ ...form, contactName: e.target.value })} className="field" placeholder="Geom. Mario Rossi" />
        </label>

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
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Termine risposta</span>
            <input type="date" value={form.deadline} disabled={!canEdit} onChange={e => setForm({ ...form, deadline: e.target.value })} className="field" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Stato</span>
            <select value={form.status} disabled={!canEdit} onChange={e => setForm({ ...form, status: e.target.value as RfqRequest['status'] })} className="field">
              <option value="da_inviare">Da inviare</option>
              <option value="inviata">Inviata</option>
              <option value="risposta">Risposta ricevuta</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Note</span>
          <textarea value={form.notes} disabled={!canEdit} onChange={e => setForm({ ...form, notes: e.target.value })} className="field h-20 resize-none" />
        </label>

        <button type="button" onClick={save} disabled={!canEdit || !form.companyName.trim()} className="btn btn-primary w-full">
          <Save size={16} /> {form.id ? 'Aggiorna' : 'Aggiungi richiesta'}
        </button>

        {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
      </div>

      <div className="space-y-3 lg:col-span-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Richieste</div>
            <div className="text-lg font-bold text-slate-800">{requests.length}</div>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wide text-sky-600">Inviate</div>
            <div className="text-lg font-bold text-sky-800">{sent}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Risposte</div>
            <div className="text-lg font-bold text-emerald-800">{answered}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">Ditta</th>
                <th className="px-2 py-2 text-left font-semibold">Contatti</th>
                <th className="px-2 py-2 text-left font-semibold">Termine</th>
                <th className="px-2 py-2 text-left font-semibold">Stato</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map(request => (
                <tr key={request.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <div className="font-semibold text-slate-700">{request.companyName}</div>
                    <div className="text-[10px] text-slate-400">{request.contactName || '—'}</div>
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">
                    <div className="truncate">{request.email || '—'}</div>
                    {request.pec && <div className="truncate text-[10px] text-slate-400">PEC: {request.pec}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">
                    <div className="flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" /> {dateLabel(request.deadline)}
                    </div>
                    {request.sentAt && <div className="text-[10px] text-slate-400">Inviata {dateLabel(request.sentAt)}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={request.status}
                      disabled={!canEdit}
                      onChange={e => updateStatus(request, e.target.value as RfqRequest['status'])}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass[request.status]}`}
                    >
                      <option value="da_inviare">Da inviare</option>
                      <option value="inviata">Inviata</option>
                      <option value="risposta">Risposta</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-0.5">
                      <button type="button" onClick={() => openEmail(request)} className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" title="Apri email/PEC">
                        <Send size={13} />
                      </button>
                      <button type="button" onClick={() => copyText(request)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Copia testo">
                        <Copy size={13} />
                      </button>
                      <button type="button" onClick={() => downloadRfqEml(project, request)} disabled={!canExport} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40" title="Scarica .eml">
                        <Download size={13} />
                      </button>
                      {canEdit && (
                        <>
                          <button type="button" onClick={() => edit(request)} className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" title="Modifica">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => remove(request)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Elimina">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                    <Mail size={24} className="mx-auto mb-2 text-slate-300" />
                    Nessuna richiesta preventivo registrata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Il pulsante email apre il client predefinito (Outlook, Thunderbird, PEC). Il file .eml può essere importato nei client che lo supportano.
        </p>
      </div>
    </div>
  );
};
