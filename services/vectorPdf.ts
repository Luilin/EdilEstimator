import { CostItem, Project, WBSNode } from '../types';
import type { PrintDocumentType } from '../components/print/PrintDocuments';
import { projectDeadlines } from './calendar';
import pdfMakeUrl from 'pdfmake/build/pdfmake.min.js?url';
import pdfFontsUrl from 'pdfmake/build/vfs_fonts.js?url';

export interface VectorPdfStyleInput {
  appTitle: string;
  docTitle: string;
  subtitle: string;
  projectId: string;
  technician: string;
  date: string;
  sizes: {
    title: number;
    docTitle: number;
    desc: number;
    meta: number;
    headerL1: number;
    headerSub: number;
    catAmount: number;
    body: number;
    amount: number;
    measurements: number;
    tableHead: number;
    total: number;
  };
  colors: {
    title: string;
    docTitle: string;
    subtitle: string;
    meta: string;
    tableHead: string;
    catBgL1: string;
    catTextL1: string;
    catBgSub: string;
    catTextSub: string;
    catAmount: string;
    itemText: string;
    amount: string;
    total: string;
  };
  borderWidth: number;
  headerLineWidth: number;
  borderColor: string;
}

export interface VectorPdfOptions {
  document: PrintDocumentType;
  project: Project;
  salId?: string | null;
  selectedIds?: Set<string>;
  layoutMode?: 'details' | 'summary' | 'both';
  showPrices?: boolean;
  showMaterialLabor?: boolean;
  footerText?: string;
  showFooter?: boolean;
  footerColor?: string;
  footerSize?: number;
  pageNumberColor?: string;
  pageNumberSize?: number;
  technician?: string;
  /** Stile dell'anteprima (dimensioni in px, come nella UI). */
  styles?: VectorPdfStyleInput;
  rfq?: {
    showMaterialLabor: boolean;
    showTimeCol: boolean;
    showContractorForm: boolean;
  };
}

declare global {
  interface Window {
    pdfMake?: any;
  }
}

const mm = (value: number) => value * 2.834645669;

/** Le dimensioni dell'anteprima sono in px CSS: nel PDF 1px = 0,75pt. */
const pxToPt = (value: number) => value * 0.75;

const resolveStyles = (options: VectorPdfOptions): VectorPdfStyleInput => {
  const project = options.project;
  const s = options.styles;

  const defaults: VectorPdfStyleInput = {
    appTitle: 'Stimia',
    docTitle: `${project.name} — ${documentLabel(options.document)}`,
    subtitle: project.description || '',
    projectId: project.id.toUpperCase().substring(0, 8),
    technician: options.technician || project.createdBy || '—',
    date: todayLabel(),
    sizes: {
      title: 20,
      docTitle: 14,
      desc: 11,
      meta: 10,
      headerL1: 16,
      headerSub: 13,
      catAmount: 13,
      body: 11,
      amount: 11,
      measurements: 9,
      tableHead: 10,
      total: 18,
    },
    colors: {
      title: '#0f172a',
      docTitle: '#4b5563',
      subtitle: '#6b7280',
      meta: '#6b7280',
      tableHead: '#4b5563',
      catBgL1: '#f3f4f6',
      catTextL1: '#111827',
      catBgSub: '#ffffff',
      catTextSub: '#1f2937',
      catAmount: '#111827',
      itemText: '#374151',
      amount: '#111827',
      total: '#000000',
    },
    borderWidth: 2,
    headerLineWidth: 3,
    borderColor: '#1f2937',
  };

  if (!s) return defaults;

  return {
    ...defaults,
    ...s,
    sizes: { ...defaults.sizes, ...s.sizes },
    colors: { ...defaults.colors, ...s.colors },
  };
};

