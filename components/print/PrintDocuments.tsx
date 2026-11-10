import React from 'react';
import { CostItem, Project, QuadroEconomicoSettings, WBSNode } from '../../types';
import { projectDeadlines } from '../../services/calendar';

export type PrintDocumentType =
  | 'computo'
  | 'rfq'
  | 'sal'
  | 'priceList'
  | 'capitolato'
  | 'quadroEconomico'
  | 'offerComparison'
  | 'verbale'
  | 'schedule'
  | 'priceAnalysis'
  | 'suppliers'
  | 'deadlines'
  | 'variants'
  | 'signatures';

export const PRINT_DOCUMENT_GROUPS: { label: string; options: { id: PrintDocumentType; label: string }[] }[] = [
  {
    label: 'Computo',
    options: [
      { id: 'computo', label: 'Computo standard' },
      { id: 'rfq', label: 'Richiesta preventivo ditte (in bianco)' },
      { id: 'sal', label: 'Contabilità — SAL' },
    ],
  },
  {
    label: 'Documenti',
    options: [
      { id: 'priceList', label: 'Elenco prezzi unitari' },
      { id: 'capitolato', label: 'Capitolato speciale d’appalto' },
      { id: 'quadroEconomico', label: 'Quadro Economico' },
    ],
  },
  {
    label: 'Ditte',
    options: [
      { id: 'offerComparison', label: 'Confronto offerte' },
      { id: 'verbale', label: 'Verbale di comparazione' },
    ],
  },
  {
    label: 'Programmazione',
    options: [{ id: 'schedule', label: 'Cronoprogramma e Gantt' }],
  },
  {
    label: 'Analisi',
    options: [{ id: 'priceAnalysis', label: 'Analisi prezzi (EPU)' }],
  },
  {
    label: 'Gestione',
    options: [
      { id: 'suppliers', label: 'Fornitori e subappalti' },
      { id: 'deadlines', label: 'Scadenze progetto' },
      { id: 'variants', label: 'Varianti e perizie' },
      { id: 'signatures', label: 'Registro firme' },
    ],
  },
];

export const PRINT_DOCUMENT_LABELS: Record<PrintDocumentType, string> = PRINT_DOCUMENT_GROUPS
  .flatMap(group => group.options)
  .reduce((acc, option) => {
    acc[option.id] = option.label;
    return acc;
  }, {} as Record<PrintDocumentType, string>);

export const isStandardPrintDocument = (document: PrintDocumentType): boolean =>
  document === 'computo' || document === 'rfq' || document === 'sal';

interface Props {
  document: PrintDocumentType;
  project: Project;
  bodyFont?: string;
}

type FlatEntry = { categoryCode: string; categoryName: string; item: CostItem };

