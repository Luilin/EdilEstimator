import React, { useState, useMemo, useRef, useEffect } from 'react';
import { WBSNode, PriceBookCategory, PriceBookItem } from '../types';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Trash2, CornerDownLeft, Copy, Edit2, Check, X } from 'lucide-react';

interface WBSTreeProps {
  node: WBSNode;
  selectedNodeId: string | null;
  selectedNodeIds?: Set<string>; // Added for multi-selection
  onSelectNode: (node: WBSNode, multi?: boolean) => void;
  onUpdateNode: (updatedNode: WBSNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDropItem: (targetNodeId: string, itemId: string) => void;
  onMoveNode: (sourceId: string, targetId: string) => void;
  onImportCategory?: (targetNodeId: string, categoryData: PriceBookCategory) => void;
  onImportCategories?: (targetNodeId: string, categoriesData: PriceBookCategory[]) => void;
  onImportItems?: (targetNodeId: string, itemsData: PriceBookItem[]) => void;
  onGetMultiSelectionData?: (ids: string[]) => WBSNode[]; // Callback to get full data for multi-drag
  isRoot?: boolean;
  duplicateCodes?: string[];
}

// Helper to calculate total recursively for display
const calculateNodeTotal = (node: WBSNode): number => {
  let total = node.items.reduce((acc, item) => acc + (item.amount || 0), 0);
  node.children.forEach(child => {
    total += calculateNodeTotal(child);
  });
  return total;
};

export const WBSTree: React.FC<WBSTreeProps> = ({ 
  node, 
  selectedNodeId, 
  selectedNodeIds,
  onSelectNode, 
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onDropItem,
  onMoveNode,
  onImportCategory,
  onImportCategories,
  onImportItems,
  onGetMultiSelectionData,
  isRoot = false,
  duplicateCodes = []
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [dragType, setDragType] = useState<'item' | 'node' | null>(null);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editCode, setEditCode] = useState(node.code);
  const [editName, setEditName] = useState(node.name);
  const inputNameRef = useRef<HTMLInputElement>(null);

  // Memoize total calculation to avoid unnecessary re-renders
  const nodeTotal = useMemo(() => calculateNodeTotal(node), [node]);
  
  // Check if this node's code is a duplicate
  const isDuplicate = node.code && duplicateCodes.includes(node.code);

  useEffect(() => {
    if (isEditing && inputNameRef.current) {
        inputNameRef.current.focus();
    }
  }, [isEditing]);

  const handleDragStart = (e: React.DragEvent) => {
    if (isEditing) {
        e.preventDefault();
        return;
    }
    e.stopPropagation();
    
    // Check if dragging part of a multi-selection
    const isMultiDragging = selectedNodeIds && selectedNodeIds.has(node.id) && selectedNodeIds.size > 1;
    
    if (isMultiDragging && onGetMultiSelectionData && selectedNodeIds) {
        // Multi-select drag logic
        const ids = Array.from(selectedNodeIds);
        e.dataTransfer.setData("application/stimia-node-ids", JSON.stringify(ids));
        
        // Serialize FULL DATA for all selected nodes for external drops
        const multiNodesData = onGetMultiSelectionData(ids);
        e.dataTransfer.setData("application/stimia-wbs-nodes-data", JSON.stringify(multiNodesData));
    } else {
        // Single node logic
        e.dataTransfer.setData("application/stimia-node-id", node.id);
        e.dataTransfer.setData("application/stimia-wbs-node-data", JSON.stringify(node));
        // Also send singular array for compatibility
        e.dataTransfer.setData("application/stimia-wbs-nodes-data", JSON.stringify([node]));
    }

    e.dataTransfer.effectAllowed = "move";

    // Create custom ghost drag image
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: absolute; top: -1000px; left: -1000px;
      background: white; border: 1px solid #6366f1;
      padding: 8px 12px; border-radius: 6px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.15);
      z-index: 9999; pointer-events: none;
      font-family: sans-serif; font-size: 12px; font-weight: 600;
      display: flex; align-items: center; gap: 8px; color: #374151;
      width: max-content;
    `;
    
    if (isMultiDragging) {
        ghost.innerHTML = `<span style="background:#e0e7ff; color:#4338ca; padding:2px 6px; border-radius:4px;">${selectedNodeIds?.size}</span> Categorie`;
    } else {
        ghost.innerHTML = `<span style="background:#e0e7ff; color:#4338ca; padding:2px 6px; border-radius:4px; font-family: monospace;">${node.code}</span> ${node.name}`;
    }
    
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    
    // Cleanup ghost element after browser takes snapshot
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isHovering) {
        setIsHovering(true);
        // Detect what is being dragged based on data types
        const types = Array.from(e.dataTransfer.types);
        if (types.includes("application/stimia-item-id") || types.includes("application/stimia-price-book-items") || types.includes("application/stimia-pb-item-id") || types.includes("application/stimia-items")) {
            setDragType('item');
            e.dataTransfer.dropEffect = "move";
        } else if (types.includes("application/stimia-node-id")) {
            setDragType('node');
            e.dataTransfer.dropEffect = "move";
        } else if (types.includes("application/stimia-price-book-category") || types.includes("application/stimia-price-book-categories")) {
            setDragType('node'); // Treat import as a node drop visually
            e.dataTransfer.dropEffect = "copy";
        }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Critical fix: prevent flickering when dragging over children elements
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
    }
    
    setIsHovering(false);
    setDragType(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovering(false);
    setDragType(null);
    
    const itemId = e.dataTransfer.getData("application/stimia-item-id");
    const itemsData = e.dataTransfer.getData("application/stimia-items"); // Local multi-item drag
    
    const draggedNodeId = e.dataTransfer.getData("application/stimia-node-id");
    
    // Price Book Data Types
    const pbItemsData = e.dataTransfer.getData("application/stimia-price-book-items");
    const pbItemData = e.dataTransfer.getData("application/stimia-price-book-item"); // Fallback single
    
    const pbCategoriesData = e.dataTransfer.getData("application/stimia-price-book-categories");
    const pbCategoryData = e.dataTransfer.getData("application/stimia-price-book-category"); // Fallback single

    if (itemsData) {
        // Multi-item move within editor
        try {
            const items = JSON.parse(itemsData);
            // We loop here, but ideally the parent handler should batch this
            items.forEach((i: any) => onDropItem(node.id, i.id));
        } catch (e) { console.error(e); }
    } else if (itemId) {
      onDropItem(node.id, itemId);
    } else if (draggedNodeId && draggedNodeId !== node.id) {
      onMoveNode(draggedNodeId, node.id);
    } else if (pbItemsData && onImportItems) {
      try {
        const items = JSON.parse(pbItemsData);
        onImportItems(node.id, items);
      } catch (err) { console.error(err); }
    } else if (pbItemData && onImportItems) {
      try {
        const item = JSON.parse(pbItemData);
        onImportItems(node.id, [item]);
      } catch (err) { console.error(err); }
    } else if (pbCategoriesData && onImportCategories) {
      try {
        const categories = JSON.parse(pbCategoriesData);
        onImportCategories(node.id, categories);
      } catch (err) { console.error(err); }
    } else if (pbCategoryData && onImportCategory) {
      try {
        const categoryData = JSON.parse(pbCategoryData);
        onImportCategory(node.id, categoryData);
      } catch (e) {
        console.error("Failed to parse Price Book category data", e);
      }
    }
  };

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop click bubbling
    
    // Constraint: Node cannot have items if we want to add a child (items must be in leaf nodes)
    if (node.items.length > 0) {
        alert("Errore: Questa categoria contiene voci. Non può avere sottocategorie. Le voci devono trovarsi nel livello più basso della struttura.");
        return;
    }

    // Logic to determine a sensible default code
    let nextCode = "1";
    if (node.level === 0) {
        // If Root (level 0), children are Level 1 (e.g., "1", "2" or "A", "B")
        nextCode = String(node.children.length + 1);
    } else {
        // Nested: ParentCode.Count
        nextCode = `${node.code}.${node.children.length + 1}`;
    }

    const newChild: WBSNode = {
      id: Math.random().toString(36).substr(2, 9),
      code: nextCode,
      name: "Nuova Categoria",
      items: [],
      children: [],
      level: node.level + 1
    };
    onUpdateNode({
      ...node,
      children: [...node.children, newChild]
    });
    setIsOpen(true);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling to parent click handlers
    e.preventDefault();
    
    // Use type safety check for the function prop
    if (onDeleteNode) {
        onDeleteNode(node.id);
    }
  };
  
  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDuplicateNode) {
        onDuplicateNode(node.id);
    }
  };

  // --- EDITING HANDLERS ---
  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditCode(node.code);
    setEditName(node.name);
    setIsEditing(true);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const saveEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editCode !== node.code || editName !== node.name) {
        onUpdateNode({ ...node, code: editCode, name: editName });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        e.stopPropagation();
        if (editCode !== node.code || editName !== node.name) {
            onUpdateNode({ ...node, code: editCode, name: editName });
        }
        setIsEditing(false);
    } else if (e.key === 'Escape') {
        e.stopPropagation();
        setIsEditing(false);
    }
  };

  const isSelected = selectedNodeId === node.id || (selectedNodeIds && selectedNodeIds.has(node.id));
  
  // Dynamic styles based on drag type
  const dragHoverClasses = dragType === 'item' 
    ? 'bg-blue-50/90 border-blue-500 border-2 border-dashed shadow-md z-10 scale-[1.01]' 
    : 'bg-indigo-50/90 border-indigo-500 border-2 border-dashed shadow-md z-10 scale-[1.01]';

  const badgeColorClasses = dragType === 'item'
    ? 'bg-blue-100/95 text-blue-700 border-blue-200'
    : 'bg-indigo-100/95 text-indigo-700 border-indigo-200';
  
  const dragLabel = dragType === 'item' ? 'Sposta Voce' : 'Sposta/Importa';

  if (isRoot) {
    return (
      <div 
        data-node-id="ROOT"
        className={`pl-1 min-h-[100px] transition-colors ${isHovering ? 'bg-indigo-50/30' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {node.children.map(child => (
          <WBSTree
            key={child.id}
            node={child}
            selectedNodeId={selectedNodeId}
            selectedNodeIds={selectedNodeIds}
            onSelectNode={onSelectNode}
            onUpdateNode={(updatedChild) => {
               const newChildren = node.children.map(c => c.id === updatedChild.id ? updatedChild : c);
               onUpdateNode({ ...node, children: newChildren });
            }}
            onDeleteNode={onDeleteNode}
            onDuplicateNode={onDuplicateNode}
            onDropItem={onDropItem}
            onMoveNode={onMoveNode}
            onImportCategory={onImportCategory}
            onImportCategories={onImportCategories}
            onImportItems={onImportItems}
            onGetMultiSelectionData={onGetMultiSelectionData}
            duplicateCodes={duplicateCodes}
          />
        ))}
        
        {/* Empty state hint only if no children and strictly inside the editor sidebar container */}
        {node.children.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded m-2 pointer-events-none">
            Nessuna categoria WBS.<br/>
            Clicca "+" o trascina qui per iniziare.
          </div>
        )}

        <button 
          onClick={handleAddChild}
          className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-xs font-bold text-accent-600 bg-accent-50 hover:bg-accent-100 rounded border border-dashed border-accent-200 transition-colors"
        >
          <Plus size={14} /> AGGIUNGI CAPITOLO
        </button>
      </div>
    );
  }

  return (
    <div className="select-none text-sm group/row mb-1">
      <div 
        draggable={!isEditing}
        onDragStart={handleDragStart}
        className={`
          flex items-center p-2 rounded cursor-pointer transition-all border-l-4 relative
          ${isSelected ? 'bg-accent/10 border-accent text-accent-900 shadow-sm' : 'border-transparent hover:bg-gray-100'}
          ${isHovering ? dragHoverClasses : ''}
        `}
        data-node-id={node.id}
        onClick={(e) => { 
            e.stopPropagation(); 
            !isEditing && onSelectNode(node, e.ctrlKey || e.metaKey || e.shiftKey); 
        }}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
          onMouseDown={(e) => e.stopPropagation()} // Prevent drag start on chevron
          className="p-1 hover:bg-black/5 rounded mr-1 text-gray-400 hover:text-gray-600 shrink-0 z-10 cursor-pointer"
        >
          {node.children.length > 0 ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : <div className="w-3.5" />}
        </button>
        
        <div className={`mr-2 transition-colors shrink-0 ${isSelected ? 'text-accent-600' : 'text-gray-400'}`}>
          {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
        </div>
        
        {/* Main Content with Edit Logic */}
        <div 
          className="flex-1 min-w-0 pr-24 flex items-center" 
          onDoubleClick={!isEditing ? startEditing : undefined}
        >
          {isEditing ? (
             <div className="flex items-center gap-1 w-full mr-2" onClick={e => e.stopPropagation()}>
                <input 
                    value={editCode}
                    onChange={e => setEditCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-12 text-xs font-mono font-bold px-1 py-0.5 border border-accent-300 rounded outline-none focus:ring-1 focus:ring-accent-500"
                    placeholder="Cod."
                    onClick={e => e.stopPropagation()}
                />
                <input 
                    ref={inputNameRef}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 text-sm px-1 py-0.5 border border-accent-300 rounded outline-none focus:ring-1 focus:ring-accent-500"
                    placeholder="Nome Categoria"
                    onClick={e => e.stopPropagation()}
                />
                <button 
                  onClick={saveEditing} 
                  className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                  title="Salva"
                >
                    <Check size={12} />
                </button>
                <button 
                  onClick={cancelEditing} 
                  className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  title="Annulla"
                >
                    <X size={12} />
                </button>
             </div>
          ) : (
             <>
               <span className={`font-mono text-xs font-bold mr-2 px-1 rounded border shrink-0 
                   ${isDuplicate 
                        ? 'bg-red-100 border-red-300 text-red-600 ring-1 ring-red-200' 
                        : isSelected 
                            ? 'bg-white border-accent/30 text-accent-700' 
                            : 'bg-gray-50 border-gray-200 text-gray-600'
                   }`}>
                 {node.code}
               </span>
               <span className="truncate mr-1" title={node.name}>{node.name}</span>
               <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 rounded-full shrink-0" title={`${node.items.length} voci`}>
                 {node.items.length}
               </span>
               
               {/* Node Total Summary */}
               <span className={`ml-auto pl-2 text-xs font-mono font-bold ${isSelected ? 'text-accent-700 bg-accent-50/50 border-accent-200' : 'text-gray-600 bg-white/50 border-gray-100'} tabular-nums px-1.5 py-0.5 rounded border shadow-sm`}>
                 € {nodeTotal.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </span>
             </>
          )}
        </div>

        {/* Drop Visual Cue */}
        {isHovering && !isEditing && (
           <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm pointer-events-none z-30 border backdrop-blur-sm animate-pulse ${badgeColorClasses}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                  {dragLabel}
              </span>
              <CornerDownLeft size={14} strokeWidth={2.5} />
           </div>
        )}

        {/* Actions appearing on hover */}
        {!isHovering && !isEditing && (
          <div 
            className="absolute right-2 flex opacity-0 group-hover/row:opacity-100 transition-opacity bg-white/95 backdrop-blur-sm rounded shadow-sm border border-gray-200 z-50"
            onMouseDown={(e) => e.stopPropagation()} 
          >
             <button 
              type="button"
              onClick={handleAddChild}
              className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-l border-r border-gray-100 transition-colors cursor-pointer"
              title="Aggiungi Sottocategoria"
            >
              <Plus size={14} className="pointer-events-none" />
            </button>
            <button 
              type="button"
              onClick={startEditing}
              className="p-1.5 hover:bg-yellow-50 text-yellow-600 border-r border-gray-100 transition-colors cursor-pointer"
              title="Rinomina Categoria"
            >
              <Edit2 size={14} className="pointer-events-none" />
            </button>
            <button 
              type="button"
              onClick={handleDuplicate}
              className="p-1.5 hover:bg-purple-50 text-purple-600 border-r border-gray-100 transition-colors cursor-pointer"
              title="Duplica Categoria"
            >
              <Copy size={14} className="pointer-events-none" />
            </button>
            <button 
              type="button"
              onClick={handleDelete}
              className="p-1.5 hover:bg-red-50 text-red-600 rounded-r transition-colors cursor-pointer"
              title="Elimina Categoria"
            >
              <Trash2 size={14} className="pointer-events-none" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {isOpen && node.children.length > 0 && (
        <div className="pl-4 border-l border-gray-200 ml-4 mt-1">
          {node.children.map(child => (
            <WBSTree
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              selectedNodeIds={selectedNodeIds}
              onSelectNode={onSelectNode}
              onUpdateNode={(updatedChild) => {
                const newChildren = node.children.map(c => c.id === updatedChild.id ? updatedChild : c);
                onUpdateNode({ ...node, children: newChildren });
              }}
              onDeleteNode={onDeleteNode}
              onDuplicateNode={onDuplicateNode}
              onDropItem={onDropItem}
              onMoveNode={onMoveNode}
              onImportCategory={onImportCategory}
              onImportCategories={onImportCategories}
              onImportItems={onImportItems}
              onGetMultiSelectionData={onGetMultiSelectionData}
              duplicateCodes={duplicateCodes}
            />
          ))}
        </div>
      )}
    </div>
  );
};