const currency = (value: number) =>
  `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateLabel = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('it-IT') : '—');

const todayLabel = () => new Date().toLocaleDateString('it-IT');

const number = (value: number, digits = 2) =>
  value.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const tableLayout = {
  hLineWidth: () => 0.4,
  vLineWidth: () => 0.4,
  hLineColor: () => '#94a3b8',
  vLineColor: () => '#94a3b8',
  paddingLeft: () => 2.5,
  paddingRight: () => 2.5,
  paddingTop: () => 1.5,
  paddingBottom: () => 1.5,
};

const headerCell = (text: string) => ({
  text,
  bold: true,
  fontSize: 7.5,
  fillColor: '#e2e8f0',
  color: '#0f172a',
});

const cell = (text: string | number, options: Record<string, any> = {}) => ({
  text: String(text ?? ''),
  fontSize: 7.5,
  ...options,
});

const rightCell = (text: string | number, options: Record<string, any> = {}) =>
  cell(text, { alignment: 'right', ...options });

const makeTable = (headers: string[], rows: any[][], widths?: any[]) => ({
  table: {
    headerRows: 1,
    dontBreakRows: true,
    widths: widths || headers.map(() => '*'),
    body: [headers.map(headerCell), ...rows],
  },
  layout: tableLayout,
  margin: [0, 2, 0, 6],
});

const categoryRow = (label: string, colSpan: number, total?: number) => {
  const row: any[] = [{ text: label, bold: true, fontSize: 7.5, fillColor: '#f1f5f9', colSpan }];
  for (let i = 1; i < colSpan - 1; i++) row.push({});
  if (total !== undefined) row.push(rightCell(currency(total), { bold: true, fillColor: '#f1f5f9' }));
  else row.push({});
  return row;
};

const flattenItems = (root: WBSNode): { nodeId: string; categoryCode: string; categoryName: string; item: CostItem }[] => {
  const entries: { nodeId: string; categoryCode: string; categoryName: string; item: CostItem }[] = [];
  const walk = (node: WBSNode) => {
    const code = node.level === 0 ? '' : node.code;
    const name = node.level === 0 ? '' : node.name;
    node.items.forEach(item => entries.push({ nodeId: node.id, categoryCode: code, categoryName: name, item }));
    node.children.forEach(walk);
  };
  walk(root);
  return entries;
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

const computeQe = (project: Project) => {
  const settings = project.quadroEconomico || {
    ivaPercent: 22,
    imprevistiPercent: 5,
    accantonamentiPercent: 1,
    speseTecnichePercent: 2,
    oneriSicurezzaMode: 'auto' as const,
    oneriSicurezzaPercent: 0,
    ribassoPercent: 0,
    sogliaAnomaliaPercent: 20,
    categorySoa: {},
  };
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
  const categories = project.rootWBS.children.map(node => {
    const items = collectItems(node);
    return {
      node,
      amount: items.reduce((sum, item) => sum + (item.amount || 0), 0),
      count: items.length,
      soa: settings.categorySoa?.[node.id] || '',
    };
  });
  return {
    settings,
    lavori,
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
    categories,
  };
};

const analysisTotals = (item: CostItem) => {
  const analysis = item.priceAnalysis;
  if (!analysis) return { direct: 0, overheads: 0, profit: 0, epu: 0 };
  const direct = analysis.rows.reduce((sum, row) => sum + (row.quantity || 0) * (row.unitPrice || 0), 0);
  const overheads = direct * (analysis.overheadsPercent || 0) / 100;
  const profit = (direct + overheads) * (analysis.profitPercent || 0) / 100;
  return { direct, overheads, profit, epu: direct + overheads + profit };
};

const offerStats = (project: Project) => {
  const items = collectItems(project.rootWBS);
  const baseTotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  const all = (project.offers || []).map(offer => {
    const priced = items.filter(item => offer.items[item.id]?.price !== undefined);
    const total = items.reduce((sum, item) => sum + (offer.items[item.id]?.price ?? 0) * item.qty, 0);
    const days = items.reduce((sum, item) => sum + (offer.items[item.id]?.days || 0), 0);
    return {
      offer,
      total,
      days,
      coverage: items.length > 0 ? (priced.length / items.length) * 100 : 0,
      delta: baseTotal > 0 ? ((total - baseTotal) / baseTotal) * 100 : 0,
    };
  }).sort((a, b) => a.total - b.total);
  const requireComplete = project.offerComparisonSettings?.requireComplete;
  const stats = requireComplete ? all.filter(entry => entry.coverage >= 99.9) : all;
  return { stats, excluded: all.length - stats.length, baseTotal };
};

/** Logo dell'app (PNG) convertito in data URL per pdfmake. */
let brandBadgeDataUrl: string | null = null;
let brandBadgePromise: Promise<void> | null = null;

const ensureBrandBadge = async (): Promise<void> => {
  if (brandBadgeDataUrl) return;
  if (brandBadgePromise) return brandBadgePromise;

  brandBadgePromise = (async () => {
    try {
      const base = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${base}brand/stimia-badge.png`);
      if (!response.ok) return;
      const blob = await response.blob();
      brandBadgeDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('Logo non disponibile per il PDF:', error);
    }
  })();

  return brandBadgePromise;
};

const headerContent = (options: VectorPdfOptions, badge: string | null = brandBadgeDataUrl) => {
  const s = resolveStyles(options);
  const isDefaultTitle = s.appTitle.trim().toLowerCase() === 'stimia';

  const titleNode = badge && isDefaultTitle
    ? {
        columns: [
          { width: 34, stack: [{ image: 'brandBadge', width: 34 }] },
          {
            width: '*',
            text: s.appTitle,
            bold: true,
            fontSize: pxToPt(s.sizes.title),
            color: s.colors.title,
            margin: [8, 5, 0, 0],
          },
        ],
      }
    : { text: s.appTitle, bold: true, fontSize: pxToPt(s.sizes.title), color: s.colors.title };

  return {
    stack: [
      {
        columns: [
          {
            width: '*',
            stack: [
              titleNode,
              { text: s.docTitle, bold: true, fontSize: pxToPt(s.sizes.docTitle), color: s.colors.docTitle, margin: [0, 3, 0, 0] },
              ...(s.subtitle ? [{ text: s.subtitle, fontSize: pxToPt(s.sizes.desc), color: s.colors.subtitle, margin: [0, 3, 0, 0] }] : []),
            ],
          },
          {
            width: 170,
            stack: [
              { text: [{ text: 'Rif. Pratica: ', bold: true }, { text: s.projectId }], fontSize: pxToPt(s.sizes.meta), color: s.colors.meta, alignment: 'right' },
              { text: [{ text: 'Tecnico: ', bold: true }, { text: s.technician }], fontSize: pxToPt(s.sizes.meta), color: s.colors.meta, alignment: 'right' },
              { text: [{ text: 'Data: ', bold: true }, { text: s.date }], fontSize: pxToPt(s.sizes.meta), color: s.colors.meta, alignment: 'right' },
            ],
          },
        ],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: mm(180), y2: 0, lineWidth: s.headerLineWidth, lineColor: s.borderColor }],
        margin: [0, 6, 0, 8],
      },
    ],
  };
};

const documentLabel = (document: PrintDocumentType): string => {
  switch (document) {
    case 'priceList': return 'Elenco Prezzi Unitari';
    case 'capitolato': return 'Capitolato Speciale d’Appalto';
    case 'quadroEconomico': return 'Quadro Economico';
    case 'offerComparison': return 'Confronto Offerte';
    case 'verbale': return 'Verbale di Comparazione';
    case 'schedule': return 'Cronoprogramma e Gantt';
    case 'priceAnalysis': return 'Analisi Prezzi (EPU)';
    case 'suppliers': return 'Fornitori e Subappalti';
    case 'deadlines': return 'Scadenze Progetto';
    case 'variants': return 'Varianti e Perizie';
    case 'signatures': return 'Registro Firme';
    default: return 'Documento';
  }
};

