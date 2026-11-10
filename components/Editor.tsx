import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, WBSNode, CostItem, COMMON_UOMS, ActiveDimensions, PriceBook, PriceBookItem, PriceBookCategory, EffectivePermissions, FULL_PERMISSIONS } from '../types';
import { WBSTree } from './WBSTree';
import { PriceBookPanel, DEFAULT_BOOKS } from './PriceBookPanel';
import { PrintPreview } from './PrintPreview';
import { SALManager } from './SALManager';
import { TeamManagementModal } from './TeamManagementModal';
import { OfferComparisonModal } from './OfferComparisonModal';
import { PriceAnalysisModal } from './PriceAnalysisModal';
import { PriceAnalysisListModal } from './PriceAnalysisListModal';
import { ScheduleModal } from './ScheduleModal';
import { DocumentsModal } from './DocumentsModal';
import { ToolsModal } from './ToolsModal';
import { AttachmentsModal } from './AttachmentsModal';
import { QuadroEconomicoModal } from './QuadroEconomicoModal';
import { SiteManagementModal } from './SiteManagementModal';
import { ToolbarMenu, ToolbarMenuSection } from './ToolbarMenu';
import { saveProjectVersion } from '../services/projectVersions';
import { externalizePriceBooks, hydratePriceBooks } from '../services/priceBooksStorage';
import { Plus, Save, Users, FileSpreadsheet, ArrowLeft, Trash2, FolderOpen, Printer, Pencil, X, Search, AlertTriangle, AlertCircle, GripVertical, Undo, Redo, PanelLeftClose, PanelLeftOpen, ArrowDownAZ, List, CheckCircle2, Calculator, AlignEndVertical, Ruler, BookOpen, ChevronLeft, Hash, Eye, EyeOff, Shield, ShieldCheck, Building2, ChevronDown, ChevronUp, Scale, FlaskConical, BarChart3, FileText, Wrench, Paperclip, Landmark, Briefcase, Menu as MenuIcon } from 'lucide-react';
import { saveProject } from '../services/storage';

interface EditorProps {
  project: Project;
  currentUser: string;
  onClose: () => void;
  isReadOnly?: boolean;
  userRole?: 'owner' | 'editor' | 'viewer' | 'ditta';
  permissions?: EffectivePermissions;
}

// Helper to cascade code changes to all descendants
const updateDescendantCodes = (node: WBSNode, oldPrefix: string, newPrefix: string): WBSNode => {
    if (oldPrefix === newPrefix) return node;
    
    const prefixWithDot = oldPrefix + ".";
    const newPrefixWithDot = newPrefix + ".";

    const newItems = node.items.map(item => {
        if (item.code.startsWith(prefixWithDot)) {
            return { ...item, code: newPrefixWithDot + item.code.substring(prefixWithDot.length) };
        }
        return item;
    });

    const newChildren = node.children.map(child => {
        let newChild = { ...child };
        if (newChild.code.startsWith(prefixWithDot)) {
             newChild.code = newPrefixWithDot + newChild.code.substring(prefixWithDot.length);
        }
        return updateDescendantCodes(newChild, oldPrefix, newPrefix);
    });

    return { ...node, items: newItems, children: newChildren };
};

const deleteNodeInTree = (root: WBSNode, nodeIdToDelete: string): WBSNode => {
    const idx = root.children.findIndex(c => c.id === nodeIdToDelete);
    if (idx !== -1) {
        const newChildren = [...root.children];
        newChildren.splice(idx, 1);
        return { ...root, children: newChildren };
    }
    const newChildren = root.children.map(child => deleteNodeInTree(child, nodeIdToDelete));
    if (newChildren.some((child, i) => child !== root.children[i])) {
        return { ...root, children: newChildren };
    }
    return root;
};

const findParentNode = (root: WBSNode, childId: string): WBSNode | null => {
    if (root.children.some(c => c.id === childId)) return root;
    for (const child of root.children) {
        const parent = findParentNode(child, childId);
        if (parent) return parent;
    }
    return null;
};

const compareWbsCodes = (codeA: string, codeB: string) => {
    if (!codeA) return 1;
    if (!codeB) return -1;
    const splitA = codeA.split(/(\d+)/).filter(Boolean);
    const splitB = codeB.split(/(\d+)/).filter(Boolean);
    for (let i = 0; i < Math.min(splitA.length, splitB.length); i++) {
        const partA = splitA[i];
        const partB = splitB[i];
        const numA = parseInt(partA, 10);
        const numB = parseInt(partB, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            if (numA !== numB) return numA - numB;
        } else {
            if (partA !== partB) return partA.localeCompare(partB);
        }
    }
    return splitA.length - splitB.length;
};

const sortTreeByCode = (node: WBSNode): WBSNode => {
    const sortedChildren = [...node.children].sort((a, b) => compareWbsCodes(a.code, b.code));
    const sortedItems = [...node.items].sort((a, b) => compareWbsCodes(a.code, b.code));
    return { ...node, items: sortedItems, children: sortedChildren.map(child => sortTreeByCode(child)) };
};

const getAllCodes = (nodes: WBSNode[]): string[] => {
    let codes: string[] = [];
    nodes.forEach(node => {
        if(node.code && node.code.trim() !== "") codes.push(node.code.trim());
        codes = codes.concat(getAllCodes(node.children));
    });
    return codes;
};

const getDefaultActiveDimensions = (uom: string): ActiveDimensions => {
    const u = uom.toLowerCase().trim();
    if (u === 'm') return { length: true, area: false, height: false, weight: false };
    if (u === 'm²' || u === 'mq') return { length: false, area: true, height: false, weight: false };
    if (u === 'm³' || u === 'mc') return { length: false, area: true, height: true, weight: false };
    if (['kg', 'q', 't', 'litri'].includes(u)) return { length: false, area: false, height: false, weight: true };
    return { length: false, area: false, height: false, weight: false }; 
};

type EditorMode = 'ESTIMATE' | 'SAL';

// Aggiunge ai prezzari di esempio già salvati le nuove categorie architettoniche/impiantistiche
const mergeDefaultSampleCategories = (books: Project['priceBooks']): Project['priceBooks'] => {
  if (!books || books.length === 0) return books;
  const sample = DEFAULT_BOOKS[0];
  if (!sample) return books;
  return books.map(book => {
    if (book.id !== sample.id) return book;
    const existingCodes = new Set(book.rootCategory.children.map(c => c.code));
    const missingCategories = sample.rootCategory.children.filter(c => !existingCodes.has(c.code));
    const isOldDescription = !book.description || book.description === 'Prezzario standard per opere edili';
    if (missingCategories.length === 0 && !isOldDescription) return book;
    return {
      ...book,
      description: isOldDescription ? sample.description : book.description,
      rootCategory: {
        ...book.rootCategory,
        children: [...book.rootCategory.children, ...missingCategories],
      },
    };
  });
};

