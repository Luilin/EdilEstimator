import React, { useMemo, useState } from 'react';
import { CostItem, Project, ScheduleActivity, WBSNode } from '../types';
import { X, BarChart3, CalendarRange, TrendingUp, Sparkles, Plus, Trash2, Download, Printer, Info, AlertTriangle } from 'lucide-react';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
  onClose: () => void;
}

type NodeInfo = { node: WBSNode; amount: number; items: CostItem[]; path: string };

const DAY = 86400000;
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

const startOfDay = (ts: number) => {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const addDays = (ts: number, days: number) => ts + days * DAY;

const formatDate = (ts: number) => new Date(ts).toLocaleDateString('it-IT');

const toDateInput = (ts: number) => {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
};

const round2 = (value: number) => Math.round(value * 100) / 100;

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

const newId = () => `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const ScheduleModal: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject, onClose }) => {
  const [tab, setTab] = useState<'plan' | 'curve'>('plan');
  const [genStart, setGenStart] = useState(() => toDateInput(Date.now()));
  const [genDuration, setGenDuration] = useState(120);

  const nodeInfo = useMemo(() => {
    const map = new Map<string, NodeInfo>();
    const walk = (node: WBSNode, parentPath: string): { amount: number; items: CostItem[] } => {
      const items = [...node.items];
      let amount = node.items.reduce((sum, item) => sum + item.amount, 0);
      const path = node.level === 0 ? '' : `${parentPath ? `${parentPath} · ` : ''}${node.code} ${node.name}`.trim();

      node.children.forEach(child => {
        const childResult = walk(child, path);
        amount += childResult.amount;
        items.push(...childResult.items);
      });

      map.set(node.id, { node, amount, items, path });
      return { amount, items };
    };

    walk(project.rootWBS, '');
    return map;
  }, [project.rootWBS]);

  const projectTotal = nodeInfo.get(project.rootWBS.id)?.amount || 0;

  const itemPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    nodeInfo.forEach(info => info.items.forEach(item => map.set(item.id, item.price)));
    return map;
  }, [nodeInfo]);

  const rawActivities = useMemo(() => project.schedule?.activities || [], [project.schedule]);

  const startMap = useMemo(() => {
    const byId = new Map<string, ScheduleActivity>(rawActivities.map(activity => [activity.id, activity] as [string, ScheduleActivity]));

    const resolve = (activity: ScheduleActivity, stack: Set<string>): number => {
      if (!activity.predecessorId || stack.has(activity.id)) return startOfDay(activity.start);
      const predecessor = byId.get(activity.predecessorId);
      if (!predecessor) return startOfDay(activity.start);
      const nextStack = new Set(stack);
      nextStack.add(activity.id);
      const predecessorStart = resolve(predecessor, nextStack);
      return addDays(predecessorStart, Math.max(1, predecessor.durationDays) + (activity.lagDays || 0));
    };

    const map = new Map<string, number>();
    rawActivities.forEach(activity => map.set(activity.id, resolve(activity, new Set())));
    return map;
  }, [rawActivities]);

  const getStart = (activity: ScheduleActivity) => startMap.get(activity.id) ?? startOfDay(activity.start);

  const activities = useMemo(
    () => [...rawActivities].sort((a, b) => {
      const startA = startMap.get(a.id) ?? a.start;
      const startB = startMap.get(b.id) ?? b.start;
      return startA - startB || a.name.localeCompare(b.name);
    }),
    [rawActivities, startMap]
  );

  const latestSal = useMemo(
    () => [...(project.sals || [])].sort((a, b) => b.date - a.date)[0],
    [project.sals]
  );

  const latestSalQty = useMemo(() => {
    const map = new Map<string, number>();
    latestSal?.rows.forEach(row => {
      map.set(row.costItemId, Math.max(map.get(row.costItemId) || 0, row.qty || 0));
    });
    return map;
  }, [latestSal]);

  const salSeries = useMemo(() => {
    const sals = [...(project.sals || [])]
      .filter(sal => sal.rows && sal.rows.length > 0)
      .sort((a, b) => a.date - b.date);

    const points: { date: number; amount: number; percent: number }[] = [];
    sals.forEach(sal => {
      const amount = sal.rows.reduce((sum, row) => sum + (row.qty || 0) * (itemPriceMap.get(row.costItemId) || 0), 0);
      const date = startOfDay(sal.date);
      const percent = projectTotal > 0 ? (amount / projectTotal) * 100 : 0;
      if (points.length > 0 && points[points.length - 1].date === date) {
        points[points.length - 1] = { date, amount, percent };
      } else {
        points.push({ date, amount, percent });
      }
    });
    return points;
  }, [project.sals, itemPriceMap, projectTotal]);

  const getWeight = (activity: ScheduleActivity) => {
    const info = activity.wbsNodeId ? nodeInfo.get(activity.wbsNodeId) : undefined;
    return info ? info.amount : (activity.weight || 0);
  };

  const totalWeight = activities.reduce((sum, activity) => sum + getWeight(activity), 0);

  const getActualPercent = (activity: ScheduleActivity) => {
    const info = activity.wbsNodeId ? nodeInfo.get(activity.wbsNodeId) : undefined;
    if (!info || info.amount <= 0) return 0;

    let amount = 0;
    info.items.forEach(item => {
      amount += Math.min(latestSalQty.get(item.id) || 0, item.qty) * item.price;
    });

    return Math.max(0, Math.min(100, (amount / info.amount) * 100));
  };

  const today = startOfDay(Date.now());
  const starts = activities.map(activity => getStart(activity));
  const ends = activities.map(activity => addDays(getStart(activity), Math.max(1, activity.durationDays)));

  const rangeStart = starts.length > 0 ? Math.min(...starts, today) : today;
  const lastSalDate = salSeries.length > 0 ? salSeries[salSeries.length - 1].date : today;
  const rangeEnd = Math.max(...ends, lastSalDate, today, addDays(rangeStart, 30));
  const totalRange = rangeEnd - rangeStart || DAY;

  const plannedPercentAt = (ts: number) => {
    if (totalWeight <= 0) return 0;
    const amount = activities.reduce((sum, activity) => {
      const start = getStart(activity);
      const end = addDays(start, Math.max(1, activity.durationDays));
      const progress = ts <= start ? 0 : ts >= end ? 1 : (ts - start) / (end - start);
      return sum + getWeight(activity) * progress;
    }, 0);
    return (amount / totalWeight) * 100;
  };

  const curvePoints = useMemo(() => {
    const stepDays = totalRange / DAY > 180 ? 7 : 1;
    const points: { date: number; planned: number }[] = [];
    for (let time = rangeStart; time <= rangeEnd; time = addDays(time, stepDays)) {
      points.push({ date: time, planned: plannedPercentAt(time) });
    }
    if (points.length === 0 || points[points.length - 1].date < rangeEnd) {
      points.push({ date: rangeEnd, planned: plannedPercentAt(rangeEnd) });
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, totalWeight, rangeStart, rangeEnd, totalRange]);

  const plannedToday = plannedPercentAt(today);
  const latestActual = salSeries.length > 0 ? salSeries[salSeries.length - 1].percent : null;
  const plannedAtLatestSal = salSeries.length > 0 ? plannedPercentAt(salSeries[salSeries.length - 1].date) : null;

  const saveActivities = (next: ScheduleActivity[]) => {
    onUpdateProject({ ...project, schedule: { activities: next, updatedAt: Date.now() } });
  };

  const updateActivity = (id: string, patch: Partial<ScheduleActivity>) => {
    if (!canEdit) return;
    saveActivities((project.schedule?.activities || []).map(activity => activity.id === id ? { ...activity, ...patch } : activity));
  };

  const addActivity = () => {
    if (!canEdit) return;
    const start = activities.length > 0
      ? Math.max(...activities.map(activity => addDays(getStart(activity), Math.max(1, activity.durationDays))))
      : startOfDay(Date.now());
    saveActivities([
      ...(project.schedule?.activities || []),
      { id: newId(), name: `Attività ${activities.length + 1}`, start, durationDays: 7, weight: 0 },
    ]);
  };

  const removeActivity = (id: string) => {
    if (!canEdit) return;
    if (!window.confirm('Eliminare questa attività dal cronoprogramma?')) return;
    saveActivities((project.schedule?.activities || []).filter(activity => activity.id !== id));
  };

  const wouldCreateCycle = (activityId: string, predecessorId: string) => {
    let current: ScheduleActivity | undefined = rawActivities.find(activity => activity.id === predecessorId);
    const visited = new Set<string>();

    while (current) {
      if (current.id === activityId) return true;
      if (!current.predecessorId || visited.has(current.id)) return false;
      visited.add(current.id);
      current = rawActivities.find(activity => activity.id === current?.predecessorId);
    }

    return false;
  };

  const handlePredecessorChange = (activity: ScheduleActivity, predecessorId: string) => {
    if (!canEdit) return;
    if (predecessorId && wouldCreateCycle(activity.id, predecessorId)) {
      window.alert('Collegamento non valido: si creerebbe un ciclo tra le attività.');
      return;
    }

    const patch: Partial<ScheduleActivity> = { predecessorId: predecessorId || undefined };
    if (!predecessorId) {
      patch.start = getStart(activity);
    }
    updateActivity(activity.id, patch);
  };

  const handleGenerate = () => {
    if (!canEdit) return;
    if (activities.length > 0 && !window.confirm('Sostituire il cronoprogramma esistente con uno generato dalla WBS?')) return;

    const candidates = Array.from(nodeInfo.values() as Iterable<NodeInfo>)
      .filter(info => info.node.level > 0 && info.node.items.length > 0 && info.amount > 0)
      .sort((a, b) => a.path.localeCompare(b.path, 'it', { numeric: true }));

    if (candidates.length === 0) {
      window.alert('Nessuna categoria con voci valorizzate: aggiungi prima le voci al computo.');
      return;
    }

    const startTs = startOfDay(parseDateInput(genStart));
    const targetDays = Math.max(30, genDuration || 120);
    const total = candidates.reduce((sum, info) => sum + info.amount, 0);
    let cursor = startTs;
    let previousId: string | undefined;

    const generated: ScheduleActivity[] = candidates.map(info => {
      const rawDuration = total > 0 ? (info.amount / total) * targetDays : targetDays / candidates.length;
      const durationDays = Math.max(3, Math.round(rawDuration));
      const id = newId();
      const activity: ScheduleActivity = {
        id,
        name: `${info.node.code} ${info.node.name}`.trim(),
        wbsNodeId: info.node.id,
        predecessorId: previousId,
        start: cursor,
        durationDays,
        weight: info.amount,
      };
      cursor = addDays(cursor, durationDays);
      previousId = id;
      return activity;
    });

    saveActivities(generated);
  };

  const monthTicks = useMemo(() => {
    const ticks: { date: number; label: string }[] = [];
    const cursor = new Date(rangeStart);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);

    while (cursor.getTime() <= rangeEnd) {
      const time = cursor.getTime();
      if (time >= rangeStart) {
        ticks.push({ date: time, label: `${MONTHS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}` });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  }, [rangeStart, rangeEnd]);

  const pctOfTimeline = (ts: number) => ((ts - rangeStart) / totalRange) * 100;

  const actualAtDate = (ts: number): number | null => {
    let value: number | null = null;
    salSeries.forEach(point => {
      if (point.date <= ts) value = point.percent;
    });
    return value;
  };

  const buildCurveSvg = () => {
    const width = 900;
    const height = 300;
    const padLeft = 46;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 34;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    const x = (ts: number) => padLeft + ((ts - rangeStart) / totalRange) * plotWidth;
    const y = (percent: number) => padTop + (1 - Math.max(0, Math.min(100, percent)) / 100) * plotHeight;

    const gridLines = [0, 25, 50, 75, 100].map(percent => `
      <line x1="${padLeft}" y1="${y(percent)}" x2="${width - padRight}" y2="${y(percent)}" stroke="#e2e8f0" stroke-width="1" />
      <text x="${padLeft - 8}" y="${y(percent) + 3}" text-anchor="end" font-size="10" fill="#64748b">${percent}%</text>
    `).join('');

    const xTicks = Array.from({ length: 6 }, (_, index) => {
      const time = rangeStart + (index / 5) * totalRange;
      return `
        <line x1="${x(time)}" y1="${padTop}" x2="${x(time)}" y2="${height - padBottom}" stroke="#f1f5f9" stroke-width="1" />
        <text x="${x(time)}" y="${height - 12}" text-anchor="middle" font-size="10" fill="#64748b">${formatDate(time)}</text>
      `;
    }).join('');

    const plannedPoints = curvePoints.map(point => `${x(point.date).toFixed(1)},${y(point.planned).toFixed(1)}`).join(' ');
    const actualPoints = salSeries.map(point => `${x(point.date).toFixed(1)},${y(point.percent).toFixed(1)}`).join(' ');

    const todayLine = today >= rangeStart && today <= rangeEnd
      ? `<line x1="${x(today)}" y1="${padTop}" x2="${x(today)}" y2="${height - padBottom}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 4" />
         <text x="${x(today) + 4}" y="${padTop + 12}" font-size="9" fill="#b45309">oggi</text>`
      : '';

    const actualDots = salSeries.map(point => `<circle cx="${x(point.date)}" cy="${y(point.percent)}" r="3" fill="#0f172a" />`).join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Curva di avanzamento">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
        ${gridLines}
        ${xTicks}
        ${todayLine}
        <polyline points="${plannedPoints}" fill="none" stroke="#10b981" stroke-width="2.5" />
        <polyline points="${actualPoints}" fill="none" stroke="#0f172a" stroke-width="2" />
        ${actualDots}
        <line x1="${width - 210}" y1="10" x2="${width - 184}" y2="10" stroke="#10b981" stroke-width="2.5" />
        <text x="${width - 178}" y="13" font-size="10" fill="#334155">Previsto</text>
        <line x1="${width - 120}" y1="10" x2="${width - 94}" y2="10" stroke="#0f172a" stroke-width="2" />
        <text x="${width - 88}" y="13" font-size="10" fill="#334155">Realizzato (SAL)</text>
      </svg>
    `;
  };

  const handleExport = async () => {
    if (!canExport) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    const activityRows: unknown[][] = [
      ['CRONOPROGRAMMA LAVORI'],
      [`Progetto: ${project.name}`],
      [`Data esportazione: ${new Date().toLocaleDateString('it-IT')}`],
      [`Periodo: ${formatDate(rangeStart)} - ${formatDate(rangeEnd)}`],
      [],
      ['Attività', 'Collegamento WBS', 'Predecessore', 'Inizio', 'Fine', 'Durata (gg)', 'Peso (€)', 'Quota (%)', 'Avanzamento (%)'],
    ];

    activities.forEach(activity => {
      const info = activity.wbsNodeId ? nodeInfo.get(activity.wbsNodeId) : undefined;
      const weight = getWeight(activity);
      const start = getStart(activity);
      const end = addDays(start, Math.max(1, activity.durationDays));
      const predecessor = activity.predecessorId
        ? rawActivities.find(candidate => candidate.id === activity.predecessorId)?.name || ''
        : '';
      activityRows.push([
        activity.name,
        info?.path || '',
        predecessor,
        formatDate(start),
        formatDate(addDays(end, -1)),
        activity.durationDays,
        round2(weight),
        totalWeight > 0 ? Number(((weight / totalWeight) * 100).toFixed(1)) : '',
        Number(getActualPercent(activity).toFixed(1)),
      ]);
    });

    const activitySheet = XLSX.utils.aoa_to_sheet(activityRows);
    activitySheet['!cols'] = [{ wch: 34 }, { wch: 34 }, { wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, activitySheet, 'Cronoprogramma');

    const curveRows: unknown[][] = [
      ['CURVA DI AVANZAMENTO'],
      [`Progetto: ${project.name}`],
      ['Data', 'Previsto (%)', 'Realizzato (%)'],
    ];

    curvePoints.forEach(point => {
      const actual = actualAtDate(point.date);
      curveRows.push([
        formatDate(point.date),
        Number(point.planned.toFixed(1)),
        actual !== null ? Number(actual.toFixed(1)) : '',
      ]);
    });

    const curveSheet = XLSX.utils.aoa_to_sheet(curveRows);
    curveSheet['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, curveSheet, 'Curva Avanzamento');

    const cleanName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    XLSX.writeFile(workbook, `${cleanName}_cronoprogramma.xlsx`);
  };

  const handlePrint = () => {
    if (!canExport) return;

    const rowsHtml = activities.map(activity => {
      const info = activity.wbsNodeId ? nodeInfo.get(activity.wbsNodeId) : undefined;
      const weight = getWeight(activity);
      const start = getStart(activity);
      const end = addDays(start, Math.max(1, activity.durationDays));
      const predecessor = activity.predecessorId
        ? rawActivities.find(candidate => candidate.id === activity.predecessorId)?.name || ''
        : '';
      return `
        <tr>
          <td>${escapeHtml(activity.name)}</td>
          <td>${escapeHtml(info?.path || '—')}</td>
          <td>${escapeHtml(predecessor || '—')}</td>
          <td>${formatDate(start)}</td>
          <td>${formatDate(addDays(end, -1))}</td>
          <td class="num">${activity.durationDays}</td>
          <td class="num">${weight.toFixed(2)}</td>
          <td class="num">${getActualPercent(activity).toFixed(1)}%</td>
        </tr>
      `;
    }).join('');

    const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>Cronoprogramma - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 9.5px; line-height: 1.4; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 3px; text-transform: uppercase; }
  h2 { font-size: 11px; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: .04em; color: #334155; }
  .subtitle { text-align: center; color: #475569; font-size: 10px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #94a3b8; padding: 3px 5px; vertical-align: top; }
  th { background: #e2e8f0; font-size: 8px; text-transform: uppercase; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .chart { margin-top: 6px; }
  .muted { color: #64748b; font-size: 8.5px; }
</style>
</head>
<body>
  <h1>Cronoprogramma dei Lavori</h1>
  <div class="subtitle">
    Progetto: <b>${escapeHtml(project.name)}</b> — Periodo: ${formatDate(rangeStart)} - ${formatDate(rangeEnd)}<br/>
    Avanzamento previsto oggi: ${plannedToday.toFixed(1)}% · Realizzato (ultimo SAL): ${latestActual !== null ? latestActual.toFixed(1) : '—'}%
  </div>

  <h2>Attività</h2>
  <table>
    <thead>
      <tr>
        <th>Attività</th>
        <th>Collegamento WBS</th>
        <th>Predecessore</th>
        <th>Inizio</th>
        <th>Fine</th>
        <th class="num">Durata (gg)</th>
        <th class="num">Peso (€)</th>
        <th class="num">Avanzamento</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <h2>Curva di avanzamento</h2>
  <div class="chart">${buildCurveSvg()}</div>

  <p class="muted">Documento generato da EdilEstimator il ${new Date().toLocaleString('it-IT')}.</p>
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

  const selectableNodes = Array.from(nodeInfo.values() as Iterable<NodeInfo>)
    .filter(info => info.node.level > 0)
    .sort((a, b) => a.path.localeCompare(b.path, 'it', { numeric: true }));

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="flex h-[94vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <BarChart3 size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Cronoprogramma e Curva di Avanzamento</h2>
              <p className="truncate text-xs text-slate-300">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {/* Stats */}
          <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><CalendarRange size={12} /> Inizio</div>
              <div className="mt-0.5 text-sm font-bold text-slate-800">{formatDate(rangeStart)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><CalendarRange size={12} /> Fine</div>
              <div className="mt-0.5 text-sm font-bold text-slate-800">{formatDate(rangeEnd)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><BarChart3 size={12} /> Attività</div>
              <div className="mt-0.5 text-sm font-bold text-slate-800">{activities.length}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600"><TrendingUp size={12} /> Avanzamento</div>
              <div className="mt-0.5 text-sm font-bold text-emerald-800">
                Previsto {plannedToday.toFixed(1)}%
                <span className="ml-2 text-slate-500">· SAL {latestActual !== null ? `${latestActual.toFixed(1)}%` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Tabs + actions */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTab('plan')}
                className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${tab === 'plan' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <BarChart3 size={14} /> Pianificazione
              </button>
              <button
                type="button"
                onClick={() => setTab('curve')}
                className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${tab === 'curve' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <TrendingUp size={14} /> Curva S
              </button>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleExport} disabled={!canExport} className="btn btn-neutral">
                <Download size={16} /> Esporta Excel
              </button>
              <button type="button" onClick={handlePrint} disabled={!canExport || activities.length === 0} className="btn btn-neutral">
                <Printer size={16} /> Stampa / PDF
              </button>
            </div>
          </div>

          {tab === 'plan' ? (
            <div className="space-y-4">
              {/* Generazione */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Data inizio</label>
                    <input
                      type="date"
                      value={genStart}
                      disabled={!canEdit}
                      onChange={e => setGenStart(e.target.value)}
                      className="field"
                    />
                  </div>
                  <div className="w-32">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">Durata complessiva (gg)</label>
                    <input
                      type="number"
                      min={30}
                      step={1}
                      value={genDuration}
                      disabled={!canEdit}
                      onChange={e => setGenDuration(parseInt(e.target.value, 10) || 0)}
                      className="field"
                    />
                  </div>
                  <button type="button" onClick={handleGenerate} disabled={!canEdit} className="btn btn-primary">
                    <Sparkles size={16} /> Genera da WBS
                  </button>
                  <button type="button" onClick={addActivity} disabled={!canEdit} className="btn btn-neutral">
                    <Plus size={16} /> Aggiungi attività
                  </button>
                  <span className="ml-auto pb-1 text-[11px] text-slate-400">
                    Peso totale pianificato: {currency(totalWeight)}
                  </span>
                </div>
              </div>

              {/* Gantt */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
                  <h3 className="text-sm font-bold text-slate-800">Diagramma di Gantt</h3>
                  <span className="text-[11px] text-slate-400">{formatDate(rangeStart)} — {formatDate(rangeEnd)}</span>
                </div>

                {activities.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <BarChart3 size={32} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">Nessuna attività pianificata</p>
                    <p className="mt-1 text-xs text-slate-400">Genera il cronoprogramma dalla WBS oppure aggiungi attività manualmente.</p>
                  </div>
                ) : (
                  <div className="max-h-[46vh] overflow-auto p-3">
                    <div className="flex">
                      <div className="w-56 shrink-0" />
                      <div className="relative h-6 flex-1 border-b border-slate-200">
                        {monthTicks.map(tick => (
                          <div
                            key={tick.date}
                            className="absolute top-0 h-full border-l border-slate-200 pl-1 text-[10px] text-slate-400"
                            style={{ left: `${pctOfTimeline(tick.date)}%` }}
                          >
                            {tick.label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {activities.map(activity => {
                      const start = getStart(activity);
                      const end = addDays(start, Math.max(1, activity.durationDays));
                      const left = pctOfTimeline(start);
                      const width = Math.max(1.5, ((end - start) / totalRange) * 100);
                      const actual = getActualPercent(activity);
                      const todayPct = pctOfTimeline(today);

                      return (
                        <div key={activity.id} className="flex items-center border-b border-slate-100 py-1.5 last:border-0">
                          <div className="w-56 shrink-0 truncate pr-2 text-xs text-slate-600" title={activity.name}>
                            {activity.name}
                          </div>
                          <div className="relative h-6 flex-1 rounded bg-slate-50">
                            {monthTicks.map(tick => (
                              <div
                                key={tick.date}
                                className="absolute top-0 h-full border-l border-slate-100"
                                style={{ left: `${pctOfTimeline(tick.date)}%` }}
                              />
                            ))}
                            {todayPct >= 0 && todayPct <= 100 && (
                              <div className="absolute top-0 bottom-0 w-px bg-amber-400" style={{ left: `${todayPct}%` }} title="Oggi" />
                            )}
                            <div
                              className="absolute top-1 h-4 overflow-hidden rounded bg-slate-200"
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${activity.name}: ${formatDate(start)} → ${formatDate(addDays(end, -1))} · ${actual.toFixed(0)}%`}
                            >
                              <div className="h-full rounded bg-emerald-500/80" style={{ width: `${actual}%` }} />
                            </div>
                            <div className="absolute right-1 top-0.5 text-[10px] font-semibold text-slate-500">
                              {actual.toFixed(0)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Attività */}
              {activities.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
                  <span className="text-sm font-bold text-slate-800">Attività</span>
                  <span className="text-[11px] text-slate-400">Le attività collegate iniziano al termine del predecessore</span>
                </div>
                  <div className="max-h-[40vh] overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold">Attività</th>
                          <th className="px-2 py-2 text-left font-semibold">Collegamento WBS</th>
                          <th className="px-2 py-2 text-left font-semibold">Predecessore</th>
                          <th className="px-2 py-2 text-left font-semibold">Inizio</th>
                          <th className="px-2 py-2 text-right font-semibold">Durata (gg)</th>
                          <th className="px-2 py-2 text-left font-semibold">Fine</th>
                          <th className="px-2 py-2 text-right font-semibold">Peso (€)</th>
                          <th className="px-2 py-2 text-right font-semibold">Avanz.</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activities.map(activity => {
                          const info = activity.wbsNodeId ? nodeInfo.get(activity.wbsNodeId) : undefined;
                          const effectiveStart = getStart(activity);
                          const end = addDays(effectiveStart, Math.max(1, activity.durationDays));
                          return (
                            <tr key={activity.id} className="border-b border-slate-100 last:border-0">
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={activity.name}
                                  disabled={!canEdit}
                                  onChange={e => updateActivity(activity.id, { name: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={activity.wbsNodeId || ''}
                                  disabled={!canEdit}
                                  onChange={e => updateActivity(activity.id, { wbsNodeId: e.target.value || undefined })}
                                  className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                                >
                                  <option value="">— Nessun collegamento —</option>
                                  {selectableNodes.map(item => (
                                    <option key={item.node.id} value={item.node.id}>{item.path}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <select
                                  value={activity.predecessorId || ''}
                                  disabled={!canEdit}
                                  onChange={e => handlePredecessorChange(activity, e.target.value)}
                                  className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                                  title="Collega l'attività alla fine di un'attività precedente"
                                >
                                  <option value="">— Inizio indipendente —</option>
                                  {activities.filter(candidate => candidate.id !== activity.id).map(candidate => (
                                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="date"
                                  value={toDateInput(effectiveStart)}
                                  disabled={!canEdit || !!activity.predecessorId}
                                  onChange={e => updateActivity(activity.id, { start: startOfDay(parseDateInput(e.target.value)) })}
                                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-400"
                                  title={activity.predecessorId ? 'Data calcolata dal predecessore' : 'Data di inizio'}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <input
                                  type="number"
                                  min={1}
                                  value={activity.durationDays}
                                  disabled={!canEdit}
                                  onChange={e => updateActivity(activity.id, { durationDays: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                  className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-slate-600">{formatDate(addDays(end, -1))}</td>
                              <td className="px-2 py-1.5 text-right">
                                {info ? (
                                  <span className="font-semibold text-slate-700">{currency(info.amount)}</span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={activity.weight}
                                    disabled={!canEdit}
                                    onChange={e => updateActivity(activity.id, { weight: parseFloat(e.target.value) || 0 })}
                                    className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50"
                                  />
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right font-semibold text-slate-600">{getActualPercent(activity).toFixed(0)}%</td>
                              <td className="px-2 py-1.5 text-right">
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeActivity(activity.id)}
                                    className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                    title="Elimina attività"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
                  <h3 className="text-sm font-bold text-slate-800">Curva di avanzamento (Curva S)</h3>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-emerald-500"></span> Previsto</span>
                    <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-slate-900"></span> Realizzato (SAL)</span>
                  </div>
                </div>

                <div className="p-3">
                  <div className="w-full" dangerouslySetInnerHTML={{ __html: buildCurveSvg() }} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Previsto oggi</div>
                  <div className="text-lg font-bold text-emerald-700">{plannedToday.toFixed(1)}%</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Realizzato ultimo SAL</div>
                  <div className="text-lg font-bold text-slate-800">{latestActual !== null ? `${latestActual.toFixed(1)}%` : '—'}</div>
                  {latestActual === null && <div className="text-[11px] text-amber-600">Nessun SAL registrato</div>}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Scostamento al SAL</div>
                  <div className={`text-lg font-bold ${
                    latestActual === null || plannedAtLatestSal === null
                      ? 'text-slate-400'
                      : latestActual - plannedAtLatestSal < 0
                        ? 'text-red-600'
                        : 'text-emerald-700'
                  }`}>
                    {latestActual !== null && plannedAtLatestSal !== null
                      ? `${(latestActual - plannedAtLatestSal) > 0 ? '+' : ''}${(latestActual - plannedAtLatestSal).toFixed(1)}%`
                      : '—'}
                  </div>
                  {plannedAtLatestSal !== null && (
                    <div className="text-[11px] text-slate-400">Previsto al SAL: {plannedAtLatestSal.toFixed(1)}%</div>
                  )}
                </div>
              </div>

              {activities.length === 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle size={18} />
                  Nessuna attività pianificata: la curva prevista non è disponibile. Vai in “Pianificazione” e genera il cronoprogramma.
                </div>
              )}

              {salSeries.length === 0 && activities.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                  <Info size={18} className="text-slate-400" />
                  Nessun SAL registrato: la curva realizzata comparirà dopo il primo stato di avanzamento.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <span className="hidden text-[11px] text-slate-400 sm:inline">
            {activities.length} attività · Piano {formatDate(rangeStart)} — {formatDate(rangeEnd)}
          </span>
          <button onClick={onClose} className="btn btn-primary sm:ml-auto">Chiudi</button>
        </div>
      </div>
    </div>
  );
};