const computoContent = (options: VectorPdfOptions): any[] => {
  const { project } = options;
  const s = resolveStyles(options);
  const isSal = options.document === 'sal';
  const sal = isSal ? (project.sals || []).find(item => item.id === options.salId) : null;
  if (isSal && !sal) return [{ text: 'Nessun SAL selezionato.', italics: true, color: s.colors.meta }];

  const selected = options.selectedIds;
  const showPrices = options.showPrices !== false && options.document !== 'rfq';
  const showMatLab = Boolean(options.showMaterialLabor);
  const layout = options.layoutMode || 'details';
  const detailBlocks: any[] = [];
  const summaryBlocks: any[] = [];

  const columns = ['Codice', 'Descrizione', 'U.M.', 'Q.tà'];
  if (isSal) columns.push('%');
  if (showMatLab && showPrices) columns.push('Mat. (€)', 'Man. (€)');
  if (showPrices) columns.push('Prezzo (€)', 'Importo (€)');
  if (options.document === 'rfq') {
    if (options.rfq?.showMaterialLabor) columns.push('Mat. (€)', 'Man. (€)', 'Prezzo Tot. (€)');
    else columns.push('Prezzo Offerto (€)');
    if (options.rfq?.showTimeCol) columns.push('Tempi (gg)');
    columns.push('Importo Offerto (€)');
  }

  const widths = columns.map((_, index) => {
    if (index === 0) return 42;
    if (index === 1) return '*';
    if (index === 2) return 24;
    if (index === 3) return 44;
    return 'auto';
  });

  const alignFor = (index: number) => {
    if (index === 0 || index === 1) return 'left';
    if (index === 2) return 'center';
    return 'right';
  };

  const buildHeaderRow = () => columns.map((label, index) => ({
    text: label,
    bold: true,
    fontSize: pxToPt(s.sizes.tableHead),
    color: s.colors.tableHead,
    alignment: alignFor(index),
  }));

  const itemsLayout = () => ({
    hLineWidth: (i: number) => (i === 0 ? 0 : 0.6),
    vLineWidth: () => 0,
    hLineColor: () => '#e5e7eb',
    paddingLeft: () => 2,
    paddingRight: () => 2,
    paddingTop: () => 2.4,
    paddingBottom: () => 2.4,
  });

  const categoryBand = (node: WBSNode, nodeTotal: number) => {
    const isRoot = node.level === 1;
    const background = isRoot ? s.colors.catBgL1 : s.colors.catBgSub;
    const textColor = isRoot ? s.colors.catTextL1 : s.colors.catTextSub;
    const fontSize = pxToPt(isRoot ? s.sizes.headerL1 : s.sizes.headerSub);

    return {
      table: {
        widths: ['*', 'auto'],
        body: [[
          { text: `${node.code}  ${node.name}`, bold: true, fontSize, color: textColor, fillColor: background },
          {
            text: showPrices ? `Tot. ${currency(nodeTotal)}` : '',
            bold: true,
            alignment: 'right',
            fontSize: pxToPt(s.sizes.catAmount),
            color: s.colors.catAmount,
            fillColor: background,
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      margin: [0, 6, 0, 2],
    };
  };

  const itemsTable = (itemRows: any[][]) => ({
    table: { headerRows: 1, widths: [...widths], body: [buildHeaderRow(), ...itemRows] },
    layout: itemsLayout(),
    margin: [0, 0, 0, 6],
  });

  const qtyText = (value: number) => value.toLocaleString('it-IT', { maximumFractionDigits: 2 });

  const salQty = (itemId: string) => {
    if (!sal) return 0;
    const row = sal.rows.find(entry => entry.costItemId === itemId);
    return row ? row.qty : 0;
  };

  const previousSalQty = (itemId: string) => {
    if (!sal) return 0;
    return (project.sals || [])
      .filter(entry => entry.id !== sal.id && entry.date < sal.date)
      .reduce((sum, entry) => sum + ((entry.rows.find(row => row.costItemId === itemId)?.qty) || 0), 0);
  };

  const buildItemRow = (item: CostItem) => {
    const qty = isSal ? salQty(item.id) : item.qty;
    const amount = qty * item.price;
    const cells: any[] = [
      { text: item.code, fontSize: pxToPt(s.sizes.measurements), color: s.colors.itemText },
      { text: item.description, fontSize: pxToPt(s.sizes.body), color: s.colors.itemText },
      { text: item.uom, fontSize: pxToPt(s.sizes.measurements), color: s.colors.itemText, alignment: 'center' },
      { text: qtyText(qty), fontSize: pxToPt(s.sizes.body), color: s.colors.itemText, alignment: 'right' },
    ];

    if (isSal) {
      const cumulative = previousSalQty(item.id) + qty;
      const percent = item.qty > 0 ? (cumulative / item.qty) * 100 : 0;
      cells.push({
        text: `${percent.toFixed(0)}%`,
        bold: true,
        fontSize: pxToPt(s.sizes.measurements),
        color: s.colors.itemText,
        alignment: 'right',
      });
    }

    if (showMatLab && showPrices) {
      cells.push({ text: currency(item.materialPrice || 0), fontSize: pxToPt(s.sizes.measurements), color: '#4b5563', alignment: 'right' });
      cells.push({ text: currency(item.laborPrice || 0), fontSize: pxToPt(s.sizes.measurements), color: '#4b5563', alignment: 'right' });
    }

    if (showPrices) {
      cells.push({ text: currency(item.price), fontSize: pxToPt(s.sizes.body), color: s.colors.itemText, alignment: 'right' });
      cells.push({ text: currency(amount), fontSize: pxToPt(s.sizes.amount), color: s.colors.amount, alignment: 'right' });
    }

    if (options.document === 'rfq') {
      if (options.rfq?.showMaterialLabor) {
        cells.push({ text: '', alignment: 'center' });
        cells.push({ text: '', alignment: 'center' });
        cells.push({ text: '', alignment: 'center' });
      } else {
        cells.push({ text: '', alignment: 'center' });
      }
      if (options.rfq?.showTimeCol) cells.push({ text: '', alignment: 'center' });
      cells.push({ text: '', alignment: 'center' });
    }

    return cells;
  };

  const subtreeTotal = (node: WBSNode, ancestorSelected: boolean): number => {
    const included = ancestorSelected || !selected || selected.size === 0 || selected.has(node.id);
    if (!included) return 0;
    const own = node.items
      .filter(item => !isSal || salQty(item.id) > 0)
      .reduce((sum, item) => sum + (isSal ? salQty(item.id) * item.price : item.amount), 0);
    return own + node.children.reduce((sum, child) => sum + subtreeTotal(child, included), 0);
  };

  const walk = (node: WBSNode, ancestorSelected: boolean) => {
    const included = ancestorSelected || !selected || selected.size === 0 || selected.has(node.id);
    if (node.level > 0 && included) {
      const items = node.items.filter(item => !isSal || salQty(item.id) > 0);
      const fullTotal = subtreeTotal(node, ancestorSelected);

      if (fullTotal > 0 || items.length > 0) {
        // Come nell'anteprima: ogni categoria mostra la propria fascia con il
        // totale del sottoalbero, e la tabella solo se ha voci proprie.
        detailBlocks.push(categoryBand(node, fullTotal));
        summaryBlocks.push(categoryBand(node, fullTotal));
        if (items.length > 0 && layout !== 'summary') {
          detailBlocks.push(itemsTable(items.map(buildItemRow)));
        }
      }
    }
    node.children.forEach(child => walk(child, included));
  };

  walk(project.rootWBS, false);

  const total = subtreeTotal(project.rootWBS, false);

  const content: any[] = [];
  if (layout === 'details' || layout === 'both') {
    content.push(...detailBlocks);
  }
  if (layout === 'both') {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: 'RIEPILOGO CATEGORIE',
      bold: true,
      fontSize: pxToPt(s.sizes.headerL1),
      color: s.colors.title,
      margin: [0, 0, 0, 8],
    });
  }
  if (layout === 'summary' || layout === 'both') {
    content.push(...summaryBlocks);
  }

  if (showPrices) {
    content.push({
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: mm(180), y2: 0, lineWidth: pxToPt(s.borderWidth), lineColor: s.borderColor }],
      margin: [0, 10, 0, 4],
    });
    content.push({
      columns: [
        {
          width: '*',
          text: `TOTALE ${isSal ? 'AVANZAMENTO LAVORI' : 'GENERALE'}`,
          bold: true,
          fontSize: pxToPt(s.sizes.total * 0.8),
          color: '#1f2937',
        },
        { width: 'auto', text: currency(total), bold: true, fontSize: pxToPt(s.sizes.total), color: s.colors.total },
      ],
    });
    if (isSal) {
      const projectTotal = collectItems(project.rootWBS).reduce((sum, item) => sum + (item.amount || 0), 0);
      const percent = projectTotal > 0 ? (total / projectTotal) * 100 : 0;
      content.push({
        text: `Percentuale avanzamento: ${percent.toFixed(2)}%`,
        fontSize: pxToPt(s.sizes.meta),
        color: '#ea580c',
        bold: true,
        margin: [0, 2, 0, 0],
      });
    }
  }

  if (isSal && sal) {
    content.push({ text: `SAL: ${sal.code} — ${sal.name} · ${dateLabel(sal.date)}`, fontSize: pxToPt(s.sizes.meta), color: s.colors.meta, margin: [0, 4, 0, 0] });
  }

  if (options.document === 'rfq' && options.rfq?.showContractorForm) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({ text: 'MODULO OFFERTA E DICHIARAZIONE DELL’IMPRESA', bold: true, fontSize: pxToPt(s.sizes.headerSub), margin: [0, 0, 0, 6] });
    content.push({ text: 'Ragione Sociale: ________________________________________________', margin: [0, 0, 0, 10] });
    content.push({ text: 'P.IVA / Cod. Fiscale: ___________________________________________', margin: [0, 0, 0, 10] });
    content.push({ text: 'Indirizzo: ______________________________________________________', margin: [0, 0, 0, 10] });
    content.push({ text: 'Referente: ______________________________________________________', margin: [0, 0, 0, 10] });
    content.push({ text: 'Tempo complessivo di esecuzione stimato: _______ giorni naturali e consecutivi', margin: [0, 0, 0, 10] });
    content.push({ text: 'Validità temporale dell’offerta: _______ giorni solari', margin: [0, 0, 0, 10] });
    content.push({ text: 'Note, specifiche tecniche o marche proposte:', margin: [0, 0, 0, 4] });
    content.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: mm(180), h: mm(25), lineWidth: 0.5, lineColor: '#94a3b8' }], margin: [0, 0, 0, 14] });
    content.push({ columns: [{ width: '*', text: 'Data e Luogo: ______________________, ____/____/______' }, { width: 'auto', text: 'Timbro e Firma del Legale Rappresentante', alignment: 'center' }] });
  }

  return content;
};

