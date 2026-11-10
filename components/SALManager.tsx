import React, { useMemo, useState, useEffect } from 'react';
import { Project, SAL, WBSNode } from '../types';
import { Plus, Trash2, Calendar, Lock, Unlock, FileText, Hash, Info, CheckSquare, Square } from 'lucide-react';

interface SALManagerProps {
    project: Project;
    activeSalId: string | null;
    selectedSalIds: Set<string>;
    onSetSelectedSals: (ids: Set<string>) => void;
    onUpdateProject: (updatedProject: Project) => void;
    onSetActiveSal: (salId: string | null) => void;
}

// Helper to calculate total project amount for percentage
const calculateProjectTotal = (node: WBSNode): number => {
    let total = node.items.reduce((acc, item) => acc + item.amount, 0);
    node.children.forEach(child => total += calculateProjectTotal(child));
    return total;
};

// Helper to calculate SAL total amount (Cumulative)
const calculateSalTotal = (sal: SAL, rootWBS: WBSNode): number => {
    let total = 0;
    
    // Create a map of items for fast lookup
    const itemPriceMap = new Map<string, number>();
    const traverse = (node: WBSNode) => {
        node.items.forEach(i => itemPriceMap.set(i.id, i.price));
        node.children.forEach(traverse);
    };
    traverse(rootWBS);

    sal.rows.forEach(row => {
        const price = itemPriceMap.get(row.costItemId) || 0;
        total += row.qty * price;
    });
    
    return total;
};

