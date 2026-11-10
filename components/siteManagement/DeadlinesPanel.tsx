import React, { useMemo } from 'react';
import { Project } from '../../types';
import { projectDeadlines, downloadIcs, googleCalendarUrl } from '../../services/calendar';
import { Calendar, Download, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { daysUntil, dateLabel } from './shared';

interface Props {
  project: Project;
  canExport: boolean;
}

const sourceClass: Record<string, string> = {
  SAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Offerta: 'bg-sky-50 text-sky-700 border-sky-200',
  'Richiesta preventivo': 'bg-amber-50 text-amber-700 border-amber-200',
  Fornitore: 'bg-purple-50 text-purple-700 border-purple-200',
  Cronoprogramma: 'bg-slate-100 text-slate-700 border-slate-200',
  Variante: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export const DeadlinesPanel: React.FC<Props> = ({ project, canExport }) => {
  const events = useMemo(() => projectDeadlines(project), [project]);

  const upcoming = events.filter(event => (daysUntil(event.date) ?? -1) >= 0);
  const overdue = events.filter(event => (daysUntil(event.date) ?? -1) < 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Scadenze del progetto</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            SAL, offerte, richieste preventivo, DURC, polizze, cronoprogramma e varianti in un unico calendario.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadIcs(project, events)}
          disabled={!canExport || events.length === 0}
          className="btn btn-primary"
        >
          <Download size={16} /> Scarica calendario (.ics)
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Eventi totali</div>
          <div className="text-lg font-bold text-slate-800">{events.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Prossimi</div>
          <div className="text-lg font-bold text-emerald-800">{upcoming.length}</div>
        </div>
        <div className={`rounded-xl border p-3 shadow-sm ${overdue.length > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Scaduti</div>
          <div className={`text-lg font-bold ${overdue.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>{overdue.length}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Data</th>
              <th className="px-3 py-2 text-left font-semibold">Evento</th>
              <th className="px-3 py-2 text-left font-semibold">Tipo</th>
              <th className="px-3 py-2 text-left font-semibold">Stato</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {events.map(event => {
              const days = daysUntil(event.date);
              const isPast = days !== null && days < 0;
              const isNear = days !== null && days >= 0 && days <= 14;
              return (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400" />
                      {dateLabel(event.date)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    <div className="font-semibold">{event.title}</div>
                    {event.description && <div className="text-[10px] text-slate-400">{event.description}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sourceClass[event.source] || sourceClass.Cronoprogramma}`}>
                      {event.source}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${isPast ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-slate-500'}`}>
                      {isPast ? <AlertTriangle size={11} /> : <Clock size={11} />}
                      {days === null ? '—' : isPast ? `${Math.abs(days)} gg fa` : days === 0 ? 'Oggi' : `tra ${days} gg`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => window.open(googleCalendarUrl(event), '_blank', 'noopener,noreferrer')}
                      className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                      title="Aggiungi a Google Calendar"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  <Calendar size={24} className="mx-auto mb-2 text-slate-300" />
                  Nessuna scadenza disponibile.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        Il file .ics è compatibile con Google Calendar, Outlook e Apple Calendar. Le scadenze sono calcolate dai dati del progetto.
      </p>
    </div>
  );
};