const priceListContent = (project: Project): any[] => {
  const rows: any[][] = [];
  let lastCategory = '';
  flattenItems(project.rootWBS).forEach(({ categoryCode, categoryName, item }) => {
    const label = `${categoryCode}${categoryCode ? ' — ' : ''}${categoryName}`;
    if (label !== lastCategory) {
      lastCategory = label;
      rows.push(categoryRow(label, 4));
    }
    rows.push([cell(item.code), cell(item.description), cell(item.uom), rightCell(currency(item.price))]);
  });
  return [
    { text: 'Elenco Prezzi Unitari', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    makeTable(['Codice', 'Descrizione', 'U.M.', 'Prezzo unitario'], rows, [45, '*', 30, 65]),
  ];
};

const capitolatoContent = (project: Project): any[] => {
  const groups = new Map<string, { code: string; name: string; items: CostItem[] }>();
  flattenItems(project.rootWBS).forEach(({ categoryCode, categoryName, item }) => {
    const key = `${categoryCode}|${categoryName}`;
    if (!groups.has(key)) groups.set(key, { code: categoryCode, name: categoryName, items: [] });
    groups.get(key)!.items.push(item);
  });
  const content: any[] = [
    { text: 'Capitolato Speciale d’Appalto', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    { text: 'Il presente capitolato disciplina le modalità di esecuzione delle lavorazioni del computo metrico estimativo. I prezzi unitari si intendono comprensivi di materiali, manodopera, noli, attrezzature, spese generali e utile d’impresa.', fontSize: 8, color: '#475569', margin: [0, 0, 0, 8] },
  ];
  let article = 0;
  groups.forEach(group => {
    article += 1;
    content.push({ text: `Art. ${article} — ${group.code} ${group.name}`, bold: true, fontSize: 9.5, margin: [0, 8, 0, 2] });
    content.push({ text: 'Le lavorazioni elencate dovranno essere eseguite secondo le regole dell’arte, nel rispetto delle normative vigenti.', fontSize: 7.5, color: '#64748b', margin: [0, 0, 0, 4] });
    group.items.forEach(item => {
      content.push({
        stack: [
          { text: `${item.code} — ${item.description}`, bold: true, fontSize: 7.5 },
          { text: `U.M. ${item.uom} · Prezzo unitario ${currency(item.price)} · Quantità ${number(item.qty, 2)}`, fontSize: 7, color: '#64748b' },
        ],
        margin: [0, 0, 0, 4],
      });
    });
  });
  return content;
};

const quadroEconomicoContent = (project: Project): any[] => {
  const qe = computeQe(project);
  const rows = [
    ['Lavori a misura', qe.lavoriNetto],
    ['Oneri della sicurezza', qe.oneriSicurezza],
    ['Imprevisti', qe.imprevisti],
    ['Accantonamenti', qe.accantonamenti],
    ['Spese tecniche', qe.speseTecniche],
    ['Imponibile', qe.imponibile],
    [`IVA (${qe.settings.ivaPercent}%)`, qe.iva],
    ['Totale quadro economico', qe.totale],
  ];
  return [
    { text: 'Quadro Economico', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    makeTable(['Voce', 'Importo'], rows.map(([label, value], index) => [
      cell(label, index === 5 || index === 7 ? { bold: true, fillColor: '#f1f5f9' } : {}),
      rightCell(currency(value as number), index === 5 || index === 7 ? { bold: true, fillColor: '#f1f5f9' } : {}),
    ]), ['*', 90]),
    { text: 'Riepilogo gara', bold: true, fontSize: 10, margin: [0, 8, 0, 2] },
    makeTable(['Voce', 'Importo'], [
      [cell('Base gara (lavori + sicurezza)'), rightCell(currency(qe.baseGara))],
      [cell(`Ribasso applicato (${qe.settings.ribassoPercent}%)`), rightCell(currency(qe.ribassoImporto))],
      [cell('Importo netto', { bold: true }), rightCell(currency(qe.importoNetto), { bold: true })],
      [cell(`Soglia di anomalia (${qe.settings.sogliaAnomaliaPercent}%)`), rightCell(currency(qe.sogliaAnomalia))],
    ], ['*', 90]),
    { text: 'Categorie e SOA', bold: true, fontSize: 10, margin: [0, 8, 0, 2] },
    makeTable(['Categoria', 'SOA', 'Voci', 'Importo'], qe.categories.map(entry => [
      cell(`${entry.node.code} — ${entry.node.name}`),
      cell(entry.soa || '—'),
      rightCell(String(entry.count)),
      rightCell(currency(entry.amount)),
    ]), ['*', 40, 35, 70]),
  ];
};

const offerComparisonContent = (project: Project): any[] => {
  const { stats, excluded, baseTotal } = offerStats(project);
  const settings = project.offerComparisonSettings;
  const criterion = settings?.criterion === 'time' ? 'Minor tempo' : settings?.criterion === 'weighted' ? 'Punteggio ponderato' : 'Minor prezzo';
  const content: any[] = [
    { text: 'Confronto Offerte', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    {
      text: `Importo base: ${currency(baseTotal)} · Criterio: ${criterion} · Offerte ammesse: ${stats.length}${excluded > 0 ? ` · Escluse incomplete: ${excluded}` : ''}`,
      fontSize: 8,
      color: '#475569',
      margin: [0, 0, 0, 6],
    },
    makeTable(['Pos.', 'Ditta', 'P.IVA', 'Data', 'Totale', 'Δ base', 'Copertura', 'Tempi'], stats.map((entry, index) => [
      cell(String(index + 1), index === 0 ? { bold: true, fillColor: '#ecfdf5' } : {}),
      cell(entry.offer.companyName, index === 0 ? { bold: true, fillColor: '#ecfdf5' } : {}),
      cell(entry.offer.vatNumber || '—'),
      cell(dateLabel(entry.offer.date)),
      rightCell(currency(entry.total)),
      rightCell(`${entry.delta >= 0 ? '+' : ''}${entry.delta.toFixed(1)}%`),
      rightCell(`${entry.coverage.toFixed(0)}%`),
      rightCell(entry.days ? String(entry.days) : '—'),
    ]), [28, '*', 55, 55, 60, 45, 45, 35]),
  ];
  content.push({ text: 'Dettaglio per voce', bold: true, fontSize: 10, margin: [0, 8, 0, 2] });
  const itemRows = flattenItems(project.rootWBS).map(({ item }) => [
    cell(item.code),
    cell(item.description),
    rightCell(number(item.qty, 2)),
    rightCell(currency(item.price)),
    ...stats.map(entry => rightCell(entry.offer.items[item.id]?.price !== undefined ? currency(entry.offer.items[item.id]!.price) : '—')),
  ]);
  content.push(makeTable(['Codice', 'Descrizione', 'Q.tà', 'Base', ...stats.map(entry => entry.offer.companyName)], itemRows));
  return content;
};

const verbaleContent = (project: Project): any[] => {
  const { stats, excluded, baseTotal } = offerStats(project);
  const content: any[] = [
    { text: 'Verbale di Comparazione delle Offerte', bold: true, fontSize: 12, margin: [0, 0, 0, 6] },
    { text: `Il giorno ${todayLabel()}, in relazione al progetto "${project.name}", si è proceduto alla comparazione delle offerte pervenute per l’importo base di ${currency(baseTotal)}.${excluded > 0 ? ` Sono state escluse ${excluded} offerte incomplete.` : ''}`, fontSize: 8.5, lineHeight: 1.4, margin: [0, 0, 0, 8] },
    makeTable(['N.', 'Ditta', 'Data', 'Importo', 'Scostamento', 'Esito'], stats.map((entry, index) => [
      cell(String(index + 1)),
      cell(entry.offer.companyName),
      cell(dateLabel(entry.offer.date)),
      rightCell(currency(entry.total)),
      rightCell(`${entry.delta >= 0 ? '+' : ''}${entry.delta.toFixed(1)}%`),
      cell(index === 0 ? 'Migliore offerta' : 'Ammessa'),
    ]), [25, '*', 55, 70, 60, 80]),
    { text: 'Conclusioni', bold: true, fontSize: 10, margin: [0, 8, 0, 3] },
    { text: `Alla luce dei risultati, l’offerta economicamente più vantaggiosa risulta quella della ditta ${stats[0]?.offer.companyName || '—'}, per un importo di ${stats[0] ? currency(stats[0].total) : '—'}.`, fontSize: 8.5, lineHeight: 1.4 },
    { text: '', margin: [0, 40, 0, 0] },
    { columns: [{ width: '*', text: 'Il Presidente della Commissione\n\n____________________________', alignment: 'center', fontSize: 8 }, { width: '*', text: 'Il Segretario verbalizzante\n\n____________________________', alignment: 'center', fontSize: 8 }] },
  ];
  return content;
};

const scheduleContent = (project: Project): any[] => {
  const activities = project.schedule?.activities || [];
  if (activities.length === 0) return [{ text: 'Nessuna attività pianificata nel cronoprogramma.', italics: true, color: '#64748b' }];
  const day = 86400000;
  const start = Math.min(...activities.map(activity => activity.start));
  const end = Math.max(...activities.map(activity => activity.start + Math.max(1, activity.durationDays) * day));
  const predecessorName = (id?: string) => activities.find(activity => activity.id === id)?.name || '—';
  const sorted = [...activities].sort((a, b) => a.start - b.start);

  const bucketCount = Math.min(24, Math.max(1, Math.ceil((end - start) / (7 * day))));
  const bucketSpan = Math.max(day, (end - start) / bucketCount);
  const ganttHeaders = ['Attività', ...Array.from({ length: bucketCount }, (_, index) =>
    new Date(start + index * bucketSpan).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
  )];
  const ganttRows = sorted.map(activity => {
    const activityEnd = activity.start + Math.max(1, activity.durationDays) * day;
    return [
      cell(activity.name, { fontSize: 6.5 }),
      ...Array.from({ length: bucketCount }, (_, index) => {
        const bucketStart = start + index * bucketSpan;
        const bucketEnd = bucketStart + bucketSpan;
        const active = activity.start < bucketEnd && activityEnd > bucketStart;
        return { text: '', fontSize: 6, fillColor: active ? '#10b981' : '#f8fafc' };
      }),
    ];
  });

  return [
    { text: 'Cronoprogramma Lavori', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    { text: `${activities.length} attività · dal ${dateLabel(start)} al ${dateLabel(end)}`, fontSize: 8, color: '#475569', margin: [0, 0, 0, 6] },
    makeTable(['Attività', 'Inizio', 'Durata', 'Fine', 'Predecessore', 'Peso'], sorted.map(activity => [
      cell(activity.name),
      cell(dateLabel(activity.start)),
      rightCell(`${activity.durationDays} gg`),
      cell(dateLabel(activity.start + Math.max(1, activity.durationDays) * day)),
      cell(predecessorName(activity.predecessorId)),
      rightCell(number(activity.weight, 2)),
    ]), ['*', 55, 40, 55, 80, 40]),
    { text: 'Diagramma di Gantt', bold: true, fontSize: 10, margin: [0, 8, 0, 2] },
    makeTable(ganttHeaders, ganttRows, [90, ...Array.from({ length: bucketCount }, () => '*')]),
    { text: 'Le celle verdi indicano i periodi di svolgimento delle attività.', fontSize: 7, color: '#64748b' },
  ];
};

const priceAnalysisContent = (project: Project): any[] => {
  const entries = flattenItems(project.rootWBS);
  const analyzed = entries.filter(({ item }) => item.priceAnalysis && item.priceAnalysis.rows.length > 0);
  const content: any[] = [
    { text: 'Analisi Prezzi (EPU)', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    { text: `Voci totali: ${entries.length} · Analizzate: ${analyzed.length} · Da analizzare: ${entries.length - analyzed.length}`, fontSize: 8, color: '#475569', margin: [0, 0, 0, 6] },
    makeTable(['Codice', 'Descrizione', 'Costo diretto', 'Spese', 'Utile', 'Prezzo EPU', 'Prezzo computo', 'Δ'], analyzed.map(({ item }) => {
      const totals = analysisTotals(item);
      const delta = item.price > 0 ? ((totals.epu - item.price) / item.price) * 100 : 0;
      return [
        cell(item.code), cell(item.description), rightCell(currency(totals.direct)), rightCell(currency(totals.overheads)),
        rightCell(currency(totals.profit)), rightCell(currency(totals.epu)), rightCell(currency(item.price)),
        rightCell(`${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`),
      ];
    }), [42, '*', 55, 45, 45, 55, 55, 35]),
  ];
  analyzed.forEach(({ item }) => {
    content.push({ text: `${item.code} — ${item.description}`, bold: true, fontSize: 8.5, margin: [0, 8, 0, 3] });
    content.push(makeTable(['Tipo', 'Descrizione', 'U.M.', 'Q.tà', 'Prezzo', 'Importo'], item.priceAnalysis!.rows.map(row => [
      cell(row.type), cell(row.description || '—'), cell(row.uom || '—'),
      rightCell(number(row.quantity, 2)), rightCell(currency(row.unitPrice || 0)),
      rightCell(currency((row.quantity || 0) * (row.unitPrice || 0))),
    ]), [45, '*', 30, 35, 45, 55]));
  });
  return content;
};

const suppliersContent = (project: Project): any[] => {
  const suppliers = project.suppliers || [];
  return [
    { text: 'Fornitori e Subappaltatori', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    makeTable(['Azienda', 'Tipo', 'P.IVA', 'SOA', 'DURC', 'Polizza', 'Contratto'], suppliers.map(supplier => [
      cell(supplier.companyName), cell(supplier.type), cell(supplier.vatNumber || '—'), cell(supplier.soa || '—'),
      cell(dateLabel(supplier.durcExpiry)), cell(dateLabel(supplier.policyExpiry)),
      rightCell(supplier.contractAmount !== undefined ? currency(supplier.contractAmount) : '—'),
    ]), ['*', 45, 55, 35, 55, 55, 65]),
    { text: `Totale contratti: ${currency(suppliers.reduce((sum, supplier) => sum + (supplier.contractAmount || 0), 0))}`, bold: true, fontSize: 8.5, margin: [0, 4, 0, 0] },
  ];
};

const deadlinesContent = (project: Project): any[] => {
  const events = projectDeadlines(project);
  return [
    { text: 'Scadenze del Progetto', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    makeTable(['Data', 'Evento', 'Tipo', 'Descrizione'], events.map(event => [
      cell(dateLabel(event.date)), cell(event.title), cell(event.source), cell(event.description || '—'),
    ]), [55, '*', 65, '*']),
  ];
};

const variantsContent = (project: Project): any[] => {
  const variants = project.variants || [];
  return [
    { text: 'Varianti e Perizie', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    makeTable(['Codice', 'Oggetto', 'Tipo', 'Stato', 'Data', 'Importo'], variants.map(variant => [
      cell(variant.code), cell(variant.name), cell(variant.type), cell(variant.status),
      cell(dateLabel(variant.date)), rightCell(currency(variant.amount || 0)),
    ]), [50, '*', 55, 55, 55, 65]),
    { text: `Totale: ${currency(variants.reduce((sum, variant) => sum + (variant.amount || 0), 0))}`, bold: true, fontSize: 8.5, margin: [0, 4, 0, 0] },
  ];
};

const signaturesContent = (project: Project): any[] => {
  const signatures = project.signatures || [];
  return [
    { text: 'Registro Firme', bold: true, fontSize: 12, margin: [0, 0, 0, 4] },
    makeTable(['Documento', 'Firmatario', 'Data', 'Impronta SHA-256'], signatures.map(record => [
      cell(record.documentLabel), cell(`${record.signerName}${record.signerRole ? ` — ${record.signerRole}` : ''}`),
      cell(dateLabel(record.signedAt)), cell(record.hash, { fontSize: 6.5 }),
    ]), ['*', 100, 55, 140]),
    { text: 'Le firme riportate sono firme elettroniche semplici con impronta SHA-256, non firme digitali qualificate PAdES/CAdES.', fontSize: 7, color: '#64748b', margin: [0, 6, 0, 0] },
  ];
};

const buildContent = (options: VectorPdfOptions): any[] => {
  switch (options.document) {
    case 'computo':
    case 'sal':
    case 'rfq':
      return computoContent(options);
    case 'priceList':
      return priceListContent(options.project);
    case 'capitolato':
      return capitolatoContent(options.project);
    case 'quadroEconomico':
      return quadroEconomicoContent(options.project);
    case 'offerComparison':
      return offerComparisonContent(options.project);
    case 'verbale':
      return verbaleContent(options.project);
    case 'schedule':
      return scheduleContent(options.project);
    case 'priceAnalysis':
      return priceAnalysisContent(options.project);
    case 'suppliers':
      return suppliersContent(options.project);
    case 'deadlines':
      return deadlinesContent(options.project);
    case 'variants':
      return variantsContent(options.project);
    case 'signatures':
      return signaturesContent(options.project);
    default:
      return [];
  }
};

const loadPdfMake = async (): Promise<any> => {
  if (window.pdfMake) return window.pdfMake;

  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-pdfmake-src="${src}"]`);
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-pdfmake-src', src);
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    };
    script.onerror = () => reject(new Error('Impossibile caricare il motore PDF.'));
    document.body.appendChild(script);
  });

  await loadScript(pdfMakeUrl);
  await loadScript(pdfFontsUrl);

  if (!window.pdfMake) {
    throw new Error('Motore PDF non disponibile.');
  }
  return window.pdfMake;
};

export interface VectorPdfSaveResult {
  status: 'saved' | 'downloaded' | 'cancelled';
  url?: string;
  /** Motivo del fallback al download, mostrato all'utente. */
  reason?: string;
}

let pdfLibPromise: Promise<typeof import('pdf-lib')> | null = null;
const loadPdfLib = () => (pdfLibPromise ??= import('pdf-lib'));

const normalizePdfBlob = async (blob: Blob): Promise<Blob> => {
  const { PDFDocument } = await loadPdfLib();
  const bytes = await blob.arrayBuffer();
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const normalized = await document.save({ useObjectStreams: false });
  return new Blob([normalized], { type: 'application/pdf' });
};

const verifyPdfBytes = async (bytes: ArrayBuffer): Promise<boolean> => {
  try {
    const { PDFDocument } = await loadPdfLib();
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    return document.getPageCount() > 0;
  } catch {
    return false;
  }
};

const downloadBlob = (blob: Blob, fileName: string): string => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 300000);
  return url;
};

const savePdfBlob = async (blob: Blob, fileName: string): Promise<VectorPdfSaveResult> => {
  const picker = (window as any).showSaveFilePicker;
  let fallbackReason: string | undefined;

  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: fileName,
        types: [
          {
            description: 'Documento PDF',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      // Scriviamo esplicitamente i byte del PDF (non il Blob): alcune
      // implementazioni del picker in Electron non gestiscono il Blob.
      const buffer = await blob.arrayBuffer();
      await writable.write(buffer);
      await writable.close();

      // Verifica completa del file scritto: stessa dimensione, stessa impronta
      // SHA-256 e struttura PDF valida (xref, trailer e pagine).
      if (typeof handle.getFile === 'function') {
        const savedFile = await handle.getFile();
        const savedBytes = await savedFile.arrayBuffer();

        if (savedBytes.byteLength === 0) {
          // La finestra di sistema ha creato un file vuoto: lo rimuoviamo per
          // non lasciare sul disco un PDF che Acrobat segnala come danneggiato.
          try {
            await handle.remove?.();
          } catch {
            /* rimozione non supportata: ignoriamo */
          }
          throw new Error('Il file salvato è vuoto.');
        }

        if (savedBytes.byteLength !== buffer.byteLength) {
          throw new Error('Il file salvato ha una dimensione diversa dal PDF generato.');
        }

        if (typeof crypto !== 'undefined' && crypto.subtle) {
          const [originalHash, savedHash] = await Promise.all([
            crypto.subtle.digest('SHA-256', buffer),
            crypto.subtle.digest('SHA-256', savedBytes),
          ]);
          const original = new Uint8Array(originalHash);
          const saved = new Uint8Array(savedHash);
          const identical = original.length === saved.length && original.every((value, index) => value === saved[index]);
          if (!identical) {
            throw new Error('Il file salvato è diverso dal PDF generato.');
          }
        }

        if (!(await verifyPdfBytes(savedBytes))) {
          throw new Error('Il file salvato non è un PDF valido.');
        }
      }

      return { status: 'saved' };
    } catch (error: any) {
      if (error?.name === 'AbortError') return { status: 'cancelled' };
      fallbackReason = error instanceof Error ? error.message : 'Salvataggio non riuscito.';
      console.warn('Salvataggio con finestra di sistema non riuscito, uso il download.', error);
    }
  }

  const url = downloadBlob(blob, fileName);
  return { status: 'downloaded', url, reason: fallbackReason };
};

export interface GeneratedVectorPdf {
  blob: Blob;
  fileName: string;
}

export async function createVectorPdfBlob(options: VectorPdfOptions): Promise<GeneratedVectorPdf> {
  const pdfMake = await loadPdfMake();
  const { project } = options;

  const footerText = options.showFooter === false ? '' : (options.footerText || todayLabel());
  const footerColor = options.footerColor || '#9ca3af';
  const footerSize = options.footerSize ? pxToPt(options.footerSize) : 7.5;
  const pageNumberColor = options.pageNumberColor || '#475569';
  const pageNumberSize = options.pageNumberSize ? pxToPt(options.pageNumberSize) : 6.75;
  const styles = resolveStyles(options);
  await ensureBrandBadge();

  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [mm(15), mm(16), mm(15), mm(18)],
    ...(brandBadgeDataUrl ? { images: { brandBadge: brandBadgeDataUrl } } : {}),
    defaultStyle: {
      font: 'Roboto',
      fontSize: pxToPt(styles.sizes.body),
      color: styles.colors.itemText,
      lineHeight: 1.15,
    },
    info: {
      title: `${project.name} — ${documentLabel(options.document)}`,
      author: 'Stimia',
      subject: project.description || '',
    },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [mm(15), 0, mm(15), mm(7)],
      columns: [
        { text: footerText, fontSize: footerSize, color: footerColor, alignment: 'left' },
        { text: `Pag. ${currentPage} / ${pageCount}`, fontSize: pageNumberSize, color: pageNumberColor, alignment: 'right' },
      ],
    }),
    content: [headerContent(options), ...buildContent(options)],
  };

  const fileName = `${project.name.replace(/[^\w.-]+/g, '_') || 'documento'}_${options.document}.pdf`;

  // pdfmake 0.3: getBlob() è asincrono e restituisce direttamente il Blob.
  const blob: Blob = await pdfMake.createPdf(docDefinition).getBlob();

  // Riscrittura con pdf-lib: produce un PDF 1.7 standard, più compatibile
  // con Acrobat e con i visualizzatori dei sistemi operativi.
  let outputBlob = blob;
  try {
    outputBlob = await normalizePdfBlob(blob);
  } catch (error) {
    console.warn('Normalizzazione PDF non riuscita, uso il PDF originale.', error);
  }

  return { blob: outputBlob, fileName };
}

export async function downloadVectorPdf(options: VectorPdfOptions): Promise<VectorPdfSaveResult> {
  const { blob, fileName } = await createVectorPdfBlob(options);
  return savePdfBlob(blob, fileName);
}