export const SALManager: React.FC<SALManagerProps> = ({ 
    project, 
    activeSalId, 
    selectedSalIds,
    onSetSelectedSals,
    onUpdateProject, 
    onSetActiveSal 
}) => {
    const [width, setWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        const resize = (e: MouseEvent) => {
            if (isResizing) {
                setWidth(prev => {
                    const newWidth = prev - e.movementX;
                    return Math.max(250, Math.min(newWidth, 600));
                });
            }
        };
        const stop = () => setIsResizing(false);
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stop);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stop);
        };
    }, [isResizing]);
    
    const projectTotalAmount = useMemo(() => calculateProjectTotal(project.rootWBS), [project.rootWBS]);
    const activeSal = project.sals?.find(s => s.id === activeSalId);
    
    const activeSalAmount = activeSal ? calculateSalTotal(activeSal, project.rootWBS) : 0;

    const handleCreateSAL = () => {
        const nextNum = (project.sals?.length || 0) + 1;
        const newSal: SAL = {
            id: Math.random().toString(36).substr(2, 9),
            code: `SAL ${nextNum}`,
            name: `Stato Avanzamento N.${nextNum}`,
            description: '',
            date: Date.now(),
            status: 'OPEN',
            rows: []
        };
        
        // Auto-fill rows from previous SAL if exists (Cumulative Logic)
        const lastClosedSal = [...(project.sals || [])].reverse().find(s => s.status === 'CLOSED');
        if (lastClosedSal) {
             newSal.rows = [...lastClosedSal.rows];
        }

        onUpdateProject({ ...project, sals: [...(project.sals || []), newSal] });
        onSetActiveSal(newSal.id);
        onSetSelectedSals(new Set([newSal.id]));
    };

    const handleUpdateSalDetails = (salId: string, updates: Partial<SAL>) => {
        if (!project.sals) return;
        const newSals = project.sals.map(s => s.id === salId ? { ...s, ...updates } : s);
        onUpdateProject({ ...project, sals: newSals });
    };

    const toggleSalStatus = (sal: SAL, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const newStatus = sal.status === 'CLOSED' ? 'OPEN' : 'CLOSED';
        handleUpdateSalDetails(sal.id, { status: newStatus });
    };

    const handleDeleteSAL = (salId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!project.sals) return;
        
        // In iframes, confirm throws or returns false. We will just use a prompt-less delete for now or consider it accepted.
        const confirmDelete = true;
        
        if (confirmDelete) {
            const newSals = project.sals.filter(s => s.id !== salId);
            onUpdateProject({ ...project, sals: newSals });
            
            if (activeSalId === salId) {
                onSetActiveSal(newSals.length > 0 ? newSals[0].id : null);
            }
            const newSet = new Set(selectedSalIds);
            newSet.delete(salId);
            onSetSelectedSals(newSet);
        }
    };

    const handleToggleSelection = (salId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const newSet = new Set(selectedSalIds);
        if (newSet.has(salId)) newSet.delete(salId);
        else newSet.add(salId);
        onSetSelectedSals(newSet);
    };

    const handleSelectAll = () => {
        if (!project.sals) return;
        if (selectedSalIds.size === project.sals.length) {
            onSetSelectedSals(new Set());
        } else {
            onSetSelectedSals(new Set(project.sals.map(s => s.id)));
        }
    };

    const handleBulkDelete = () => {
        if (!project.sals || selectedSalIds.size === 0) return;
        const allowDelete = true; // confirm() blocked in iframe
        if (allowDelete) {
            const newSals = project.sals.filter(s => !selectedSalIds.has(s.id));
            onUpdateProject({ ...project, sals: newSals });
            if (selectedSalIds.has(activeSalId!)) {
                onSetActiveSal(newSals.length > 0 ? newSals[0].id : null);
            }
            onSetSelectedSals(new Set());
        }
    };

    const sortedSals = [...(project.sals || [])].sort((a, b) => b.date - a.date);

    return (
        <div 
            className="bg-slate-50 border-l border-slate-200 flex flex-col h-full shrink-0 shadow-inner z-20 relative group/panel"
            style={{ width, maxWidth: '90vw' }}
        >
            <div 
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-500 active:bg-emerald-600 z-30 transition-colors"
                onMouseDown={() => setIsResizing(true)}
            />
            {/* Sidebar Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-100/60">
                <div className="flex justify-between items-center mb-1">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                        <FileText size={18} /> Contabilità SAL
                    </h3>
                    {project.sals && project.sals.length > 0 && (
                        <button 
                            onClick={handleSelectAll}
                            className="text-[10px] uppercase font-black text-emerald-600 hover:text-emerald-800 transition-colors"
                        >
                            {selectedSalIds.size === project.sals.length ? 'Deseleziona' : 'Tutti'}
                        </button>
                    )}
                </div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-3">
                    Gestione Avanzamento
                </p>

                {/* Bulk Action Bar */}
                {selectedSalIds.size > 1 && (
                    <div className="mb-4 p-2 bg-emerald-100 rounded-lg flex items-center justify-between animate-in slide-in-from-top-2 duration-200">
                        <span className="text-[10px] font-black text-emerald-900 px-2">
                             {selectedSalIds.size} SELEZIONATI
                        </span>
                        <div className="flex gap-1">
                            <button 
                                onClick={handleBulkDelete}
                                className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors shadow-sm"
                                title="Elimina selezionati"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Summary Section for Active SAL */}
                {activeSal && !selectedSalIds.has(activeSalId!) && (
                    <div className="bg-emerald-600 text-white p-3 rounded-lg shadow-md mb-4 border border-emerald-700 opacity-90">
                        <div className="flex items-center gap-2 mb-1 text-[10px] uppercase font-black text-emerald-100 opacity-90">
                            <Info size={10} /> Riepilogo SAL Corrente
                        </div>
                        <div className="text-xl font-black">
                            € {activeSalAmount.toLocaleString('it-IT', {minimumFractionDigits: 2})}
                        </div>
                    </div>
                )}

                {/* Global Info */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 mb-4 shadow-sm">
                    <div className="text-[9px] uppercase font-black text-slate-500 mb-0.5">Computo Progetto</div>
                    <div className="text-sm font-black text-slate-900">€ {projectTotalAmount.toLocaleString('it-IT', {minimumFractionDigits: 2})}</div>
                </div>

                <button 
                    type="button"
                    onClick={handleCreateSAL} 
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg shadow-sm text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                    <Plus size={18} /> Nuovo SAL
                </button>
            </div>

            {/* SAL List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {(!project.sals || project.sals.length === 0) && (
                    <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/60">
                        <FileText size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-xs font-bold uppercase tracking-tight">Nessun SAL presente</p>
                    </div>
                )}

                {sortedSals.map(sal => {
                    const isActive = sal.id === activeSalId;
                    const isSelected = selectedSalIds.has(sal.id);
                    const isClosed = sal.status === 'CLOSED';
                    
                    const currentAmount = calculateSalTotal(sal, project.rootWBS);
                    const percent = projectTotalAmount > 0 ? (currentAmount / projectTotalAmount) * 100 : 0;

                    return (
                        <div 
                            key={sal.id}
                            onClick={() => onSetActiveSal(sal.id)}
                            className={`
                                relative p-4 rounded-xl border transition-all cursor-pointer group
                                ${isActive 
                                    ? 'bg-white border-emerald-500 shadow-lg ring-1 ring-emerald-500/20' 
                                    : isSelected 
                                        ? 'bg-emerald-50/50 border-emerald-400 shadow-sm'
                                        : 'bg-white/60 border-emerald-200 hover:bg-white hover:border-emerald-300 hover:shadow-sm'
                                }
                                ${isClosed ? 'opacity-90' : ''}
                            `}
                        >
                            {/* Selection Checkbox */}
                            <div 
                                onClick={(e) => handleToggleSelection(sal.id, e)}
                                className={`absolute -left-2 -top-2 p-1.5 rounded-full shadow-md z-10 transition-colors border
                                    ${isSelected ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-gray-300 hover:text-emerald-500 border-gray-200'}
                                `}
                            >
                                {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                            </div>

                            {/* Header Row: Code & Status */}
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex-1 flex gap-2 items-center">
                                    <div className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-tighter ${isActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                       {sal.code || `SAL`}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => toggleSalStatus(sal, e)}
                                        className={`
                                            px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border transition-colors
                                            ${isClosed 
                                                ? 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200' 
                                                : 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                                            }
                                        `}
                                        title={isClosed ? "Riapri SAL" : "Chiudi SAL"}
                                    >
                                        {isClosed ? <Lock size={10} /> : <Unlock size={10} />}
                                        {isClosed ? 'Chiuso' : 'Aperto'}
                                    </button>
                                </div>
                                <button 
                                    type="button"
                                    onClick={(e) => handleDeleteSAL(sal.id, e)}
                                    className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-90"
                                    title="Elimina permanentemente"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            {/* Editable Fields */}
                            <div className="space-y-2 mb-3">
                                <div className="flex items-center gap-2">
                                    <Hash size={12} className="text-gray-400 shrink-0" />
                                    {isActive ? (
                                        <input 
                                            type="text" 
                                            value={sal.code || ''} 
                                            onChange={(e) => handleUpdateSalDetails(sal.id, { code: e.target.value })}
                                            className="w-full font-bold text-gray-800 text-sm bg-transparent border-b border-dashed border-gray-300 focus:border-emerald-500 outline-none pb-0.5"
                                            placeholder="Codice"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span className="font-bold text-gray-800 text-sm truncate">{sal.code || 'Senza Codice'}</span>
                                    )}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <FileText size={12} className="text-gray-400 shrink-0" />
                                    {isActive ? (
                                        <input 
                                            type="text" 
                                            value={sal.name} 
                                            onChange={(e) => handleUpdateSalDetails(sal.id, { name: e.target.value })}
                                            className="w-full text-gray-700 text-xs bg-transparent border-b border-dashed border-gray-300 focus:border-emerald-500 outline-none pb-0.5"
                                            placeholder="Titolo"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span className="text-xs text-gray-600 truncate">{sal.name}</span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <Calendar size={12} className="text-gray-400 shrink-0" />
                                    {isActive ? (
                                        <input 
                                            type="date"
                                            value={new Date(sal.date).toISOString().split('T')[0]}
                                            onChange={(e) => handleUpdateSalDetails(sal.id, { date: new Date(e.target.value).getTime() })}
                                            className="text-xs text-gray-600 bg-transparent border-none p-0 focus:ring-0 cursor-pointer w-full"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <span className="text-xs text-gray-500">{new Date(sal.date).toLocaleDateString('it-IT')}</span>
                                    )}
                                </div>
                            </div>

                            {/* Progress Bar & Amount */}
                            <div className="border border-slate-200 bg-slate-50 rounded-lg p-2.5 mt-2 transition-colors">
                                <div className="flex justify-between items-end mb-1.5">
                                    <span className="text-[9px] uppercase font-black text-gray-400">Incidenza</span>
                                    <span className="text-xs font-black text-gray-900">{percent.toFixed(2)}%</span>
                                </div>
                                <div className="w-full bg-gray-200/50 rounded-full h-1.5 mb-2 overflow-hidden">
                                    <div 
                                        className="bg-emerald-500 h-full rounded-full transition-all duration-700 ease-out" 
                                        style={{ width: `${Math.min(percent, 100)}%` }}
                                    ></div>
                                </div>
                                <div className="text-right text-[11px] font-black text-gray-950 tabular-nums">
                                    € {currentAmount.toLocaleString('it-IT', {minimumFractionDigits: 2})}
                                </div>
                            </div>

                            {isActive && (
                                <div className="absolute -left-[1px] top-1/2 -translate-y-1/2 w-1.5 h-10 bg-emerald-600 rounded-r-full shadow-[2px_0_8px_rgba(16,185,129,0.35)]"></div>
                            )}
                        </div>
                    );
                })}
            </div>
            
            {/* Footer Summary */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 text-[10px] text-center text-slate-500 font-black uppercase tracking-widest">
                {project.sals?.length || 0} Stati Avanzamento
            </div>
        </div>
    );
};