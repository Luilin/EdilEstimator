import React, { useMemo, useState } from 'react';
import { Project, SignatureRecord } from '../../types';
import { PenTool, Printer, Copy, Trash2, Loader2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { printSignatureReceipt, signDocument } from '../../services/signatures';
import { dateLabel } from './shared';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
}

const typeLabel: Record<SignatureRecord['documentType'], string> = {
  computo: 'Computo metrico',
  sal: 'SAL',
  verbale: 'Verbale',
  offerta: 'Offerta',
  altro: 'Altro documento',
};

export const SignaturePanel: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject }) => {
  const signatures = project.signatures || [];
  const [documentType, setDocumentType] = useState<SignatureRecord['documentType']>('computo');
  const [salId, setSalId] = useState(project.sals?.[0]?.id || '');
  const [offerId, setOfferId] = useState(project.offers?.[0]?.id || '');
  const [customLabel, setCustomLabel] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState(project.createdBy || '');
  const [signerRole, setSignerRole] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const documentLabel = useMemo(() => {
    if (documentType === 'computo') return `Computo metrico — ${project.name}`;
    if (documentType === 'sal') {
      const sal = project.sals?.find(item => item.id === salId);
      return sal ? `${sal.code} — ${sal.name}` : 'SAL';
    }
    if (documentType === 'offerta') {
      const offer = project.offers?.find(item => item.id === offerId);
      return offer ? `Offerta — ${offer.companyName}` : 'Offerta';
    }
    if (documentType === 'verbale') return customLabel.trim() || 'Verbale di sopralluogo';
    return customLabel.trim() || 'Documento';
  }, [documentType, project, salId, offerId, customLabel]);

  const documentData = useMemo(() => {
    if (documentType === 'sal') return project.sals?.find(item => item.id === salId) || null;
    if (documentType === 'offerta') return project.offers?.find(item => item.id === offerId) || null;
    if (documentType === 'computo') return { rootWBS: project.rootWBS, totals: signatures.length };
    if (documentType === 'verbale') return { label: documentLabel, sal: project.sals || [] };
    return { label: documentLabel };
  }, [documentType, project, salId, offerId, documentLabel, signatures.length]);

  const handleSign = async () => {
    if (!canEdit) return;
    setBusy(true);
    setMessage(null);
    try {
      const record = await signDocument({
        project,
        documentType,
        documentLabel,
        signerName,
        signerEmail,
        signerRole,
        notes,
        data: documentData,
      });
      onUpdateProject({ ...project, signatures: [record, ...signatures] });
      setMessage({ type: 'success', text: 'Documento firmato e impronta SHA-256 registrata.' });
      setNotes('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Errore durante la firma.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = (record: SignatureRecord) => {
    if (!canEdit) return;
    if (!window.confirm('Eliminare questa firma dalla cronologia?')) return;
    onUpdateProject({ ...project, signatures: signatures.filter(item => item.id !== record.id) });
  };

  const copyHash = async (record: SignatureRecord) => {
    try {
      await navigator.clipboard.writeText(record.hash);
      setMessage({ type: 'success', text: 'Impronta SHA-256 copiata negli appunti.' });
    } catch {
      setMessage({ type: 'error', text: 'Impossibile copiare negli appunti.' });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <PenTool size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Firma documento</h3>
            <p className="text-xs text-slate-500">Firma elettronica semplice con impronta SHA-256.</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Tipo documento</span>
          <select
            value={documentType}
            disabled={!canEdit}
            onChange={e => setDocumentType(e.target.value as SignatureRecord['documentType'])}
            className="field"
          >
            <option value="computo">Computo metrico</option>
            <option value="sal">SAL</option>
            <option value="verbale">Verbale</option>
            <option value="offerta">Offerta ditta</option>
            <option value="altro">Altro</option>
          </select>
        </label>

        {documentType === 'sal' && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">SAL</span>
            <select value={salId} disabled={!canEdit} onChange={e => setSalId(e.target.value)} className="field">
              {(project.sals || []).map(sal => <option key={sal.id} value={sal.id}>{sal.code} — {sal.name}</option>)}
              {(project.sals || []).length === 0 && <option value="">Nessun SAL disponibile</option>}
            </select>
          </label>
        )}

        {documentType === 'offerta' && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Offerta</span>
            <select value={offerId} disabled={!canEdit} onChange={e => setOfferId(e.target.value)} className="field">
              {(project.offers || []).map(offer => <option key={offer.id} value={offer.id}>{offer.companyName}</option>)}
              {(project.offers || []).length === 0 && <option value="">Nessuna offerta disponibile</option>}
            </select>
          </label>
        )}

        {(documentType === 'verbale' || documentType === 'altro') && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Descrizione documento</span>
            <input value={customLabel} disabled={!canEdit} onChange={e => setCustomLabel(e.target.value)} className="field" placeholder="Verbale di consegna lavori" />
          </label>
        )}

        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold">Documento:</span> {documentLabel}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Nome e cognome *</span>
          <input value={signerName} disabled={!canEdit} onChange={e => setSignerName(e.target.value)} className="field" placeholder="Geom. Mario Rossi" />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Email</span>
            <input type="email" value={signerEmail} disabled={!canEdit} onChange={e => setSignerEmail(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Ruolo</span>
            <input value={signerRole} disabled={!canEdit} onChange={e => setSignerRole(e.target.value)} className="field" placeholder="Direttore lavori" />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Note</span>
          <textarea value={notes} disabled={!canEdit} onChange={e => setNotes(e.target.value)} className="field h-16 resize-none" />
        </label>

        <button type="button" onClick={handleSign} disabled={!canEdit || busy || !signerName.trim()} className="btn btn-primary w-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {busy ? 'Firma in corso…' : 'Firma e registra impronta'}
        </button>

        {message && (
          <p className={`flex items-start gap-1.5 rounded-lg p-2 text-[11px] ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            {message.type === 'success' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
            {message.text}
          </p>
        )}

        <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          È una firma elettronica semplice, non una firma digitale qualificata PAdES/CAdES.
        </p>
      </div>

      <div className="lg:col-span-3">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Documento</th>
                <th className="px-3 py-2 text-left font-semibold">Firmatario</th>
                <th className="px-3 py-2 text-left font-semibold">Data</th>
                <th className="px-3 py-2 text-left font-semibold">Impronta</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {signatures.map(record => (
                <tr key={record.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-700">{record.documentLabel}</div>
                    <div className="text-[10px] text-slate-400">{typeLabel[record.documentType]}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{record.signerName}</div>
                    <div className="text-[10px] text-slate-400">{record.signerRole || record.signerEmail || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{dateLabel(record.signedAt)}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{record.hash.slice(0, 16)}…</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-0.5">
                      <button type="button" onClick={() => copyHash(record)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Copia impronta">
                        <Copy size={13} />
                      </button>
                      <button type="button" onClick={() => printSignatureReceipt(record, project)} disabled={!canExport} className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40" title="Stampa ricevuta">
                        <Printer size={13} />
                      </button>
                      {canEdit && (
                        <button type="button" onClick={() => remove(record)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Elimina">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {signatures.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-slate-400">
                    <PenTool size={24} className="mx-auto mb-2 text-slate-300" />
                    Nessun documento firmato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
