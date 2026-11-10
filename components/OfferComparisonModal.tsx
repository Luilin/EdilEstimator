import React, { useMemo, useRef, useState } from 'react';
import type { WorkBook } from 'xlsx';
import { ContractorOffer, OfferItemPrice, OfferComparisonSettings, Project, CostItem, WBSNode } from '../types';
import { X, Upload, Download, Save, Trash2, Scale, Award, AlertCircle, FileSpreadsheet, FileText, Info, Building2, CalendarDays, Clock, Percent, Plus, Search, ArrowLeft, Copy, RotateCcw, Pencil, Printer } from 'lucide-react';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
  onClose: () => void;
}

type FlatEntry = { categoryCode: string; categoryName: string; item: CostItem };
type DraftRow = { price: string; days: string };
type ColumnMapping = {
  headerRow: number;
  code: number;
  description: number;
  price: number;
  amount: number;
  quantity: number;
  days: number;
  notes: number;
  material: number;
  labor: number;
};
type PendingImport = {
  fileName: string;
  workbook: WorkBook;
  sheets: string[];
  sheetName: string;
  rows: unknown[][];
  mapping: ColumnMapping;
  companyName: string;
};
type OfferDraft = {
  offerId: string | null;
  companyName: string;
  vatNumber: string;
  address: string;
  contactPerson: string;
  date: string;
  validityDays: string;
  totalDays: string;
  notes: string;
  rows: Record<string, DraftRow>;
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

const DEFAULT_COMPARISON_SETTINGS: OfferComparisonSettings = {
  criterion: 'price',
  priceWeight: 70,
  timeWeight: 30,
  requireComplete: true,
};

const percentLabel = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const dateLabel = (ts: number) => {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('it-IT') : '—';
};

const parseMoney = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim().replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const parseDateValue = (raw: unknown): number | null => {
  if (typeof raw === 'number') {
    // Serial date di Excel (giorni dal 30/12/1899), senza dipendere da xlsx.
    const date = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).getTime();
  }
  const s = String(raw).trim();
  const m = s.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return new Date(year, parseInt(m[2], 10) - 1, parseInt(m[1], 10)).getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};

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

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDescription = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const detectHeaderRow = (rows: unknown[][]): number => {
  let bestIndex = 0;
  let bestScore = 0;

  rows.slice(0, 50).forEach((row, index) => {
    if (!Array.isArray(row)) return;
    const headers = row.map(normalizeHeader);
    let score = 0;
    if (headers.some(h => /codice|articolo|\bcod\b/.test(h))) score++;
    if (headers.some(h => /descrizione|\bdesc\b|lavorazione|prestazione|\bvoce\b|oggetto/.test(h))) score++;
    if (headers.some(h => /prezz|unitario|offert|importo|totale/.test(h))) score++;
    if (headers.some(h => /quantit|qta|q\s*\.?\s*t|\bqty\b/.test(h))) score++;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 2 ? bestIndex : 0;
};

const detectColumns = (headers: string[]): Omit<ColumnMapping, 'headerRow'> => {
  const find = (patterns: RegExp[]) => headers.findIndex(h => h !== '' && patterns.some(p => p.test(h)));
  const isSplitColumn = (header: string) => /material|manodopera|mano d'?opera|\blabor\b/.test(header);

  return {
    code: find([/codice/, /articolo/, /\bcod\b/, /\bart\b/, /\bitem\b/]),
    description: find([/descrizione/, /\bdesc\b/, /lavorazione/, /prestazione/, /\bvoce\b/, /oggetto/]),
    price: headers.findIndex(h => h !== '' && /prezz|unitario|offerta/.test(h) && !isSplitColumn(h) && !/importo|totale/.test(h)),
    amount: headers.findIndex(h => h !== '' && /importo|totale|ammontare/.test(h) && !isSplitColumn(h)),
    quantity: find([/quantit/, /qta/, /q\s*\.?\s*t/, /\bqty\b/]),
    days: find([/tempi/, /giorni/, /consegna/, /durata/]),
    notes: find([/note/, /marca/, /annotazioni/, /specifiche/]),
    material: find([/material/]),
    labor: find([/manodopera/, /mano d'?opera/, /\blabor\b/]),
  };
};

const findMetadataValue = (rows: unknown[][], labels: string[]): string => {
  const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = normalizeHeader(row[c]);
      if (labels.some(label => cell.includes(label))) {
        for (let k = c + 1; k < row.length; k++) {
          const value = text(row[k]);
          if (value) return value;
        }
      }
    }
  }

  return '';
};

const readSheetRows = async (workbook: WorkBook, sheetName: string): Promise<unknown[][]> => {
  const XLSX = await import('xlsx');
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) : [];
};

export const OfferComparisonModal: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject, onClose }) => {
  const offers = project.offers || [];
  const entries = useMemo(() => flattenItems(project.rootWBS), [project.rootWBS]);
  const settings = project.offerComparisonSettings || DEFAULT_COMPARISON_SETTINGS;

  const updateSettings = (partial: Partial<OfferComparisonSettings>) => {
    if (!canEdit) return;
    onUpdateProject({ ...project, offerComparisonSettings: { ...settings, ...partial } });
  };

  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<OfferDraft | null>(null);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const baseTotal = useMemo(
    () => entries.reduce((sum, { item }) => sum + item.qty * item.price, 0),
    [entries]
  );

  const stats = useMemo(() => offers.map(offer => {
    let total = 0;
    let priced = 0;
    let days = 0;
    let materials = 0;
    let labor = 0;
    let hasSplit = false;

    entries.forEach(({ item }) => {
      const line = offer.items[item.id];
      if (line && line.price !== undefined && line.price !== null) {
        total += line.price * item.qty;
        priced++;
      }
      if (line?.days) days += line.days;
      if (line?.materialPrice !== undefined && line.materialPrice !== null) {
        materials += line.materialPrice * item.qty;
        hasSplit = true;
      }
      if (line?.laborPrice !== undefined && line.laborPrice !== null) {
        labor += line.laborPrice * item.qty;
        hasSplit = true;
      }
    });
    const coverage = entries.length > 0 ? Math.round((priced / entries.length) * 100) : 0;
    return {
      offer,
      total,
      days: days > 0 ? days : (offer.totalDays || 0),
      coverage,
      delta: baseTotal > 0 ? ((total - baseTotal) / baseTotal) * 100 : null,
      complete: entries.length > 0 && priced === entries.length,
      materials,
      labor,
      hasSplit,
    };
  }), [offers, entries, baseTotal]);

  const eligibleStats = useMemo(() => stats.filter(stat => {
    if (stat.total <= 0) return false;
    if (settings.requireComplete && !stat.complete) return false;
    if (settings.criterion === 'time' && !(stat.days > 0)) return false;
    return true;
  }), [stats, settings]);

  const ranking = useMemo(() => {
    const minTotal = eligibleStats.length > 0 ? Math.min(...eligibleStats.map(s => s.total)) : 0;
    const days = eligibleStats.map(s => s.days).filter(d => d > 0);
    const minDays = days.length > 0 ? Math.min(...days) : 0;

    const scored = eligibleStats.map(stat => {
      const priceScore = stat.total > 0 ? (minTotal / stat.total) * 100 : 0;
      const timeScore = stat.days > 0 && minDays > 0 ? (minDays / stat.days) * 100 : 0;

      let score: number;
      if (settings.criterion === 'price') score = priceScore;
      else if (settings.criterion === 'time') score = timeScore;
      else {
        const totalWeight = (settings.priceWeight + settings.timeWeight) || 1;
        score = (priceScore * settings.priceWeight + timeScore * settings.timeWeight) / totalWeight;
      }

      return { ...stat, score };
    });

    return scored.sort((a, b) => b.score - a.score);
  }, [eligibleStats, settings]);

  const bestOfferId = ranking.length > 0 ? ranking[0].offer.id : null;
  const excludedStats = stats.filter(stat => !eligibleStats.some(eligible => eligible.offer.id === stat.offer.id));

  const criterionLabel = settings.criterion === 'price'
    ? 'Minor prezzo'
    : settings.criterion === 'time'
      ? 'Minor tempo di esecuzione'
      : `Punteggio ponderato (prezzo ${settings.priceWeight}% · tempo ${settings.timeWeight}%)`;

  const saveOffer = (offer: ContractorOffer, successMessage: string): boolean => {
    if (!canEdit) return false;
    const currentOffers = project.offers || [];
    const existingIndex = currentOffers.findIndex(
      o => o.companyName.trim().toLowerCase() === offer.companyName.trim().toLowerCase()
    );

    let nextOffers: ContractorOffer[];
    if (existingIndex >= 0) {
      const confirmReplace = window.confirm(
        `Esiste già un'offerta di "${currentOffers[existingIndex].companyName}". Vuoi sostituirla con quella nuova?`
      );
      if (!confirmReplace) return false;
      nextOffers = currentOffers.map((o, i) => (i === existingIndex ? { ...offer, id: o.id } : o));
    } else {
      nextOffers = [...currentOffers, offer];
    }

    onUpdateProject({ ...project, offers: nextOffers });
    setMessage({ type: 'success', text: successMessage });
    return true;
  };

  const toDateInput = (ts: number) => {
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return toDateInput(Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const openNewDraft = () => {
    setDraft({
      offerId: null,
      companyName: '',
      vatNumber: '',
      address: '',
      contactPerson: '',
      date: toDateInput(Date.now()),
      validityDays: '',
      totalDays: '',
      notes: '',
      rows: {},
    });
    setDraftSearch('');
    setDraftMessage(null);
  };

  const openEditDraft = (offer: ContractorOffer) => {
    const rows: Record<string, DraftRow> = {};
    entries.forEach(({ item }) => {
      const line = offer.items[item.id];
      rows[item.id] = {
        price: line && line.price !== undefined && line.price !== null ? String(line.price) : '',
        days: line?.days !== undefined ? String(line.days) : '',
      };
    });
    setDraft({
      offerId: offer.id,
      companyName: offer.companyName,
      vatNumber: offer.vatNumber || '',
      address: offer.address || '',
      contactPerson: offer.contactPerson || '',
      date: toDateInput(offer.date),
      validityDays: offer.validityDays ? String(offer.validityDays) : '',
      totalDays: offer.totalDays ? String(offer.totalDays) : '',
      notes: offer.notes || '',
      rows,
    });
    setDraftSearch('');
    setDraftMessage(null);
  };

  const updateDraftField = (field: keyof OfferDraft, value: string) => {
    setDraft(current => (current ? { ...current, [field]: value } : current));
  };

  const updateDraftRow = (itemId: string, field: keyof DraftRow, value: string) => {
    setDraft(current => {
      if (!current) return current;
      const existing = current.rows[itemId] || { price: '', days: '' };
      return {
        ...current,
        rows: { ...current.rows, [itemId]: { ...existing, [field]: value } },
      };
    });
  };

  const prefillBasePrices = () => {
    if (!draft) return;
    const hasPrices = Object.values(draft.rows).some((row: DraftRow) => row.price.trim() !== '');
    if (hasPrices && !window.confirm('Sostituire i prezzi già inseriti con quelli del computo base?')) return;

    const rows: Record<string, DraftRow> = { ...draft.rows };
    entries.forEach(({ item }) => {
      const existing = rows[item.id] || { price: '', days: '' };
      rows[item.id] = { ...existing, price: String(item.price) };
    });
    setDraft({ ...draft, rows });
  };

  const clearDraftPrices = () => {
    if (!draft) return;
    if (!window.confirm('Azzerare tutti i prezzi inseriti nell\'offerta?')) return;

    const rows: Record<string, DraftRow> = { ...draft.rows };
    entries.forEach(({ item }) => {
      const existing = rows[item.id] || { price: '', days: '' };
      rows[item.id] = { ...existing, price: '' };
    });
    setDraft({ ...draft, rows });
  };

  const handleSaveDraft = () => {
    if (!draft) return;
    const companyName = draft.companyName.trim();
    if (!companyName) {
      setDraftMessage('Inserisci la ragione sociale della ditta.');
      return;
    }

    const items: Record<string, OfferItemPrice> = {};
    entries.forEach(({ item }) => {
      const row = draft.rows[item.id];
      if (!row) return;
      const price = parseMoney(row.price);
      if (price === null) return;
      const days = parseMoney(row.days);
      items[item.id] = {
        price,
        days: days !== null ? days : undefined,
      };
    });

    if (Object.keys(items).length === 0) {
      const proceed = window.confirm('Non hai inserito alcun prezzo. Vuoi salvare comunque l\'offerta senza prezzi?');
      if (!proceed) return;
    }

    const computedDays = Object.values(items).reduce((sum, line) => sum + (line.days || 0), 0);
    const validityDays = parseMoney(draft.validityDays);
    const totalDays = parseMoney(draft.totalDays);
    const parsedDate = draft.date ? new Date(draft.date).getTime() : NaN;

    const offer: ContractorOffer = {
      id: draft.offerId || `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      companyName,
      vatNumber: draft.vatNumber.trim() || undefined,
      address: draft.address.trim() || undefined,
      contactPerson: draft.contactPerson.trim() || undefined,
      date: Number.isFinite(parsedDate) ? parsedDate : Date.now(),
      validityDays: validityDays !== null ? validityDays : undefined,
      totalDays: totalDays !== null ? totalDays : (computedDays || undefined),
      notes: draft.notes.trim() || undefined,
      source: 'manuale',
      items,
    };

    const currentOffers = project.offers || [];
    let nextOffers: ContractorOffer[];

    if (draft.offerId) {
      nextOffers = currentOffers.map(o => (o.id === draft.offerId ? offer : o));
    } else {
      const duplicateIndex = currentOffers.findIndex(
        o => o.companyName.trim().toLowerCase() === companyName.toLowerCase()
      );
      if (duplicateIndex >= 0) {
        const replace = window.confirm(`Esiste già un'offerta di "${currentOffers[duplicateIndex].companyName}". Vuoi sostituirla?`);
        if (!replace) return;
        nextOffers = currentOffers.map((o, i) => (i === duplicateIndex ? { ...offer, id: o.id } : o));
      } else {
        nextOffers = [...currentOffers, offer];
      }
    }

    onUpdateProject({ ...project, offers: nextOffers });
    setDraft(null);
    setDraftSearch('');
    setDraftMessage(null);
    setMessage({ type: 'success', text: `Offerta di "${companyName}" salvata nel confronto.` });
  };

  const filteredDraftEntries = useMemo(() => {
    const query = draftSearch.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(({ item, categoryCode, categoryName }) =>
      item.code.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      categoryCode.toLowerCase().includes(query) ||
      categoryName.toLowerCase().includes(query)
    );
  }, [entries, draftSearch]);

  const draftStats = useMemo(() => {
    if (!draft) return { total: 0, priced: 0 };
    let total = 0;
    let priced = 0;
    entries.forEach(({ item }) => {
      const price = parseMoney(draft.rows[item.id]?.price ?? '');
      if (price !== null) {
        total += price * item.qty;
        priced++;
      }
    });
    return { total, priced };
  }, [draft, entries]);

  const handleSnapshotCurrentOffer = () => {
    if (!canEdit) return;
    const items: Record<string, OfferItemPrice> = {};
    entries.forEach(({ item }) => {
      if (item.offerPrice !== undefined && item.offerPrice !== null && item.offerPrice > 0) {
        items[item.id] = {
          price: item.offerPrice,
          materialPrice: item.offerMaterialPrice,
          laborPrice: item.offerLaborPrice,
          days: item.offerDays,
          notes: item.offerNotes,
        };
      }
    });

    if (Object.keys(items).length === 0) {
      setMessage({ type: 'error', text: 'Nessun prezzo offerto trovato. Compila prima l\'offerta in modalità "Compilazione Offerta Ditta".' });
      return;
    }

    const details = project.contractorDetails || {};
    const companyName = (details.companyName || '').trim() || 'Offerta corrente';
    const computedDays = Object.values(items).reduce((sum, line) => sum + (line.days || 0), 0);

    const offer: ContractorOffer = {
      id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      companyName,
      vatNumber: details.vatNumber,
      address: details.address,
      contactPerson: details.contactPerson,
      phone: details.phone,
      email: details.email,
      date: Date.now(),
      validityDays: details.validityDays,
      totalDays: details.totalDays || computedDays || undefined,
      notes: details.notes,
      source: 'compilazione',
      items,
    };

    saveOffer(offer, `Offerta di "${companyName}" salvata nel confronto.`);
  };

  const buildOfferHeadersFromRows = (rows: unknown[][]) => {
    const offerDateRaw = findMetadataValue(rows, ['data offerta']);
    return {
      vatNumber: findMetadataValue(rows, ['partita iva', 'p.iva', 'codice fiscale']) || undefined,
      address: findMetadataValue(rows, ['sede legale', 'indirizzo']) || undefined,
      contactPerson: findMetadataValue(rows, ['referente']) || undefined,
      date: offerDateRaw ? parseDateValue(offerDateRaw) : null,
      totalDays: parseMoney(findMetadataValue(rows, ['tempo complessivo'])),
      validityDays: parseMoney(findMetadataValue(rows, ['validita'])),
    };
  };

  const buildOfferFromStandardRows = (rows: unknown[][], fileName: string): ContractorOffer => {
    const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());

    const headerIndex = rows.findIndex(row =>
      Array.isArray(row) &&
      row.some(cell => normalizeHeader(cell).includes('codice voce')) &&
      row.some(cell => normalizeHeader(cell).includes('prezzo unitario'))
    );

    if (headerIndex < 0) {
      throw new Error('Formato standard non riconosciuto.');
    }

    const headers = (rows[headerIndex] as unknown[]).map(normalizeHeader);
    const findColumn = (predicate: (header: string) => boolean) => headers.findIndex(predicate);

    let codeColumn = findColumn(h => h.includes('codice voce'));
    if (codeColumn < 0) codeColumn = findColumn(h => h === 'codice');
    const descriptionColumn = findColumn(h => h.startsWith('descrizione'));
    let priceColumn = findColumn(h => h.includes('prezzo unitario') && h.includes('offert'));
    if (priceColumn < 0) priceColumn = 6;
    const daysColumn = findColumn(h => h.includes('tempi') && h.includes('giorni'));
    const notesColumn = findColumn(h => h.startsWith('note'));

    const byCode = new Map<string, CostItem>();
    const byDescription = new Map<string, CostItem>();
    entries.forEach(({ item }) => {
      if (item.code.trim()) byCode.set(item.code.trim().toLowerCase(), item);
      if (item.description.trim()) byDescription.set(item.description.trim().toLowerCase(), item);
    });

    const items: Record<string, OfferItemPrice> = {};
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const code = codeColumn >= 0 ? text(row[codeColumn]) : '';
      const description = descriptionColumn >= 0 ? text(row[descriptionColumn]) : '';
      const price = parseMoney(priceColumn >= 0 ? row[priceColumn] : null);
      if (price === null) continue;

      const item = (code && byCode.get(code.toLowerCase())) || (description && byDescription.get(description.toLowerCase()));
      if (!item) continue;

      const days = parseMoney(daysColumn >= 0 ? row[daysColumn] : null);
      const notes = notesColumn >= 0 ? text(row[notesColumn]) : '';

      items[item.id] = {
        price,
        days: days !== null ? days : undefined,
        notes: notes || undefined,
      };
    }

    if (Object.keys(items).length === 0) {
      throw new Error('Nessun prezzo riconosciuto. Verifica di aver compilato la colonna "Prezzo Unitario Offerto (€)".');
    }

    const companyNameFromSheet = findMetadataValue(rows, ['ragione sociale']);
    const meta = buildOfferHeadersFromRows(rows);
    const computedDays = Object.values(items).reduce((sum, line) => sum + (line.days || 0), 0);
    const companyName = companyNameFromSheet || fileName.replace(/\.(xlsx|xls|csv)$/i, '');

    return {
      id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      companyName,
      vatNumber: meta.vatNumber,
      address: meta.address,
      contactPerson: meta.contactPerson,
      date: meta.date || Date.now(),
      validityDays: meta.validityDays !== null ? meta.validityDays : undefined,
      totalDays: meta.totalDays !== null ? meta.totalDays : (computedDays || undefined),
      source: 'excel',
      items,
    };
  };

  const buildItemMatcher = () => {
    const byCode = new Map<string, CostItem>();
    const byDescription = new Map<string, CostItem>();
    const normalized = entries.map(({ item }) => ({ item, description: normalizeDescription(item.description) }));

    normalized.forEach(({ item }) => {
      if (item.code.trim()) byCode.set(item.code.trim().toLowerCase(), item);
    });
    normalized.forEach(({ item, description }) => {
      if (description) byDescription.set(description, item);
    });

    return (code: string, description: string): CostItem | null => {
      const normalizedCode = code.trim().toLowerCase();
      if (normalizedCode) {
        const match = byCode.get(normalizedCode);
        if (match) return match;
      }

      const normalizedText = normalizeDescription(description);
      if (!normalizedText) return null;

      const exact = byDescription.get(normalizedText);
      if (exact) return exact;

      if (normalizedText.length >= 12) {
        const partial = normalized.find(entry =>
          entry.description.length >= 12 &&
          (entry.description.includes(normalizedText) || normalizedText.includes(entry.description))
        );
        if (partial) return partial.item;
      }

      return null;
    };
  };

  const getMappedRowData = (row: unknown[], mapping: ColumnMapping, matchItem: (code: string, description: string) => CostItem | null) => {
    const text = (value: unknown) => (value === null || value === undefined ? '' : String(value).trim());
    const code = mapping.code >= 0 ? text(row[mapping.code]) : '';
    const description = mapping.description >= 0 ? text(row[mapping.description]) : '';
    const item = matchItem(code, description);

    let price = mapping.price >= 0 ? parseMoney(row[mapping.price]) : null;
    if (price === null && mapping.amount >= 0) {
      const amount = parseMoney(row[mapping.amount]);
      if (amount !== null) {
        const rowQty = mapping.quantity >= 0 ? parseMoney(row[mapping.quantity]) : null;
        const divisor = rowQty !== null && rowQty !== 0 ? rowQty : (item?.qty || 0);
        price = divisor > 0 ? amount / divisor : null;
      }
    }

    const days = mapping.days >= 0 ? parseMoney(row[mapping.days]) : null;
    const notes = mapping.notes >= 0 ? text(row[mapping.notes]) : '';
    const materialPrice = mapping.material >= 0 ? parseMoney(row[mapping.material]) : null;
    const laborPrice = mapping.labor >= 0 ? parseMoney(row[mapping.labor]) : null;

    return { item, price, days, notes, code, description, materialPrice, laborPrice };
  };

  const buildOfferFromPendingImport = (pending: PendingImport): ContractorOffer => {
    const matchItem = buildItemMatcher();
    const items: Record<string, OfferItemPrice> = {};

    for (let r = pending.mapping.headerRow + 1; r < pending.rows.length; r++) {
      const row = pending.rows[r];
      if (!Array.isArray(row)) continue;

      const { item, price, days, notes, materialPrice, laborPrice } = getMappedRowData(row, pending.mapping, matchItem);
      if (price === null) continue;
      if (!item) continue;

      items[item.id] = {
        price,
        days: days !== null ? days : undefined,
        notes: notes || undefined,
        materialPrice: materialPrice !== null ? materialPrice : undefined,
        laborPrice: laborPrice !== null ? laborPrice : undefined,
      };
    }

    if (Object.keys(items).length === 0) {
      throw new Error('Nessuna riga abbinata alle voci del computo. Controlla le colonne selezionate.');
    }

    const meta = buildOfferHeadersFromRows(pending.rows);
    const computedDays = Object.values(items).reduce((sum, line) => sum + (line.days || 0), 0);
    const companyName = pending.companyName.trim() || pending.fileName.replace(/\.(xlsx|xls|csv)$/i, '');

    return {
      id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      companyName,
      vatNumber: meta.vatNumber,
      address: meta.address,
      contactPerson: meta.contactPerson,
      date: meta.date || Date.now(),
      validityDays: meta.validityDays !== null ? meta.validityDays : undefined,
      totalDays: meta.totalDays !== null ? meta.totalDays : (computedDays || undefined),
      source: 'excel',
      items,
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBusy(true);
    setMessage(null);
    setImportError(null);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const rows = await readSheetRows(workbook, sheetName);

      const isStandard = rows.some(row =>
        Array.isArray(row) &&
        row.some(cell => normalizeHeader(cell).includes('codice voce')) &&
        row.some(cell => normalizeHeader(cell).includes('prezzo unitario'))
      );

      if (isStandard) {
        const offer = buildOfferFromStandardRows(rows, file.name);
        saveOffer(offer, `Offerta di "${offer.companyName}" importata correttamente.`);
      } else {
        const headerRow = detectHeaderRow(rows);
        const headers = ((rows[headerRow] as unknown[]) || []).map(normalizeHeader);
        setPendingImport({
          fileName: file.name,
          workbook,
          sheets: workbook.SheetNames,
          sheetName,
          rows,
          mapping: { headerRow, ...detectColumns(headers) },
          companyName: findMetadataValue(rows, ['ragione sociale', 'impresa', 'ditta']) || file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Errore durante l\'importazione del file.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePendingSheetChange = async (sheetName: string) => {
    if (!pendingImport) return;
    const rows = await readSheetRows(pendingImport.workbook, sheetName);
    const headerRow = detectHeaderRow(rows);
    const headers = ((rows[headerRow] as unknown[]) || []).map(normalizeHeader);
    setPendingImport({
      ...pendingImport,
      sheetName,
      rows,
      mapping: { headerRow, ...detectColumns(headers) },
    });
    setImportError(null);
  };

  const updatePendingMapping = (field: keyof ColumnMapping, value: number) => {
    setPendingImport(current => (current ? { ...current, mapping: { ...current.mapping, [field]: value } } : current));
    setImportError(null);
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    try {
      const offer = buildOfferFromPendingImport(pendingImport);
      const saved = saveOffer(offer, `Offerta di "${offer.companyName}" importata correttamente.`);
      if (saved) {
        setPendingImport(null);
        setImportError(null);
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Errore durante l\'importazione.');
    }
  };

  const handleDeleteOffer = (offer: ContractorOffer) => {
    if (!canEdit) return;
    if (!window.confirm(`Eliminare l'offerta di "${offer.companyName}" dal confronto?`)) return;
    onUpdateProject({
      ...project,
      offers: (project.offers || []).filter(o => o.id !== offer.id),
    });
    setMessage({ type: 'info', text: `Offerta di "${offer.companyName}" eliminata.` });
  };

  const handleExportComparison = async () => {
    if (!canExport) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const rows: unknown[][] = [];

    rows.push(['CONFRONTO OFFERTE DITTE']);
    rows.push([`Progetto: ${project.name}`]);
    rows.push([`Data esportazione: ${new Date().toLocaleDateString('it-IT')}`]);
    rows.push([`Totale computo base: € ${baseTotal.toFixed(2)}`]);
    rows.push([`Criterio di aggiudicazione: ${criterionLabel}`]);
    rows.push([`Offerte ammesse: ${ranking.length}${excludedStats.length > 0 ? ` — escluse: ${excludedStats.length}` : ''}`]);
    rows.push([]);

    rows.push(['Posizione', 'Ditta', 'P.IVA', 'Data offerta', 'Tempi (gg)', 'Validità (gg)', 'Totale offerto (€)', 'Scostamento vs base (%)', 'Copertura (%)', 'Punteggio', 'Esito']);
    stats.forEach(({ offer, total, days, coverage, delta }) => {
      const position = ranking.findIndex(entry => entry.offer.id === offer.id) + 1;
      const ranked = ranking.find(entry => entry.offer.id === offer.id);
      rows.push([
        position > 0 ? position : '—',
        offer.companyName,
        offer.vatNumber || '',
        dateLabel(offer.date),
        days || '',
        offer.validityDays ?? '',
        Number(total.toFixed(2)),
        delta !== null ? Number(delta.toFixed(1)) : '',
        coverage,
        ranked ? Number(ranked.score.toFixed(1)) : '',
        ranked ? 'Ammessa' : 'Esclusa',
      ]);
    });

    rows.push([]);
    const headerRow: unknown[] = ['Categoria', 'Codice', 'Descrizione', 'U.M.', 'Quantità', 'Prezzo base (€)', 'Importo base (€)'];
    offers.forEach(offer => headerRow.push(`${offer.companyName} - Prezzo (€)`, `${offer.companyName} - Importo (€)`));
    rows.push(headerRow);

    entries.forEach(({ item, categoryCode }) => {
      const row: unknown[] = [
        categoryCode,
        item.code,
        item.description,
        item.uom,
        item.qty,
        Number(item.price.toFixed(2)),
        Number((item.qty * item.price).toFixed(2)),
      ];
      offers.forEach(offer => {
        const line = offer.items[item.id];
        const price = line?.price;
        row.push(
          price !== undefined ? Number(price.toFixed(2)) : '',
          price !== undefined ? Number((price * item.qty).toFixed(2)) : ''
        );
      });
      rows.push(row);
    });

    const totalsRow: unknown[] = ['', '', '', '', '', 'TOTALE', Number(baseTotal.toFixed(2))];
    offers.forEach(offer => {
      const offerStat = stats.find(s => s.offer.id === offer.id);
      totalsRow.push('', offerStat ? Number(offerStat.total.toFixed(2)) : '');
    });
    rows.push(totalsRow);

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 50 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Confronto Offerte');

    const cleanName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    XLSX.writeFile(workbook, `${cleanName}_confronto_offerte.xlsx`);
  };

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

  const handlePrintComparison = () => {
    if (!canExport || offers.length === 0) return;

    const summaryHtml = stats.map(({ offer, total, days, coverage, delta }) => `
      <div class="card">
        <div class="name">${escapeHtml(offer.companyName)}</div>
        <div class="total">€ ${total.toFixed(2)}</div>
        <div class="muted">
          ${dateLabel(offer.date)} · ${days || '—'} gg · copertura ${coverage}%
          ${delta !== null ? ` · ${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs base` : ''}
        </div>
      </div>
    `).join('');

    const offerHeaders = offers.map(offer => `<th colspan="2">${escapeHtml(offer.companyName)}</th>`).join('');
    const subHeaders = offers.map(() => '<th class="num">Prezzo</th><th class="num">Importo</th>').join('');

    const itemRows = entries.map(({ item }) => {
      const offerCells = offers.map(offer => {
        const line = offer.items[item.id];
        const price = line?.price;
        return `<td class="num">${price !== undefined ? price.toFixed(2) : '—'}</td><td class="num">${price !== undefined ? (price * item.qty).toFixed(2) : '—'}</td>`;
      }).join('');
      return `<tr>
        <td>${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.uom)}</td>
        <td class="num">${item.qty.toLocaleString('it-IT')}</td>
        <td class="num">${item.price.toFixed(2)}</td>
        <td class="num">${(item.price * item.qty).toFixed(2)}</td>
        ${offerCells}
      </tr>`;
    }).join('');

    const totalsCells = offers.map(offer => {
      const offerStat = stats.find(s => s.offer.id === offer.id);
      return `<td></td><td class="num"><b>${offerStat ? offerStat.total.toFixed(2) : '—'}</b></td>`;
    }).join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Confronto offerte - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 9px; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 11px; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
  .muted { color: #64748b; }
  .cards { display: flex; flex-wrap: wrap; gap: 6px; }
  .card { border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 8px; min-width: 170px; }
  .card .name { font-weight: bold; font-size: 10px; }
  .card .total { font-size: 13px; font-weight: bold; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 4px; vertical-align: top; }
  th { background: #e2e8f0; font-size: 8px; text-transform: uppercase; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tfoot td { border-top: 2px solid #94a3b8; font-weight: bold; }
  .footer { margin-top: 8px; font-size: 8px; color: #94a3b8; }
</style>
</head>
<body>
  <h1>Confronto Offerte Ditte</h1>
  <div class="muted">Progetto: <b>${escapeHtml(project.name)}</b> — Totale computo base: € ${baseTotal.toFixed(2)} — Data: ${new Date().toLocaleDateString('it-IT')}<br/>Criterio: ${criterionLabel}${excludedStats.length > 0 ? ` — Offerte escluse: ${excludedStats.length}` : ''}</div>
  <h2>Riepilogo offerte</h2>
  <div class="cards">${summaryHtml}</div>
  <h2>Confronto analitico</h2>
  <table>
    <thead>
      <tr>
        <th rowspan="2">Codice</th>
        <th rowspan="2">Descrizione</th>
        <th rowspan="2">U.M.</th>
        <th rowspan="2" class="num">Q.tà</th>
        <th rowspan="2" class="num">Prezzo base</th>
        <th rowspan="2" class="num">Importo base</th>
        ${offerHeaders}
      </tr>
      <tr>${subHeaders}</tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="num">Totale offerto</td>
        <td class="num">${baseTotal.toFixed(2)}</td>
        ${totalsCells}
      </tr>
    </tfoot>
  </table>
  <div class="footer">Documento generato da Stimia il ${new Date().toLocaleString('it-IT')}.</div>
</body>
</html>`;

    printHtmlDocument(html);
  };

  const handlePrintVerbale = () => {
    if (!canExport || offers.length === 0) return;

    const best = ranking[0] || null;
    const criterionPhrase = settings.criterion === 'price'
      ? 'del minor prezzo'
      : settings.criterion === 'time'
        ? 'del minor tempo di esecuzione'
        : `del punteggio ponderato (prezzo ${settings.priceWeight}% e tempo ${settings.timeWeight}%)`;

    const proposalHtml = best
      ? `<p>Vista la comparazione delle offerte pervenute, si propone l'affidamento alla ditta
          <b>${escapeHtml(best.offer.companyName)}</b> per l'importo complessivo di
          <b>€ ${best.total.toFixed(2)}</b>${baseTotal > 0 ? `, corrispondente a un ribasso del
          <b>${Math.abs(((best.total - baseTotal) / baseTotal) * 100).toFixed(1)}%</b> rispetto al computo base` : ''}.
          ${settings.criterion !== 'price' ? `Punteggio complessivo: <b>${best.score.toFixed(1)}</b>.` : ''}</p>`
      : `<p>Non risultano offerte ammesse con i criteri selezionati; la comparazione è sospesa in attesa di integrazione documentale.</p>`;

    const excludedHtml = excludedStats.length > 0
      ? `<p>Sono state escluse dalla comparazione ${excludedStats.length} ${excludedStats.length === 1 ? 'offerta' : 'offerte'} per incompletezza o assenza dei requisiti richiesti.</p>`
      : '';

    const rankedIds = new Set(ranking.map(entry => entry.offer.id));
    const scoreColumn = settings.criterion !== 'price';

    const rowsHtml = stats.map(({ offer, total, days, coverage, delta }) => {
      const ranked = ranking.find(entry => entry.offer.id === offer.id);
      const position = ranking.findIndex(entry => entry.offer.id === offer.id) + 1;
      return `
      <tr>
        <td class="num">${position > 0 ? position : '—'}</td>
        <td>${escapeHtml(offer.companyName)}</td>
        <td>${escapeHtml(offer.vatNumber || '—')}</td>
        <td>${dateLabel(offer.date)}</td>
        <td class="num">${days || '—'}</td>
        <td class="num">${offer.validityDays ?? '—'}</td>
        <td class="num">${total.toFixed(2)}</td>
        <td class="num">${coverage}%</td>
        <td class="num">${delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : '—'}</td>
        ${scoreColumn ? `<td class="num">${ranked ? ranked.score.toFixed(1) : '—'}</td>` : ''}
        <td>${rankedIds.has(offer.id) ? 'Ammessa' : 'Esclusa'}</td>
      </tr>
    `;
    }).join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Verbale di comparazione - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.5; }
  h1 { font-size: 17px; text-align: center; margin: 0 0 4px; text-transform: uppercase; }
  h2 { font-size: 12px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
  .subtitle { text-align: center; color: #475569; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #94a3b8; padding: 4px 6px; vertical-align: top; }
  th { background: #e2e8f0; font-size: 9px; text-transform: uppercase; }
  td.num, th.num { text-align: right; }
  .totals { margin-top: 10px; }
  .signatures { display: flex; justify-content: space-between; gap: 30px; margin-top: 50px; }
  .signature { flex: 1; text-align: center; }
  .signature .line { border-top: 1px solid #0f172a; margin-top: 40px; padding-top: 4px; font-size: 10px; }
  .muted { color: #64748b; font-size: 10px; }
</style>
</head>
<body>
  <h1>Verbale di comparazione delle offerte</h1>
  <div class="subtitle">
    Progetto: <b>${escapeHtml(project.name)}</b><br/>
    Totale computo base: € ${baseTotal.toFixed(2)} — Data: ${new Date().toLocaleDateString('it-IT')}
  </div>

  <p>Il sottoscritto, in qualità di tecnico incaricato, presa visione delle offerte pervenute dalle imprese invitate
  per l'esecuzione dei lavori di cui al progetto sopra indicato, procede alla comparazione delle stesse secondo
  il criterio ${criterionPhrase}, verificata la completezza delle offerte rispetto alle voci del computo metrico.</p>
  ${excludedHtml}

  <h2>Offerte pervenute</h2>
  <table>
    <thead>
      <tr>
        <th class="num">Pos.</th>
        <th>Ditta</th>
        <th>P.IVA / C.F.</th>
        <th>Data</th>
        <th class="num">Tempi (gg)</th>
        <th class="num">Validità (gg)</th>
        <th class="num">Importo offerto (€)</th>
        <th class="num">Copertura</th>
        <th class="num">Δ base</th>
        ${scoreColumn ? '<th class="num">Punteggio</th>' : ''}
        <th>Esito</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <h2>Proposta di aggiudicazione</h2>
  ${proposalHtml}

  <p class="totals muted">
    Importo complessivo del computo base: € ${baseTotal.toFixed(2)}.<br/>
    Risparmio rispetto alla base: € ${best ? (baseTotal - best.total).toFixed(2) : '—'}.
  </p>

  <div class="signatures">
    <div class="signature"><div class="line">Il Tecnico</div></div>
    <div class="signature"><div class="line">Il Committente</div></div>
    <div class="signature"><div class="line">Per le Imprese</div></div>
  </div>

  <p class="muted" style="margin-top:24px">Documento generato da Stimia il ${new Date().toLocaleString('it-IT')}.</p>
</body>
</html>`;

    printHtmlDocument(html);
  };

  const renderDelta = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return <span className="text-slate-400">—</span>;
    const isDiscount = value < 0;
    return (
      <span className={`font-semibold ${isDiscount ? 'text-emerald-700' : value > 0 ? 'text-red-600' : 'text-slate-500'}`}>
        {percentLabel(value)}
      </span>
    );
  };

  const importPreviewStats = useMemo(() => {
    if (!pendingImport) return { matched: 0, withPrice: 0, unmatched: [] as string[] };

    const matchItem = buildItemMatcher();
    let matched = 0;
    let withPrice = 0;
    const unmatched: string[] = [];

    for (let r = pendingImport.mapping.headerRow + 1; r < pendingImport.rows.length; r++) {
      const row = pendingImport.rows[r];
      if (!Array.isArray(row)) continue;

      const { item, price, code, description } = getMappedRowData(row, pendingImport.mapping, matchItem);
      if (price === null) continue;

      withPrice++;
      if (item) matched++;
      else if (code || description) unmatched.push(description || code);
    }

    return { matched, withPrice, unmatched };
  }, [pendingImport, entries]);

  const mappingFields: { key: keyof Omit<ColumnMapping, 'headerRow'>; label: string; required?: boolean }[] = [
    { key: 'code', label: 'Codice voce' },
    { key: 'description', label: 'Descrizione', required: true },
    { key: 'price', label: 'Prezzo unitario' },
    { key: 'amount', label: 'Importo totale' },
    { key: 'quantity', label: 'Quantità' },
    { key: 'days', label: 'Tempi (gg)' },
    { key: 'notes', label: 'Note' },
    { key: 'material', label: 'Prezzo materiali' },
    { key: 'labor', label: 'Prezzo manodopera' },
  ];

  const pendingHeaders = pendingImport
    ? ((pendingImport.rows[pendingImport.mapping.headerRow] as unknown[]) || []).map(normalizeHeader)
    : [];

  const canImportMapped = !!pendingImport &&
    (pendingImport.mapping.code >= 0 || pendingImport.mapping.description >= 0) &&
    (pendingImport.mapping.price >= 0 || pendingImport.mapping.amount >= 0) &&
    importPreviewStats.matched > 0;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="flex h-[94vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <Scale size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Confronto Offerte Ditte</h2>
              <p className="truncate text-xs text-slate-300">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {pendingImport ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setPendingImport(null); setImportError(null); }}
                  className="btn btn-ghost btn-icon"
                  title="Annulla importazione"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900">Importa offerta da Excel</h3>
                  <p className="text-xs text-slate-500">
                    Il file non usa il modello standard: abbina le colonne del file alle voci del computo.
                  </p>
                </div>
              </div>

              {importError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle size={15} /> {importError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <FileSpreadsheet size={15} className="text-emerald-600" />
                    File: <b className="truncate text-slate-700">{pendingImport.fileName}</b>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">Foglio</label>
                      <select
                        value={pendingImport.sheetName}
                        onChange={e => handlePendingSheetChange(e.target.value)}
                        className="field"
                      >
                        {pendingImport.sheets.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">Riga intestazione</label>
                      <input
                        type="number"
                        min={1}
                        max={pendingImport.rows.length}
                        value={pendingImport.mapping.headerRow + 1}
                        onChange={e => updatePendingMapping('headerRow', Math.max(0, (parseInt(e.target.value, 10) || 1) - 1))}
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-600">Ditta</label>
                      <input
                        type="text"
                        value={pendingImport.companyName}
                        onChange={e => setPendingImport(current => current ? { ...current, companyName: e.target.value } : current)}
                        className="field"
                        placeholder="Ragione sociale"
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Colonne del file</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {mappingFields.map(field => (
                        <div key={field.key}>
                          <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                            {field.label}{field.required ? ' *' : ''}
                          </label>
                          <select
                            value={pendingImport.mapping[field.key]}
                            onChange={e => updatePendingMapping(field.key, parseInt(e.target.value, 10))}
                            className="field"
                          >
                            <option value={-1}>— Nessuna —</option>
                            {pendingHeaders.map((header, index) => (
                              <option key={index} value={index}>
                                {index + 1}. {header || `Colonna ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Anteprima abbinamento</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Righe con prezzo</span>
                      <b className="text-slate-800">{importPreviewStats.withPrice}</b>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Righe abbinate</span>
                      <b className="text-emerald-700">{importPreviewStats.matched}</b>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Righe non abbinate</span>
                      <b className={importPreviewStats.unmatched.length > 0 ? 'text-amber-700' : 'text-slate-800'}>
                        {importPreviewStats.unmatched.length}
                      </b>
                    </div>
                  </div>

                  {importPreviewStats.unmatched.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Prime voci non abbinate</div>
                      <ul className="max-h-28 space-y-0.5 overflow-auto text-[11px] text-amber-800">
                        {importPreviewStats.unmatched.slice(0, 8).map((description, index) => (
                          <li key={index} className="truncate" title={description}>• {description}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400">
                    <Info size={13} className="mt-0.5 shrink-0" />
                    L'abbinamento usa il codice voce; se assente, la descrizione. Le righe non abbinate vengono ignorate.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => { setPendingImport(null); setImportError(null); }} className="btn btn-neutral">
                  Annulla
                </button>
                <button type="button" onClick={handleConfirmImport} disabled={!canImportMapped} className="btn btn-primary">
                  <Upload size={16} /> Importa offerta
                </button>
              </div>
            </div>
          ) : draft ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setDraft(null); setDraftSearch(''); setDraftMessage(null); }}
                  className="btn btn-ghost btn-icon"
                  title="Torna al confronto"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900">
                    {draft.offerId ? 'Modifica offerta' : 'Nuova offerta manuale'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Trascrivi i prezzi dal documento della ditta nelle voci del computo.
                  </p>
                </div>
              </div>

              {draftMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle size={15} /> {draftMessage}
                </div>
              )}

              {/* Dati offerta */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Dati offerta</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Ragione Sociale *</label>
                    <input
                      type="text"
                      value={draft.companyName}
                      onChange={e => updateDraftField('companyName', e.target.value)}
                      className="field"
                      placeholder="Es. Impresa Edile Rossi Srl"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">P.IVA / C.F.</label>
                    <input
                      type="text"
                      value={draft.vatNumber}
                      onChange={e => updateDraftField('vatNumber', e.target.value)}
                      className="field"
                      placeholder="01234567890"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Referente / Contatti</label>
                    <input
                      type="text"
                      value={draft.contactPerson}
                      onChange={e => updateDraftField('contactPerson', e.target.value)}
                      className="field"
                      placeholder="Nome, telefono, email"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Indirizzo</label>
                    <input
                      type="text"
                      value={draft.address}
                      onChange={e => updateDraftField('address', e.target.value)}
                      className="field"
                      placeholder="Via, numero civico, città"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Data offerta</label>
                    <input
                      type="date"
                      value={draft.date}
                      onChange={e => updateDraftField('date', e.target.value)}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Validità (gg)</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.validityDays}
                      onChange={e => updateDraftField('validityDays', e.target.value)}
                      className="field"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Tempi esecuzione (gg)</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.totalDays}
                      onChange={e => updateDraftField('totalDays', e.target.value)}
                      className="field"
                      placeholder="Es. 90"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Note</label>
                    <input
                      type="text"
                      value={draft.notes}
                      onChange={e => updateDraftField('notes', e.target.value)}
                      className="field"
                      placeholder="Annotazioni sull'offerta"
                    />
                  </div>
                </div>
              </div>

              {/* Inserimento prezzi */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
                  <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={draftSearch}
                      onChange={e => setDraftSearch(e.target.value)}
                      placeholder="Cerca voce o categoria..."
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <button type="button" onClick={prefillBasePrices} className="btn btn-neutral h-8" title="Copia i prezzi del computo base">
                    <Copy size={14} /> Copia prezzi base
                  </button>
                  <button type="button" onClick={clearDraftPrices} className="btn btn-neutral h-8" title="Azzera i prezzi inseriti">
                    <RotateCcw size={14} /> Azzera
                  </button>
                </div>

                <div className="max-h-[42vh] overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-2 py-2 text-left font-semibold">Codice</th>
                        <th className="px-2 py-2 text-left font-semibold">Descrizione</th>
                        <th className="px-2 py-2 text-center font-semibold">U.M.</th>
                        <th className="px-2 py-2 text-right font-semibold">Q.tà</th>
                        <th className="px-2 py-2 text-right font-semibold">Prezzo base</th>
                        <th className="px-2 py-2 text-right font-semibold text-emerald-700">Prezzo offerto (€)</th>
                        <th className="px-2 py-2 text-right font-semibold">Tempi (gg)</th>
                        <th className="px-2 py-2 text-right font-semibold">Importo</th>
                        <th className="px-2 py-2 text-right font-semibold">Δ base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDraftEntries.map(({ item }) => {
                        const row = draft.rows[item.id] || { price: '', days: '' };
                        const price = parseMoney(row.price);
                        const delta = price !== null && item.price > 0 ? ((price - item.price) / item.price) * 100 : null;

                        return (
                          <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                            <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">
                              {item.code}
                            </td>
                            <td className="max-w-[340px] px-2 py-1.5 text-slate-700">
                              <span className="line-clamp-2">{item.description}</span>
                            </td>
                            <td className="px-2 py-1.5 text-center text-slate-500">{item.uom}</td>
                            <td className="px-2 py-1.5 text-right text-slate-600">{item.qty.toLocaleString('it-IT', { maximumFractionDigits: 3 })}</td>
                            <td className="px-2 py-1.5 text-right text-slate-600">{currency(item.price)}</td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={row.price}
                                onChange={e => updateDraftRow(item.id, 'price', e.target.value)}
                                className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                                placeholder="0,00"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={row.days}
                                onChange={e => updateDraftRow(item.id, 'days', e.target.value)}
                                className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                                placeholder="—"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium text-slate-700">
                              {price !== null ? currency(price * item.qty) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {delta !== null ? renderDelta(delta) : <span className="text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredDraftEntries.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                            Nessuna voce corrisponde al filtro.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">
                    Voci prezzate: <b className="text-slate-700">{draftStats.priced}</b> / {entries.length}
                    <span className="mx-2 text-slate-300">|</span>
                    Totale offerta: <b className="text-slate-800">{currency(draftStats.total)}</b>
                    {baseTotal > 0 && draftStats.priced > 0 && (
                      <span className="ml-1">
                        ({renderDelta(((draftStats.total - baseTotal) / baseTotal) * 100)} vs base)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setDraft(null); setDraftSearch(''); setDraftMessage(null); }}
                      className="btn btn-neutral"
                    >
                      Annulla
                    </button>
                    <button type="button" onClick={handleSaveDraft} className="btn btn-primary">
                      <Save size={16} /> Salva offerta
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <>
          {/* Actions */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="btn btn-primary"
                  title="Importa il file Excel compilato dalla ditta"
                >
                  <Upload size={16} /> Importa offerta Excel
                </button>
                <button
                  type="button"
                  onClick={handleSnapshotCurrentOffer}
                  className="btn btn-neutral"
                  title="Salva l'offerta compilata in modalità ditta come offerta del confronto"
                >
                  <Save size={16} /> Salva offerta corrente
                </button>
                <button
                  type="button"
                  onClick={openNewDraft}
                  className="btn btn-neutral"
                  title="Inserisci manualmente un'offerta ricevuta in PDF o su carta"
                >
                  <Plus size={16} /> Nuova offerta
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleExportComparison}
              disabled={!canExport || offers.length === 0}
              className="btn btn-neutral"
              title="Esporta il confronto in Excel"
            >
              <Download size={16} /> Esporta confronto
            </button>
            <button
              type="button"
              onClick={handlePrintComparison}
              disabled={!canExport || offers.length === 0}
              className="btn btn-neutral"
              title="Stampa o salva in PDF il prospetto comparativo"
            >
              <Printer size={16} /> Stampa / PDF
            </button>
            <button
              type="button"
              onClick={handlePrintVerbale}
              disabled={!canExport || offers.length === 0}
              className="btn btn-neutral"
              title="Stampa il verbale di comparazione con proposta di aggiudicazione"
            >
              <FileText size={16} /> Verbale
            </button>
            <span className="ml-auto hidden text-xs text-slate-400 sm:inline">
              Totale computo base: <b className="text-slate-600">{currency(baseTotal)}</b>
            </span>
          </div>

          {message && (
            <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-xs ${
              message.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : message.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-600'
            }`}>
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{message.text}</span>
            </div>
          )}

          {offers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <FileSpreadsheet size={26} />
              </div>
              <h3 className="text-base font-bold text-slate-800">Nessuna offerta acquisita</h3>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                Esporta il “Preventivo Ditte” e importa il file Excel compilato, oppure inserisci manualmente
                l’offerta ricevuta in PDF o su carta: trascrivi i prezzi direttamente nelle voci del computo.
              </p>
              {canEdit && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-primary">
                    <Upload size={16} /> Importa offerta Excel
                  </button>
                  <button type="button" onClick={openNewDraft} className="btn btn-primary">
                    <Plus size={16} /> Nuova offerta manuale
                  </button>
                  <button type="button" onClick={handleSnapshotCurrentOffer} className="btn btn-neutral">
                    <Save size={16} /> Salva offerta corrente
                  </button>
                </div>
              )}
              <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
                <Info size={13} /> Le celle in verde indicano il prezzo più basso per singola voce.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Criterio di aggiudicazione */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px]">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Criterio di aggiudicazione</label>
                    <select
                      value={settings.criterion}
                      disabled={!canEdit}
                      onChange={e => updateSettings({ criterion: e.target.value as OfferComparisonSettings['criterion'] })}
                      className="field"
                    >
                      <option value="price">Minor prezzo</option>
                      <option value="time">Minor tempo di esecuzione</option>
                      <option value="weighted">Punteggio ponderato</option>
                    </select>
                  </div>

                  {settings.criterion === 'weighted' && (
                    <>
                      <div className="w-24">
                        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Peso prezzo (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={settings.priceWeight}
                          disabled={!canEdit}
                          onChange={e => updateSettings({ priceWeight: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })}
                          className="field"
                        />
                      </div>
                      <div className="w-24">
                        <label className="mb-1 block text-[11px] font-semibold text-slate-600">Peso tempo (%)</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={settings.timeWeight}
                          disabled={!canEdit}
                          onChange={e => updateSettings({ timeWeight: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })}
                          className="field"
                        />
                      </div>
                    </>
                  )}

                  <label className="flex items-center gap-2 pb-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={settings.requireComplete}
                      disabled={!canEdit}
                      onChange={e => updateSettings({ requireComplete: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Escludi offerte incomplete
                  </label>

                  <span className="ml-auto pb-2 text-[11px] text-slate-400">
                    {eligibleStats.length} {eligibleStats.length === 1 ? 'offerta valida' : 'offerte valide'} su {offers.length}
                  </span>
                </div>
              </div>

              {/* Esito comparazione */}
              {ranking.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <Award size={20} className="shrink-0 text-emerald-600" />
                  <div className="min-w-0 text-sm">
                    <b className="text-emerald-800">Migliore offerta: {ranking[0].offer.companyName}</b>
                    <span className="ml-2 font-semibold text-emerald-700">{currency(ranking[0].total)}</span>
                    <span className="ml-2 text-xs text-emerald-600">
                      · {criterionLabel}
                      {settings.criterion !== 'price' ? ` · punteggio ${ranking[0].score.toFixed(1)}` : ''}
                    </span>
                  </div>
                  {excludedStats.length > 0 && (
                    <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      {excludedStats.length} {excludedStats.length === 1 ? 'offerta esclusa' : 'offerte escluse'}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle size={18} />
                  Nessuna offerta ammessa con i criteri attuali. Controlla la copertura delle voci e i tempi indicati.
                </div>
              )}

              {/* Offer cards */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {stats.map(({ offer, total, days, coverage, delta, materials, labor, hasSplit }) => {
                  const rankIndex = ranking.findIndex(entry => entry.offer.id === offer.id);
                  const ranked = rankIndex >= 0 ? ranking[rankIndex] : null;
                  const rank = rankIndex >= 0 ? rankIndex + 1 : null;
                  return (
                  <div
                    key={offer.id}
                    className={`relative rounded-xl border bg-white p-4 shadow-sm ${
                      offer.id === bestOfferId
                        ? 'border-emerald-300 ring-1 ring-emerald-200'
                        : ranked
                          ? 'border-slate-200'
                          : 'border-amber-200 opacity-80'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <Building2 size={16} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-slate-900" title={offer.companyName}>{offer.companyName}</h4>
                          <p className="truncate text-[11px] text-slate-500">
                            {offer.vatNumber ? `P.IVA ${offer.vatNumber}` : 'Dati fiscali non indicati'}
                          </p>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditDraft(offer)}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                            title="Inserisci o modifica i prezzi dell'offerta"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOffer(offer)}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Elimina offerta"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {offer.id === bestOfferId && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          <Award size={11} /> Miglior offerta
                        </span>
                      )}
                      {rank !== null && rank > 1 && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          #{rank} in classifica
                        </span>
                      )}
                      {ranked && settings.criterion !== 'price' && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Punteggio {ranked.score.toFixed(1)}
                        </span>
                      )}
                      {!ranked && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          Esclusa{coverage < 100 && settings.requireComplete
                            ? ': offerta incompleta'
                            : settings.criterion === 'time' && days <= 0
                              ? ': tempi non indicati'
                              : ''}
                        </span>
                      )}
                    </div>

                    <div className="mb-2 text-xl font-black text-slate-900">{currency(total)}</div>
                    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {dateLabel(offer.date)}</span>
                      {days > 0 && <span className="inline-flex items-center gap-1"><Clock size={12} /> {days} gg</span>}
                      {offer.validityDays ? <span className="inline-flex items-center gap-1"><Percent size={12} /> validità {offer.validityDays} gg</span> : null}
                    </div>

                    {hasSplit && (
                      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                        <span>Materiali: <b className="text-slate-700">{currency(materials)}</b></span>
                        <span>Manodopera: <b className="text-slate-700">{currency(labor)}</b></span>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                      <span className="text-slate-500">
                        Scostamento vs base: {renderDelta(delta)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${
                        coverage === 100
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        Copertura {coverage}%
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Classifica */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-2 text-sm font-bold text-slate-800">Classifica offerte</div>
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Pos.</th>
                      <th className="px-3 py-2 text-left font-semibold">Ditta</th>
                      <th className="px-3 py-2 text-right font-semibold">Importo</th>
                      <th className="px-3 py-2 text-right font-semibold">Tempi</th>
                      <th className="px-3 py-2 text-right font-semibold">Punteggio</th>
                      <th className="px-3 py-2 text-right font-semibold">Esito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((entry, index) => (
                      <tr key={entry.offer.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-bold text-slate-700">{index + 1}</td>
                        <td className="px-3 py-2 text-slate-700">{entry.offer.companyName}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{currency(entry.total)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{entry.days > 0 ? `${entry.days} gg` : '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{entry.score.toFixed(1)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${index === 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {index === 0 ? 'Proposta' : 'Ammessa'}
                        </td>
                      </tr>
                    ))}
                    {excludedStats.map(entry => (
                      <tr key={entry.offer.id} className="border-t border-slate-100 bg-amber-50/40 text-amber-800">
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">{entry.offer.companyName}</td>
                        <td className="px-3 py-2 text-right">{currency(entry.total)}</td>
                        <td className="px-3 py-2 text-right">{entry.days > 0 ? `${entry.days} gg` : '—'}</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2 text-right font-semibold">Esclusa</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Comparison table */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-800">Confronto analitico delle voci</h3>
                  <span className="text-[11px] text-slate-400">
                    {entries.length} voci · {offers.length} offerte{bestOfferId ? ' · miglior offerta evidenziata' : ''}
                  </span>
                </div>
                <div className="max-h-[52vh] overflow-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                      <tr>
                        <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Codice</th>
                        <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Descrizione</th>
                        <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-center font-semibold">U.M.</th>
                        <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-right font-semibold">Q.tà</th>
                        <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-right font-semibold">Prezzo base</th>
                        <th rowSpan={2} className="border-b border-slate-200 px-2 py-2 text-right font-semibold">Importo base</th>
                        {offers.map(offer => (
                          <th key={offer.id} colSpan={3} className="border-b border-l border-slate-200 px-2 py-2 text-center font-semibold">
                            {offer.companyName}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {offers.map(offer => (
                          <React.Fragment key={`${offer.id}-sub`}>
                            <th className="border-b border-l border-slate-200 px-2 py-1 text-right font-medium">Prezzo</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium">Importo</th>
                            <th className="border-b border-slate-200 px-2 py-1 text-right font-medium">Δ base</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(({ item }) => {
                        const offeredPrices = offers
                          .map(offer => offer.items[item.id]?.price)
                          .filter((price): price is number => price !== undefined && price !== null);
                        const minPrice = offeredPrices.length > 0 ? Math.min(...offeredPrices) : null;

                        return (
                          <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                            <td className="px-2 py-1.5 font-mono text-[11px] text-slate-500">
                              {item.code}
                            </td>
                            <td className="max-w-[380px] px-2 py-1.5 text-slate-700">
                              <span className="line-clamp-2">{item.description}</span>
                            </td>
                            <td className="px-2 py-1.5 text-center text-slate-500">{item.uom}</td>
                            <td className="px-2 py-1.5 text-right text-slate-600">{item.qty.toLocaleString('it-IT', { maximumFractionDigits: 3 })}</td>
                            <td className="px-2 py-1.5 text-right text-slate-600">{currency(item.price)}</td>
                            <td className="px-2 py-1.5 text-right font-medium text-slate-700">{currency(item.qty * item.price)}</td>
                            {offers.map(offer => {
                              const price = offer.items[item.id]?.price;
                              const hasPrice = price !== undefined && price !== null;
                              const delta = hasPrice && item.price > 0 ? ((price - item.price) / item.price) * 100 : null;
                              const isAnomaly = hasPrice && delta !== null && Math.abs(delta) > 30;
                              return (
                                <React.Fragment key={`${offer.id}-${item.id}`}>
                                  <td
                                    className={`border-l border-slate-100 px-2 py-1.5 text-right ${
                                      hasPrice && price === minPrice
                                        ? 'bg-emerald-50 font-bold text-emerald-700'
                                        : isAnomaly
                                          ? 'bg-amber-50 font-semibold text-amber-800'
                                          : 'text-slate-700'
                                    }`}
                                    title={isAnomaly ? 'Scostamento superiore al 30% rispetto al prezzo base' : undefined}
                                  >
                                    {hasPrice ? currency(price) : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-slate-600">
                                    {hasPrice ? currency(price * item.qty) : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    {hasPrice ? renderDelta(delta) : <span className="text-slate-300">—</span>}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-slate-900 text-white">
                      <tr>
                        <td colSpan={5} className="px-2 py-2 text-right text-xs font-bold uppercase tracking-wide">Totale offerto</td>
                        <td className="px-2 py-2 text-right text-xs font-bold">{currency(baseTotal)}</td>
                        {offers.map(offer => {
                          const offerStat = stats.find(s => s.offer.id === offer.id);
                          return (
                            <React.Fragment key={`${offer.id}-total`}>
                              <td className="border-l border-slate-700 px-2 py-2 text-right text-[11px] text-slate-400">—</td>
                              <td className="px-2 py-2 text-right text-xs font-bold">{offerStat ? currency(offerStat.total) : '—'}</td>
                              <td className="px-2 py-2 text-right text-xs">
                                {offerStat && offerStat.delta !== null
                                  ? (
                                    <span className={offerStat.delta < 0 ? 'font-semibold text-emerald-300' : offerStat.delta > 0 ? 'font-semibold text-red-300' : 'text-slate-300'}>
                                      {percentLabel(offerStat.delta)}
                                    </span>
                                  )
                                  : '—'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Info size={13} />
                Il confronto usa le quantità del computo. Verde = prezzo più basso per voce; ambra = scostamento oltre il 30% dal prezzo base.
              </p>
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            {offers.length} {offers.length === 1 ? 'offerta acquisita' : 'offerte acquisite'} · dati salvati con il computo
          </span>
          <button onClick={onClose} className="btn btn-primary sm:ml-auto">Chiudi</button>
        </div>
      </div>
    </div>
  );
};
