import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CostItem, Project, ProjectVariant, WBSNode } from '../types';
import {
  X, Wrench, Percent, Plus, Trash2, Pencil, Save, Info, AlertTriangle,
  History, ArrowLeftRight, Download, Upload, RotateCcw, Loader2, CheckCircle2, Clock, BookOpen,
} from 'lucide-react';
import {
  ProjectVersion,
  deleteProjectVersion,
  deleteProjectVersions,
  listProjectVersions,
  restoreProjectVersion,
  saveProjectVersion,
} from '../services/projectVersions';
import { XpweImportResult, createPriceBookFromXpwe, downloadXpwe, parseXpwe, parseXpwePriceBook } from '../services/xpwe';
import { externalizePriceBooks } from '../services/priceBooksStorage';

interface Props {
  project: Project;
  selectedNode: WBSNode | null;
  canEdit: boolean;
  onUpdateProject: (project: Project) => void;
  onClose: () => void;
}

type NodeOption = { id: string; path: string; amount: number };

const currency = (value: number) =>
  `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const weekDay = (ts: number) => new Date(ts).toLocaleDateString('it-IT');

const toDateInput = (ts: number) => {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const collectItems = (node: WBSNode): CostItem[] => {
  const items = [...node.items];
  node.children.forEach(child => items.push(...collectItems(child)));
  return items;
};

const replaceNode = (root: WBSNode, nodeId: string, replacement: (node: WBSNode) => WBSNode): WBSNode => {
  if (root.id === nodeId) return replacement(root);
  return {
    ...root,
    children: root.children.map(child => replaceNode(child, nodeId, replacement)),
  };
};

const collectNodeOptions = (root: WBSNode): NodeOption[] => {
  const options: NodeOption[] = [];
  const walk = (node: WBSNode, parentPath: string) => {
    const path = node.level === 0 ? '' : `${parentPath ? `${parentPath} · ` : ''}${node.code} ${node.name}`.trim();
    const items = collectItems(node);
    const amount = items.reduce((sum, item) => sum + item.amount, 0);
    if (node.level > 0 && node.items.length > 0) {
      options.push({ id: node.id, path, amount });
    }
    node.children.forEach(child => walk(child, path));
  };
  walk(root, '');
  return options;
};

export const ToolsModal: React.FC<Props> = ({ project, selectedNode, canEdit, onUpdateProject, onClose }) => {
  const [tab, setTab] = useState<'revision' | 'variants' | 'versions' | 'interop'>('revision');

  // Revisione prezzi
  const [percent, setPercent] = useState('0');
  const [scope, setScope] = useState<'all' | 'selected'>(selectedNode ? 'selected' : 'all');

  const revisionTargets = useMemo(() => {
    const node = scope === 'selected' && selectedNode ? selectedNode : project.rootWBS;
    return collectItems(node);
  }, [project.rootWBS, selectedNode, scope]);

  const revisionTotals = useMemo(() => {
    const value = parseFloat(percent.replace(',', '.')) || 0;
    const factor = 1 + value / 100;
    let current = 0;
    let next = 0;
    revisionTargets.forEach(item => {
      current += item.amount;
      next += item.qty * Math.round(item.price * factor * 100) / 100;
    });
    return { current, next, delta: next - current, factor, count: revisionTargets.length };
  }, [revisionTargets, percent]);

  const handleApplyRevision = () => {
    if (!canEdit) return;
    const value = parseFloat(percent.replace(',', '.')) || 0;
    if (value === 0) return;
    if (revisionTargets.length === 0) return;

    const confirm = window.confirm(
      `Applicare una revisione del ${value > 0 ? '+' : ''}${value}% a ${revisionTargets.length} voci?\n` +
      `Totale attuale: ${currency(revisionTotals.current)} → nuovo totale: ${currency(revisionTotals.next)}`
    );
    if (!confirm) return;

    const factor = 1 + value / 100;
    const revise = (node: WBSNode): WBSNode => ({
      ...node,
      items: node.items.map(item => {
        const price = Math.round(item.price * factor * 100) / 100;
        return { ...item, price, amount: item.qty * price };
      }),
      children: node.children.map(revise),
    });

    let newRoot: WBSNode;
    if (scope === 'selected' && selectedNode) {
      newRoot = replaceNode(project.rootWBS, selectedNode.id, revise);
    } else {
      newRoot = revise(project.rootWBS);
    }

    onUpdateProject({ ...project, rootWBS: newRoot });
    setPercent('0');
  };

  // Varianti e perizie
  const variants = project.variants || [];
  const nodeOptions = useMemo(() => collectNodeOptions(project.rootWBS), [project.rootWBS]);

  const [variantForm, setVariantForm] = useState<{
    id: string | null;
    code: string;
    name: string;
    description: string;
    type: 'variante' | 'perizia';
    status: 'bozza' | 'approvata' | 'respinta';
    date: string;
    wbsNodeId: string;
    amount: string;
    notes: string;
  }>({
    id: null,
    code: '',
    name: '',
    description: '',
    type: 'variante',
    status: 'bozza',
    date: toDateInput(Date.now()),
    wbsNodeId: '',
    amount: '',
    notes: '',
  });

  const resetVariantForm = () => {
    setVariantForm({
      id: null,
      code: '',
      name: '',
      description: '',
      type: 'variante',
      status: 'bozza',
      date: toDateInput(Date.now()),
      wbsNodeId: '',
      amount: '',
      notes: '',
    });
  };

  const handleVariantNodeChange = (nodeId: string) => {
    const option = nodeOptions.find(node => node.id === nodeId);
    setVariantForm(current => ({
      ...current,
      wbsNodeId: nodeId,
      amount: option ? String(Math.round(option.amount * 100) / 100) : current.amount,
    }));
  };

  const handleSaveVariant = () => {
    if (!canEdit) return;
    if (!variantForm.code.trim() || !variantForm.name.trim()) return;

    const parsedAmount = parseFloat(variantForm.amount.replace(',', '.')) || 0;
    const parsedDate = new Date(`${variantForm.date}T00:00:00`).getTime();

    const variant: ProjectVariant = {
      id: variantForm.id || `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      code: variantForm.code.trim(),
      name: variantForm.name.trim(),
      description: variantForm.description.trim() || undefined,
      type: variantForm.type,
      status: variantForm.status,
      date: Number.isFinite(parsedDate) ? parsedDate : Date.now(),
      wbsNodeId: variantForm.wbsNodeId || undefined,
      amount: parsedAmount,
      notes: variantForm.notes.trim() || undefined,
    };

    const next = variantForm.id
      ? variants.map(item => (item.id === variantForm.id ? variant : item))
      : [...variants, variant];

    onUpdateProject({ ...project, variants: next });
    resetVariantForm();
  };

  const handleEditVariant = (variant: ProjectVariant) => {
    setVariantForm({
      id: variant.id,
      code: variant.code,
      name: variant.name,
      description: variant.description || '',
      type: variant.type,
      status: variant.status,
      date: toDateInput(variant.date),
      wbsNodeId: variant.wbsNodeId || '',
      amount: String(variant.amount ?? ''),
      notes: variant.notes || '',
    });
  };

  const handleDeleteVariant = (variant: ProjectVariant) => {
    if (!canEdit) return;
    if (!window.confirm(`Eliminare ${variant.type === 'perizia' ? 'la perizia' : 'la variante'} "${variant.name}"?`)) return;
    onUpdateProject({ ...project, variants: variants.filter(item => item.id !== variant.id) });
    if (variantForm.id === variant.id) resetVariantForm();
  };

  const variantsTotal = variants.reduce((sum, variant) => sum + (variant.amount || 0), 0);

  // --------------------------------------------------------------------------
  // Versioni del progetto
  // --------------------------------------------------------------------------
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [versionsMessage, setVersionsMessage] = useState<string | null>(null);

  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      setVersions(await listProjectVersions(project.id));
      setVersionsMessage(null);
    } catch (err) {
      setVersionsMessage(err instanceof Error ? err.message : 'Impossibile leggere la cronologia.');
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'versions') loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, project.id]);

  const handleCreateVersion = async () => {
    if (!canEdit) return;
    setVersionsBusy(true);
    try {
      const created = await saveProjectVersion(project, 'Manuale', true);
      setVersionsMessage(created ? 'Versione salvata correttamente.' : 'Nessuna modifica da salvare.');
      await loadVersions();
    } catch (err) {
      setVersionsMessage(err instanceof Error ? err.message : 'Errore nel salvataggio della versione.');
    } finally {
      setVersionsBusy(false);
    }
  };

  const handleRestoreVersion = async (version: ProjectVersion) => {
    if (!canEdit) return;
    if (!window.confirm(
      `Ripristinare la versione del ${new Date(version.createdAt).toLocaleString('it-IT')}?\n` +
      'La situazione attuale verrà prima salvata come nuova versione.'
    )) return;

    setVersionsBusy(true);
    try {
      await saveProjectVersion(project, 'Prima del ripristino', true);
      const restored = await restoreProjectVersion(version);
      onUpdateProject({ ...restored, lastModified: Date.now() });
      setVersionsMessage('Versione ripristinata.');
      await loadVersions();
    } catch (err) {
      setVersionsMessage(err instanceof Error ? err.message : 'Errore durante il ripristino.');
    } finally {
      setVersionsBusy(false);
    }
  };

  const handleDeleteVersion = async (version: ProjectVersion) => {
    if (!canEdit) return;
    if (!window.confirm('Eliminare questa versione dalla cronologia?')) return;
    await deleteProjectVersion(version.id);
    await loadVersions();
  };

  const handleClearVersions = async () => {
    if (!canEdit) return;
    if (!window.confirm('Eliminare tutte le versioni salvate per questo progetto?')) return;
    await deleteProjectVersions(project.id);
    await loadVersions();
  };

  // --------------------------------------------------------------------------
  // Interoperabilità XPWE
  // --------------------------------------------------------------------------
  const [pendingImport, setPendingImport] = useState<XpweImportResult | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [interopBusy, setInteropBusy] = useState(false);
  const [interopMessage, setInteropMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setInteropBusy(true);
    try {
      const text = await file.text();
      const result = parseXpwe(text);
      setPendingImport(result);
      setInteropMessage(null);
    } catch (err) {
      setPendingImport(null);
      setInteropMessage({ type: 'error', text: err instanceof Error ? err.message : 'File XPWE non valido.' });
    } finally {
      setInteropBusy(false);
    }
  };

  const handleApplyImport = () => {
    if (!canEdit || !pendingImport) return;
    if (importMode === 'replace' && !window.confirm(
      'Sostituire l’intera struttura del computo con quella importata?\nLe voci attuali verranno rimosse.'
    )) return;

    const rootWBS: WBSNode = importMode === 'replace'
      ? {
          ...project.rootWBS,
          name: pendingImport.projectName || project.rootWBS.name,
          children: pendingImport.nodes,
        }
      : {
          ...project.rootWBS,
          children: [...project.rootWBS.children, ...pendingImport.nodes],
        };

    onUpdateProject({ ...project, rootWBS });
    setInteropMessage({
      type: 'success',
      text: `Importate ${pendingImport.counts.entries} voci (${pendingImport.counts.measurements} righe di misura).`,
    });
    setPendingImport(null);
  };

  const handleExportXpwe = () => {
    downloadXpwe(project);
  };

  const [priceBookBusy, setPriceBookBusy] = useState(false);
  const [priceBookMessage, setPriceBookMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const priceBookInputRef = useRef<HTMLInputElement>(null);

  const handleImportPriceBook = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setPriceBookBusy(true);
    try {
      const text = await file.text();
      const result = parseXpwePriceBook(text);
      const newBook = createPriceBookFromXpwe(result, file.name.replace(/\.(xpwe|xml)$/i, ''));

      const metadata = await externalizePriceBooks(project.id, [...(project.priceBooks || []), newBook]);
      onUpdateProject({ ...project, priceBooks: metadata });
      setPriceBookMessage({
        type: 'success',
        text: `Prezzario "${newBook.name}" importato: ${result.itemCount} voci in ${result.categories.length} categorie.` +
          (result.itemCount > 300 ? ' Salvato nell’archivio locale del browser (IndexedDB).' : ''),
      });
    } catch (err) {
      setPriceBookMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Prezzario XPWE non valido.',
      });
    } finally {
      setPriceBookBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <Wrench size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Strumenti del computo</h2>
              <p className="truncate text-xs text-slate-300">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
          <div className="flex flex-wrap rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('revision')}
              className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${tab === 'revision' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Percent size={14} /> Revisione prezzi
            </button>
            <button
              type="button"
              onClick={() => setTab('variants')}
              className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${tab === 'variants' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Plus size={14} /> Varianti e perizie
            </button>
            <button
              type="button"
              onClick={() => setTab('versions')}
              className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${tab === 'versions' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <History size={14} /> Versioni
            </button>
            <button
              type="button"
              onClick={() => setTab('interop')}
              className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${tab === 'interop' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <ArrowLeftRight size={14} /> XPWE / Interscambio
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {tab === 'revision' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800">Revisione prezzi (indice ISTAT o percentuale)</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Applica un adeguamento percentuale ai prezzi unitari delle voci. L'operazione è annullabile con Undo.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Variazione percentuale (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={percent}
                      disabled={!canEdit}
                      onChange={e => setPercent(e.target.value)}
                      className="field"
                      placeholder="Es. 2.5 oppure -1.2"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Ambito</label>
                    <select
                      value={scope}
                      disabled={!canEdit || !selectedNode}
                      onChange={e => setScope(e.target.value as 'all' | 'selected')}
                      className="field"
                    >
                      <option value="all">Tutto il computo</option>
                      <option value="selected">Categoria selezionata{selectedNode ? `: ${selectedNode.code} ${selectedNode.name}` : ''}</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleApplyRevision}
                      disabled={!canEdit || revisionTotals.count === 0 || revisionTotals.factor === 1}
                      className="btn btn-primary w-full"
                    >
                      <Percent size={16} /> Applica revisione
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Voci interessate</div>
                    <div className="font-bold text-slate-800">{revisionTotals.count}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Totale attuale</div>
                    <div className="font-bold text-slate-800">{currency(revisionTotals.current)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Nuovo totale</div>
                    <div className="font-bold text-emerald-700">
                      {currency(revisionTotals.next)}
                      <span className={`ml-1 text-[11px] ${revisionTotals.delta < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ({revisionTotals.delta >= 0 ? '+' : ''}{currency(revisionTotals.delta)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
                <Info size={13} className="mt-0.5 shrink-0" />
                La revisione modifica i prezzi unitari del computo. Le offerte delle ditte e le analisi prezzi eventualmente presenti non vengono ricalcolate automaticamente.
              </p>
            </div>
          ) : tab === 'variants' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                  <h3 className="text-sm font-bold text-slate-800">
                    {variantForm.id ? 'Modifica variante/perizia' : 'Nuova variante/perizia'}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">Codice *</label>
                      <input value={variantForm.code} disabled={!canEdit} onChange={e => setVariantForm({ ...variantForm, code: e.target.value })} className="field" placeholder="VAR 01" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">Tipo</label>
                      <select value={variantForm.type} disabled={!canEdit} onChange={e => setVariantForm({ ...variantForm, type: e.target.value as 'variante' | 'perizia' })} className="field">
                        <option value="variante">Variante</option>
                        <option value="perizia">Perizia suppletiva</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Oggetto *</label>
                    <input value={variantForm.name} disabled={!canEdit} onChange={e => setVariantForm({ ...variantForm, name: e.target.value })} className="field" placeholder="Descrizione sintetica" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">Data</label>
                      <input type="date" value={variantForm.date} disabled={!canEdit} onChange={e => setVariantForm({ ...variantForm, date: e.target.value })} className="field" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">Stato</label>
                      <select value={variantForm.status} disabled={!canEdit} onChange={e => setVariantForm({ ...variantForm, status: e.target.value as 'bozza' | 'approvata' | 'respinta' })} className="field">
                        <option value="bozza">Bozza</option>
                        <option value="approvata">Approvata</option>
                        <option value="respinta">Respinta</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Collegamento WBS</label>
                    <select value={variantForm.wbsNodeId} disabled={!canEdit} onChange={e => handleVariantNodeChange(e.target.value)} className="field">
                      <option value="">— Nessun collegamento —</option>
                      {nodeOptions.map(option => <option key={option.id} value={option.id}>{option.path}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Importo (€)</label>
                    <input type="number" step="0.01" value={variantForm.amount} disabled={!canEdit} onChange={e => setVariantForm({ ...variantForm, amount: e.target.value })} className="field" placeholder="0,00" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Note</label>
                    <textarea value={variantForm.notes} disabled={!canEdit} onChange={e => setVariantForm({ ...variantForm, notes: e.target.value })} className="field h-16 resize-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSaveVariant} disabled={!canEdit || !variantForm.code.trim() || !variantForm.name.trim()} className="btn btn-primary flex-1">
                      <Save size={16} /> {variantForm.id ? 'Aggiorna' : 'Aggiungi'}
                    </button>
                    {variantForm.id && (
                      <button type="button" onClick={resetVariantForm} className="btn btn-neutral">Annulla</button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 lg:col-span-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Varianti/perizie</div>
                      <div className="text-lg font-bold text-slate-800">{variants.length}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Importo complessivo</div>
                      <div className="text-lg font-bold text-emerald-800">{currency(variantsTotal)}</div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold">Codice</th>
                          <th className="px-2 py-2 text-left font-semibold">Oggetto</th>
                          <th className="px-2 py-2 text-left font-semibold">Tipo</th>
                          <th className="px-2 py-2 text-right font-semibold">Importo</th>
                          <th className="px-2 py-2 text-left font-semibold">Stato</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map(variant => (
                          <tr key={variant.id} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">{variant.code}</td>
                            <td className="px-2 py-1.5 text-slate-700">
                              <div className="font-semibold">{variant.name}</div>
                              <div className="text-[10px] text-slate-400">{weekDay(variant.date)}{variant.wbsNodeId ? ' · collegata WBS' : ''}</div>
                            </td>
                            <td className="px-2 py-1.5 text-slate-600">{variant.type === 'perizia' ? 'Perizia' : 'Variante'}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{currency(variant.amount || 0)}</td>
                            <td className="px-2 py-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                variant.status === 'approvata'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : variant.status === 'respinta'
                                    ? 'bg-red-50 text-red-600'
                                    : 'bg-amber-50 text-amber-700'
                              }`}>
                                {variant.status}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {canEdit && (
                                <div className="flex justify-end gap-0.5">
                                  <button type="button" onClick={() => handleEditVariant(variant)} className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700" title="Modifica">
                                    <Pencil size={13} />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteVariant(variant)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Elimina">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {variants.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                              Nessuna variante o perizia registrata.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    L'importo può essere inserito manualmente oppure ricavato collegando una categoria WBS del computo.
                  </p>
                </div>
              </div>
            </div>
          ) : tab === 'versions' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Cronologia versioni</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Snapshot automatici ogni 10 minuti (max 20 per progetto) e salvataggi manuali. Restano in questo browser.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleCreateVersion} disabled={!canEdit || versionsBusy} className="btn btn-primary">
                      {versionsBusy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salva versione
                    </button>
                    <button type="button" onClick={handleClearVersions} disabled={!canEdit || versions.length === 0} className="btn btn-neutral">
                      <Trash2 size={16} /> Svuota
                    </button>
                  </div>
                </div>
                {versionsMessage && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    <CheckCircle2 size={14} /> {versionsMessage}
                  </p>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {versionsLoading ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
                    <Loader2 size={18} className="animate-spin" /> Caricamento cronologia…
                  </div>
                ) : versions.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <History size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">Nessuna versione salvata</p>
                    <p className="text-xs text-slate-400">La prima versione viene creata automaticamente alla modifica del computo.</p>
                  </div>
                ) : (
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Data</th>
                        <th className="px-3 py-2 text-left font-semibold">Motivo</th>
                        <th className="px-3 py-2 text-right font-semibold">Categorie</th>
                        <th className="px-3 py-2 text-right font-semibold">Voci</th>
                        <th className="px-3 py-2 text-right font-semibold">Totale</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map(version => (
                        <tr key={version.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-600">
                            <div className="flex items-center gap-1.5">
                              <Clock size={12} className="text-slate-400" />
                              {new Date(version.createdAt).toLocaleString('it-IT')}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{version.reason}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{version.stats.categories}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{version.stats.items}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">{currency(version.stats.total)}</td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleRestoreVersion(version)}
                                disabled={!canEdit || versionsBusy}
                                className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                                title="Ripristina"
                              >
                                <RotateCcw size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteVersion(version)}
                                disabled={!canEdit}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                title="Elimina"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
                <Info size={13} className="mt-0.5 shrink-0" />
                Prima di un ripristino viene salvata automaticamente la situazione corrente, così puoi annullare l’operazione.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Download size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Esporta XPWE</h3>
                      <p className="text-xs text-slate-500">Computo, voci, misure e prezzi in un file XML.</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    <p>Il file contiene la struttura WBS, l’elenco prezzi e le righe di misura.</p>
                    <p className="mt-1 font-semibold text-slate-700">{project.name}</p>
                  </div>

                  <button type="button" onClick={handleExportXpwe} className="btn btn-primary mt-3 w-full">
                    <Download size={16} /> Scarica .xpwe
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <Upload size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Importa XPWE / XML</h3>
                      <p className="text-xs text-slate-500">Aggiungi o sostituisci il computo da un file esterno.</p>
                    </div>
                  </div>

                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xpwe,.xml,application/xml,text/xml"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    disabled={!canEdit || interopBusy}
                    className="btn btn-neutral mt-3 w-full"
                  >
                    {interopBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {interopBusy ? 'Lettura file…' : 'Seleziona file XPWE'}
                  </button>

                  {pendingImport && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                      <div className="text-xs font-bold text-emerald-800">Anteprima importazione</div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded bg-white p-2">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Prezzi</div>
                          <div className="font-bold text-slate-800">{pendingImport.counts.prices}</div>
                        </div>
                        <div className="rounded bg-white p-2">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Voci</div>
                          <div className="font-bold text-slate-800">{pendingImport.counts.entries}</div>
                        </div>
                        <div className="rounded bg-white p-2">
                          <div className="text-[10px] font-bold uppercase text-slate-400">Misure</div>
                          <div className="font-bold text-slate-800">{pendingImport.counts.measurements}</div>
                        </div>
                      </div>

                      {pendingImport.projectName && (
                        <p className="mt-2 truncate text-[11px] text-slate-600">File: {pendingImport.projectName}</p>
                      )}

                      <label className="mt-2 block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Modalità</span>
                        <select value={importMode} onChange={e => setImportMode(e.target.value as 'append' | 'replace')} className="field">
                          <option value="append">Aggiungi al computo esistente</option>
                          <option value="replace">Sostituisci il computo</option>
                        </select>
                      </label>

                      {pendingImport.warnings.length > 0 && (
                        <div className="mt-2 max-h-24 overflow-y-auto rounded bg-amber-50 p-2 text-[10px] text-amber-700">
                          {pendingImport.warnings.map((warning, index) => (
                            <p key={index} className="flex items-start gap-1">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {warning}
                            </p>
                          ))}
                        </div>
                      )}

                      <button type="button" onClick={handleApplyImport} disabled={!canEdit} className="btn btn-primary mt-2 w-full">
                        <CheckCircle2 size={16} /> Importa nel computo
                      </button>
                    </div>
                  )}

                  {interopMessage && (
                    <p className={`mt-3 flex items-start gap-1.5 rounded-lg p-2 text-[11px] ${interopMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {interopMessage.type === 'success' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                      {interopMessage.text}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Importa prezzario XPWE</h3>
                      <p className="text-xs text-slate-500">
                        Aggiunge un nuovo prezzario al progetto, ad esempio un listino regionale.
                        I file PriMus <b>.dcf</b> vanno prima convertiti in XPWE (PriMus-DCF → Salva con nome → XPWE).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => priceBookInputRef.current?.click()}
                    disabled={!canEdit || priceBookBusy}
                    className="btn btn-neutral"
                  >
                    {priceBookBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    {priceBookBusy ? 'Lettura file…' : 'Seleziona prezzario XPWE'}
                  </button>
                </div>

                <input
                  ref={priceBookInputRef}
                  type="file"
                  accept=".xpwe,.xml,application/xml,text/xml"
                  className="hidden"
                  onChange={handleImportPriceBook}
                />

                {priceBookMessage && (
                  <p className={`mt-3 flex items-start gap-1.5 rounded-lg p-2 text-[11px] ${priceBookMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {priceBookMessage.type === 'success' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                    {priceBookMessage.text}
                  </p>
                )}
              </div>

              <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
                <Info size={13} className="mt-0.5 shrink-0" />
                XPWE è un formato di interscambio XML. L’import è tollerante e riconosce i nodi standard di elenco prezzi, voci di computo e WBS. Verifica sempre il risultato nel software di destinazione.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button onClick={onClose} className="btn btn-neutral">Chiudi</button>
        </div>
      </div>
    </div>
  );
};