const currency = (value: number) =>
  `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateLabel = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('it-IT') : '—');

const flattenItems = (root: WBSNode): FlatEntry[] => {
  const entries: FlatEntry[] = [];
  const walk = (node: WBSNode) => {
    const code = node.level === 0 ? '' : node.code;
    const name = node.level === 0 ? '' : node.name;
    node.items.forEach(item => entries.push({ categoryCode: code, categoryName: name, item }));
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

const DEFAULT_QE: QuadroEconomicoSettings = {
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

const computeQe = (project: Project) => {
  const settings = project.quadroEconomico || DEFAULT_QE;
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

  const categoryBreakdown = project.rootWBS.children.map(node => {
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
    categoryBreakdown,
  };
};

const computeAnalysisTotals = (item: CostItem) => {
  const analysis = item.priceAnalysis;
  if (!analysis) return { direct: 0, overheads: 0, profit: 0, epu: 0 };
  const direct = analysis.rows.reduce((sum, row) => sum + (row.quantity || 0) * (row.unitPrice || 0), 0);
  const overheads = direct * (analysis.overheadsPercent || 0) / 100;
  const profit = (direct + overheads) * (analysis.profitPercent || 0) / 100;
  return { direct, overheads, profit, epu: direct + overheads + profit };
};

const offerTotals = (project: Project) => {
  const items = collectItems(project.rootWBS);
  const baseTotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  return (project.offers || []).map(offer => {
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
};

const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <table className={`w-full border-collapse text-[10px] ${className}`}>{children}</table>
);
const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <th className={`border border-slate-400 bg-slate-100 px-1.5 py-1 text-left font-bold ${className}`}>{children}</th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string; colSpan?: number }> = ({ children, className = '', colSpan }) => (
  <td colSpan={colSpan} className={`border border-slate-300 px-1.5 py-1 align-top ${className}`}>{children}</td>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="mb-2 mt-4 border-b border-slate-400 pb-1 text-[13px] font-bold uppercase tracking-wide first:mt-0">{children}</h2>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-2 rounded border border-slate-300 bg-slate-50 p-2 text-[9px] leading-relaxed text-slate-600">{children}</p>
);

const PriceListDocument: React.FC<{ project: Project }> = ({ project }) => {
  const entries = flattenItems(project.rootWBS);
  let lastCategory = '';
  return (
    <div>
      <SectionTitle>Elenco prezzi unitari</SectionTitle>
      <p className="mb-2 text-[10px] text-slate-600">{entries.length} voci · Prezzi unitari del computo</p>
      <Table>
        <thead>
          <tr><Th>Codice</Th><Th>Descrizione</Th><Th>U.M.</Th><Th className="text-right">Prezzo unitario</Th></tr>
        </thead>
        <tbody>
          {entries.map(({ categoryCode, categoryName, item }) => {
            const label = `${categoryCode}${categoryCode ? ' — ' : ''}${categoryName}`;
            const showCategory = label !== lastCategory;
            lastCategory = label;
            return (
              <React.Fragment key={item.id}>
                {showCategory && <tr><Td colSpan={4} className="bg-slate-100 font-bold">{label}</Td></tr>}
                <tr><Td>{item.code}</Td><Td>{item.description}</Td><Td>{item.uom}</Td><Td className="text-right">{currency(item.price)}</Td></tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
};

const CapitolatoDocument: React.FC<{ project: Project }> = ({ project }) => {
  const groups = new Map<string, { code: string; name: string; items: CostItem[] }>();
  flattenItems(project.rootWBS).forEach(({ categoryCode, categoryName, item }) => {
    const key = `${categoryCode}|${categoryName}`;
    if (!groups.has(key)) groups.set(key, { code: categoryCode, name: categoryName, items: [] });
    groups.get(key)!.items.push(item);
  });

  let article = 0;
  return (
    <div>
      <SectionTitle>Capitolato speciale d’appalto</SectionTitle>
      <Note>
        Il presente capitolato disciplina le modalità di esecuzione delle lavorazioni del computo metrico estimativo.
        I prezzi unitari si intendono comprensivi di materiali, manodopera, noli, attrezzature, spese generali e utile d’impresa,
        salvo diversa specificazione.
      </Note>
      {Array.from(groups.values()).map(group => {
        article += 1;
        return (
          <section key={`${group.code}-${group.name}`} className="mt-4 break-inside-avoid">
            <h3 className="mb-1 text-[11px] font-bold">Art. {article} — {group.code} {group.name}</h3>
            <p className="mb-1 text-[9px] text-slate-600">
              Le lavorazioni elencate dovranno essere eseguite secondo le regole dell’arte, nel rispetto delle normative vigenti.
            </p>
            {group.items.map(item => (
              <div key={item.id} className="mb-1.5 border-l-2 border-slate-300 pl-2 text-[9px] break-inside-avoid">
                <div className="font-bold">{item.code} — {item.description}</div>
                <div className="text-slate-600">U.M. {item.uom} · Prezzo unitario {currency(item.price)} · Quantità {item.qty.toLocaleString('it-IT')}</div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
};

const QuadroEconomicoDocument: React.FC<{ project: Project }> = ({ project }) => {
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
  ] as const;

  return (
    <div>
      <SectionTitle>Quadro Economico</SectionTitle>
      <Table>
        <thead><tr><Th>Voce</Th><Th className="text-right">Importo</Th></tr></thead>
        <tbody>
          {rows.map(([label, value], index) => (
            <tr key={label} className={index === 5 || index === 7 ? 'bg-slate-100 font-bold' : ''}>
              <Td>{label}</Td><Td className="text-right">{currency(value)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <SectionTitle>Riepilogo gara</SectionTitle>
      <Table>
        <tbody>
          <tr><Td>Base gara (lavori + sicurezza)</Td><Td className="text-right">{currency(qe.baseGara)}</Td></tr>
          <tr><Td>Ribasso applicato ({qe.settings.ribassoPercent}%)</Td><Td className="text-right">{currency(qe.ribassoImporto)}</Td></tr>
          <tr className="font-bold"><Td>Importo netto</Td><Td className="text-right">{currency(qe.importoNetto)}</Td></tr>
          <tr><Td>Soglia di anomalia ({qe.settings.sogliaAnomaliaPercent}%)</Td><Td className="text-right">{currency(qe.sogliaAnomalia)}</Td></tr>
        </tbody>
      </Table>

      <SectionTitle>Categorie e SOA</SectionTitle>
      <Table>
        <thead><tr><Th>Categoria</Th><Th>SOA</Th><Th className="text-right">Voci</Th><Th className="text-right">Importo</Th></tr></thead>
        <tbody>
          {qe.categoryBreakdown.map(entry => (
            <tr key={entry.node.id}>
              <Td>{entry.node.code} — {entry.node.name}</Td>
              <Td>{entry.soa || '—'}</Td>
              <Td className="text-right">{entry.count}</Td>
              <Td className="text-right">{currency(entry.amount)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {qe.settings.notes && <Note>{qe.settings.notes}</Note>}
    </div>
  );
};

const offerStatsForPrint = (project: Project) => {
  const all = offerTotals(project);
  const requireComplete = project.offerComparisonSettings?.requireComplete;
  const stats = requireComplete ? all.filter(entry => entry.coverage >= 99.9) : all;
  return { stats, excluded: all.length - stats.length };
};

const OfferComparisonDocument: React.FC<{ project: Project }> = ({ project }) => {
  const { stats, excluded } = offerStatsForPrint(project);
  const baseTotal = collectItems(project.rootWBS).reduce((sum, item) => sum + (item.amount || 0), 0);
  const settings = project.offerComparisonSettings;
  const criterion = settings?.criterion === 'time' ? 'Minor tempo' : settings?.criterion === 'weighted' ? 'Punteggio ponderato' : 'Minor prezzo';
  const best = stats[0];

  return (
    <div>
      <SectionTitle>Confronto offerte</SectionTitle>
      <p className="mb-2 text-[10px] text-slate-600">
        Importo base: <b>{currency(baseTotal)}</b> · Criterio: <b>{criterion}</b> · Offerte ammesse: <b>{stats.length}</b>
        {excluded > 0 ? ` · Escluse incomplete: ${excluded}` : ''}
      </p>
      <Table>
        <thead>
          <tr><Th>Pos.</Th><Th>Ditta</Th><Th>P.IVA</Th><Th>Data</Th><Th className="text-right">Totale</Th><Th className="text-right">Δ base</Th><Th className="text-right">Copertura</Th><Th className="text-right">Tempi</Th></tr>
        </thead>
        <tbody>
          {stats.map((entry, index) => (
            <tr key={entry.offer.id} className={index === 0 ? 'bg-emerald-50 font-bold' : ''}>
              <Td>{index + 1}</Td>
              <Td>{entry.offer.companyName}</Td>
              <Td>{entry.offer.vatNumber || '—'}</Td>
              <Td>{dateLabel(entry.offer.date)}</Td>
              <Td className="text-right">{currency(entry.total)}</Td>
              <Td className="text-right">{entry.delta >= 0 ? '+' : ''}{entry.delta.toFixed(1)}%</Td>
              <Td className="text-right">{entry.coverage.toFixed(0)}%</Td>
              <Td className="text-right">{entry.days || '—'}</Td>
            </tr>
          ))}
          {stats.length === 0 && <tr><Td colSpan={8} className="text-center text-slate-500">Nessuna offerta acquisita.</Td></tr>}
        </tbody>
      </Table>

      {best && (
        <Note>
          Migliore offerta: <b>{best.offer.companyName}</b> — {currency(best.total)}
          {best.delta !== 0 ? ` (${best.delta > 0 ? '+' : ''}${best.delta.toFixed(1)}% rispetto alla base)` : ''}.
          {settings?.requireComplete ? ' Sono considerate solo le offerte complete.' : ''}
        </Note>
      )}

      <SectionTitle>Dettaglio per voce</SectionTitle>
      <Table>
        <thead>
          <tr>
            <Th>Codice</Th><Th>Descrizione</Th><Th className="text-right">Q.tà</Th><Th className="text-right">Base</Th>
            {stats.map(entry => <Th key={entry.offer.id} className="text-right">{entry.offer.companyName}</Th>)}
          </tr>
        </thead>
        <tbody>
          {flattenItems(project.rootWBS).map(({ item }) => (
            <tr key={item.id}>
              <Td>{item.code}</Td><Td>{item.description}</Td><Td className="text-right">{item.qty.toLocaleString('it-IT')}</Td>
              <Td className="text-right">{currency(item.price)}</Td>
              {stats.map(entry => <Td key={entry.offer.id} className="text-right">{entry.offer.items[item.id]?.price !== undefined ? currency(entry.offer.items[item.id]!.price) : '—'}</Td>)}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

const VerbaleDocument: React.FC<{ project: Project }> = ({ project }) => {
  const { stats, excluded } = offerStatsForPrint(project);
  const baseTotal = collectItems(project.rootWBS).reduce((sum, item) => sum + (item.amount || 0), 0);
  return (
    <div>
      <SectionTitle>Verbale di comparazione delle offerte</SectionTitle>
      <p className="text-[10px] leading-relaxed">
        Il giorno {dateLabel(Date.now())}, in relazione al progetto <b>{project.name}</b>, si è proceduto alla comparazione
        delle offerte pervenute per l’importo base di <b>{currency(baseTotal)}</b>.
        {excluded > 0 ? ` Sono state escluse ${excluded} offerte incomplete.` : ''}
      </p>

      <SectionTitle>Offerte pervenute</SectionTitle>
      <Table>
        <thead><tr><Th>N.</Th><Th>Ditta</Th><Th>Data</Th><Th className="text-right">Importo</Th><Th className="text-right">Scostamento</Th><Th>Esito</Th></tr></thead>
        <tbody>
          {stats.map((entry, index) => (
            <tr key={entry.offer.id}>
              <Td>{index + 1}</Td><Td>{entry.offer.companyName}</Td><Td>{dateLabel(entry.offer.date)}</Td>
              <Td className="text-right">{currency(entry.total)}</Td>
              <Td className="text-right">{entry.delta >= 0 ? '+' : ''}{entry.delta.toFixed(1)}%</Td>
              <Td>{index === 0 ? 'Migliore offerta' : 'Ammessa'}</Td>
            </tr>
          ))}
          {stats.length === 0 && <tr><Td colSpan={6} className="text-center text-slate-500">Nessuna offerta acquisita.</Td></tr>}
        </tbody>
      </Table>

      <SectionTitle>Conclusioni</SectionTitle>
      <p className="text-[10px] leading-relaxed">
        Alla luce dei risultati, l’offerta economicamente più vantaggiosa risulta quella della ditta
        <b> {stats[0]?.offer.companyName || '—'}</b>, per un importo di <b>{stats[0] ? currency(stats[0].total) : '—'}</b>.
      </p>

      <div className="mt-12 grid grid-cols-2 gap-8 text-center text-[10px]">
        <div className="border-t border-slate-500 pt-2">Il Presidente della Commissione</div>
        <div className="border-t border-slate-500 pt-2">Il Segretario verbalizzante</div>
      </div>
    </div>
  );
};

const ScheduleDocument: React.FC<{ project: Project }> = ({ project }) => {
  const activities = project.schedule?.activities || [];
  if (activities.length === 0) return <Note>Nessuna attività pianificata nel cronoprogramma.</Note>;

  const day = 86400000;
  const start = Math.min(...activities.map(activity => activity.start));
  const end = Math.max(...activities.map(activity => activity.start + Math.max(1, activity.durationDays) * day));
  const span = Math.max(day, end - start);
  const predecessorName = (id?: string) => activities.find(activity => activity.id === id)?.name || '—';

  return (
    <div>
      <SectionTitle>Cronoprogramma lavori</SectionTitle>
      <p className="mb-2 text-[10px] text-slate-600">
        {activities.length} attività · dal {dateLabel(start)} al {dateLabel(end)}
      </p>

      <Table>
        <thead><tr><Th>Attività</Th><Th>Inizio</Th><Th className="text-right">Durata</Th><Th>Fine</Th><Th>Predecessore</Th><Th className="text-right">Peso</Th></tr></thead>
        <tbody>
          {[...activities].sort((a, b) => a.start - b.start).map(activity => (
            <tr key={activity.id}>
              <Td>{activity.name}</Td>
              <Td>{dateLabel(activity.start)}</Td>
              <Td className="text-right">{activity.durationDays} gg</Td>
              <Td>{dateLabel(activity.start + Math.max(1, activity.durationDays) * day)}</Td>
              <Td>{predecessorName(activity.predecessorId)}</Td>
              <Td className="text-right">{activity.weight.toLocaleString('it-IT', { maximumFractionDigits: 2 })}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <SectionTitle>Diagramma di Gantt</SectionTitle>
      <div className="space-y-1">
        {[...activities].sort((a, b) => a.start - b.start).map(activity => {
          const left = ((activity.start - start) / span) * 100;
          const width = Math.max(1.5, (Math.max(1, activity.durationDays) * day / span) * 100);
          return (
            <div key={activity.id} className="flex items-center gap-2 text-[9px]">
              <div className="w-44 shrink-0 truncate font-semibold">{activity.name}</div>
              <div className="relative h-4 flex-1 rounded bg-slate-100">
                <div className="absolute top-0 h-4 rounded bg-emerald-500" style={{ left: `${left}%`, width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PriceAnalysisDocument: React.FC<{ project: Project }> = ({ project }) => {
  const entries = flattenItems(project.rootWBS);
  const analyzed = entries.filter(({ item }) => item.priceAnalysis && item.priceAnalysis.rows.length > 0);

  return (
    <div>
      <SectionTitle>Analisi prezzi (EPU)</SectionTitle>
      <p className="mb-2 text-[10px] text-slate-600">
        Voci totali: {entries.length} · Analizzate: {analyzed.length} · Da analizzare: {entries.length - analyzed.length}
      </p>

      <Table>
        <thead><tr><Th>Codice</Th><Th>Descrizione</Th><Th className="text-right">Costo diretto</Th><Th className="text-right">Spese</Th><Th className="text-right">Utile</Th><Th className="text-right">Prezzo EPU</Th><Th className="text-right">Prezzo computo</Th><Th className="text-right">Δ</Th></tr></thead>
        <tbody>
          {analyzed.map(({ item }) => {
            const totals = computeAnalysisTotals(item);
            const delta = item.price > 0 ? ((totals.epu - item.price) / item.price) * 100 : 0;
            return (
              <tr key={item.id}>
                <Td>{item.code}</Td><Td>{item.description}</Td>
                <Td className="text-right">{currency(totals.direct)}</Td>
                <Td className="text-right">{currency(totals.overheads)}</Td>
                <Td className="text-right">{currency(totals.profit)}</Td>
                <Td className="text-right">{currency(totals.epu)}</Td>
                <Td className="text-right">{currency(item.price)}</Td>
                <Td className="text-right">{delta >= 0 ? '+' : ''}{delta.toFixed(1)}%</Td>
              </tr>
            );
          })}
          {analyzed.length === 0 && <tr><Td colSpan={8} className="text-center text-slate-500">Nessuna analisi prezzi disponibile.</Td></tr>}
        </tbody>
      </Table>

      {analyzed.map(({ item }) => (
        <section key={`detail-${item.id}`} className="mt-4 break-inside-avoid">
          <h3 className="mb-1 text-[10px] font-bold">{item.code} — {item.description}</h3>
          <Table>
            <thead><tr><Th>Tipo</Th><Th>Descrizione</Th><Th>U.M.</Th><Th className="text-right">Q.tà</Th><Th className="text-right">Prezzo</Th><Th className="text-right">Importo</Th></tr></thead>
            <tbody>
              {item.priceAnalysis!.rows.map(row => (
                <tr key={row.id}>
                  <Td>{row.type}</Td><Td>{row.description || '—'}</Td><Td>{row.uom || '—'}</Td>
                  <Td className="text-right">{row.quantity.toLocaleString('it-IT')}</Td>
                  <Td className="text-right">{currency(row.unitPrice || 0)}</Td>
                  <Td className="text-right">{currency((row.quantity || 0) * (row.unitPrice || 0))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ))}
    </div>
  );
};

const SuppliersDocument: React.FC<{ project: Project }> = ({ project }) => {
  const suppliers = project.suppliers || [];
  return (
    <div>
      <SectionTitle>Fornitori e subappaltatori</SectionTitle>
      <Table>
        <thead><tr><Th>Azienda</Th><Th>Tipo</Th><Th>P.IVA</Th><Th>SOA</Th><Th>DURC</Th><Th>Polizza</Th><Th className="text-right">Contratto</Th></tr></thead>
        <tbody>
          {suppliers.map(supplier => (
            <tr key={supplier.id}>
              <Td>{supplier.companyName}</Td><Td>{supplier.type}</Td><Td>{supplier.vatNumber || '—'}</Td>
              <Td>{supplier.soa || '—'}</Td><Td>{dateLabel(supplier.durcExpiry)}</Td>
              <Td>{dateLabel(supplier.policyExpiry)}</Td>
              <Td className="text-right">{supplier.contractAmount !== undefined ? currency(supplier.contractAmount) : '—'}</Td>
            </tr>
          ))}
          {suppliers.length === 0 && <tr><Td colSpan={7} className="text-center text-slate-500">Nessun fornitore registrato.</Td></tr>}
        </tbody>
      </Table>
      <p className="mt-2 text-[10px] text-slate-600">
        Totale contratti: <b>{currency(suppliers.reduce((sum, supplier) => sum + (supplier.contractAmount || 0), 0))}</b>
      </p>
    </div>
  );
};

const DeadlinesDocument: React.FC<{ project: Project }> = ({ project }) => {
  const events = projectDeadlines(project);
  return (
    <div>
      <SectionTitle>Scadenze del progetto</SectionTitle>
      <Table>
        <thead><tr><Th>Data</Th><Th>Evento</Th><Th>Tipo</Th><Th>Descrizione</Th></tr></thead>
        <tbody>
          {events.map(event => (
            <tr key={event.id}>
              <Td>{dateLabel(event.date)}</Td><Td>{event.title}</Td><Td>{event.source}</Td><Td>{event.description || '—'}</Td>
            </tr>
          ))}
          {events.length === 0 && <tr><Td colSpan={4} className="text-center text-slate-500">Nessuna scadenza disponibile.</Td></tr>}
        </tbody>
      </Table>
    </div>
  );
};

const VariantsDocument: React.FC<{ project: Project }> = ({ project }) => {
  const variants = project.variants || [];
  return (
    <div>
      <SectionTitle>Varianti e perizie</SectionTitle>
      <Table>
        <thead><tr><Th>Codice</Th><Th>Oggetto</Th><Th>Tipo</Th><Th>Stato</Th><Th>Data</Th><Th className="text-right">Importo</Th></tr></thead>
        <tbody>
          {variants.map(variant => (
            <tr key={variant.id}>
              <Td>{variant.code}</Td><Td>{variant.name}</Td><Td>{variant.type}</Td><Td>{variant.status}</Td>
              <Td>{dateLabel(variant.date)}</Td><Td className="text-right">{currency(variant.amount || 0)}</Td>
            </tr>
          ))}
          {variants.length === 0 && <tr><Td colSpan={6} className="text-center text-slate-500">Nessuna variante o perizia registrata.</Td></tr>}
        </tbody>
      </Table>
      <p className="mt-2 text-[10px] text-slate-600">
        Totale: <b>{currency(variants.reduce((sum, variant) => sum + (variant.amount || 0), 0))}</b>
      </p>
    </div>
  );
};

const SignaturesDocument: React.FC<{ project: Project }> = ({ project }) => {
  const signatures = project.signatures || [];
  return (
    <div>
      <SectionTitle>Registro firme</SectionTitle>
      <Table>
        <thead><tr><Th>Documento</Th><Th>Firmatario</Th><Th>Data</Th><Th>Impronta SHA-256</Th></tr></thead>
        <tbody>
          {signatures.map(record => (
            <tr key={record.id}>
              <Td>{record.documentLabel}</Td>
              <Td>{record.signerName}{record.signerRole ? ` — ${record.signerRole}` : ''}</Td>
              <Td>{dateLabel(record.signedAt)}</Td>
              <Td className="font-mono text-[8px] break-all">{record.hash}</Td>
            </tr>
          ))}
          {signatures.length === 0 && <tr><Td colSpan={4} className="text-center text-slate-500">Nessun documento firmato.</Td></tr>}
        </tbody>
      </Table>
      <Note>Le firme riportate sono firme elettroniche semplici con impronta SHA-256, non firme digitali qualificate PAdES/CAdES.</Note>
    </div>
  );
};

export const PrintDocumentContent: React.FC<Props> = ({ document, project, bodyFont }) => {
  const content = (() => {
    switch (document) {
      case 'priceList': return <PriceListDocument project={project} />;
      case 'capitolato': return <CapitolatoDocument project={project} />;
      case 'quadroEconomico': return <QuadroEconomicoDocument project={project} />;
      case 'offerComparison': return <OfferComparisonDocument project={project} />;
      case 'verbale': return <VerbaleDocument project={project} />;
      case 'schedule': return <ScheduleDocument project={project} />;
      case 'priceAnalysis': return <PriceAnalysisDocument project={project} />;
      case 'suppliers': return <SuppliersDocument project={project} />;
      case 'deadlines': return <DeadlinesDocument project={project} />;
      case 'variants': return <VariantsDocument project={project} />;
      case 'signatures': return <SignaturesDocument project={project} />;
      default: return null;
    }
  })();

  return (
    <div style={{ fontFamily: bodyFont || undefined }} className="text-slate-800">
      {content}
    </div>
  );
};