export const Editor: React.FC<EditorProps> = ({ project: initialProject, currentUser, onClose, isReadOnly, userRole, permissions }) => {
  const [project, setProject] = useState<Project>(() => {
      // Fallback for price books from localStorage for migration
      let priceBooks = initialProject.priceBooks;
      if (!priceBooks || priceBooks.length === 0) {
          if (typeof window !== 'undefined') {
              const saved = localStorage.getItem('edil_price_books');
              if (saved) {
                  try {
                      priceBooks = JSON.parse(saved);
                  } catch (e) {
                      priceBooks = DEFAULT_BOOKS;
                  }
              } else {
                  priceBooks = DEFAULT_BOOKS;
              }
          } else {
              priceBooks = DEFAULT_BOOKS;
          }
      }
      return { ...initialProject, sals: initialProject.sals || [], priceBooks: mergeDefaultSampleCategories(priceBooks) };
  });
  const [priceBooks, setPriceBooks] = useState<PriceBook[]>(() => project.priceBooks || []);
  const priceBooksSaveRef = useRef<number | null>(null);
  const projectRef = useRef<Project>(project);

  const [history, setHistory] = useState<Project[]>([project]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Editor Mode & SAL State
  const [editorMode, setEditorMode] = useState<EditorMode>('ESTIMATE');
  const [activeSalId, setActiveSalId] = useState<string | null>(null);
  const [selectedSalIds, setSelectedSalIds] = useState<Set<string>>(new Set());
  const [preventOver100, setPreventOver100] = useState(true); // Cap cumulative to 100%
  const [hideCompleted, setHideCompleted] = useState(false); // Hide items completed in prev SALs

  // Sidebar State
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('edil_editor_sidebar_width');
          return saved ? parseInt(saved, 10) : 450;
      }
      return 450;
  });
  const [isResizing, setIsResizing] = useState(false);
  
  // Settings
  const [autoItemCode, setAutoItemCode] = useState(false);
  const [autoWBSCode, setAutoWBSCode] = useState(true);
  const [showPriceBook, setShowPriceBook] = useState(false);
  const [priceBookImportData, setPriceBookImportData] = useState<{type: 'category' | 'item', data: any[]} | null>(null);

  // UOMs
  const [customUoms, setCustomUoms] = useState<string[]>(() => {
      const saved = localStorage.getItem('edil_uoms');
      return saved ? JSON.parse(saved) : COMMON_UOMS;
  });
  const [showUomModal, setShowUomModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showQuadroEconomico, setShowQuadroEconomico] = useState(false);
  const [showSiteManagement, setShowSiteManagement] = useState(false);

  // Print & Export State
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isRfqPrintMode, setIsRfqPrintMode] = useState(false);
  const isDittaRole = userRole === 'ditta';
  const effectivePermissions = permissions || FULL_PERMISSIONS;
  const canWrite = effectivePermissions.canWrite;
  const canEditSAL = effectivePermissions.canEditSAL;
  const canEditPriceBooks = effectivePermissions.canEditPriceBooks;
  const canExport = effectivePermissions.canExport;
  const canManageMembers = effectivePermissions.canManageMembers;
  const [isDittaMode, setIsDittaMode] = useState<boolean>(isDittaRole);
  const [showDittaModal, setShowDittaModal] = useState<boolean>(false);
  const [showProjectInfoModal, setShowProjectInfoModal] = useState<boolean>(false);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [projectDescDraft, setProjectDescDraft] = useState('');

  const openProjectInfoModal = () => {
    setProjectNameDraft(project.name);
    setProjectDescDraft(project.description || '');
    setShowProjectInfoModal(true);
  };

  const handleSaveProjectInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNameDraft.trim()) return;
    updateProject({ ...project, name: projectNameDraft.trim(), description: projectDescDraft.trim(), lastModified: Date.now() });
    setShowProjectInfoModal(false);
  };
  const [showOfferComparison, setShowOfferComparison] = useState(false);
  const [priceAnalysisItem, setPriceAnalysisItem] = useState<CostItem | null>(null);
  const [showPriceAnalysisList, setShowPriceAnalysisList] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const [filterText, setFilterText] = useState("");
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null);
  
  // Selection logic for WBS Sidebar
  const [wbsSelectedIds, setWbsSelectedIds] = useState<Set<string>>(new Set());
  const [wbsSelectionRect, setWbsSelectionRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const wbsSelectionStartPos = useRef<{x: number, y: number} | null>(null);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);

  // Selection logic for Cost Items
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemSelectionRect, setItemSelectionRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const itemSelectionStartPos = useRef<{x: number, y: number} | null>(null);
  const [isSelectingItems, setIsSelectingItems] = useState(false);
  const itemsListRef = useRef<HTMLDivElement>(null);

  // Toast notification state
  const [toastNotification, setToastNotification] = useState<{ message: string; type: 'info' | 'warning' | 'error' | 'success' } | null>(null);
  const [categoryToRename, setCategoryToRename] = useState<{ id: string; name: string } | null>(null);

  const notify = (message: string, type: 'info' | 'warning' | 'error' | 'success' = 'warning') => {
    setToastNotification({ message, type });
  };

  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => setToastNotification(null), 3500);
    return () => clearTimeout(timer);
  }, [toastNotification]);
  
  useEffect(() => {
    if (isReadOnly) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await saveProject(project);
      } catch (err) {
        console.error("Auto-save error:", err);
      } finally {
        setTimeout(() => setSaving(false), 400);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [project, isReadOnly]);

  // Snapshot automatico della cronologia versioni (throttle nel servizio).
  useEffect(() => {
    if (isReadOnly) return;
    const timer = setTimeout(() => {
      saveProjectVersion(project, 'Automatica').catch(err => {
        console.warn('Impossibile salvare la versione automatica:', err);
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, [project, isReadOnly]);

  // Riferimento sempre aggiornato al progetto, usato dai salvataggi asincroni.
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // Carica in memoria i prezzari grandi salvati in IndexedDB.
  useEffect(() => {
    let cancelled = false;
    hydratePriceBooks(project.id, project.priceBooks || [])
      .then(books => {
        if (!cancelled) setPriceBooks(books);
      })
      .catch(err => {
        console.warn('Impossibile caricare i prezzari esterni:', err);
      });
    return () => { cancelled = true; };
  }, [project.id, project.priceBooks]);

  // Ensure sals array exists and have status
  useEffect(() => {
      let needsUpdate = false;
      let newSals = [...(project.sals || [])];
      
      if (!project.sals) {
          newSals = [];
          needsUpdate = true;
      } else {
          // Backwards compatibility: add status='OPEN' if missing
          newSals = newSals.map(s => {
              if (!s.status) {
                  needsUpdate = true;
                  return { ...s, status: 'OPEN' };
              }
              return s;
          });
      }

      if (needsUpdate) {
          updateProject({ ...project, sals: newSals });
      }
  }, []);

  useEffect(() => {
    localStorage.setItem('edil_editor_sidebar_width', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
      localStorage.setItem('edil_uoms', JSON.stringify(customUoms));
  }, [customUoms]);
  
  const startResizing = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
  }, []);

  useEffect(() => {
      const resize = (e: MouseEvent) => {
          if (isResizing) {
              const newWidth = e.clientX;
              if (newWidth > 300 && newWidth < 800) setSidebarWidth(newWidth);
          }
      };
      const stopResizing = () => setIsResizing(false);
      if (isResizing) {
          window.addEventListener("mousemove", resize);
          window.addEventListener("mouseup", stopResizing);
      }
      return () => {
          window.removeEventListener("mousemove", resize);
          window.removeEventListener("mouseup", stopResizing);
      };
  }, [isResizing]);

  // Undo/Redo
  const isChangeAllowed = (next: Project): boolean => {
      // Il proprietario ha tutti i permessi.
      if (canWrite && canManageMembers && canEditSAL && canEditPriceBooks && canExport) return true;

      // In modalità compilazione offerta ditta, la ditta può aggiornare le proprie offerte.
      if (isDittaRole && isDittaMode) return true;

      let allowed = true;
      if (next.rootWBS !== project.rootWBS || next.name !== project.name || next.description !== project.description) {
        if (!canWrite) allowed = false;
      }
      if (next.sals !== project.sals) {
        if (!canEditSAL) allowed = false;
      }
      if (next.priceBooks !== project.priceBooks) {
        if (!canEditPriceBooks) allowed = false;
      }
      if (next.contractorDetails !== project.contractorDetails) {
        if (!canWrite && !isDittaRole) allowed = false;
      }
      if (next.memberPermissions !== project.memberPermissions || next.collaborators !== project.collaborators || next.sharedWithEmails !== project.sharedWithEmails) {
        if (!canManageMembers) allowed = false;
      }
      return allowed;
  };

  const updateProject = (newProjectData: Project, options?: { bypassPermissions?: boolean }) => {
      if (!options?.bypassPermissions && !isChangeAllowed(newProjectData)) {
        notify('Non hai i permessi per questa modifica.', 'warning');
        return;
      }
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newProjectData);
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setProject(newProjectData);
  };
  const handleUndo = () => {
      if (!canWrite && !canEditSAL && !canEditPriceBooks && !isDittaRole) {
        notify('Non hai i permessi per modificare.', 'warning');
        return;
      }
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setProject(history[newIndex]);
      }
  };
  const handleRedo = () => {
      if (!canWrite && !canEditSAL && !canEditPriceBooks && !isDittaRole) {
        notify('Non hai i permessi per modificare.', 'warning');
        return;
      }
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setProject(history[newIndex]);
      }
  };

  const handleUpdatePriceBooks = (newBooks: Project['priceBooks']) => {
      if (!newBooks) return;

      setPriceBooks(newBooks);

      if (priceBooksSaveRef.current) {
        window.clearTimeout(priceBooksSaveRef.current);
      }

      priceBooksSaveRef.current = window.setTimeout(async () => {
        try {
          const metadata = await externalizePriceBooks(projectRef.current.id, newBooks);
          if (priceBooksSaveRef.current) {
            priceBooksSaveRef.current = null;
          }
          updateProject({ ...projectRef.current, priceBooks: metadata });
        } catch (err) {
          console.error('Errore salvataggio prezzari:', err);
          notify('Errore nel salvataggio del prezzario. Verifica lo spazio disponibile nel browser.', 'error');
        }
      }, 350);
  };

  const findNode = (id: string, nodes: WBSNode[]): WBSNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findNode(id, node.children);
      if (found) return found;
    }
    return null;
  };
  
  // For resolving multiple IDs into full nodes
  const getMultiSelectionData = (ids: string[]): WBSNode[] => {
      const result: WBSNode[] = [];
      const traverse = (node: WBSNode) => {
          if (ids.includes(node.id)) {
              result.push(node);
          }
          node.children.forEach(traverse);
      };
      traverse(project.rootWBS);
      return result;
  };

  const getSelectedNode = () => {
    if (!selectedNodeId) return null;
    return findNode(selectedNodeId, project.rootWBS.children) || (project.rootWBS.id === selectedNodeId ? project.rootWBS : null);
  };
  const selectedNode = getSelectedNode();
  
  // WBS Selection Handler supporting multiple select via state update
  const handleSelectNode = (node: WBSNode, multi: boolean = false) => {
      // Sync primary selection for right pane
      if (!multi) {
          setSelectedNodeId(node.id);
          setWbsSelectedIds(new Set([node.id]));
      } else {
          // Multi-select mode
          const newSet = new Set(wbsSelectedIds);
          if (newSet.has(node.id)) newSet.delete(node.id);
          else newSet.add(node.id);
          setWbsSelectedIds(newSet);
          // If singular remaining, sync primary
          if (newSet.size === 1) setSelectedNodeId(Array.from(newSet)[0]);
          else if (newSet.size === 0) setSelectedNodeId(null);
          // If multiple, keep current selectedNodeId if in set, else pick first or null
      }
      // Reset Item Selection when changing WBS Node
      setSelectedItemIds(new Set());
  };

  const filteredItems = selectedNode 
    ? selectedNode.items.filter(item => {
        if (!filterText.trim()) return true;
        const terms = filterText.toLowerCase().split(';').map(t => t.trim()).filter(t => t);
        return terms.every(term => {
            if (item.code.toLowerCase().includes(term)) return true;
            if (item.description.toLowerCase().includes(term)) return true;
            if (item.uom.toLowerCase().includes(term)) return true;
            if (['lunghezza', 'length', 'dim:l'].includes(term) && item.activeDimensions.length) return true;
            if (['area', 'dim:a'].includes(term) && item.activeDimensions.area) return true;
            if (['altezza', 'height', 'dim:h'].includes(term) && item.activeDimensions.height) return true;
            if (['peso', 'weight', 'dim:p'].includes(term) && item.activeDimensions.weight) return true;
            return false;
        });
    }) : [];

  const updateNodeInTree = (root: WBSNode, updatedNode: WBSNode): WBSNode => {
    if (root.id === updatedNode.id) return updatedNode;
    return { ...root, children: root.children.map(child => updateNodeInTree(child, updatedNode)) };
  };

  const handleUpdateNode = (updatedNode: WBSNode) => {
    let originalNode: WBSNode | null = null;
    if (updatedNode.id === project.rootWBS.id) originalNode = project.rootWBS;
    else originalNode = findNode(updatedNode.id, project.rootWBS.children);
    
    let nodeToProcess = updatedNode;
    if (originalNode && originalNode.code !== updatedNode.code) {
         nodeToProcess = updateDescendantCodes(updatedNode, originalNode.code, updatedNode.code);
    }

    let newProject: Project;
    if (nodeToProcess.id === project.rootWBS.id) {
       newProject = { ...project, rootWBS: nodeToProcess };
    } else {
       newProject = { ...project, rootWBS: { ...project.rootWBS, children: project.rootWBS.children.map(c => updateNodeInTree(c, nodeToProcess)) } };
    }
    updateProject(newProject);
  };

  // --- SAL MANAGEMENT LOGIC ---
  const activeSal = project.sals?.find(s => s.id === activeSalId);

  // Get Current Cumulative Qty (Input in current SAL)
  const getSalQty = (costItemId: string, targetSalId: string | null = activeSalId): number => {
      if (!targetSalId || !project.sals) return 0;
      const sal = project.sals.find(s => s.id === targetSalId);
      if (!sal) return 0;
      const row = sal.rows.find(r => r.costItemId === costItemId);
      return row ? row.qty : 0;
    };

  // Get Previous SAL Info (Latest closed SAL for this item)
  const getPreviousSalInfo = (costItemId: string): { qty: number, code: string } => {
      if (!project.sals || !activeSal) return { qty: 0, code: '-' };
      
      // Filter closed SALs before current one
      const closedSals = project.sals
          .filter(s => s.status === 'CLOSED' && s.date < activeSal.date)
          .sort((a, b) => b.date - a.date); // Sort desc (latest first)
      
      for (const sal of closedSals) {
          const row = sal.rows.find(r => r.costItemId === costItemId);
          if (row && row.qty > 0) {
              return { qty: row.qty, code: sal.code || sal.name };
          }
      }
      return { qty: 0, code: '-' };
  };

  const handleUpdateSalQty = (costItemId: string, qty: number, totalEstQty: number) => {
      if (!activeSalId || !project.sals) return;
      const salIndex = project.sals.findIndex(s => s.id === activeSalId);
      if (salIndex === -1) return;
      
      const sal = project.sals[salIndex];
      if (sal.status === 'CLOSED') {
          notify("Questo SAL è chiuso. Riaprilo per effettuare modifiche.", "warning");
          return;
      }

      const prevInfo = getPreviousSalInfo(costItemId);
      
      // Check Cumulative 100% cap
      if (preventOver100) {
          const remaining = totalEstQty - prevInfo.qty;
          if (qty > remaining) {
              qty = Math.max(0, remaining);
          }
      }

      const rowIndex = sal.rows.findIndex(r => r.costItemId === costItemId);
      
      let newRows = [...sal.rows];
      if (rowIndex !== -1) {
          if (qty <= 0) {
              newRows.splice(rowIndex, 1);
          } else {
              newRows[rowIndex] = { ...newRows[rowIndex], qty };
          }
      } else {
          if (qty > 0) {
              newRows.push({ costItemId, qty });
          }
      }
      
      const newSals = [...project.sals];
      newSals[salIndex] = { ...sal, rows: newRows };
      updateProject({ ...project, sals: newSals }, { bypassPermissions: true });
  };

  // --- NODE MANAGEMENT LOGIC (Standard) ---

  const initiateDeleteNode = (nodeId: string) => setNodeToDelete(nodeId);
  const confirmDeleteNode = () => {
      if (!nodeToDelete) return;
      if (selectedNodeId === nodeToDelete) setSelectedNodeId(null);
      const newRoot = deleteNodeInTree(project.rootWBS, nodeToDelete);
      updateProject({ ...project, rootWBS: newRoot });
      setNodeToDelete(null);
  };

  const handleDuplicateNode = (nodeId: string) => {
      const nodeToDuplicate = findNode(nodeId, project.rootWBS.children);
      if (!nodeToDuplicate) return;
      const parentNode = findParentNode(project.rootWBS, nodeId);
      if (!parentNode) return;

      const deepCloneNode = (node: WBSNode): WBSNode => ({
          ...node,
          id: Math.random().toString(36).substr(2, 9),
          items: node.items.map(i => ({ ...i, id: Math.random().toString(36).substr(2, 9) })),
          children: node.children.map(c => deepCloneNode(c))
      });
      const clonedNode = deepCloneNode(nodeToDuplicate);
      
      let nextCode = "1";
      if (parentNode.level === 0) nextCode = String(parentNode.children.length + 1);
      else nextCode = `${parentNode.code}.${parentNode.children.length + 1}`;

      const updatedClonedNode = updateDescendantCodes(clonedNode, clonedNode.code, nextCode);
      updatedClonedNode.code = nextCode;
      updatedClonedNode.name = `${nodeToDuplicate.name} (Copia)`;

      const updatedParent = { ...parentNode, children: [...parentNode.children, updatedClonedNode] };
      handleUpdateNode(updatedParent);
  };

  const handleMoveNode = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const isDescendant = (parent: WBSNode, targetId: string): boolean => {
        return parent.children.some(child => child.id === targetId || isDescendant(child, targetId));
    };
    const sourceNode = findNode(sourceId, project.rootWBS.children);
    if (!sourceNode) return; 
    if (isDescendant(sourceNode, targetId)) {
        notify("Non puoi spostare una categoria dentro una sua sottocategoria.", "warning");
        return;
    }

    const targetNode = findNode(targetId, project.rootWBS.children) || (project.rootWBS.id === targetId ? project.rootWBS : null);
    if (targetNode && targetNode.items.length > 0) {
        notify("La categoria di destinazione contiene voci. Le categorie con voci non possono avere sottocategorie.", "warning");
        return;
    }

    const removeNode = (node: WBSNode): WBSNode => {
        if (node.children.some(c => c.id === sourceId)) return { ...node, children: node.children.filter(c => c.id !== sourceId) };
        return { ...node, children: node.children.map(removeNode) };
    };

    const addNode = (node: WBSNode, nodeToAdd: WBSNode): WBSNode => {
        if (node.id === targetId) {
             let updatedNodeToAdd = { ...nodeToAdd, level: node.level + 1 };
             if (node.level > 0 && autoWBSCode) {
                 const itemNumber = node.children.length + 1;
                 const nextCode = `${node.code}.${itemNumber}`;
                 updatedNodeToAdd = updateDescendantCodes(updatedNodeToAdd, updatedNodeToAdd.code, nextCode);
                 updatedNodeToAdd.code = nextCode;
             }
             return { ...node, children: [...node.children, updatedNodeToAdd] };
        }
        return { ...node, children: node.children.map(c => addNode(c, nodeToAdd)) };
    };

    let newRoot = removeNode(project.rootWBS);
    newRoot = addNode(newRoot, sourceNode);
    updateProject({ ...project, rootWBS: newRoot });
  };
  
  const handleImportCategories = (targetNodeId: string, categories: PriceBookCategory[]) => {
      const targetId = targetNodeId || selectedNodeId || project.rootWBS.id;
      const targetNode = findNode(targetId, project.rootWBS.children) || (project.rootWBS.id === targetId ? project.rootWBS : null);
      if (!targetNode) return;

      const newNodes: WBSNode[] = [];
      let currentSiblingCount = targetNode.children.length;

      const convert = (pbCat: PriceBookCategory, level: number, parentCode: string, autoCode: boolean, siblingIndex: number): WBSNode => {
            const id = Math.random().toString(36).substr(2, 9);
            let code = pbCat.code;
            if (autoCode) {
                if (level === 1) code = String(siblingIndex + 1);
                else code = `${parentCode}.${siblingIndex + 1}`;
            }

            const items = pbCat.items.map((pbItem, idx) => {
                 const itemNumber = idx + 1;
                 const itemCodeSuffix = itemNumber.toString().padStart(2, '0');
                 const itemCode = autoItemCode ? (code ? `${code}.${itemCodeSuffix}` : itemCodeSuffix) : pbItem.code;
                 return {
                    id: Math.random().toString(36).substr(2, 9),
                    code: itemCode,
                    description: pbItem.description,
                    uom: pbItem.uom,
                    factor: 1,
                    length: 1,
                    area: 1,
                    height: 1,
                    weight: 1,
                    activeDimensions: getDefaultActiveDimensions(pbItem.uom),
                    qty: 1,
                    price: pbItem.price,
                    amount: pbItem.price, 
                    sourceBookId: (pbItem as any).sourceBookId,
                    sourceCode: (pbItem as any).sourceCode || pbItem.code,
                    sourceColor: (pbItem as any).categoryColor
                 } as CostItem;
            });

            const children = pbCat.children.map((child, idx) => 
                convert(child, level + 1, code, autoCode, idx)
            );
            return { id, code, name: pbCat.name, level, items, children };
      };

      categories.forEach(cat => {
          const newNode = convert(cat, targetNode.level + 1, targetNode.code, autoWBSCode, currentSiblingCount);
          newNodes.push(newNode);
          currentSiblingCount++;
      });

      handleUpdateNode({ ...targetNode, children: [...targetNode.children, ...newNodes] });
  };
  
  const handleImportCategory = (targetNodeId: string, pbCategory: PriceBookCategory) => {
      handleImportCategories(targetNodeId, [pbCategory]);
  };
  
  const handleImportItems = (targetNodeId: string, items: PriceBookItem[]) => {
      const targetNode = findNode(targetNodeId, project.rootWBS.children) || (project.rootWBS.id === targetNodeId ? project.rootWBS : null);
      if (!targetNode) return;
      
      if (targetNode.children.length > 0) {
          alert("Errore: Non puoi importare voci in una categoria che ha sottocategorie. Le voci possono essere inserite solo nelle categorie di ultimo livello.");
          return;
      }

      let newItems = [...targetNode.items];
      items.forEach(priceItem => {
          const newItem: CostItem = {
             id: Math.random().toString(36).substr(2, 9),
             code: '',
             description: priceItem.description,
             uom: priceItem.uom,
             factor: 1,
             length: 1,
             area: 1,
             height: 1,
             weight: 1,
             activeDimensions: getDefaultActiveDimensions(priceItem.uom),
             qty: 1,
             price: priceItem.price,
             amount: priceItem.price,
             sourceBookId: (priceItem as any).sourceBookId,
             sourceCode: priceItem.code,
             sourceColor: (priceItem as any).categoryColor
          };
          newItems.push(newItem);
      });

      if (autoItemCode) {
          newItems = newItems.map((item, index) => {
             const suffix = (index + 1).toString().padStart(2, '0');
             const code = targetNode.code ? `${targetNode.code}.${suffix}` : suffix;
             return { ...item, code };
          });
      }
      handleUpdateNode({ ...targetNode, items: newItems });
  };
  
  const handleAddContractorItem = () => {
    if (!selectedNode) {
      alert("Seleziona prima una categoria WBS.");
      return;
    }
    if (selectedNode.children.length > 0) {
      alert("Errore: Le voci possono essere inserite solo nelle categorie di ultimo livello.");
      return;
    }
    const itemNumber = selectedNode.items.length + 1;
    const itemCodeSuffix = itemNumber.toString().padStart(2, '0');
    const newCode = selectedNode.code ? `${selectedNode.code}.${itemCodeSuffix}` : itemCodeSuffix;
    const newItem: CostItem = {
      id: Math.random().toString(36).substr(2, 9),
      code: newCode,
      description: "Lavorazione proposta dalla ditta",
      uom: "cad",
      factor: 1,
      length: 1,
      area: 1,
      height: 1,
      weight: 1,
      activeDimensions: getDefaultActiveDimensions("cad"),
      qty: 1,
      price: 0,
      amount: 0,
      offerPrice: 0,
      offerDays: 1,
      offerNotes: "",
      isContractorItem: true
    };
    handleUpdateNode({ ...selectedNode, items: [...selectedNode.items, newItem] });
  };

  const handleRemoveItem = (itemId: string) => {
    if (!selectedNode) return;
    handleUpdateNode({ ...selectedNode, items: selectedNode.items.filter(i => i.id !== itemId) });
  };

  const calculateOfferTotals = (node: WBSNode) => {
    let totalAmount = 0;
    let totalMaterial = 0;
    let totalLabor = 0;
    let totalDays = 0;
    let itemCount = 0;
    const traverse = (n: WBSNode) => {
      n.items.forEach(item => {
        itemCount++;
        const qty = item.qty || 0;
        if (item.offerPrice) totalAmount += qty * item.offerPrice;
        if (item.offerMaterialPrice) totalMaterial += qty * item.offerMaterialPrice;
        if (item.offerLaborPrice) totalLabor += qty * item.offerLaborPrice;
        if (item.offerDays) totalDays += item.offerDays;
      });
      n.children.forEach(traverse);
    };
    traverse(node);
    return { totalAmount, totalMaterial, totalLabor, totalDays, itemCount };
  };

  const handleSortWBS = () => updateProject({ ...project, rootWBS: sortTreeByCode(project.rootWBS) });
  const handleSortItems = () => {
      if (!selectedNode) return;
      handleUpdateNode({ ...selectedNode, items: [...selectedNode.items].sort((a, b) => compareWbsCodes(a.code, b.code)) });
  };

  const moveItem = (sourceNodeId: string, targetNodeId: string, itemId: string) => {
    if (sourceNodeId === targetNodeId) return;
    let itemToMove: CostItem | undefined;
    
    const removeAndFind = (node: WBSNode): WBSNode => {
      const found = node.items.find(i => i.id === itemId);
      if (found) {
        itemToMove = found;
        return { ...node, items: node.items.filter(i => i.id !== itemId) };
      }
      return { ...node, children: node.children.map(removeAndFind) };
    };

    const addToTarget = (node: WBSNode): WBSNode => {
      if (node.id === targetNodeId && itemToMove) {
        let newCode = itemToMove.code;
        if (autoItemCode) {
            const itemNumber = node.items.length + 1;
            const itemCodeSuffix = itemNumber.toString().padStart(2, '0');
            newCode = node.code ? `${node.code}.${itemCodeSuffix}` : itemCodeSuffix;
        }
        return { ...node, items: [...node.items, { ...itemToMove, code: newCode }] };
      }
      return { ...node, children: node.children.map(addToTarget) };
    };

    let newRoot = removeAndFind(project.rootWBS);
    if (itemToMove) {
        newRoot = addToTarget(newRoot);
        updateProject({ ...project, rootWBS: newRoot });
    }
  };

  const handleDropItem = (targetNodeId: string, itemId: string) => {
    const targetNode = findNode(targetNodeId, project.rootWBS.children) || (project.rootWBS.id === targetNodeId ? project.rootWBS : null);
    if (targetNode && targetNode.children.length > 0) {
        alert("Errore: Non puoi spostare voci in una categoria che ha sottocategorie. Le voci possono essere inserite solo nelle categorie di ultimo livello.");
        return;
    }

    const findItemOwner = (node: WBSNode): string | null => {
      if (node.items.some(i => i.id === itemId)) return node.id;
      for (const child of node.children) {
        const found = findItemOwner(child);
        if (found) return found;
      }
      return null;
    };
    const sourceId = findItemOwner(project.rootWBS);
    if (sourceId) moveItem(sourceId, targetNodeId, itemId);
  };

  const handleMoveItemDirect = (currentIndex: number, direction: 'up' | 'down') => {
      if (!selectedNode || filterText) return;
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= selectedNode.items.length) return;
      const items = [...selectedNode.items];
      const [moved] = items.splice(currentIndex, 1);
      items.splice(targetIndex, 0, moved);

      const finalItems = items.map((item, index) => {
          if (autoItemCode) {
              const itemNumber = index + 1;
              const itemCodeSuffix = itemNumber.toString().padStart(2, '0');
              const newCode = selectedNode.code ? `${selectedNode.code}.${itemCodeSuffix}` : itemCodeSuffix;
              return { ...item, code: newCode };
          }
          return item;
      });
      handleUpdateNode({ ...selectedNode, items: finalItems });
  };

  const handleReorderItem = (sourceId: string, targetId: string) => {
      if (!selectedNode || filterText) return;
      const items = [...selectedNode.items];
      const sourceIndex = items.findIndex(i => i.id === sourceId);
      if (sourceIndex === -1 || sourceId === targetId) return;
      const [movedItem] = items.splice(sourceIndex, 1);
      const targetIndex = items.findIndex(i => i.id === targetId);
      if (targetIndex !== -1) items.splice(targetIndex, 0, movedItem);
      else items.push(movedItem);

      const finalItems = items.map((item, index) => {
          if (autoItemCode) {
              const itemNumber = index + 1;
              const itemCodeSuffix = itemNumber.toString().padStart(2, '0');
              const newCode = selectedNode.code ? `${selectedNode.code}.${itemCodeSuffix}` : itemCodeSuffix;
              return { ...item, code: newCode };
          }
          return item;
      });
      handleUpdateNode({ ...selectedNode, items: finalItems });
  };
  
  const handleMoveToEnd = (itemId: string) => {
      if (!selectedNode) return;
      const items = [...selectedNode.items];
      const sourceIndex = items.findIndex(i => i.id === itemId);
      if (sourceIndex === -1) return;
      const [movedItem] = items.splice(sourceIndex, 1);
      items.push(movedItem);
      
      const finalItems = items.map((item, index) => {
          if (autoItemCode) {
              const itemNumber = index + 1;
              const itemCodeSuffix = itemNumber.toString().padStart(2, '0');
              const newCode = selectedNode.code ? `${selectedNode.code}.${itemCodeSuffix}` : itemCodeSuffix;
              return { ...item, code: newCode };
          }
          return item;
      });
      handleUpdateNode({ ...selectedNode, items: finalItems });
  };

  const calculateMeasurementQty = (item: CostItem, m: any): number => {
      const { length, area, height, weight } = item.activeDimensions;
      const factor = m.factor || 1;
      if (!length && !area && !height && !weight) return factor; 
      let dimTotal = 1;
      if (length) dimTotal *= m.length;
      if (area) dimTotal *= m.area;
      if (height) dimTotal *= m.height;
      if (weight) dimTotal *= m.weight;
      return factor * dimTotal;
  };

  const calculateQty = (item: CostItem): number => {
      if (item.measurements && item.measurements.length > 0) {
          return item.measurements.reduce((sum, m) => sum + calculateMeasurementQty(item, m), 0);
      }
      return calculateMeasurementQty(item, item);
  };

  const handleAddItem = () => {
    if (!selectedNode) {
        notify("Seleziona prima una categoria.", "warning");
        return;
    }
    if (selectedNode.children.length > 0) {
        notify("Le voci possono essere inserite solo nelle categorie di ultimo livello.", "warning");
        return;
    }

    const itemNumber = selectedNode.items.length + 1;
    const itemCodeSuffix = itemNumber.toString().padStart(2, '0');
    const newCode = selectedNode.code ? `${selectedNode.code}.${itemCodeSuffix}` : itemCodeSuffix;

    const newItem: CostItem = {
      id: Math.random().toString(36).substr(2, 9),
      code: newCode,
      description: "Nuova voce",
      uom: "cad",
      factor: 1,
      length: 1,
      area: 1,
      height: 1,
      weight: 1,
      activeDimensions: getDefaultActiveDimensions("cad"),
      qty: 1,
      price: 0,
      amount: 0
    };
    handleUpdateNode({ ...selectedNode, items: [...selectedNode.items, newItem] });
  };

  const handleAddItemsFromPriceBook = (priceItems: (PriceBookItem & { sourceBookId?: string, categoryColor?: string })[], insertIndex: number | null = null) => {
     if (!selectedNode) {
         notify("Seleziona prima una categoria.", "warning");
         return;
     }

     if (selectedNode.children.length > 0) {
         notify("Le voci possono essere inserite solo nelle categorie di ultimo livello.", "warning");
         return;
     }
     
     const newCostItems = priceItems.map(priceItem => ({
         id: Math.random().toString(36).substr(2, 9),
         code: '',
         description: priceItem.description,
         uom: priceItem.uom,
         factor: 1,
         length: 1,
         area: 1,
         height: 1,
         weight: 1,
         activeDimensions: getDefaultActiveDimensions(priceItem.uom),
         qty: 1,
         price: priceItem.price,
         amount: priceItem.price,
         sourceBookId: priceItem.sourceBookId,
         sourceCode: priceItem.code,
         sourceColor: (priceItem as any).categoryColor
     }));

     let currentItems = [...selectedNode.items];
     if (insertIndex !== null && insertIndex >= 0 && insertIndex <= currentItems.length) {
         currentItems.splice(insertIndex, 0, ...newCostItems);
     } else {
         currentItems.push(...newCostItems);
     }

     if (autoItemCode) {
         currentItems = currentItems.map((item, index) => {
             const suffix = (index + 1).toString().padStart(2, '0');
             const code = selectedNode.code ? `${selectedNode.code}.${suffix}` : suffix;
             return { ...item, code };
         });
     }
     handleUpdateNode({ ...selectedNode, items: currentItems });
  };
  
  const handlePriceBookItemUpdate = (bookId: string, pbItem: PriceBookItem, oldCode?: string) => {
     if (!bookId) return;
     const updateNodeItems = (node: WBSNode): WBSNode => {
         let hasChanges = false;
         const newItems = node.items.map(item => {
             const isMatch = item.sourceBookId === bookId && (item.sourceCode === (oldCode || pbItem.code));
             if (isMatch) {
                 hasChanges = true;
                 const newItem = { ...item, description: pbItem.description, uom: pbItem.uom, price: pbItem.price, sourceCode: pbItem.code };
                 newItem.amount = newItem.qty * newItem.price;
                 return newItem;
             }
             return item;
         });
         const newChildren = node.children.map(updateNodeItems);
         if (hasChanges || newChildren.some((child, i) => child !== node.children[i])) {
             return { ...node, items: newItems, children: newChildren };
         }
         return node;
     };
     const newRoot = updateNodeItems(project.rootWBS);
     if (newRoot !== project.rootWBS) updateProject({ ...project, rootWBS: newRoot });
  };

  const handleCategoryColorUpdate = (bookId: string, itemCodes: string[], newColor: string) => {
      const updateNode = (node: WBSNode): WBSNode => {
          let hasChanges = false;
          const newItems = node.items.map(item => {
              if (item.sourceBookId === bookId && item.sourceCode && itemCodes.includes(item.sourceCode)) {
                  if (item.sourceColor !== newColor) {
                      hasChanges = true;
                      return { ...item, sourceColor: newColor };
                  }
              }
              return item;
          });
          const newChildren = node.children.map(updateNode);
          if (hasChanges || newChildren.some((child, i) => child !== node.children[i])) {
              return { ...node, items: newItems, children: newChildren };
          }
          return node;
      };
      
      const newRoot = updateNode(project.rootWBS);
      if (newRoot !== project.rootWBS) {
          updateProject({ ...project, rootWBS: newRoot });
      }
  };

  const handleUpdateItem = (item: CostItem, options: { uomChanged?: boolean, recalcQty?: boolean } = {}) => {
    if (!selectedNode) return;
    let updatedItem = { ...item };
    if (options.uomChanged) updatedItem.activeDimensions = getDefaultActiveDimensions(updatedItem.uom);
    if (options.recalcQty || options.uomChanged) updatedItem.qty = calculateQty(updatedItem);
    updatedItem.amount = updatedItem.qty * updatedItem.price;
    const updatedItems = selectedNode.items.map(i => i.id === item.id ? updatedItem : i);
    handleUpdateNode({ ...selectedNode, items: updatedItems });
  };

  const ensureMeasurements = (item: CostItem): CostItem => {
      if (!item.measurements || item.measurements.length === 0) {
          return {
              ...item,
              measurements: [{
                  id: Math.random().toString(36).substr(2, 9),
                  name: '',
                  factor: item.factor || 1,
                  length: item.length || 1,
                  area: item.area || 1,
                  height: item.height || 1,
                  weight: item.weight || 1,
                  qty: calculateMeasurementQty(item, item)
              }]
          };
      }
      return item;
  };

  const handleAddMeasurement = (item: CostItem) => {
      const itemWithMeas = ensureMeasurements(item);
      itemWithMeas.measurements = [
          ...(itemWithMeas.measurements || []),
          {
              id: Math.random().toString(36).substr(2, 9),
              name: '',
              factor: 1,
              length: 1,
              area: 1,
              height: 1,
              weight: 1,
              qty: 0
          }
      ];
      handleUpdateItem(itemWithMeas, {recalcQty: true});
  };

  const handleUpdateMeasurement = (item: CostItem, measId: string, updates: any) => {
      const itemWithMeas = ensureMeasurements(item);
      itemWithMeas.measurements = itemWithMeas.measurements?.map(m => {
          if (m.id === measId) {
              const updated = { ...m, ...updates };
              updated.qty = calculateMeasurementQty(itemWithMeas, updated);
              return updated;
          }
          return m;
      });
      handleUpdateItem(itemWithMeas, {recalcQty: true});
  };

  const handleRemoveMeasurement = (item: CostItem, measId: string) => {
      const itemWithMeas = ensureMeasurements(item);
      if (itemWithMeas.measurements!.length <= 1) return; // Prevent removing the last one
      itemWithMeas.measurements = itemWithMeas.measurements?.filter(m => m.id !== measId);
      handleUpdateItem(itemWithMeas, {recalcQty: true});
  };

  const toggleDimension = (item: CostItem, dim: keyof ActiveDimensions) => {
      const isActivating = !item.activeDimensions[dim];
      const newActive = { ...item.activeDimensions, [dim]: isActivating };
      let updatedItem = { ...item, activeDimensions: newActive };
      if (isActivating) {
          if (updatedItem.measurements && updatedItem.measurements.length > 0) {
              updatedItem.measurements = updatedItem.measurements.map(m => ({
                  ...m,
                  [dim]: (!m[dim] && m[dim] !== 0) || m[dim] === 0 ? 1 : m[dim]
              }));
          } else {
              if (!updatedItem[dim] || updatedItem[dim] === 0) {
                  (updatedItem as any)[dim] = 1;
              }
          }
      }
      handleUpdateItem(updatedItem, { recalcQty: true });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!selectedNode) return;
    const updatedItems = selectedNode.items.filter(i => i.id !== itemId);
    const resequencedItems = updatedItems.map((item, index) => {
        if (!autoItemCode) return item; 
        const itemCodeSuffix = (index + 1).toString().padStart(2, '0');
        const newCode = selectedNode.code ? `${selectedNode.code}.${itemCodeSuffix}` : itemCodeSuffix;
        return { ...item, code: newCode };
    });
    handleUpdateNode({ ...selectedNode, items: resequencedItems });
  };
  

  // EXPORT EXCEL
  const handleExportExcel = async () => {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const isSalModeActive = editorMode === 'SAL';
      
      // If we are in SAL mode and have multiple SALs selected, export all of them as separate sheets
      const salsToExport = (isSalModeActive && selectedSalIds.size > 1) 
        ? project.sals?.filter(s => selectedSalIds.has(s.id)).sort((a,b) => a.date - b.date)
        : (isSalModeActive && activeSalId ? [project.sals?.find(s => s.id === activeSalId)!] : []);

      if (isSalModeActive && salsToExport && salsToExport.length > 0) {
          salsToExport.forEach(sal => {
              const rows: any[] = [];
              rows.push(['Codice WBS', 'Categoria', 'Codice Voce', 'Descrizione', 'U.M.', `Q.tà ${sal.code}`, 'Prezzo', 'Importo', 'Rif. Prezzario']);
              
              const traverse = (node: WBSNode) => {
                  if (node.level > 0) {
                      rows.push([node.code, node.name, null, null, null, null, null, null, null]);
                  }
                  node.items.forEach(item => {
                      const qty = getSalQty(item.id, sal.id);
                      if (qty === 0) return;
                      rows.push([null, null, item.code, item.description, item.uom, qty, item.price, qty * item.price, item.sourceCode || '']);
                  });
                  node.children.forEach(traverse);
              };
              
              project.rootWBS.children.forEach(traverse);
              
              const calculateSalTotal = (node: WBSNode): number => {
                let total = node.items.reduce((acc, item) => acc + (getSalQty(item.id, sal.id) * item.price), 0);
                node.children.forEach(child => total += calculateSalTotal(child));
                return total;
              };
              
              const grandTotal = calculateSalTotal(project.rootWBS);
              rows.push([null, null, null, null, null, null, 'TOTALE SAL:', grandTotal, null]);
              
              const ws = XLSX.utils.aoa_to_sheet(rows);
              XLSX.utils.book_append_sheet(wb, ws, sal.code || sal.name.substring(0, 30));
          });
      } else {
          // Standard single sheet export (Estimate or Single Active SAL)
          const rows: any[] = [];
          const salName = isSalModeActive ? project.sals?.find(s => s.id === activeSalId)?.name : '';
          const qtyHeader = isSalModeActive ? `Q.tà ${salName}` : 'Q.tà';
          const amountHeader = isSalModeActive ? `Importo ${salName}` : 'Importo';

          rows.push(['Codice WBS', 'Categoria', 'Codice Voce', 'Descrizione', 'U.M.', qtyHeader, 'Prezzo', amountHeader, 'Rif. Prezzario']);
          
          const traverse = (node: WBSNode) => {
              if (node.level > 0) {
                  rows.push([node.code, node.name, null, null, null, null, null, null, null]);
              }
              node.items.forEach(item => {
                  const qty = isSalModeActive ? getSalQty(item.id) : item.qty;
                  if (isSalModeActive && qty === 0) return; 
                  rows.push([null, null, item.code, item.description, item.uom, qty, item.price, qty * item.price, item.sourceCode || '']);
              });
              node.children.forEach(traverse);
          };
          
          project.rootWBS.children.forEach(traverse);
          
          const calculateSalTotal = (node: WBSNode): number => {
              let total = node.items.reduce((acc, item) => acc + (getSalQty(item.id) * item.price), 0);
              node.children.forEach(child => total += calculateSalTotal(child));
              return total;
          };

          const calculateTotal = (node: WBSNode): number => {
            let total = node.items.reduce((acc, item) => acc + item.amount, 0);
            node.children.forEach(child => total += calculateTotal(child));
            return total;
          };

          const grandTotal = isSalModeActive ? calculateSalTotal(project.rootWBS) : calculateTotal(project.rootWBS);
          rows.push([null, null, null, null, null, null, 'TOTALE:', grandTotal, null]);

          const ws = XLSX.utils.aoa_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws, isSalModeActive ? "Contabilità" : "Computo Metrico");
      }

      const fileNamePrefix = isSalModeActive ? `${project.name}_sal_esportazione` : `${project.name}_computo`;
      XLSX.writeFile(wb, `${fileNamePrefix.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`);
  };

  // EXPORT EXCEL PER RICHIESTA PREVENTIVO DITTE (COMPUTO IN BIANCO)
  const handleExportRFQExcel = async () => {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const rows: any[] = [];
      
      // Header info
      rows.push(['RICHIESTA PREVENTIVO E CAPITOLATO D\'APPALTO (COMPUTO IN BIANCO)']);
      rows.push([`Progetto: ${project.name}`]);
      rows.push([`Descrizione: ${project.description || '-'}`]);
      rows.push([`Committente / Tecnico: ${currentUser}`]);
      rows.push([`Data Richiesta: ${new Date().toLocaleDateString('it-IT')}`]);
      rows.push(['ISTRUZIONI PER LA DITTA: Compilare la colonna "Prezzo Unitario Offerto (€)" e "Tempi Stimati (gg)" per ciascuna lavorazione.']);
      rows.push([]); // Empty line
      
      // Table column headers
      rows.push([
          'Codice WBS', 
          'Categoria', 
          'Codice Voce', 
          'Descrizione Lavorazione', 
          'U.M.', 
          'Quantità', 
          'Prezzo Unitario Offerto (€)', 
          'Tempi Stimati (giorni)', 
          'Importo Totale Offerto (€)', 
          'Note / Marca Proposta'
      ]);

      let rowCount = 8;
      const itemRows: number[] = [];

      const traverse = (node: WBSNode) => {
          if (node.level > 0) {
              rowCount++;
              rows.push([node.code, node.name, null, null, null, null, null, null, null, null]);
          }
          node.items.forEach(item => {
              rowCount++;
              itemRows.push(rowCount);
              rows.push([
                  null, 
                  null, 
                  item.code, 
                  item.description, 
                  item.uom, 
                  item.qty, 
                  '', // Left blank for contractor to enter price
                  '', // Left blank for contractor to enter days
                  { f: `F${rowCount}*G${rowCount}` }, // Auto formula Quantity * Offered Price
                  ''  // Notes / brand specs
              ]);
          });
          node.children.forEach(traverse);
      };

      project.rootWBS.children.forEach(traverse);

      // Summary lines
      rows.push([]);
      rowCount++;
      
      const sumFormula = itemRows.length > 0 
          ? `SUM(I${itemRows[0]}:I${itemRows[itemRows.length - 1]})`
          : '0';

      rows.push([null, null, null, null, null, 'TOTALE GENERALE OFFERTO (€):', '', '', { f: sumFormula }, null]);
      rows.push([null, null, null, null, null, 'TEMPO COMPLESSIVO ESECUZIONE (giorni):', '', '', '', null]);
      rows.push([]);
      rows.push(['SCHEDA ANAGRAFICA DITTA OFFERENTE']);
      rows.push(['Ragione Sociale Ditta:', '']);
      rows.push(['Partita IVA / Codice Fiscale:', '']);
      rows.push(['Sede Legale / Indirizzo:', '']);
      rows.push(['Referente / Tel / Email:', '']);
      rows.push(['Data Offerta:', '']);
      rows.push(['Firma e Timbro Legale Rappresentante:', '']);

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Column widths
      ws['!cols'] = [
          { wch: 12 }, // Codice WBS
          { wch: 20 }, // Categoria
          { wch: 14 }, // Codice Voce
          { wch: 50 }, // Descrizione
          { wch: 8 },  // U.M.
          { wch: 12 }, // Quantità
          { wch: 26 }, // Prezzo Unitario Offerto (€)
          { wch: 22 }, // Tempi Stimati (giorni)
          { wch: 26 }, // Importo Totale Offerto (€)
          { wch: 30 }  // Note / Specifiche
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Richiesta Preventivo");
      const cleanName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `${cleanName}_richiesta_preventivo_ditte.xlsx`;
      XLSX.writeFile(wb, fileName);
  };

  const rootDuplicates = project.rootWBS.children.map(c => c.code.trim()).filter((item, index, array) => array.indexOf(item) !== index && item !== "");
  const allCodes = getAllCodes(project.rootWBS.children);
  const duplicateCodes = [...new Set(allCodes.filter((item, index) => allCodes.indexOf(item) !== index))];
  const currentItemCodes = filteredItems.map(i => i.code.trim());
  const duplicateItemCodes = currentItemCodes.filter((c, i) => currentItemCodes.indexOf(c) !== i && c !== "");

  // Menu compatto della toolbar: raggruppa le funzioni secondarie.
  const toolbarSections: ToolbarMenuSection[] = [];

  if (!isDittaRole) {
    toolbarSections.push({
      title: 'Computo e documenti',
      items: [
        {
          id: 'price-analysis',
          label: 'Analisi Prezzi (EPU)',
          description: 'Elenco analisi e voci mancanti',
          icon: <FlaskConical size={16} />,
          onClick: () => setShowPriceAnalysisList(true),
        },
        {
          id: 'schedule',
          label: 'Cronoprogramma',
          description: 'Gantt e curva di avanzamento',
          icon: <BarChart3 size={16} />,
          onClick: () => setShowSchedule(true),
        },
        {
          id: 'documents',
          label: 'Documenti',
          description: 'Elenco prezzi e capitolato',
          icon: <FileText size={16} />,
          onClick: () => setShowDocuments(true),
        },
        {
          id: 'quadro-economico',
          label: 'Quadro Economico',
          description: 'SOA, ribasso e soglia anomalia',
          icon: <Landmark size={16} />,
          onClick: () => setShowQuadroEconomico(true),
        },
        {
          id: 'tools',
          label: 'Revisione, varianti, versioni',
          description: 'ISTAT, perizie, cronologia, XPWE',
          icon: <Wrench size={16} />,
          onClick: () => setShowTools(true),
        },
      ],
    });

    toolbarSections.push({
      title: 'Gestione',
      items: [
        {
          id: 'site-management',
          label: 'Gestione cantiere',
          description: 'Fornitori, scadenze, firme, fatture',
          icon: <Briefcase size={16} />,
          onClick: () => setShowSiteManagement(true),
        },
        {
          id: 'attachments',
          label: 'Allegati',
          description: 'Documenti e cartella cloud',
          icon: <Paperclip size={16} />,
          onClick: () => setShowAttachments(true),
        },
        {
          id: 'members',
          label: 'Membri & Permessi',
          description: canManageMembers ? 'Team e condivisione progetto' : 'Permesso non disponibile',
          icon: <Users size={16} />,
          onClick: () => {
            if (!canManageMembers) {
              notify('Non hai i permessi per gestire i membri del team.', 'warning');
              return;
            }
            setShowTeamModal(true);
          },
          disabled: !canManageMembers,
        },
      ],
    });

    toolbarSections.push({
      title: 'Ditte',
      items: [
        {
          id: 'rfq-excel',
          label: 'Preventivo Ditte — Excel',
          description: 'Modulo in bianco con formule',
          icon: <FileSpreadsheet size={16} />,
          onClick: () => handleExportRFQExcel(),
        },
        {
          id: 'rfq-print',
          label: 'Preventivo Ditte — Stampa',
          description: 'Modulo offerta da stampare o PDF',
          icon: <Printer size={16} />,
          onClick: () => {
            setIsRfqPrintMode(true);
            setShowPrintPreview(true);
          },
        },
        {
          id: 'offer-comparison',
          label: 'Confronto Offerte',
          description: 'Classifica e analisi delle offerte',
          icon: <Scale size={16} />,
          onClick: () => setShowOfferComparison(true),
          badge: project.offers?.length || 0,
        },
        {
          id: 'ditta-mode',
          label: isDittaMode ? 'Esci da Compilazione Ditta' : 'Compilazione Offerta Ditta',
          description: isDittaMode ? 'Torna alla modalità preventivo' : 'Compila l’offerta direttamente nel computo',
          icon: <Building2 size={16} />,
          onClick: () => setIsDittaMode(!isDittaMode),
        },
      ],
    });
  } else {
    toolbarSections.push({
      title: 'Gestione',
      items: [
        {
          id: 'attachments',
          label: 'Allegati',
          description: 'Documenti e cartella cloud',
          icon: <Paperclip size={16} />,
          onClick: () => setShowAttachments(true),
        },
      ],
    });

    if (isDittaMode) {
      toolbarSections.push({
        title: 'Offerta ditta',
        items: [
          {
            id: 'exit-ditta-mode',
            label: 'Esci da Compilazione Ditta',
            description: 'Torna alla modalità preventivo',
            icon: <Building2 size={16} />,
            onClick: () => setIsDittaMode(false),
          },
        ],
      });
    }
  }

  // Sidebar selection logic
  const handleSidebarMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('[data-node-id]')) return; 
      const container = sidebarContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;
      wbsSelectionStartPos.current = { x, y };
      setWbsSelectionRect({ x, y, w: 0, h: 0 });
      if (!e.ctrlKey && !e.shiftKey) setWbsSelectedIds(new Set());
  };
  const handleSidebarMouseMove = (e: React.MouseEvent) => {
      if (!wbsSelectionStartPos.current || !sidebarContainerRef.current) return;
      const container = sidebarContainerRef.current;
      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;
      const newRect = { x: Math.min(wbsSelectionStartPos.current.x, currentX), y: Math.min(wbsSelectionStartPos.current.y, currentY), w: Math.abs(currentX - wbsSelectionStartPos.current.x), h: Math.abs(currentY - wbsSelectionStartPos.current.y) };
      setWbsSelectionRect(newRect);
      const newSelection = new Set(e.ctrlKey || e.shiftKey ? wbsSelectedIds : []);
      const nodeElements = container.querySelectorAll('[data-node-id]');
      const selectAbsX = rect.left + newRect.x - container.scrollLeft;
      const selectAbsY = rect.top + newRect.y - container.scrollTop;
      nodeElements.forEach(el => {
          const nodeRect = el.getBoundingClientRect();
          const nodeId = el.getAttribute('data-node-id');
          if (!nodeId || nodeId === 'ROOT') return;
          const isIntersecting = !(nodeRect.right < selectAbsX || nodeRect.left > selectAbsX + newRect.w || nodeRect.bottom < selectAbsY || nodeRect.top > selectAbsY + newRect.h);
          if (isIntersecting) newSelection.add(nodeId);
      });
      setWbsSelectedIds(newSelection);
  };
  const handleSidebarMouseUp = () => { setWbsSelectionRect(null); wbsSelectionStartPos.current = null; };
  const handleItemListMouseDown = (e: React.MouseEvent) => { if (e.button !== 0) return; if ((e.target as HTMLElement).closest('[data-item-id]')) return; const container = itemsListRef.current; if (!container) return; const rect = container.getBoundingClientRect(); const x = e.clientX - rect.left + container.scrollLeft; const y = e.clientY - rect.top + container.scrollTop; setIsSelectingItems(true); itemSelectionStartPos.current = { x, y }; setItemSelectionRect({ x, y, w: 0, h: 0 }); if (!e.ctrlKey && !e.shiftKey) setSelectedItemIds(new Set()); };
  const handleItemListMouseMove = (e: React.MouseEvent) => { if (!isSelectingItems || !itemSelectionStartPos.current || !itemsListRef.current) return; const container = itemsListRef.current; const rect = container.getBoundingClientRect(); const currentX = e.clientX - rect.left + container.scrollLeft; const currentY = e.clientY - rect.top + container.scrollTop; const newRect = { x: Math.min(itemSelectionStartPos.current.x, currentX), y: Math.min(itemSelectionStartPos.current.y, currentY), w: Math.abs(currentX - itemSelectionStartPos.current.x), h: Math.abs(currentY - itemSelectionStartPos.current.y) }; setItemSelectionRect(newRect); const newSelection = new Set(e.ctrlKey || e.shiftKey ? selectedItemIds : []); const itemElements = container.querySelectorAll('[data-item-id]'); const selectAbsX = rect.left + newRect.x - container.scrollLeft; const selectAbsY = rect.top + newRect.y - container.scrollTop; itemElements.forEach(el => { const elRect = el.getBoundingClientRect(); const itemId = el.getAttribute('data-item-id'); if (!itemId) return; const isIntersecting = !(elRect.right < selectAbsX || elRect.left > selectAbsX + newRect.w || elRect.bottom < selectAbsY || elRect.top > selectAbsY + newRect.h); if (isIntersecting) newSelection.add(itemId); }); setSelectedItemIds(newSelection); };
  const handleItemListMouseUp = () => { setIsSelectingItems(false); setItemSelectionRect(null); itemSelectionStartPos.current = null; };
  const handleItemClick = (e: React.MouseEvent, itemId: string) => { e.stopPropagation(); const newSet = new Set(e.ctrlKey || e.metaKey ? selectedItemIds : []); if (newSet.has(itemId)) newSet.delete(itemId); else newSet.add(itemId); setSelectedItemIds(newSet); };
  
  return (
    <div className={`flex flex-col h-full ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
       <datalist id="uoms">{customUoms.map(u => <option key={u} value={u} />)}</datalist>

      {/* Main Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white no-print z-20 shadow-sm">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <button onClick={onClose} className="btn btn-ghost btn-icon shrink-0" title="Torna alla dashboard" aria-label="Torna alla dashboard">
            <ArrowLeft size={18} />
          </button>
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="btn btn-ghost btn-icon shrink-0" title={isSidebarOpen ? 'Nascondi pannello WBS' : 'Mostra pannello WBS'} aria-label="Pannello WBS">
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div className="min-w-0 flex-1 px-1">
            <div className="flex min-w-0 items-center gap-2">
               <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">{project.name}</h1>
               {canWrite && (
                 <button
                   onClick={openProjectInfoModal}
                   className="btn btn-ghost h-6 w-6 shrink-0 px-0 text-slate-400 hover:text-emerald-700"
                   title="Modifica nome e descrizione del computo"
                   aria-label="Modifica nome e descrizione del computo"
                 >
                   <Pencil size={13} />
                 </button>
               )}
               {isReadOnly && <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Sola Lettura</span>}
            </div>
            <div className="flex items-center gap-2 truncate text-[11px] text-slate-500">
              <span className="truncate">Utente: {currentUser}</span>
              {!isReadOnly && saving && <span className="flex shrink-0 items-center gap-1 text-emerald-600"><Save size={10} /> Salvataggio...</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <div className="hidden items-center rounded-lg bg-slate-100 sm:flex">
                <button onClick={handleUndo} disabled={historyIndex <= 0} className="btn btn-ghost h-8 w-8 rounded-r-none px-0" title="Annulla"><Undo size={16} /></button>
                <div className="h-5 w-px bg-slate-200"></div>
                <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="btn btn-ghost h-8 w-8 rounded-l-none px-0" title="Ripeti"><Redo size={16} /></button>
            </div>
            <button onClick={() => setShowUomModal(true)} className="btn btn-ghost btn-icon hidden sm:inline-flex" title="Unità di misura" aria-label="Unità di misura">
              <Ruler size={17} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2 sm:gap-2 sm:px-4">
            <div className="flex shrink-0 items-center rounded-lg bg-slate-100 p-1">
                <button 
                    onClick={() => setEditorMode('ESTIMATE')}
                    className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors sm:px-3 ${editorMode === 'ESTIMATE' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                    <Calculator size={15} /> Computo
                </button>
                <button 
                    onClick={() => {
                        setEditorMode('SAL');
                        if (!activeSalId && project.sals && project.sals.length > 0) {
                            setActiveSalId(project.sals[0].id);
                            setSelectedSalIds(new Set([project.sals[0].id]));
                        }
                    }}
                    className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors sm:px-3 ${editorMode === 'SAL' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                    <CheckCircle2 size={15} /><span className="hidden sm:inline">Contabilità (SAL)</span><span className="sm:hidden">SAL</span>
                </button>
            </div>

            <div className="hidden h-6 w-px shrink-0 bg-slate-200 md:block"></div>

            <button onClick={() => setShowPriceBook(!showPriceBook)} className={`btn btn-neutral shrink-0 ${showPriceBook ? '!border-emerald-200 !bg-emerald-50 !text-emerald-700' : ''}`} title="Prezzario">
                <BookOpen size={16} className={showPriceBook ? 'text-emerald-600' : 'text-slate-500'} />
                <span className="hidden md:inline">Prezzario</span>
            </button>

            <ToolbarMenu
                label="Menu"
                icon={<MenuIcon size={16} />}
                title="Funzioni del computo"
                sections={toolbarSections}
            />

            <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                <button onClick={() => { if (!canExport) { notify('Non hai i permessi per esportare.', 'warning'); return; } handleExportExcel(); }} disabled={!canExport} className="btn btn-primary" title="Esporta Excel"><FileSpreadsheet size={16} /> <span className="hidden sm:inline">{editorMode === 'SAL' && selectedSalIds.size > 1 ? `Esporta ${selectedSalIds.size} SAL` : 'Esporta Excel'}</span></button>
                <button onClick={() => {
                    if (!canExport) { notify('Non hai i permessi per stampare.', 'warning'); return; }
                    setIsRfqPrintMode(false);
                    setShowPrintPreview(true);
                }} disabled={!canExport} className="btn btn-neutral" title="Stampa / PDF"><Printer size={16} /> <span className="hidden sm:inline">Stampa</span></button>
            </div>
        </div>
      </div>
      
      <div className="relative flex flex-1 overflow-hidden">
        {/* Sidebar WBS */}
        <div 
          ref={sidebarContainerRef}
          className="bg-gray-50 border-r overflow-y-auto flex flex-col no-print relative group transition-[width] duration-300 ease-in-out select-none" 
          style={{ width: isSidebarOpen ? sidebarWidth : 0, maxWidth: '90vw' }}
          onMouseDown={handleSidebarMouseDown}
          onMouseMove={handleSidebarMouseMove}
          onMouseUp={handleSidebarMouseUp}
          onMouseLeave={handleSidebarMouseUp}
        >
          {wbsSelectionRect && (
            <div 
                className="absolute bg-emerald-500/10 border border-emerald-500 pointer-events-none z-50"
                style={{
                    left: wbsSelectionRect.x,
                    top: wbsSelectionRect.y,
                    width: wbsSelectionRect.w,
                    height: wbsSelectionRect.h
                }}
            />
          )}

          <div className="flex flex-col border-b sticky top-0 z-20 backdrop-blur-sm bg-slate-100/70 min-w-[260px]">
             <div className="flex justify-between items-center p-4 pb-2">
                <h2 className="font-bold text-gray-700 uppercase text-xs tracking-wider flex items-center gap-2"><FolderOpen size={16} className="text-gray-500" /> Struttura WBS</h2>
                <div className="flex gap-2">
                    <button onClick={() => setSidebarOpen(false)} className="p-1 rounded text-gray-500 hover:bg-gray-200"><ChevronLeft size={16} /></button>
                    <button onClick={() => setAutoWBSCode(!autoWBSCode)} className={`p-1.5 rounded border transition-colors ${autoWBSCode ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>{autoWBSCode ? <Hash size={14} /> : <Hash size={14} className="opacity-50" />}</button>
                    <button onClick={handleSortWBS} className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded text-xs font-medium text-gray-600 hover:text-accent-600"><ArrowDownAZ size={14} /> Ordina</button>
                </div>
            </div>
            {rootDuplicates.length > 0 && <div className="mx-4 mb-2 bg-red-100 border border-red-200 text-red-700 px-3 py-2 rounded text-xs flex items-center gap-2"><AlertTriangle size={14} /> <span><b>Codici duplicati:</b> {rootDuplicates.join(", ")}</span></div>}
          </div>
          <div className="p-4 flex-1 min-w-[260px]">
            <WBSTree 
                node={project.rootWBS} 
                selectedNodeId={selectedNodeId} 
                selectedNodeIds={wbsSelectedIds}
                onSelectNode={handleSelectNode} 
                onUpdateNode={handleUpdateNode} 
                onDeleteNode={initiateDeleteNode} 
                onDuplicateNode={handleDuplicateNode} 
                onDropItem={handleDropItem} 
                onMoveNode={handleMoveNode} 
                onImportCategory={handleImportCategory} 
                onImportCategories={handleImportCategories} 
                onImportItems={handleImportItems}
                onGetMultiSelectionData={getMultiSelectionData}
                isRoot={true} 
                duplicateCodes={duplicateCodes} 
            />
          </div>
          {isSidebarOpen && <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent-400 active:bg-accent-600 transition-colors z-50" onMouseDown={startResizing} />}
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {selectedNode ? (
            <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-hidden">
              <div className="mb-5 pb-5 border-b border-slate-200 shrink-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Codice WBS</label>
                    <input type="text" value={selectedNode.code} placeholder="Codice" onChange={(e) => handleUpdateNode({...selectedNode, code: e.target.value})} className="w-full border-b border-slate-300 text-lg font-mono font-bold text-slate-900 outline-none focus:border-emerald-500 sm:text-2xl"/>
                  </div>
                  <div className="flex-[3]">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Categoria</label>
                    <input type="text" value={selectedNode.name} onChange={(e) => handleUpdateNode({...selectedNode, name: e.target.value})} className="w-full border-b border-slate-300 text-lg font-bold text-slate-900 outline-none focus:border-emerald-500 sm:text-2xl"/>
                  </div>
                </div>
              </div>

              <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <h3 className="flex shrink-0 items-center gap-2 whitespace-nowrap text-base font-bold text-slate-700"><List size={18}/> Voci di Costo ({selectedNode.items.length})</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {isDittaMode && (
                      <button 
                        onClick={handleAddContractorItem}
                        className="btn btn-primary"
                      >
                        <Plus size={16} /> <span className="hidden sm:inline">Nuova Lavorazione Proposta (Ditta)</span><span className="sm:hidden">Proposta</span>
                      </button>
                    )}
                     {editorMode === 'SAL' && (
                         <>
                             <button 
                                 onClick={() => setHideCompleted(!hideCompleted)}
                                 className={`btn ${hideCompleted ? '!border-slate-300 !bg-slate-100 !text-slate-700' : 'btn-neutral'}`}
                                 title={hideCompleted ? "Mostra voci completate nei SAL precedenti" : "Nascondi voci già completate"}
                             >
                                 {hideCompleted ? <EyeOff size={16} /> : <Eye size={16} />}
                                 <span className="hidden sm:inline">{hideCompleted ? "Mostra Completati" : "Nascondi Completati"}</span>
                             </button>
                             <button 
                                 onClick={() => setPreventOver100(!preventOver100)}
                                 className={`btn ${preventOver100 ? '!border-emerald-200 !bg-emerald-50 !text-emerald-700' : 'btn-neutral'}`}
                                 title={preventOver100 ? "Blocco al 100% Attivo (Cumulativo)" : "Blocco al 100% Disattivato"}
                             >
                                 {preventOver100 ? <ShieldCheck size={16} /> : <Shield size={16} />}
                                 <span className="hidden sm:inline">Blocca {">"}100%</span>
                             </button>
                         </>
                     )}
                     <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                          type="text" 
                          placeholder="Filtra voci..." 
                          className="w-full rounded-full border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 sm:w-48"
                          value={filterText}
                          onChange={(e) => setFilterText(e.target.value)}
                        />
                     </div>
                     <button onClick={() => setAutoItemCode(!autoItemCode)} className={`p-1.5 rounded border transition-colors ${autoItemCode ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`} title={autoItemCode ? "Codici Automatici" : "Codici Manuali"}>
                         {autoItemCode ? <Hash size={16} /> : <Hash size={16} className="opacity-50" />}
                     </button>
                     <button onClick={handleSortItems} className="btn btn-neutral btn-icon" title="Riordina Voci"><ArrowDownAZ size={16} /></button>
                     <button onClick={handleAddItem} className="btn btn-primary"><Plus size={16} /> <span className="hidden sm:inline">Nuova Voce</span><span className="sm:hidden">Voce</span></button>
                  </div>
              </div>
              
              {/* Items List Header */}
              <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
              <div className="flex min-h-0 flex-1 min-w-[860px] flex-col sm:min-w-0">
                            {/* VOCI TABLE HEADERS */}
              {isDittaMode ? (
                <div className="grid grid-cols-[30px_60px_2.5fr_40px_50px_90px_60px_90px_1fr_40px] gap-2 p-2.5 pb-2 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 items-center">
                  <div className="text-center">#</div>
                  <div>Codice</div>
                  <div>Descrizione Lavorazione</div>
                  <div className="text-center">U.M.</div>
                  <div className="text-right">Q.tà</div>
                  <div className="text-right text-emerald-800 font-bold">Prezzo Off. (€)</div>
                  <div className="text-center text-emerald-700 font-bold">Tempi (gg)</div>
                  <div className="text-right text-emerald-700 font-bold">Imp. Offerto (€)</div>
                  <div>Note / Marca Proposta</div>
                  <div></div>
                </div>
              ) : editorMode === 'ESTIMATE' ? (
                  <div className="grid grid-cols-[45px_60px_90px_2fr_35px_45px_75px_75px_80px_90px_30px] gap-2 p-2.5 pb-2 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 items-center">
                      <div className="text-center">#</div>
                      <div>Codice</div>
                      <div>Rif.</div>
                      <div>Descrizione</div>
                      <div className="text-center">U.M.</div>
                      <div className="text-right">Q.tà</div>
                      <div className="text-right text-gray-700 font-bold">Mat. (€)</div>
                      <div className="text-right text-gray-700 font-bold">Man. (€)</div>
                      <div className="text-right text-gray-900 font-bold">Prezzo (€)</div>
                      <div className="text-right text-gray-900 font-bold">Importo (€)</div>
                      <div></div>
                  </div>
              ) : (
                  // SAL Grid Layout
                  <div className="grid grid-cols-[30px_60px_3fr_40px_70px_60px_70px_80px_60px_80px] gap-4 pb-2 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0 pr-2 items-end">
                      <div className="text-center">#</div>
                      <div>Codice</div>
                      <div>Descrizione</div>
                      <div className="text-center">U.M.</div>
                      <div className="text-right text-gray-400 leading-tight">Q.tà<br/>Residua</div>
                      <div className="text-center text-emerald-400 leading-tight">Rif.<br/>SAL Prec.</div>
                      <div className="text-right text-gray-400 leading-tight">Q.tà<br/>Preced.</div>
                      <div className="text-right text-emerald-600 font-bold leading-tight">Q.tà<br/>Attuale</div>
                      <div className="text-right">%</div>
                      <div className="text-right leading-tight">Importo<br/>Cumul.</div>
                  </div>
              )}

              {/* Items List */}
              <div 
                  ref={itemsListRef}
                  className="flex-1 overflow-y-auto pr-2 pb-20 relative select-none"
                  onMouseDown={handleItemListMouseDown}
                  onMouseMove={handleItemListMouseMove}
                  onMouseUp={handleItemListMouseUp}
                  onMouseLeave={handleItemListMouseUp}
                  onDragOver={(e) => {
                      if (editorMode === 'SAL') return;
                      e.preventDefault();
                      if (e.dataTransfer.types.includes("application/edil-price-book-items") || 
                          e.dataTransfer.types.includes("application/edil-price-book-item") ||
                          e.dataTransfer.types.includes("application/edil-items")) {
                          e.dataTransfer.dropEffect = "copy";
                      }
                  }}
                  onDrop={(e) => {
                      if (editorMode === 'SAL' || e.defaultPrevented) return;
                      e.preventDefault();
                      const itemsData = e.dataTransfer.getData("application/edil-items");
                      if (itemsData) return;
                      const pbItemsData = e.dataTransfer.getData("application/edil-price-book-items");
                      if (pbItemsData) {
                          try {
                              const newItems = JSON.parse(pbItemsData);
                              handleAddItemsFromPriceBook(newItems); 
                          } catch (err) { console.error(err); }
                          return;
                      }
                      const pbItemData = e.dataTransfer.getData("application/edil-price-book-item");
                      if (pbItemData) {
                          try {
                              const newItem = JSON.parse(pbItemData);
                              handleAddItemsFromPriceBook([newItem]); 
                          } catch (err) { console.error(err); }
                      }
                  }}
              >
                  {itemSelectionRect && (
                      <div 
                          className="absolute bg-emerald-500/20 border border-emerald-500 pointer-events-none z-50"
                          style={{ left: itemSelectionRect.x, top: itemSelectionRect.y, width: itemSelectionRect.w, height: itemSelectionRect.h }}
                      />
                  )}

                  {selectedNode.items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-100 rounded-lg mt-4 pointer-events-none">
                          <p className="mb-2">Nessuna voce in questa categoria</p>
                          <button onClick={(e) => { e.stopPropagation(); handleAddItem(); }} className="text-accent-600 hover:underline text-sm font-medium pointer-events-auto">Aggiungi la prima voce</button>
                      </div>
                  ) : (
                    <div className="space-y-1 mt-2">
                        {filteredItems.map((item, index) => {
                           const isDragOver = dragOverItemIndex === index;
                           const isDuplicate = duplicateItemCodes.includes(item.code.trim());
                           const isSelected = selectedItemIds.has(item.id);
                           const refStyle = item.sourceColor ? { backgroundColor: item.sourceColor, color: '#1f2937' } : {};
                           
                           const salQty = editorMode === 'SAL' ? getSalQty(item.id) : 0;
                           const salAmount = salQty * item.price;
                           const inSal = editorMode === 'SAL' && salQty > 0;
                           const isSalClosed = editorMode === 'SAL' && activeSal?.status === 'CLOSED';
                           
                           const prevSalInfo = editorMode === 'SAL' ? getPreviousSalInfo(item.id) : { qty: 0, code: '-' };
                           const cumulativeQty = (editorMode === 'SAL' ? prevSalInfo.qty : 0) + salQty;
                           const progressPercent = item.qty > 0 ? (cumulativeQty / item.qty) * 100 : 0;

                           const isCompletedInPrev = prevSalInfo.qty >= item.qty;
                           const remainingQty = item.qty - prevSalInfo.qty;

                           if (editorMode === 'SAL' && hideCompleted && isCompletedInPrev) {
                               return null;
                           }

                                                       if (isDittaMode) {
                                const isContractorAdded = item.isContractorItem === true;
                                const offerPrice = item.offerPrice ?? '';
                                const offerDays = item.offerDays ?? '';
                                const offerNotes = item.offerNotes ?? '';
                                const offerAmount = (item.qty || 0) * (item.offerPrice || 0);

                                return (
                                    <div 
                                       key={item.id}
                                       className={`grid grid-cols-[30px_60px_2.5fr_40px_50px_90px_60px_90px_1fr_40px] gap-2 items-start p-2.5 border rounded hover:shadow-sm transition-all text-xs
                                         ${isContractorAdded ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-gray-200'}
                                       `}
                                    >
                                       <div className="text-center text-gray-400 pt-1 font-mono">{index + 1}</div>
                                       <div className="font-mono text-gray-700 font-bold truncate pt-1" title={item.code}>{item.code}</div>
                                       
                                       <div>
                                           {isContractorAdded ? (
                                               <textarea
                                                   rows={1}
                                                   value={item.description}
                                                   onChange={(e) => handleUpdateItem({...item, description: e.target.value})}
                                                   className="w-full text-xs border-b border-emerald-300 focus:border-emerald-600 outline-none bg-transparent resize-none font-medium"
                                                   placeholder="Descrizione lavorazione proposta..."
                                               />
                                           ) : (
                                               <div className="text-xs text-gray-800 leading-normal font-medium">{item.description}</div>
                                           )}
                                           {isContractorAdded && (
                                               <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.2 rounded inline-block mt-0.5">Voce Aggiunta dalla Ditta</span>
                                           )}
                                       </div>

                                       <div className="text-center pt-1">
                                           {isContractorAdded ? (
                                               <input
                                                   type="text"
                                                   value={item.uom}
                                                   onChange={(e) => handleUpdateItem({...item, uom: e.target.value})}
                                                   className="w-full text-center border-b border-emerald-300 outline-none text-xs bg-transparent"
                                               />
                                           ) : (
                                               <span className="text-gray-600 font-medium">{item.uom}</span>
                                           )}
                                       </div>

                                       <div className="text-right font-semibold pt-1 text-gray-700">
                                           {isContractorAdded ? (
                                               <input
                                                   type="number"
                                                   value={item.qty}
                                                   onChange={(e) => handleUpdateItem({...item, qty: parseFloat(e.target.value) || 0})}
                                                   className="w-full text-right border-b border-emerald-300 outline-none text-xs bg-transparent font-bold"
                                               />
                                           ) : (
                                               <span>{Number(item.qty).toLocaleString('it-IT', {maximumFractionDigits:2})}</span>
                                           )}
                                       </div>

                                       <div>
                                           <div className="relative">
                                               <span className="absolute left-1 top-1 text-[10px] text-emerald-400 font-mono">€</span>
                                               <input
                                                   type="number"
                                                   value={offerPrice}
                                                   placeholder="0.00"
                                                   onChange={(e) => {
                                                       const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                                       handleUpdateItem({...item, offerPrice: val});
                                                   }}
                                                   className="w-full text-right font-bold text-xs text-emerald-950 bg-emerald-50/80 border border-emerald-300 rounded pl-4 pr-1.5 py-1 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                                               />
                                           </div>
                                       </div>

                                       <div>
                                           <input
                                               type="number"
                                               value={offerDays}
                                               placeholder="gg"
                                               onChange={(e) => {
                                                   const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                                   handleUpdateItem({...item, offerDays: val});
                                               }}
                                               className="w-full text-center text-xs text-emerald-950 bg-emerald-50/80 border border-emerald-300 rounded px-1 py-1 focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                                           />
                                       </div>

                                       <div className="text-right font-bold text-xs pt-1 text-emerald-800 tabular-nums">
                                           € {offerAmount.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                       </div>

                                       <div>
                                           <input
                                               type="text"
                                               value={offerNotes}
                                               placeholder="Note / Marca proposta..."
                                               onChange={(e) => handleUpdateItem({...item, offerNotes: e.target.value})}
                                               className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-emerald-400 bg-white"
                                           />
                                       </div>

                                       <div className="text-center pt-1">
                                           {isContractorAdded ? (
                                               <button
                                                   onClick={() => handleRemoveItem(item.id)}
                                                   className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                                                   title="Elimina voce proposta da ditta"
                                               >
                                                   <Trash2 size={14} />
                                               </button>
                                           ) : (
                                               <span className="text-[10px] text-gray-300 italic" title="Voce base non modificabile da ditta">Base</span>
                                           )}
                                       </div>
                                    </div>
                                );
                            }

                            if (editorMode === 'SAL') {
                               return (
                                   <div 
                                      key={item.id}
                                      className={`grid grid-cols-[30px_60px_3fr_40px_70px_60px_70px_80px_60px_80px] gap-4 items-center p-3 border rounded hover:shadow-sm transition-all text-sm
                                        ${inSal ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}
                                        ${isCompletedInPrev ? 'opacity-60 bg-gray-50' : ''}
                                      `}
                                   >
                                      <div className="text-center text-xs text-gray-400">{index + 1}</div>
                                      <div className="font-mono text-xs text-gray-600 font-bold truncate" title={item.code}>{item.code}</div>
                                      <div className="text-sm truncate" title={item.description}>{item.description}</div>
                                      <div className="text-center text-xs">{item.uom}</div>
                                      
                                      <div className="text-right text-gray-500 tabular-nums font-medium">
                                          {remainingQty.toLocaleString('it-IT', {maximumFractionDigits:2})}
                                      </div>

                                      <div className="text-center text-xs text-emerald-500 font-mono bg-emerald-50 rounded px-1 py-0.5 border border-emerald-100">
                                          {prevSalInfo.qty > 0 ? prevSalInfo.code : '-'}
                                      </div>
                                      
                                      <div className="text-right text-gray-400 tabular-nums">
                                          {prevSalInfo.qty > 0 ? prevSalInfo.qty.toLocaleString('it-IT', {maximumFractionDigits:2}) : '-'}
                                      </div>

                                      <div className="relative">
                                          {isCompletedInPrev && isSalClosed ? (
                                              <div className="text-right text-gray-400 italic text-xs pr-2">Completato</div>
                                          ) : (
                                              <input 
                                                type="number" 
                                                value={salQty || ''}
                                                placeholder="0"
                                                onChange={(e) => handleUpdateSalQty(item.id, parseFloat(e.target.value) || 0, item.qty)}
                                                disabled={!activeSalId || isSalClosed || (isCompletedInPrev && !preventOver100)} 
                                                className={`w-full text-right font-bold text-emerald-700 bg-white border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none tabular-nums 
                                                    ${isSalClosed ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}
                                                    ${salQty > remainingQty && preventOver100 ? 'text-red-600 bg-red-50 border-red-300' : ''}
                                                `}
                                              />
                                          )}
                                      </div>

                                      <div className="text-right text-xs font-bold tabular-nums">
                                          <span className={`${progressPercent >= 100 ? 'text-emerald-600' : progressPercent > 100 ? 'text-red-500' : 'text-gray-500'}`}>
                                              {progressPercent.toFixed(0)}%
                                          </span>
                                      </div>

                                      <div className="text-right font-bold text-sm text-gray-800 tabular-nums">
                                          € {salAmount.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                      </div>
                                   </div>
                               );
                           }

                           return (
                              <div 
                                key={item.id} 
                                data-item-id={item.id}
                                draggable={!filterText}
                                onClick={(e) => handleItemClick(e, item.id)}
                                onDragStart={(e) => {
                                    if(filterText) return;
                                    e.stopPropagation();
                                    if (!selectedItemIds.has(item.id)) {
                                        setSelectedItemIds(new Set([item.id]));
                                        e.dataTransfer.setData("application/edil-item-id", item.id);
                                        e.dataTransfer.setData("application/edil-items", JSON.stringify([item]));
                                    } else {
                                        const itemsToDrag = selectedNode.items.filter(i => selectedItemIds.has(i.id));
                                        e.dataTransfer.setData("application/edil-items", JSON.stringify(itemsToDrag));
                                        e.dataTransfer.setData("application/edil-item-id", item.id);
                                    }
                                    e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(e) => {
                                    if(filterText) return;
                                    e.preventDefault();
                                    setDragOverItemIndex(index);
                                }}
                                onDragEnd={() => setDragOverItemIndex(null)}
                                onDrop={(e) => {
                                    if(filterText) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const sourceId = e.dataTransfer.getData("application/edil-item-id");
                                    if (sourceId && sourceId !== item.id) {
                                        handleReorderItem(sourceId, item.id);
                                        setDragOverItemIndex(null);
                                        return;
                                    }
                                    const pbItemsData = e.dataTransfer.getData("application/edil-price-book-items");
                                    if (pbItemsData) {
                                        try {
                                            const newItems = JSON.parse(pbItemsData);
                                            handleAddItemsFromPriceBook(newItems, index);
                                        } catch (err) { console.error(err); }
                                        setDragOverItemIndex(null);
                                        return;
                                    }
                                    const pbItemData = e.dataTransfer.getData("application/edil-price-book-item");
                                    if (pbItemData) {
                                        try {
                                            const newItem = JSON.parse(pbItemData);
                                            handleAddItemsFromPriceBook([newItem], index);
                                        } catch (err) { console.error(err); }
                                    }
                                    setDragOverItemIndex(null);
                                }}
                                className={`grid grid-cols-[45px_60px_90px_2fr_35px_45px_75px_75px_80px_90px_30px] gap-2 items-start p-2.5 bg-white border rounded hover:shadow-sm transition-all group group/item
                                    ${isDragOver ? 'border-t-4 border-t-accent-500' : isSelected ? 'border-accent-500 bg-accent-50/30 ring-1 ring-accent-500' : 'border-gray-200'}
                                    ${item.qty === 0 ? 'opacity-75' : ''}
                                `}
                              >
                                  <div className="flex flex-col items-center gap-0.5 pt-1 text-gray-400 group-hover/item:text-gray-600">
                                      <div className="flex items-center gap-0.5">
                                          <div 
                                              className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-emerald-600"
                                              title="Trascina per riordinare"
                                          >
                                              <GripVertical size={13} />
                                          </div>
                                          <div className="flex flex-col -my-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                              {index > 0 && (
                                                  <button 
                                                      type="button" 
                                                      onClick={(e) => { e.stopPropagation(); handleMoveItemDirect(index, 'up'); }}
                                                      className="p-0.5 hover:text-emerald-600 hover:bg-gray-100 rounded"
                                                      title="Sposta su"
                                                  >
                                                      <ChevronUp size={11} />
                                                  </button>
                                              )}
                                              {index < (selectedNode?.items.length || 0) - 1 && (
                                                  <button 
                                                      type="button" 
                                                      onClick={(e) => { e.stopPropagation(); handleMoveItemDirect(index, 'down'); }}
                                                      className="p-0.5 hover:text-emerald-600 hover:bg-gray-100 rounded"
                                                      title="Sposta giù"
                                                  >
                                                      <ChevronDown size={11} />
                                                  </button>
                                              )}
                                          </div>
                                      </div>
                                      <span className="text-[10px] font-mono font-medium">{index + 1}</span>
                                  </div>
                                  
                                  <div className="relative">
                                     <input 
                                        type="text" 
                                        value={item.code} 
                                        onChange={(e) => handleUpdateItem({...item, code: e.target.value})} 
                                        readOnly={autoItemCode}
                                        className={`w-full font-mono text-sm border-b border-transparent focus:border-accent outline-none bg-transparent ${isDuplicate ? 'text-red-600 font-bold' : 'text-gray-600'}`}
                                        title={isDuplicate ? "Codice Duplicato!" : ""}
                                     />
                                     {isDuplicate && <AlertTriangle size={12} className="text-red-500 absolute -right-2 top-0" />}
                                  </div>

                                  <div className="flex items-start">
                                      {item.sourceCode && (
                                          <div 
                                              className="bg-gray-100 border border-gray-200 text-gray-700 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded w-full text-center break-all whitespace-normal leading-tight shadow-2xs" 
                                              title={`Voce prezzario: ${item.sourceCode}`}
                                              style={refStyle}
                                          >
                                              {item.sourceCode}
                                          </div>
                                      )}
                                  </div>
                                  
                                  <div className="flex flex-col gap-1">
                                      <textarea 
                                        rows={Math.max(1, Math.ceil(item.description.length / 60))}
                                        value={item.description}
                                        onChange={(e) => handleUpdateItem({...item, description: e.target.value})}
                                        className="w-full text-sm border-b border-transparent focus:border-accent outline-none bg-transparent resize-none leading-relaxed"
                                        placeholder="Descrizione..."
                                      />
                                      
                                      <div className="flex flex-col gap-2 mt-1 bg-gray-50 p-2 rounded border border-gray-100 hidden group-focus-within/item:flex">
                                          <div className="flex items-center justify-between mb-1">
                                              <div className="font-bold text-gray-400 text-[10px] uppercase tracking-wider">Dettaglio Misure</div>
                                              <div className="flex gap-1">
                                                  <button onClick={() => toggleDimension(item, 'length')} className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${item.activeDimensions.length ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-white text-gray-400'}`}>Lunghezza</button>
                                                  <button onClick={() => toggleDimension(item, 'area')} className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${item.activeDimensions.area ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-white text-gray-400'}`}>Larghezza/Area</button>
                                                  <button onClick={() => toggleDimension(item, 'height')} className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${item.activeDimensions.height ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-white text-gray-400'}`}>Altezza</button>
                                                  <button onClick={() => toggleDimension(item, 'weight')} className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${item.activeDimensions.weight ? 'bg-slate-50 border-slate-200 text-slate-700 font-bold' : 'bg-white text-gray-400'}`}>Peso/Spec.</button>
                                              </div>
                                          </div>
                                          
                                          {(item.measurements && item.measurements.length > 0 ? item.measurements : [{...item, id: 'default', name: ''}]).map((m, idx) => (
                                              <div key={m.id} className="flex flex-wrap items-center gap-1">
                                                  <input 
                                                      type="text" 
                                                      value={m.name || ''} 
                                                      onChange={(e) => {
                                                          if (item.measurements) {
                                                              handleUpdateMeasurement(item, m.id, {name: e.target.value});
                                                          } else {
                                                              const withMeas = ensureMeasurements(item);
                                                              withMeas.measurements[0].name = e.target.value;
                                                              handleUpdateItem(withMeas, {recalcQty: true});
                                                          }
                                                      }} 
                                                      className="w-24 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 focus:border-accent outline-none bg-white" 
                                                      placeholder={`Misura ${idx+1}`} 
                                                  />
                                                  <div className="flex items-center gap-1 px-1">
                                                      <span className="text-[10px] text-gray-500 font-medium">P.U.</span>
                                                      <input type="number" value={m.factor} onChange={(e) => item.measurements ? handleUpdateMeasurement(item, m.id, {factor: parseFloat(e.target.value) || 0}) : handleUpdateItem({...item, factor: parseFloat(e.target.value) || 0}, {recalcQty: true})} className="w-12 border rounded px-1 text-center bg-white font-bold" />
                                                  </div>
                                                  <input 
                                                      type="number" 
                                                      value={item.activeDimensions.length ? (m.length ?? '') : ''} 
                                                      disabled={!item.activeDimensions.length}
                                                      onChange={(e) => {
                                                          const val = parseFloat(e.target.value) || 0;
                                                          if (item.measurements) handleUpdateMeasurement(item, m.id, {length: val});
                                                          else handleUpdateItem({...item, length: val}, {recalcQty: true});
                                                      }} 
                                                      className={`w-14 border rounded px-1 text-right text-[11px] transition-colors ${
                                                          item.activeDimensions.length 
                                                              ? 'bg-white border-emerald-300 ring-1 ring-emerald-200 text-gray-900 font-medium' 
                                                              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                                      }`} 
                                                      placeholder={item.activeDimensions.length ? "L (m)" : "L (off)"} 
                                                      title={item.activeDimensions.length ? "Lunghezza" : "Attiva 'Lunghezza' in alto per modificare"}
                                                  />
                                                  <input 
                                                      type="number" 
                                                      value={item.activeDimensions.area ? (m.area ?? '') : ''} 
                                                      disabled={!item.activeDimensions.area}
                                                      onChange={(e) => {
                                                          const val = parseFloat(e.target.value) || 0;
                                                          if (item.measurements) handleUpdateMeasurement(item, m.id, {area: val});
                                                          else handleUpdateItem({...item, area: val}, {recalcQty: true});
                                                      }} 
                                                      className={`w-14 border rounded px-1 text-right text-[11px] transition-colors ${
                                                          item.activeDimensions.area 
                                                              ? 'bg-white border-emerald-300 ring-1 ring-emerald-200 text-gray-900 font-medium' 
                                                              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                                      }`} 
                                                      placeholder={item.activeDimensions.area ? "W/Area" : "W (off)"} 
                                                      title={item.activeDimensions.area ? "Larghezza/Area" : "Attiva 'Larghezza/Area' in alto per modificare"}
                                                  />
                                                  <input 
                                                      type="number" 
                                                      value={item.activeDimensions.height ? (m.height ?? '') : ''} 
                                                      disabled={!item.activeDimensions.height}
                                                      onChange={(e) => {
                                                          const val = parseFloat(e.target.value) || 0;
                                                          if (item.measurements) handleUpdateMeasurement(item, m.id, {height: val});
                                                          else handleUpdateItem({...item, height: val}, {recalcQty: true});
                                                      }} 
                                                      className={`w-14 border rounded px-1 text-right text-[11px] transition-colors ${
                                                          item.activeDimensions.height 
                                                              ? 'bg-white border-emerald-300 ring-1 ring-emerald-200 text-gray-900 font-medium' 
                                                              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                                      }`} 
                                                      placeholder={item.activeDimensions.height ? "H (m)" : "H (off)"} 
                                                      title={item.activeDimensions.height ? "Altezza" : "Attiva 'Altezza' in alto per modificare"}
                                                  />
                                                  <input 
                                                      type="number" 
                                                      value={item.activeDimensions.weight ? (m.weight ?? '') : ''} 
                                                      disabled={!item.activeDimensions.weight}
                                                      onChange={(e) => {
                                                          const val = parseFloat(e.target.value) || 0;
                                                          if (item.measurements) handleUpdateMeasurement(item, m.id, {weight: val});
                                                          else handleUpdateItem({...item, weight: val}, {recalcQty: true});
                                                      }} 
                                                      className={`w-14 border rounded px-1 text-right text-[11px] transition-colors ${
                                                          item.activeDimensions.weight 
                                                              ? 'bg-white border-slate-400 ring-1 ring-slate-200 text-gray-900 font-medium' 
                                                              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                                                      }`} 
                                                      placeholder={item.activeDimensions.weight ? "Peso" : "P (off)"} 
                                                      title={item.activeDimensions.weight ? "Peso/Spec." : "Attiva 'Peso/Spec.' in alto per modificare"}
                                                  />
                                                  
                                                  <div className="flex items-center ml-2 border-l pl-2 text-[10px] text-gray-500 font-mono overflow-hidden whitespace-nowrap">
                                                      {(() => {
                                                          const parts = [];
                                                          if (m.factor !== 1) parts.push(m.factor || 0);
                                                          if (item.activeDimensions.length) parts.push(m.length || 0);
                                                          if (item.activeDimensions.area) parts.push(m.area || 0);
                                                          if (item.activeDimensions.height) parts.push(m.height || 0);
                                                          if (item.activeDimensions.weight) parts.push(m.weight || 0);
                                                          
                                                          const total = calculateMeasurementQty(item, m);
                                                          
                                                          if (parts.length <= 1) {
                                                              return <span>= <strong className="text-gray-800">{total.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>;
                                                          }
                                                          
                                                          return <span>{parts.join(' × ')} = <strong className="text-gray-800">{total.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></span>;
                                                      })()}
                                                  </div>
                                                  
                                                  {item.measurements && item.measurements.length > 1 && (
                                                      <button onClick={(e) => { e.preventDefault(); handleRemoveMeasurement(item, m.id); }} className="ml-auto text-gray-400 hover:text-red-500 border border-transparent hover:border-red-200 rounded bg-white p-0.5"><X size={12} /></button>
                                                  )}
                                              </div>
                                          ))}
                                          
                                          <button onClick={(e) => { e.preventDefault(); handleAddMeasurement(item); }} className="text-[10px] text-accent-600 font-medium flex items-center gap-1 mt-1 hover:underline w-fit">
                                              <Plus size={10} /> Aggiungi riga di misura
                                          </button>
                                      </div>
                                  </div>

                                  <div className="flex items-start justify-center pt-0.5">
                                      <input 
                                        type="text" 
                                        value={item.uom} 
                                        onChange={(e) => handleUpdateItem({...item, uom: e.target.value}, {uomChanged: true})}
                                        list="uoms"
                                        className="w-full text-xs text-center border-b border-transparent focus:border-accent outline-none bg-transparent"
                                      />
                                  </div>

                                  <div className="flex items-start justify-end pt-0.5">
                                      <input 
                                        type="number" 
                                        value={Number(item.qty).toFixed(2)} 
                                        readOnly
                                        className="w-full text-xs text-right font-medium bg-gray-50 rounded px-1 text-gray-700 select-none cursor-default focus:outline-none"
                                        tabIndex={-1}
                                      />
                                  </div>

                                  {/* Materiali (€) */}
                                  <div className="flex items-start justify-end pt-0.5">
                                      <input 
                                        type="number" 
                                        value={item.materialPrice ?? ''} 
                                        placeholder="Mat."
                                        onChange={(e) => {
                                            const newMat = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                            const curLab = item.laborPrice || 0;
                                            const newPrice = (newMat || 0) + curLab;
                                            handleUpdateItem({
                                                ...item,
                                                materialPrice: newMat,
                                                price: newPrice
                                            }, {recalcQty: false});
                                        }}
                                        className="w-full text-xs text-right border-b border-gray-200 focus:border-accent outline-none bg-transparent font-medium tabular-nums px-1 py-0.5"
                                        title="Costo unitario materiale base"
                                      />
                                  </div>

                                  {/* Manodopera (€) */}
                                  <div className="flex items-start justify-end pt-0.5">
                                      <input 
                                        type="number" 
                                        value={item.laborPrice ?? ''} 
                                        placeholder="Man."
                                        onChange={(e) => {
                                            const newLab = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                            const curMat = item.materialPrice || 0;
                                            const newPrice = curMat + (newLab || 0);
                                            handleUpdateItem({
                                                ...item,
                                                laborPrice: newLab,
                                                price: newPrice
                                            }, {recalcQty: false});
                                        }}
                                        className="w-full text-xs text-right border-b border-gray-200 focus:border-accent outline-none bg-transparent font-medium tabular-nums px-1 py-0.5"
                                        title="Costo unitario manodopera base"
                                      />
                                  </div>

                                  {/* Prezzo Totale (€) */}
                                  <div className="flex items-start justify-end pt-0.5">
                                      <div className="relative w-full">
                                          <span className="absolute left-0 top-0.5 text-[10px] text-gray-400">€</span>
                                          <input 
                                            type="number" 
                                            value={item.price} 
                                            onChange={(e) => handleUpdateItem({...item, price: parseFloat(e.target.value) || 0}, {recalcQty: false})}
                                            className="w-full text-xs text-right border-b border-transparent focus:border-accent outline-none bg-transparent font-medium pl-2.5"
                                            title="Prezzo unitario totale"
                                          />
                                      </div>
                                  </div>

                                  <div className="text-right font-bold text-xs pt-1 text-gray-800 tabular-nums">
                                      € {item.amount.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                  </div>

                                  <div className="flex flex-col gap-1 items-end opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => setPriceAnalysisItem(item)}
                                        className={`p-1 rounded hover:bg-emerald-50 ${item.priceAnalysis ? 'text-emerald-600 hover:text-emerald-700' : 'text-gray-400 hover:text-emerald-600'}`}
                                        title={item.priceAnalysis ? 'Analisi prezzo (EPU) disponibile — modifica' : 'Analisi prezzo (EPU)'}
                                      >
                                          <FlaskConical size={14} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteItem(item.id)} 
                                        className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                                        title="Elimina"
                                      >
                                          <Trash2 size={14} />
                                      </button>
                                      <button 
                                        onClick={() => handleMoveToEnd(item.id)} 
                                        className="p-1 text-gray-400 hover:text-emerald-500 rounded hover:bg-emerald-50"
                                        title="Sposta in fondo"
                                      >
                                          <AlignEndVertical size={14} />
                                      </button>
                                  </div>
                              </div>
                           );
                        })}
                    </div>
                  )}
                  {/* Total Footer Sticky */}
                  <div className="sticky bottom-0 bg-white border-t p-4 mt-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] flex justify-between items-center z-10">
                      <div className="flex flex-col">
                          <div className="text-sm text-gray-500">
                              {editorMode === 'SAL' ? `Totale Categoria (SAL: ${activeSal?.name || '-'})` : `Totale Categoria (${selectedNode.items.length} voci)`}
                          </div>
                          {editorMode === 'SAL' && (
                              <div className="text-xs text-emerald-600 font-bold">
                                  {(() => {
                                      const catEstimateTotal = selectedNode.items.reduce((acc, i) => acc + i.amount, 0);
                                      const catSalTotal = selectedNode.items.reduce((acc, i) => acc + (getSalQty(i.id) * i.price), 0);
                                      const catPercent = catEstimateTotal > 0 ? (catSalTotal / catEstimateTotal) * 100 : 0;
                                      return `Avanzamento Categoria: ${catPercent.toFixed(2)}%`;
                                  })()}
                              </div>
                          )}
                      </div>
                      <div className={`text-xl font-bold ${editorMode === 'SAL' ? 'text-emerald-700' : 'text-accent-700'}`}>
                          € {selectedNode.items.reduce((acc, i) => {
                              if (isDittaMode) {
                                  return acc + ((i.qty || 0) * (i.offerPrice || 0));
                              }
                              if (editorMode === 'SAL') {
                                  return acc + (getSalQty(i.id) * i.price);
                              }
                              return acc + i.amount;
                          }, 0).toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </div>
                  </div>
              </div>
              </div>
              </div>
            </div>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 px-6 text-center text-slate-400">
                 <FolderOpen size={44} className="mb-4 opacity-50" />
                 <p className="text-base font-semibold text-slate-600">Seleziona una categoria WBS</p>
                 <p className="text-sm">o creane una nuova dal menu a sinistra</p>
             </div>
          )}
        </div>

        {editorMode === 'SAL' && (
            <SALManager 
              project={project} 
              activeSalId={activeSalId} 
              selectedSalIds={selectedSalIds}
              onSetSelectedSals={setSelectedSalIds}
              onUpdateProject={canEditSAL ? updateProject : () => { notify('Non hai i permessi per modificare i SAL.', 'warning'); }} 
              onSetActiveSal={setActiveSalId} 
            />
        )}
        
        {showPriceBook && (
            <div className="absolute inset-y-0 right-0 z-40 flex max-w-[100vw] shadow-2xl">
              <PriceBookPanel 
                onClose={() => setShowPriceBook(false)}
                onPriceBookItemUpdate={handlePriceBookItemUpdate}
                onCategoryColorUpdate={handleCategoryColorUpdate}
                onAddItems={(items) => handleAddItemsFromPriceBook(items)}
                onAddCategory={(cat) => handleImportCategory(selectedNode ? selectedNode.id : project.rootWBS.id, cat)}
                onImportCategories={(cats) => handleImportCategories(selectedNode ? selectedNode.id : project.rootWBS.id, cats)}
                externalImportData={priceBookImportData}
                onClearExternalImport={() => setPriceBookImportData(null)}
                books={priceBooks}
                onUpdateBooks={canEditPriceBooks ? handleUpdatePriceBooks : () => { notify('Non hai i permessi per modificare i prezzari.', 'warning'); }}
              />
            </div>
        )}
      </div>


      {showPrintPreview && (
          <PrintPreview 
            project={project} 
            editorMode={editorMode} 
            activeSalId={activeSalId} 
            currentUser={currentUser} 
            onClose={() => {
                setShowPrintPreview(false);
                setIsRfqPrintMode(false);
            }} 
            initialRFQMode={isRfqPrintMode}
          />
      )}

      {nodeToDelete && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">Elimina Categoria</h3>
            <p className="mb-6 text-gray-700">Sei sicuro di voler eliminare questa categoria? L'operazione non può essere annullata ed eliminerà anche tutte le sottocategorie e voci associate.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setNodeToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-medium">Annulla</button>
              <button onClick={confirmDeleteNode} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50">Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* BARRA TOTALE OFFERTA DITTA */}
      {isDittaMode && (
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-3 border-t border-slate-800 flex flex-wrap gap-3 justify-between items-center text-xs font-sans shrink-0 shadow-lg no-print">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-emerald-400" />
              <span className="font-bold uppercase tracking-wider text-slate-300">Riepilogo Offerta Ditta</span>
            </div>
            {project.contractorDetails?.companyName && (
              <div className="text-slate-300 font-medium">
                Ditta: <strong className="text-white">{project.contractorDetails.companyName}</strong>
              </div>
            )}
          </div>
          <div className="flex items-center gap-6">
            {(() => {
              const { totalAmount, totalMaterial, totalLabor, totalDays, itemCount } = calculateOfferTotals(project.rootWBS);
              return (
                <>
                  <div className="text-right">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Voci Compilate</span>
                    <span className="font-mono font-bold text-sm text-white">{itemCount} lavorazioni</span>
                  </div>
                  {totalMaterial > 0 && (
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Tot. Materiali</span>
                      <span className="font-mono font-bold text-xs text-emerald-100">€ {totalMaterial.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {totalLabor > 0 && (
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Tot. Manodopera</span>
                      <span className="font-mono font-bold text-xs text-emerald-100">€ {totalLabor.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  )}
                  {totalDays > 0 && (
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Tempo Stimato Totale</span>
                      <span className="font-mono font-bold text-sm text-slate-200">{totalDays} giorni</span>
                    </div>
                  )}
                  <div className="text-right pl-4 border-l border-slate-800">
                    <span className="text-emerald-400 block text-[10px] uppercase font-bold">Totale Generale Offerto (escl. IVA)</span>
                    <span className="font-mono font-bold text-lg text-emerald-300">€ {totalAmount.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODALE MODIFICA NOME/DESCRIZIONE COMPUTO */}
      {showProjectInfoModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2 font-bold text-base">
                <Pencil size={18} className="text-emerald-300" />
                Nome e descrizione del computo
              </div>
              <button onClick={() => setShowProjectInfoModal(false)} className="text-slate-300 hover:text-white" aria-label="Chiudi">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveProjectInfo} className="p-5 space-y-4 overflow-y-auto text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nome Computo</label>
                <input
                  autoFocus
                  type="text"
                  value={projectNameDraft}
                  onChange={(e) => setProjectNameDraft(e.target.value)}
                  className="field"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Descrizione</label>
                <textarea
                  value={projectDescDraft}
                  onChange={(e) => setProjectDescDraft(e.target.value)}
                  className="field h-28 resize-none"
                  placeholder="Descrizione del computo"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setShowProjectInfoModal(false)} className="btn btn-neutral">Annulla</button>
                <button type="submit" className="btn btn-primary">Salva</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODALE DOCUMENTI */}
      {showDocuments && (
        <DocumentsModal
          project={project}
          canExport={canExport}
          onClose={() => setShowDocuments(false)}
        />
      )}

      {/* MODALE STRUMENTI */}
      {showTools && (
        <ToolsModal
          project={project}
          selectedNode={selectedNode}
          canEdit={canWrite}
          onUpdateProject={(updated) => updateProject(updated)}
          onClose={() => setShowTools(false)}
        />
      )}

      {/* MODALE ALLEGATI */}
      {showAttachments && (
        <AttachmentsModal
          project={project}
          canEdit={canWrite}
          canExport={canExport}
          onUpdateProject={(updated) => updateProject(updated)}
          onClose={() => setShowAttachments(false)}
        />
      )}

      {/* MODALE QUADRO ECONOMICO */}
      {showQuadroEconomico && (
        <QuadroEconomicoModal
          project={project}
          canEdit={canWrite}
          canExport={canExport}
          onUpdateProject={(updated) => updateProject(updated)}
          onClose={() => setShowQuadroEconomico(false)}
        />
      )}

      {/* MODALE GESTIONE CANTIERE */}
      {showSiteManagement && (
        <SiteManagementModal
          project={project}
          canEdit={canWrite}
          canExport={canExport}
          onUpdateProject={(updated) => updateProject(updated)}
          onClose={() => setShowSiteManagement(false)}
        />
      )}

      {/* MODALE CRONOPROGRAMMA */}
      {showSchedule && (
        <ScheduleModal
          project={project}
          canEdit={canWrite}
          canExport={canExport}
          onUpdateProject={(updated) => updateProject(updated)}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {/* MODALE ELENCO ANALISI PREZZI */}
      {showPriceAnalysisList && (
        <PriceAnalysisListModal
          project={project}
          canExport={canExport}
          onClose={() => setShowPriceAnalysisList(false)}
        />
      )}

      {/* MODALE ANALISI PREZZO (EPU) */}
      {priceAnalysisItem && (
        <PriceAnalysisModal
          item={priceAnalysisItem}
          canEdit={canWrite}
          canExport={canExport}
          onClose={() => setPriceAnalysisItem(null)}
          onSave={(analysis, applyPrice) => {
            const currentItem = selectedNode?.items.find(i => i.id === priceAnalysisItem.id) || priceAnalysisItem;
            const updated: CostItem = { ...currentItem, priceAnalysis: analysis };

            if (applyPrice) {
              const directCost = analysis.rows.reduce((sum, row) => sum + (row.quantity || 0) * (row.unitPrice || 0), 0);
              const overhead = directCost * (analysis.overheadsPercent || 0) / 100;
              const profit = (directCost + overhead) * (analysis.profitPercent || 0) / 100;
              const epu = directCost + overhead + profit;
              const materialTotal = analysis.rows.filter(r => r.type === 'material').reduce((sum, r) => sum + (r.quantity || 0) * (r.unitPrice || 0), 0);
              const laborTotal = analysis.rows.filter(r => r.type === 'labor').reduce((sum, r) => sum + (r.quantity || 0) * (r.unitPrice || 0), 0);

              updated.price = Math.round(epu * 100) / 100;
              updated.materialPrice = materialTotal > 0 ? Math.round(materialTotal * 100) / 100 : undefined;
              updated.laborPrice = laborTotal > 0 ? Math.round(laborTotal * 100) / 100 : undefined;
            }

            handleUpdateItem(updated, { recalcQty: false });
            setPriceAnalysisItem(null);
          }}
        />
      )}

      {/* MODALE CONFRONTO OFFERTE DITTE */}
      {showOfferComparison && (
        <OfferComparisonModal
          project={project}
          canEdit={canWrite}
          canExport={canExport}
          onUpdateProject={(updated) => updateProject(updated)}
          onClose={() => setShowOfferComparison(false)}
        />
      )}

      {/* MODALE ANAGRAFICA DITTA */}
      {showDittaModal && (
        <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2 font-bold text-base">
                <Building2 size={20} className="text-emerald-300" />
                Anagrafica e Note Ditta Offerente
              </div>
              <button onClick={() => setShowDittaModal(false)} className="text-slate-300 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Ragione Sociale Ditta *</label>
                <input 
                  type="text" 
                  value={project.contractorDetails?.companyName || ''}
                  onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), companyName: e.target.value } })}
                  placeholder="Es. Impresa Edile Rossi S.r.l."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">P.IVA / Cod. Fiscale</label>
                  <input 
                    type="text" 
                    value={project.contractorDetails?.vatNumber || ''}
                    onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), vatNumber: e.target.value } })}
                    placeholder="IT01234567890"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Referente Lavori</label>
                  <input 
                    type="text" 
                    value={project.contractorDetails?.contactPerson || ''}
                    onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), contactPerson: e.target.value } })}
                    placeholder="Geom. Mario Rossi"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Indirizzo Sede Legale</label>
                <input 
                  type="text" 
                  value={project.contractorDetails?.address || ''}
                  onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), address: e.target.value } })}
                  placeholder="Via Roma 123, 00100 Roma"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Telefono / Cellulare</label>
                  <input 
                    type="text" 
                    value={project.contractorDetails?.phone || ''}
                    onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), phone: e.target.value } })}
                    placeholder="+39 06 1234567"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email / PEC</label>
                  <input 
                    type="email" 
                    value={project.contractorDetails?.email || ''}
                    onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), email: e.target.value } })}
                    placeholder="info@impresarossi.it"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Validità Offerta (Giorni)</label>
                  <input 
                    type="number" 
                    value={project.contractorDetails?.validityDays || 60}
                    onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), validityDays: parseInt(e.target.value, 10) || 60 } })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Tempo Esecuzione Totale (gg)</label>
                  <input 
                    type="number" 
                    value={project.contractorDetails?.totalDays || ''}
                    onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), totalDays: parseInt(e.target.value, 10) || undefined } })}
                    placeholder="es. 120"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Note e Condizioni Particolari dell'Offerta</label>
                <textarea 
                  rows={3}
                  value={project.contractorDetails?.notes || ''}
                  onChange={(e) => updateProject({ ...project, contractorDetails: { ...(project.contractorDetails || {}), notes: e.target.value } })}
                  placeholder="Indicare eventuali condizioni di pagamento, esclusioni, o precisazioni sul preventivo..."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-end">
              <button 
                onClick={() => setShowDittaModal(false)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-sm shadow-sm"
              >
                Salva Dati Ditta
              </button>
            </div>
          </div>
        </div>
      )}

      {showTeamModal && (
        <TeamManagementModal 
          project={project} 
          currentUserEmail={currentUser} 
          onSave={async (updatedProject) => {
             try {
               await saveProject(updatedProject);
               updateProject(updatedProject, { bypassPermissions: true });
             } catch (err) {
               console.error("Errore salvataggio team:", err);
             }
          }} 
          onClose={() => setShowTeamModal(false)} 
        />
      )}

      {showUomModal && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-bold text-lg">Unità di Misura</h2>
              <button onClick={() => setShowUomModal(false)} className="text-gray-500 hover:text-gray-800"><X size={20} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
               <div className="flex gap-2 mb-4">
                   <input 
                     type="text" 
                     id="new-uom-input" 
                     placeholder="Nuova U.M. (es. mq, ml, a corpo)" 
                     className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
                     onKeyDown={(e) => {
                         if (e.key === 'Enter') {
                             const val = e.currentTarget.value.trim();
                             if (val && !customUoms.includes(val)) {
                                 setCustomUoms([...customUoms, val]);
                                 e.currentTarget.value = '';
                             }
                         }
                     }}
                   />
                   <button 
                     onClick={() => {
                        const input = document.getElementById('new-uom-input') as HTMLInputElement;
                        if (input) {
                             const val = input.value.trim();
                             if (val && !customUoms.includes(val)) {
                                 setCustomUoms([...customUoms, val]);
                                 input.value = '';
                             }
                        }
                     }}
                     className="bg-emerald-600 text-white px-3 py-2 rounded font-bold hover:bg-emerald-700 text-sm"
                   >Aggiungi</button>
               </div>
               <div className="space-y-2">
                  {customUoms.map(uom => (
                      <div key={uom} className="flex justify-between items-center bg-gray-50 p-2 rounded border border-gray-200">
                          <span className="font-medium text-gray-800">{uom}</span>
                          <button onClick={() => setCustomUoms(customUoms.filter(u => u !== uom))} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Elimina"><Trash2 size={16} /></button>
                      </div>
                  ))}
                  {customUoms.length === 0 && <div className="text-center text-gray-500 text-sm py-4">Nessuna unità di misura.</div>}
               </div>
            </div>
          </div>
        </div>
      )}

      {categoryToRename && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-[160] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h3 className="font-bold text-base mb-3 text-gray-800">Rinomina Categoria</h3>
            <input 
              autoFocus
              type="text" 
              value={categoryToRename.name} 
              onChange={(e) => setCategoryToRename({ ...categoryToRename, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && categoryToRename.name.trim()) {
                  const targetNode = findNode(categoryToRename.id, project.rootWBS.children) || (project.rootWBS.id === categoryToRename.id ? project.rootWBS : null);
                  if (targetNode) handleUpdateNode({ ...targetNode, name: categoryToRename.name.trim() });
                  setCategoryToRename(null);
                } else if (e.key === 'Escape') {
                  setCategoryToRename(null);
                }
              }}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCategoryToRename(null)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded">Annulla</button>
              <button 
                onClick={() => {
                  if (categoryToRename.name.trim()) {
                    const targetNode = findNode(categoryToRename.id, project.rootWBS.children) || (project.rootWBS.id === categoryToRename.id ? project.rootWBS : null);
                    if (targetNode) handleUpdateNode({ ...targetNode, name: categoryToRename.name.trim() });
                  }
                  setCategoryToRename(null);
                }} 
                className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {toastNotification && (
        <div className="fixed bottom-5 right-5 z-[200] max-w-md animate-fade-in shadow-2xl rounded-xl border p-4 bg-white flex items-center gap-3">
          <div className={`p-2 rounded-full shrink-0 ${
            toastNotification.type === 'error' ? 'bg-red-100 text-red-600' :
            toastNotification.type === 'warning' ? 'bg-amber-100 text-amber-600' :
            toastNotification.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
            'bg-emerald-100 text-emerald-600'
          }`}>
            <AlertCircle size={18} />
          </div>
          <div className="flex-1 text-xs text-gray-800 font-medium">
            {toastNotification.message}
          </div>
          <button onClick={() => setToastNotification(null)} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={14} />
          </button>
        </div>
      )}

    </div>
  );
};