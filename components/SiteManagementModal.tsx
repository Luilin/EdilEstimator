import React, { useState } from 'react';
import { Project } from '../types';
import { X, Briefcase, Truck, Mail, Calendar, PenTool, FileText } from 'lucide-react';
import { SuppliersPanel } from './siteManagement/SuppliersPanel';
import { RfqPanel } from './siteManagement/RfqPanel';
import { DeadlinesPanel } from './siteManagement/DeadlinesPanel';
import { SignaturePanel } from './siteManagement/SignaturePanel';
import { InvoicePanel } from './siteManagement/InvoicePanel';

interface Props {
  project: Project;
  canEdit: boolean;
  canExport: boolean;
  onUpdateProject: (project: Project) => void;
  onClose: () => void;
}

type Tab = 'suppliers' | 'rfq' | 'deadlines' | 'signatures' | 'invoices';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'suppliers', label: 'Fornitori e subappalti', icon: <Truck size={14} /> },
  { id: 'rfq', label: 'Richieste preventivo', icon: <Mail size={14} /> },
  { id: 'deadlines', label: 'Scadenze', icon: <Calendar size={14} /> },
  { id: 'signatures', label: 'Firme', icon: <PenTool size={14} /> },
  { id: 'invoices', label: 'Fatturazione', icon: <FileText size={14} /> },
];

export const SiteManagementModal: React.FC<Props> = ({ project, canEdit, canExport, onUpdateProject, onClose }) => {
  const [tab, setTab] = useState<Tab>('suppliers');

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 shadow-sm">
              <Briefcase size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight sm:text-lg">Gestione cantiere</h2>
              <p className="truncate text-xs text-slate-300">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Chiudi">
            <X size={20} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
          <div className="flex rounded-lg bg-slate-100 p-1">
            {tabs.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
                  tab === item.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {tab === 'suppliers' && (
            <SuppliersPanel project={project} canEdit={canEdit} canExport={canExport} onUpdateProject={onUpdateProject} />
          )}
          {tab === 'rfq' && (
            <RfqPanel project={project} canEdit={canEdit} canExport={canExport} onUpdateProject={onUpdateProject} />
          )}
          {tab === 'deadlines' && <DeadlinesPanel project={project} canExport={canExport} />}
          {tab === 'signatures' && (
            <SignaturePanel project={project} canEdit={canEdit} canExport={canExport} onUpdateProject={onUpdateProject} />
          )}
          {tab === 'invoices' && (
            <InvoicePanel project={project} canEdit={canEdit} canExport={canExport} onUpdateProject={onUpdateProject} />
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button onClick={onClose} className="btn btn-neutral">Chiudi</button>
        </div>
      </div>
    </div>
  );
};
