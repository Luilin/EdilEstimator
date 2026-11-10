import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PriceBookItem, PriceBook, PriceBookCategory } from '../types';
import { Search, BookOpen, Tag, Download, Plus, X, Edit2, Trash2, Folder, FolderOpen, ChevronRight, ChevronDown, FileSpreadsheet, ArrowDownAZ, AlertTriangle, CornerDownLeft, FileText, Copy, ArrowRight, Undo, Redo, Palette, Hash, BookUp, Loader2, Upload } from 'lucide-react';
import { createPriceBookFromXpwe, parseXpwePriceBook } from '../services/xpwe';
// --- MOCK DATA GENERATORS ---

const generateId = () => Math.random().toString(36).substr(2, 9);

export const DEFAULT_BOOKS: PriceBook[] = [
    {
        id: 'pb_default',
        name: 'Listino Regionale 2024',
        description: 'Prezzario di esempio: opere edili, architettoniche e impiantistiche',
        rootCategory: {
            id: 'root',
            code: '',
            name: 'Root',
            items: [],
            children: [
                {
                    id: 'cat_1',
                    code: 'A',
                    name: 'Scavi e Demolizioni',
                    color: '#e0f2fe',
                    items: [],
                    children: [
                        {
                            id: 'sub_1_1',
                            code: 'A.01',
                            name: 'Scavi in genere',
                            children: [],
                            items: [
                                { id: 'item_1', code: 'A.01.01', description: 'Scavo a sezione obbligata', uom: 'm³', price: 12.50 },
                                { id: 'item_2', code: 'A.01.02', description: 'Scavo di sbancamento', uom: 'm³', price: 8.40 },
                            ]
                        },
                        {
                            id: 'sub_1_2',
                            code: 'A.02',
                            name: 'Demolizioni',
                            children: [],
                            items: [
                                { id: 'item_3', code: 'A.02.01', description: 'Demolizione CLS armato', uom: 'm³', price: 150.00 },
                            ]
                        }
                    ]
                },
                {
                    id: 'cat_2',
                    code: 'B',
                    name: 'Opere Strutturali',
                    color: '#fce7f3',
                    items: [],
                    children: [
                        {
                            id: 'sub_2_1',
                            code: 'B.01',
                            name: 'Calcestruzzi',
                            children: [],
                            items: [
                                { id: 'item_4', code: 'B.01.01', description: 'CLS Rck 30', uom: 'm³', price: 120.00 },
                            ]
                        }
                    ]
                },
                {
                    id: 'cat_3',
                    code: 'C',
                    name: 'Opere Architettoniche',
                    color: '#dcfce7',
                    items: [],
                    children: [
                        {
                            id: 'sub_3_1',
                            code: 'C.01',
                            name: 'Murature e Tramezzi',
                            children: [],
                            items: [
                                { id: 'item_5', code: 'C.01.01', description: 'Tramezzo in laterizio 8 cm', uom: 'm²', price: 28.50 },
                                { id: 'item_6', code: 'C.01.02', description: 'Muratura in blocchi di tufo 30 cm', uom: 'm³', price: 145.00 },
                                { id: 'item_7', code: 'C.01.03', description: 'Parete in cartongesso doppia lastra', uom: 'm²', price: 42.00 },
                            ]
                        },
                        {
                            id: 'sub_3_2',
                            code: 'C.02',
                            name: 'Intonaci e Finiture',
                            children: [],
                            items: [
                                { id: 'item_8', code: 'C.02.01', description: 'Intonaco civile interno', uom: 'm²', price: 14.50 },
                                { id: 'item_9', code: 'C.02.02', description: 'Rasatura e pittura lavabile (due mani)', uom: 'm²', price: 9.80 },
                                { id: 'item_10', code: 'C.02.03', description: 'Controsoffitto in cartongesso', uom: 'm²', price: 35.00 },
                            ]
                        },
                        {
                            id: 'sub_3_3',
                            code: 'C.03',
                            name: 'Pavimenti e Rivestimenti',
                            children: [],
                            items: [
                                { id: 'item_11', code: 'C.03.01', description: 'Massetto cementizio per sottofondo', uom: 'm²', price: 12.00 },
                                { id: 'item_12', code: 'C.03.02', description: 'Pavimento in gres porcellanato 60x60', uom: 'm²', price: 45.00 },
                                { id: 'item_13', code: 'C.03.03', description: 'Battiscopa in ceramica h 10 cm', uom: 'm', price: 8.50 },
                            ]
                        },
                        {
                            id: 'sub_3_4',
                            code: 'C.04',
                            name: 'Serramenti e Porte',
                            children: [],
                            items: [
                                { id: 'item_14', code: 'C.04.01', description: 'Porta interna in legno tamburato', uom: 'cad', price: 220.00 },
                                { id: 'item_15', code: 'C.04.02', description: 'Finestra in PVC con doppio vetro', uom: 'm²', price: 180.00 },
                                { id: 'item_16', code: 'C.04.03', description: "Portoncino d'ingresso blindato", uom: 'cad', price: 950.00 },
                            ]
                        }
                    ]
                },
                {
                    id: 'cat_4',
                    code: 'D',
                    name: 'Impianti',
                    color: '#e0e7ff',
                    items: [],
                    children: [
                        {
                            id: 'sub_4_1',
                            code: 'D.01',
                            name: 'Impianto Elettrico',
                            children: [],
                            items: [
                                { id: 'item_17', code: 'D.01.01', description: 'Punto luce completo (frutto e placche)', uom: 'cad', price: 45.00 },
                                { id: 'item_18', code: 'D.01.02', description: 'Punto presa 16A con terra', uom: 'cad', price: 38.00 },
                                { id: 'item_19', code: 'D.01.03', description: 'Quadro elettrico 12 moduli', uom: 'cad', price: 180.00 },
                                { id: 'item_20', code: 'D.01.04', description: 'Cavo elettrico 3x2,5 mm²', uom: 'm', price: 3.20 },
                            ]
                        },
                        {
                            id: 'sub_4_2',
                            code: 'D.02',
                            name: 'Impianto Idraulico',
                            children: [],
                            items: [
                                { id: 'item_21', code: 'D.02.01', description: 'Punto acqua fredda/calda', uom: 'cad', price: 55.00 },
                                { id: 'item_22', code: 'D.02.02', description: 'Scarico in PVC diametro 50 mm', uom: 'm', price: 12.00 },
                                { id: 'item_23', code: 'D.02.03', description: 'Termoarredo in acciaio', uom: 'cad', price: 320.00 },
                            ]
                        },
                        {
                            id: 'sub_4_3',
                            code: 'D.03',
                            name: 'Climatizzazione',
                            children: [],
                            items: [
                                { id: 'item_24', code: 'D.03.01', description: 'Split climatizzatore 9000 BTU', uom: 'cad', price: 650.00 },
                                { id: 'item_25', code: 'D.03.02', description: 'Linea frigorifera completa', uom: 'm', price: 18.00 },
                            ]
                        },
                        {
                            id: 'sub_4_4',
                            code: 'D.04',
                            name: 'Sicurezza e Antincendio',
                            children: [],
                            items: [
                                { id: 'item_26', code: 'D.04.01', description: 'Rilevatore di fumo', uom: 'cad', price: 35.00 },
                                { id: 'item_27', code: 'D.04.02', description: 'Estintore a polvere 6 kg', uom: 'cad', price: 55.00 },
                                { id: 'item_28', code: 'D.04.03', description: 'Citofono con videocamera', uom: 'cad', price: 280.00 },
                            ]
                        }
                    ]
                }
            ]
        }
    }
];

// Pastel colors for new categories (high contrast with black text)
const PASTEL_COLORS = [
    '#dbeafe', // blue-100
    '#dcfce7', // green-100
    '#fef9c3', // yellow-100
    '#fee2e2', // red-100
    '#f3e8ff', // purple-100
    '#ffedd5', // orange-100
    '#e0e7ff', // indigo-100
    '#fae8ff', // fuchsia-100
    '#ccfbf1', // teal-100
    '#fce7f3', // pink-100
];

// --- HELPERS ---

const compareNatural = (a: string, b: string) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const collectAllCodes = (node: PriceBookCategory, acc: string[] = []) => {
    if (node.code) acc.push(node.code);
    node.items.forEach(i => acc.push(i.code));
    node.children.forEach(c => collectAllCodes(c, acc));
    return acc;
};

const collectAllItemCodes = (node: PriceBookCategory, acc: string[] = []) => {
    node.items.forEach(i => acc.push(i.code));
    node.children.forEach(c => collectAllItemCodes(c, acc));
    return acc;
};

const findNextCategoryCode = (parent: PriceBookCategory): string => {
    if (parent.children.length === 0) {
        if (!parent.code) return '1'; 
        return `${parent.code}.01`;   
    }

    let maxSuffix = 0;
    parent.children.forEach(child => {
        const parts = child.code.split('.');
        const lastPart = parts[parts.length - 1];
        const num = parseInt(lastPart, 10);
        if (!isNaN(num)) {
            maxSuffix = Math.max(maxSuffix, num);
        }
    });

    const nextNum = maxSuffix + 1;
    const shouldPad = !!parent.code; 
    const suffix = shouldPad && nextNum < 10 ? `0${nextNum}` : `${nextNum}`;

    return parent.code ? `${parent.code}.${suffix}` : suffix;
};

const updatePriceBookCodes = (node: PriceBookCategory, oldPrefix: string, newPrefix: string): PriceBookCategory => {
    if (oldPrefix === newPrefix) return node;
    
    const prefixWithDot = oldPrefix ? oldPrefix + "." : "";
    const newPrefixWithDot = newPrefix ? newPrefix + "." : "";

    const newItems = node.items.map(item => {
        if (item.code.startsWith(prefixWithDot)) {
             const suffix = item.code.substring(prefixWithDot.length);
             return { ...item, code: newPrefixWithDot + suffix };
        }
        return item;
    });

    const newChildren = node.children.map(child => {
        let newChild = { ...child };
        if (newChild.code.startsWith(prefixWithDot)) {
            const suffix = newChild.code.substring(prefixWithDot.length);
            newChild.code = newPrefixWithDot + suffix;
        }
        return updatePriceBookCodes(newChild, oldPrefix, newPrefix);
    });

    return { ...node, items: newItems, children: newChildren };
};

// Helper to deep inject sourceBookId and sourceCode before exporting
// Also injects categoryColor
const injectSourceInfo = (node: PriceBookCategory, bookId: string, inheritedColor?: string): PriceBookCategory => {
    const currentColor = node.color || inheritedColor;
    return {
        ...node,
        items: node.items.map(i => ({...i, sourceBookId: bookId, sourceCode: i.code, categoryColor: currentColor})),
        children: node.children.map(c => injectSourceInfo(c, bookId, currentColor))
    };
};

const getCategoriesFlat = (root: PriceBookCategory) => {
    const list: {id: string, name: string, code: string, depth: number}[] = [];
    const traverse = (node: PriceBookCategory, depth: number) => {
        if (node.id !== root.id) {
           list.push({ id: node.id, name: node.name, code: node.code, depth });
        }
        node.children.forEach(c => traverse(c, depth + 1));
    };
    list.push({ id: root.id, name: 'Root (Principale)', code: '', depth: 0 });
    root.children.forEach(c => traverse(c, 1));
    return list;
};

// --- TREE COMPONENT ---

interface CategoryTreeProps {
    node: PriceBookCategory;
    bookId: string;
    selectedIds: Set<string>;
    onSelect: (node: PriceBookCategory, event: React.MouseEvent) => void;
    onEdit: (node: PriceBookCategory) => void;
    onDuplicate: (node: PriceBookCategory) => void;
    onDelete: (node: PriceBookCategory) => void;
    onMove: (sourceId: string, targetId: string) => void;
    onMoveItem: (itemId: string, targetCategoryId: string) => void;
    onCategoryDragStart: (e: React.DragEvent, node: PriceBookCategory) => void;
    onImportCostItems?: (targetCategoryId: string, items: any[]) => void;
    onContextMenu?: (e: React.MouseEvent, node: PriceBookCategory, level: number) => void;
    level?: number;
    duplicateCodes: Set<string>;
    filterText: string;
    readOnly?: boolean;
    inheritedColor?: string; // Propagated color from parent
}

const CategoryTree: React.FC<CategoryTreeProps> = ({ 
    node, 
    bookId, 
    selectedIds, 
    onSelect, 
    onEdit, 
    onDuplicate, 
    onDelete, 
    onMove, 
    onMoveItem, 
    onCategoryDragStart,
    onImportCostItems,
    onContextMenu,
    level = 0, 
    duplicateCodes, 
    filterText, 
    readOnly = false, 
    inheritedColor 
}) => {
    const [isOpen, setIsOpen] = useState(level < 1);
    const [isHovering, setIsHovering] = useState(false);
    const [dragType, setDragType] = useState<'category' | 'item' | 'cost_item' | null>(null);
    
    // Determine effective color: if Level 1, use own color. If deeper, use inherited color (forcing consistency).
    // Level 1 categories are the children of Root (level 0).
    const effectiveColor = level === 1 ? node.color : (inheritedColor || node.color);

    const matchesFilter = (n: PriceBookCategory, text: string): boolean => {
        if (!text) return true;
        const lowerText = text.toLowerCase();
        if (n.code.toLowerCase().includes(lowerText) || n.name.toLowerCase().includes(lowerText)) return true;
        return n.children.some(child => matchesFilter(child, text));
    };

    const isVisible = matchesFilter(node, filterText);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedIds.has(node.id);
    const isDuplicate = node.code && duplicateCodes.has(node.code);

    // Numero di voci contenute nella categoria, incluse le sottocategorie.
    const itemCount = useMemo(() => {
        let total = node.items.length;
        node.children.forEach(function walk(child) {
            total += child.items.length;
            child.children.forEach(walk);
        });
        return total;
    }, [node]);

    useEffect(() => {
        if (filterText && hasChildren) {
             const childrenMatch = node.children.some(child => matchesFilter(child, filterText));
             if (childrenMatch) setIsOpen(true);
        }
    }, [filterText, hasChildren, node.children]);

    const handleDragStart = (e: React.DragEvent) => {
        if (readOnly) return;
        onCategoryDragStart(e, node);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        
        if (!isHovering) {
            setIsHovering(true);
            const types = Array.from(e.dataTransfer.types);
            if (types.includes("application/edil-pb-item-id")) {
                setDragType('item');
            } else if (types.includes("application/edil-items")) {
                setDragType('cost_item'); // From Editor
            } else {
                setDragType('category');
            }
        }
        e.dataTransfer.dropEffect = "move";
    };

    const handleDragLeave = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsHovering(false);
        setDragType(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        setIsHovering(false);
        setDragType(null);
        
        const sourceCatId = e.dataTransfer.getData("application/edil-pb-cat-id");
        const sourceItemId = e.dataTransfer.getData("application/edil-pb-item-id");
        const costItemsData = e.dataTransfer.getData("application/edil-items");
        
        if (costItemsData && onImportCostItems) {
            try {
                const items = JSON.parse(costItemsData);
                onImportCostItems(node.id, items);
            } catch (err) { console.error(err); }
        } else if (sourceItemId) {
            onMoveItem(sourceItemId, node.id);
        } else if (sourceCatId && sourceCatId !== node.id) {
            onMove(sourceCatId, node.id);
        }
    };

    if (level === 0) {
        return (
            <div className="flex flex-col h-full" onDragOver={!readOnly ? handleDragOver : undefined} onDrop={!readOnly ? handleDrop : undefined}>
                {node.children.map(child => (
                    <CategoryTree 
                        key={child.id} 
                        node={child}
                        bookId={bookId}
                        selectedIds={selectedIds} 
                        onSelect={onSelect} 
                        onEdit={onEdit}
                        onDuplicate={onDuplicate}
                        onDelete={onDelete} 
                        onMove={onMove}
                        onMoveItem={onMoveItem}
                        onCategoryDragStart={onCategoryDragStart}
                        onImportCostItems={onImportCostItems}
                        onContextMenu={onContextMenu}
                        level={level + 1} 
                        duplicateCodes={duplicateCodes}
                        filterText={filterText}
                        readOnly={readOnly}
                        inheritedColor={effectiveColor}
                    />
                ))}
            </div>
        );
    }

    if (!isVisible) return null;

    // Visual style for custom color
    const customStyle = effectiveColor ? { borderLeftColor: effectiveColor } : {};
    const badgeStyle = effectiveColor ? { backgroundColor: effectiveColor, borderColor: 'transparent', color: '#1f2937' } : {};
    
    const dropFeedbackColor = dragType === 'item' || dragType === 'cost_item' 
        ? 'bg-blue-50 border-blue-400' 
        : 'bg-emerald-50 border-emerald-400';

    return (
        <div className="select-none group/tree-item">
            <div 
                data-cat-id={node.id}
                draggable={!readOnly}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center gap-1 py-1 px-2 cursor-pointer text-xs transition-colors relative border border-transparent
                    ${isSelected ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'hover:bg-gray-100 text-gray-700'}
                    ${isHovering ? `${dropFeedbackColor} border-dashed` : ''}
                    ${effectiveColor ? 'border-l-4' : ''}
                `}
                style={{ 
                    paddingLeft: `${(level - 1) * 12 + 8}px`,
                    ...customStyle
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect(node, e);
                }}
                onContextMenu={(e) => {
                    if (onContextMenu) {
                        e.preventDefault();
                        e.stopPropagation();
                        onContextMenu(e, node, level);
                    }
                }}
            >
                <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                    onMouseDown={e => e.stopPropagation()}
                    className={`p-0.5 rounded hover:bg-black/5 ${!hasChildren ? 'invisible' : ''}`}
                    aria-label={isOpen ? "Chiudi Categoria" : "Apri Categoria"}
                >
                    {isOpen ? <ChevronDown size={12} className="pointer-events-none" /> : <ChevronRight size={12} className="pointer-events-none" />}
                </button>
                
                {isOpen ? <FolderOpen size={14} className={isSelected ? 'text-emerald-600 pointer-events-none' : 'text-yellow-500 pointer-events-none'} /> : <Folder size={14} className={isSelected ? 'text-emerald-600 pointer-events-none' : 'text-yellow-500 pointer-events-none'} />}
                
                <span className={`font-mono font-bold text-[10px] px-1 rounded border 
                    ${isDuplicate ? 'bg-red-100 border-red-300 text-red-600' : 'bg-gray-100 border-gray-200'}
                `}
                style={!isDuplicate ? badgeStyle : {}}
                >
                    {node.code}
                </span>
                
                <span className="truncate font-medium flex-1">
                     {filterText && node.name.toLowerCase().includes(filterText.toLowerCase()) ? (
                         <>
                            {node.name.substring(0, node.name.toLowerCase().indexOf(filterText.toLowerCase()))}
                            <span className="bg-yellow-200 text-yellow-900 rounded-[1px]">{node.name.substring(node.name.toLowerCase().indexOf(filterText.toLowerCase()), node.name.toLowerCase().indexOf(filterText.toLowerCase()) + filterText.length)}</span>
                            {node.name.substring(node.name.toLowerCase().indexOf(filterText.toLowerCase()) + filterText.length)}
                         </>
                     ) : node.name}
                </span>
                <span
                    className="ml-auto mr-12 shrink-0 rounded-full border border-gray-200 bg-white/80 px-1.5 py-0.5 text-[9px] font-bold text-gray-500"
                    title={`${itemCount} voci nella categoria e nelle sottocategorie`}
                >
                    {itemCount} voci
                </span>
                
                {isDuplicate && <AlertTriangle size={10} className="text-red-500 shrink-0 mr-1" />}

                {isHovering && !readOnly && (
                    <div className={`absolute right-2 flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border shadow-sm pointer-events-none ${dragType === 'item' || dragType === 'cost_item' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300'}`}>
                        {dragType === 'item' ? 'Sposta Voce Qui' : dragType === 'cost_item' ? 'Importa Voce' : 'Sposta Categoria'} <CornerDownLeft size={10} />
                    </div>
                )}

                {!isHovering && !readOnly && (
                    <div className="flex gap-1 opacity-0 group-hover/tree-item:opacity-100 transition-opacity bg-white/50 backdrop-blur-sm rounded px-1 absolute right-1 z-50">
                        <button 
                            type="button"
                            onClick={(e) => { 
                                e.preventDefault(); 
                                e.stopPropagation(); 
                                onEdit(node); 
                            }} 
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-1 text-gray-500 hover:text-emerald-600 hover:bg-white rounded shadow-sm cursor-pointer z-50"
                            title="Modifica Categoria"
                            aria-label="Modifica Categoria"
                        >
                            <Edit2 size={12} className="pointer-events-none" />
                        </button>
                        <button 
                            type="button"
                            onClick={(e) => { 
                                e.preventDefault(); 
                                e.stopPropagation(); 
                                onDuplicate(node); 
                            }} 
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-1 text-gray-500 hover:text-purple-600 hover:bg-white rounded shadow-sm cursor-pointer z-50"
                            title="Duplica Categoria"
                            aria-label="Duplica Categoria"
                        >
                            <Copy size={12} className="pointer-events-none" />
                        </button>
                        <button 
                            type="button"
                            onClick={(e) => { 
                                e.preventDefault(); 
                                e.stopPropagation(); 
                                onDelete(node); 
                            }} 
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-1 text-gray-500 hover:text-red-600 hover:bg-white rounded shadow-sm cursor-pointer z-50"
                            title="Elimina Categoria"
                            aria-label="Elimina Categoria"
                        >
                            <Trash2 size={12} className="pointer-events-none" />
                        </button>
                    </div>
                )}
            </div>
            
            {isOpen && hasChildren && (
                <div>
                    {node.children.map(child => (
                        <CategoryTree 
                            key={child.id} 
                            node={child} 
                            bookId={bookId}
                            selectedIds={selectedIds} 
                            onSelect={onSelect} 
                            onEdit={onEdit} 
                            onDuplicate={onDuplicate}
                            onDelete={onDelete}
                            onMove={onMove}
                            onMoveItem={onMoveItem}
                            onCategoryDragStart={onCategoryDragStart}
                            onImportCostItems={onImportCostItems}
                            onContextMenu={onContextMenu}
                            level={level + 1} 
                            duplicateCodes={duplicateCodes}
                            filterText={filterText}
                            readOnly={readOnly}
                            inheritedColor={effectiveColor}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- CSV WIZARD TYPES ---
interface CsvMapping {
    [key: number]: 'ignore' | 'code' | 'desc' | 'uom' | 'price' | 'cat_full' | 'cat_l1' | 'cat_l2' | 'cat_l3' | 'cat_l4' | 'cat_l5' | 'cat_l1_code' | 'cat_l1_desc' | 'cat_l2_code' | 'cat_l2_desc' | 'cat_l3_code' | 'cat_l3_desc' | 'cat_l4_code' | 'cat_l4_desc' | 'cat_l5_code' | 'cat_l5_desc' | 'cat_code' | 'cat_desc';
}

type WizardStep = 'mapping' | 'categories';

// --- MAIN PANEL COMPONENT ---

interface PriceBookPanelProps {
  onClose?: () => void;
  onPriceBookItemUpdate?: (bookId: string, item: PriceBookItem, oldCode?: string) => void;
  onCategoryColorUpdate?: (bookId: string, itemCodes: string[], newColor: string) => void;
  onAddItems?: (items: PriceBookItem[]) => void;
  onAddCategory?: (category: PriceBookCategory) => void;
  onImportCategories?: (categories: PriceBookCategory[]) => void;
  externalImportData?: { type: 'category' | 'item', data: any[] } | null;
  onClearExternalImport?: () => void;
  books: PriceBook[];
  onUpdateBooks: (books: PriceBook[]) => void;
}

export const PriceBookPanel: React.FC<PriceBookPanelProps> = ({ 
    onClose, 
    onPriceBookItemUpdate, 
    onCategoryColorUpdate,
    onAddItems, 
    onAddCategory,
    onImportCategories,
    externalImportData,
    onClearExternalImport,
    books,
    onUpdateBooks
}) => {
  // Use a local proxy for history management but sync with parent
  const [history, setHistory] = useState<PriceBook[][]>([books]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [activeBookId, setActiveBookId] = useState<string>(() => {
      // Try to keep same active book if possible
      return books.length > 0 ? books[0].id : '';
  });
  
  // Update internal history when external books change from non-internal source.
  // Confronto per riferimento: evita di serializzare prezzari molto grandi.
  useEffect(() => {
    if (books !== history[historyIndex]) {
        setHistory([books]);
        setHistoryIndex(0);
        if (!activeBookId && books.length > 0) setActiveBookId(books[0].id);
    }
  }, [books]);

  // Handle External Import (from WBS)
  useEffect(() => {
      if (externalImportData && activeBookId) {
          const { type, data } = externalImportData;
          if (data.length === 0) return;

          let newRoot = books.find(b => b.id === activeBookId)?.rootCategory;
          if (!newRoot) return;
          
          if (type === 'item') {
              const targetCatId = (selectedCategoryIds.size === 1) ? Array.from(selectedCategoryIds)[0] : newRoot.id;
              
              const addItemsRecursive = (node: PriceBookCategory): PriceBookCategory => {
                  if (node.id === targetCatId) {
                      // Restriction: Cannot add items to categories that have children
                      if (node.children.length > 0) {
                          alert(`La categoria "${node.name}" contiene sottocategorie. Non puoi aggiungere voci direttamente qui. Seleziona una sottocategoria.`);
                          return node;
                      }

                      const importedItems: PriceBookItem[] = data.map(wbsItem => ({
                          id: generateId(),
                          code: getNextItemCode(node), // Note: might conflict in batch, simplified
                          description: wbsItem.description || wbsItem.name, // Handle WBS Node as item fallback? No, type check
                          uom: wbsItem.uom || 'cad',
                          price: wbsItem.price || wbsItem.amount || 0
                      }));
                      
                      // Fix codes for batch import
                      importedItems.forEach((item, idx) => {
                          if (idx > 0) {
                              const parts = importedItems[0].code.split('.');
                              const suffix = parseInt(parts[parts.length-1]) + idx;
                              item.code = parts.slice(0, parts.length-1).join('.') + '.' + suffix.toString().padStart(2, '0');
                          }
                      });

                      return { ...node, items: [...node.items, ...importedItems] };
                  }
                  return { ...node, children: node.children.map(addItemsRecursive) };
              };
              newRoot = addItemsRecursive(newRoot);
              alert(`${data.length} voci importate nel prezzario.`);

          } else if (type === 'category') {
              // Deep convert WBS Node to PB Category
              const convertNode = (wbsNode: any): PriceBookCategory => {
                  return {
                      id: generateId(),
                      code: wbsNode.code,
                      name: wbsNode.name,
                      color: PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)],
                      items: (wbsNode.items || []).map((i: any) => ({
                          id: generateId(),
                          code: i.code || '',
                          description: i.description,
                          uom: i.uom,
                          price: i.price
                      })),
                      children: (wbsNode.children || []).map(convertNode)
                  };
              };

              const importedCats = data.map(convertNode);
              // Add to root
              newRoot = { ...newRoot, children: [...newRoot.children, ...importedCats] };
               alert(`${data.length} categorie importate nel prezzario.`);
          }

          const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot! } : b);
          updateBooksWrapper(updatedBooks);
          
          if (onClearExternalImport) onClearExternalImport();
      }
  }, [externalImportData, activeBookId]);
  
  // Selection State
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  
  // Multiple Item Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [lastClickedItemId, setLastClickedItemId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, visible: boolean} | null>(null);
  const [catContextMenu, setCatContextMenu] = useState<{x: number, y: number, catId: string, level: number} | null>(null);

  // Rectangle Selection State for Items
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const selectionStartPos = useRef<{x: number, y: number} | null>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);

  // Rectangle Selection State for Categories
  const [isSelectingCat, setIsSelectingCat] = useState(false);
  const [catSelectionRect, setCatSelectionRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const catSelectionStartPos = useRef<{x: number, y: number} | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [categorySearchTerm, setCategorySearchTerm] = useState("");
  
  // Settings State
  const [isAutoCode, setIsAutoCode] = useState(true);
  
  // UI State
  const [width, setWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);

  // Column Resizing (Tree vs List)
  const [treeHeight, setTreeHeight] = useState(300); // Changed from treeWidth to treeHeight
  const [isResizingTree, setIsResizingTree] = useState(false);

  // Modals & Edit States
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  const [copyItemTargets, setCopyItemTargets] = useState<PriceBookItem[] | null>(null); 
  const [copyCategoryTargets, setCopyCategoryTargets] = useState<PriceBookCategory[] | null>(null);
  const [copyTargetBookId, setCopyTargetBookId] = useState<string>("");
  const [copyTargetCategoryId, setCopyTargetCategoryId] = useState<string | null>(null);

  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [targetParentId, setTargetParentId] = useState<string | null>(null); 
  const [parentPrefix, setParentPrefix] = useState<string>("");

  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);

  // Import prezzario XPWE
  const [isImportingXpwe, setIsImportingXpwe] = useState(false);
  const [xpweMessage, setXpweMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const xpweInputRef = useRef<HTMLInputElement>(null);
  
  // Color Picker Modal State
  const [showColorModal, setShowColorModal] = useState(false);
  const [targetCatForColor, setTargetCatForColor] = useState<string | null>(null);
  const [tempColor, setTempColor] = useState("#000000");

  const [showCsvWizard, setShowCsvWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('mapping');
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [csvRawLines, setCsvRawLines] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvMapping>({});
  const [csvSkipHeader, setCsvSkipHeader] = useState(true);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvDetectedCategories, setCsvDetectedCategories] = useState<Record<string, string>>({});

  // Form Data
  const [itemFormData, setItemFormData] = useState<Partial<PriceBookItem>>({});
  const [catFormData, setCatFormData] = useState<{name: string, code: string, color?: string}>({name: '', code: '', color: '#000000'});
  const [bookFormData, setBookFormData] = useState<{name: string, desc: string}>({name: '', desc: ''});

  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [csvSeparator, setCsvSeparator] = useState<string>(',');

  const activeBook = books.find(b => b.id === activeBookId) || books[0];

  const updateBooksWrapper = (newBooks: PriceBook[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newBooks);
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      onUpdateBooks(newBooks);
  };
  
  // Context Menu Auto-Close
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
      setCatContextMenu(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
    };
  }, []);

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          onUpdateBooks(history[newIndex]);
          const currentExists = history[newIndex].find(b => b.id === activeBookId);
          if (!currentExists && history[newIndex].length > 0) setActiveBookId(history[newIndex][0].id);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          onUpdateBooks(history[newIndex]);
          const currentExists = history[newIndex].find(b => b.id === activeBookId);
          if (!currentExists && history[newIndex].length > 0) setActiveBookId(history[newIndex][0].id);
      }
  };

  const findNodeById = useCallback((node: PriceBookCategory, id: string): PriceBookCategory | null => {
      if (node.id === id) return node;
      for (const child of node.children) {
          const found = findNodeById(child, id);
          if (found) return found;
      }
      return null;
  }, []);

  const getNextItemCode = (category: PriceBookCategory): string => {
      if (!category.code) return `ITEM.${(category.items.length + 1).toString().padStart(2, '0')}`;
      let maxSuffix = 0;
      category.items.forEach(item => {
          if (item.code.startsWith(category.code + '.')) {
              const suffixPart = item.code.substring(category.code.length + 1);
              const suffix = parseInt(suffixPart, 10);
              if (!isNaN(suffix)) maxSuffix = Math.max(maxSuffix, suffix);
          }
      });
      return `${category.code}.${(maxSuffix + 1).toString().padStart(2, '0')}`;
  };

  const getVisibleItems = useCallback(() => {
    let items: (PriceBookItem & { categoryName: string, categoryColor?: string })[] = [];
    const searchTerms = searchTerm.toLowerCase().split(' ').filter(Boolean);

    const collect = (node: PriceBookCategory, collectAll: boolean, inheritedColor?: string) => {
        const currentColor = node.color || inheritedColor;
        const isTarget = selectedCategoryIds.has(node.id);
        if (collectAll || isTarget) {
            items.push(...node.items.map(i => ({...i, categoryName: node.name, categoryColor: currentColor})));
        }
        node.children.forEach(child => collect(child, collectAll, currentColor)); 
    };

    if (searchTerms.length > 0) {
        const traverseSearch = (node: PriceBookCategory, inheritedColor?: string) => {
             const currentColor = node.color || inheritedColor;
             node.items.forEach(i => {
                 const fullText = (i.code + ' ' + i.description + ' ' + i.uom).toLowerCase();
                 if (searchTerms.every(term => fullText.includes(term))) {
                     items.push({...i, categoryName: node.name, categoryColor: currentColor});
                 }
             });
             node.children.forEach(child => traverseSearch(child, currentColor));
        };
        traverseSearch(activeBook.rootCategory);
    } else {
        if (selectedCategoryIds.size > 0) {
             const traverse = (node: PriceBookCategory, inheritedColor?: string) => {
                 const currentColor = node.color || inheritedColor;
                 if (selectedCategoryIds.has(node.id)) {
                     items.push(...node.items.map(i => ({...i, categoryName: node.name, categoryColor: currentColor})));
                 }
                 node.children.forEach(child => traverse(child, currentColor));
             };
             traverse(activeBook.rootCategory);
        }
    }
    return items;
  }, [activeBook, selectedCategoryIds, searchTerm]);

  const visibleItems = getVisibleItems();

  const duplicateCodes = useMemo(() => {
      const allCodes = collectAllCodes(activeBook.rootCategory);
      const duplicates = new Set<string>();
      const seen = new Set<string>();
      allCodes.forEach(c => {
          const trimmed = c.trim();
          if (trimmed) {
              if (seen.has(trimmed)) duplicates.add(trimmed);
              else seen.add(trimmed);
          }
      });
      return duplicates;
  }, [activeBook]);
  
  const getAllCategoriesFlat = useMemo(() => {
      const list: {id: string, name: string, code: string, depth: number}[] = [];
      const traverse = (node: PriceBookCategory, depth: number) => {
          if (node.id !== activeBook.rootCategory.id) {
             list.push({ id: node.id, name: node.name, code: node.code, depth });
          }
          node.children.forEach(c => traverse(c, depth + 1));
      };
      list.push({ id: activeBook.rootCategory.id, name: 'Root (Principale)', code: '', depth: 0 });
      activeBook.rootCategory.children.forEach(c => traverse(c, 1));
      return list;
  }, [activeBook]);

  const handleCategorySelect = (node: PriceBookCategory, e: React.MouseEvent) => {
      e.stopPropagation();
      let newIds = new Set(selectedCategoryIds);
      if (e.ctrlKey || e.metaKey) {
          if (newIds.has(node.id)) newIds.delete(node.id);
          else newIds.add(node.id);
      } else {
          newIds.clear();
          newIds.add(node.id);
      }
      setSelectedCategoryIds(newIds);
      setSelectedItemIds(new Set()); 
  };
  
  const handleCategoryDragStart = (e: React.DragEvent, node: PriceBookCategory) => {
      e.stopPropagation();
      let catsToDrag: PriceBookCategory[] = [];
      if (selectedCategoryIds.has(node.id)) {
          const findNodes = (n: PriceBookCategory) => {
              if (selectedCategoryIds.has(n.id)) catsToDrag.push(n);
              n.children.forEach(findNodes);
          };
          findNodes(activeBook.rootCategory);
      } else {
          setSelectedCategoryIds(new Set([node.id]));
          catsToDrag = [node];
      }
      const enrichedCats = catsToDrag.map(c => injectSourceInfo(c, activeBookId, c.color));
      e.dataTransfer.setData("application/edil-price-book-categories", JSON.stringify(enrichedCats));
      e.dataTransfer.setData("application/edil-pb-cat-id", node.id); 
      if (enrichedCats.length === 1) {
          e.dataTransfer.setData("application/edil-price-book-category", JSON.stringify(enrichedCats[0]));
      }
      e.dataTransfer.effectAllowed = "move";
      const ghost = document.createElement('div');
      ghost.style.cssText = `position: absolute; top: -1000px; background: white; border: 1px solid #10b981; padding: 4px 8px; border-radius: 4px; z-index: 9999; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 4px; color: #064e3b; box-shadow: 0 4px 6px rgba(0,0,0,0.1);`;
      ghost.innerHTML = `<span style="background:#d1fae5; padding: 1px 4px; border-radius: 2px;">${catsToDrag.length}</span> Categorie`;
      if (catsToDrag.length === 1) {
           ghost.innerHTML = `<span style="background:#d1fae5; padding: 1px 4px; border-radius: 2px;">${node.code}</span> ${node.name}`;
      }
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => document.body.removeChild(ghost), 0);
  };
  
  const handleItemClick = (item: PriceBookItem, index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setContextMenu(null);
      const newSelected = new Set(e.ctrlKey || e.metaKey ? selectedItemIds : []);
      if (e.ctrlKey || e.metaKey) {
          if (newSelected.has(item.id)) newSelected.delete(item.id);
          else newSelected.add(item.id);
          setLastClickedItemId(item.id);
      } else if (e.shiftKey && lastClickedItemId) {
          const lastIndex = visibleItems.findIndex(i => i.id === lastClickedItemId);
          if (lastIndex !== -1) {
              const start = Math.min(lastIndex, index);
              const end = Math.max(lastIndex, index);
              for(let i=start; i<=end; i++) newSelected.add(visibleItems[i].id);
          }
      } else {
          newSelected.add(item.id);
          setLastClickedItemId(item.id);
      }
      setSelectedItemIds(newSelected);
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('[draggable="true"]')) return;
      const container = itemsContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;
      setIsSelecting(true);
      selectionStartPos.current = { x, y };
      setSelectionRect({ x, y, w: 0, h: 0 });
      if (!e.ctrlKey && !e.shiftKey) setSelectedItemIds(new Set());
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
      if (!isSelecting || !selectionStartPos.current || !itemsContainerRef.current) return;
      const container = itemsContainerRef.current;
      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;
      const newRect = {
          x: Math.min(selectionStartPos.current.x, currentX),
          y: Math.min(selectionStartPos.current.y, currentY),
          w: Math.abs(currentX - selectionStartPos.current.x),
          h: Math.abs(currentY - selectionStartPos.current.y)
      };
      setSelectionRect(newRect);
      const newSelection = new Set(e.ctrlKey || e.shiftKey ? selectedItemIds : []);
      const itemElements = container.querySelectorAll('[data-item-id]');
      const selectAbsX = rect.left + newRect.x - container.scrollLeft;
      const selectAbsY = rect.top + newRect.y - container.scrollTop;
      itemElements.forEach((el) => {
          const itemRect = el.getBoundingClientRect();
          const itemId = el.getAttribute('data-item-id');
          if (!itemId) return;
          const isIntersecting = !(itemRect.right < selectAbsX || itemRect.left > selectAbsX + newRect.w || itemRect.bottom < selectAbsY || itemRect.top > selectAbsY + newRect.h);
          if (isIntersecting) newSelection.add(itemId);
      });
      setSelectedItemIds(newSelection);
  };

  const handleContainerMouseUp = () => {
      setIsSelecting(false);
      setSelectionRect(null);
      selectionStartPos.current = null;
  };

  const handleTreeMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('[draggable="true"]')) return;
      const container = treeContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft;
      const y = e.clientY - rect.top + container.scrollTop;
      setIsSelectingCat(true);
      catSelectionStartPos.current = { x, y };
      setCatSelectionRect({ x, y, w: 0, h: 0 });
      if (!e.ctrlKey && !e.shiftKey) setSelectedCategoryIds(new Set());
  };

  const handleTreeMouseMove = (e: React.MouseEvent) => {
      if (!isSelectingCat || !catSelectionStartPos.current || !treeContainerRef.current) return;
      const container = treeContainerRef.current;
      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;
      const newRect = {
          x: Math.min(catSelectionStartPos.current.x, currentX),
          y: Math.min(catSelectionStartPos.current.y, currentY),
          w: Math.abs(currentX - catSelectionStartPos.current.x),
          h: Math.abs(currentY - catSelectionStartPos.current.y)
      };
      setCatSelectionRect(newRect);
      const newSelection = new Set(e.ctrlKey || e.shiftKey ? selectedCategoryIds : []);
      const itemElements = container.querySelectorAll('[data-cat-id]');
      const selectAbsX = rect.left + newRect.x - container.scrollLeft;
      const selectAbsY = rect.top + newRect.y - container.scrollTop;
      itemElements.forEach((el) => {
          const itemRect = el.getBoundingClientRect();
          const catId = el.getAttribute('data-cat-id');
          if (!catId) return;
          const isIntersecting = !(itemRect.right < selectAbsX || itemRect.left > selectAbsX + newRect.w || itemRect.bottom < selectAbsY || itemRect.top > selectAbsY + newRect.h);
          if (isIntersecting) newSelection.add(catId);
      });
      setSelectedCategoryIds(newSelection);
  };

  const handleTreeMouseUp = () => {
      setIsSelectingCat(false);
      setCatSelectionRect(null);
      catSelectionStartPos.current = null;
  };

  const handleItemContextMenu = (e: React.MouseEvent, item: PriceBookItem) => {
      e.preventDefault();
      e.stopPropagation();
      let newSelected = new Set(selectedItemIds);
      if (!newSelected.has(item.id)) {
          newSelected.clear();
          newSelected.add(item.id);
          setSelectedItemIds(newSelected);
          setLastClickedItemId(item.id);
      }
      const x = e.clientX;
      const y = e.clientY;
      setContextMenu({ x, y, visible: true });
  };
  
  const handleCategoryContextMenu = (e: React.MouseEvent, cat: PriceBookCategory, level: number) => {
      e.preventDefault();
      e.stopPropagation();
      let newSelected = new Set(selectedCategoryIds);
      if (!newSelected.has(cat.id)) {
          newSelected.clear();
          newSelected.add(cat.id);
          setSelectedCategoryIds(newSelected);
      }
      const x = e.clientX;
      const y = e.clientY;
      setCatContextMenu({ x, y, catId: cat.id, level });
  };

  const handleCatAction = (action: 'add_sub' | 'rename' | 'duplicate' | 'delete' | 'add_to_estimate' | 'change_color' | 'copy_to_other') => {
      if (!catContextMenu) return;
      const { catId, level } = catContextMenu;
      const node = findNodeById(activeBook.rootCategory, catId);
      if (!node) return;

      if (action === 'change_color') {
          // Restriction: Only Level 1 categories allow color change
          if (level !== 1) {
              alert("Puoi modificare il colore solo alle categorie principali (Livello 1).");
              return;
          }
          setTargetCatForColor(node.id);
          setTempColor(node.color || "#000000");
          setShowColorModal(true);
      } else if (action === 'add_sub') {
          setTargetParentId(node.id);
          const nextCode = findNextCategoryCode(node);
          let prefix = "";
          if (node.code) prefix = node.code + ".";
          setParentPrefix(prefix);
          setCatFormData({ name: '', code: nextCode, color: PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)] });
          setEditingCatId(null);
          setShowCatModal(true);
      } else if (action === 'rename') {
          handleOpenCategoryModal(node);
      } else if (action === 'duplicate') {
          handleDuplicateCategory(node);
      } else if (action === 'copy_to_other') {
          const catsToCopy: PriceBookCategory[] = [];
          if (selectedCategoryIds.has(node.id)) {
               const findNodes = (n: PriceBookCategory) => {
                   if (selectedCategoryIds.has(n.id)) catsToCopy.push(n);
                   n.children.forEach(findNodes);
               };
               findNodes(activeBook.rootCategory);
          } else {
              catsToCopy.push(node);
          }
          handleOpenCopyCategoryModal(catsToCopy);
      } else if (action === 'delete') {
          initiateDeleteCategory(node);
      } else if (action === 'add_to_estimate') {
          if (onImportCategories) {
              const catsToAdd: PriceBookCategory[] = [];
              if (selectedCategoryIds.size > 0) {
                  const traverse = (n: PriceBookCategory) => {
                      if (selectedCategoryIds.has(n.id)) catsToAdd.push(injectSourceInfo(n, activeBookId, n.color));
                      n.children.forEach(traverse);
                  };
                  traverse(activeBook.rootCategory);
              } else {
                  catsToAdd.push(injectSourceInfo(node, activeBookId, node.color));
              }

              if (catsToAdd.length > 0) {
                  onImportCategories(catsToAdd);
              }
          } else if (onAddCategory) {
              const enrichedNode = injectSourceInfo(node, activeBookId, node.color);
              onAddCategory(enrichedNode);
          }
      }
      setCatContextMenu(null);
  };

  const handleSaveColor = () => {
      if (!targetCatForColor) return;
      const updateTree = (node: PriceBookCategory): PriceBookCategory => {
          if (node.id === targetCatForColor) {
              return { ...node, color: tempColor };
          }
          return { ...node, children: node.children.map(updateTree) };
      };
      const newRoot = updateTree(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
      
      if (onCategoryColorUpdate) {
          const changedNode = findNodeById(newRoot, targetCatForColor);
          if (changedNode) {
              const affectedItemCodes = collectAllItemCodes(changedNode);
              onCategoryColorUpdate(activeBookId, affectedItemCodes, tempColor);
          }
      }
      setShowColorModal(false);
  };

  const handleDragStartItem = (e: React.DragEvent, item: PriceBookItem) => {
      let itemsToDrag: (PriceBookItem & { categoryColor?: string })[] = [];
      if (!selectedItemIds.has(item.id)) {
          setSelectedItemIds(new Set([item.id]));
          const visibleItem = visibleItems.find(i => i.id === item.id);
          if (visibleItem) itemsToDrag = [visibleItem];
      } else {
          itemsToDrag = visibleItems.filter(i => selectedItemIds.has(i.id));
      }
      const dragData = itemsToDrag.map(i => ({...i, sourceBookId: activeBookId}));
      e.dataTransfer.setData("application/edil-price-book-items", JSON.stringify(dragData));
      e.dataTransfer.setData("application/edil-pb-item-id", item.id); 
      e.dataTransfer.setData("application/edil-price-book-item", JSON.stringify(dragData[0]));
      if (itemsToDrag.length > 1) {
          const ghost = document.createElement('div');
          ghost.style.cssText = `position: absolute; top: -1000px; background: #059669; color: white; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.2); z-index: 9999; pointer-events: none;`;
          ghost.textContent = `${itemsToDrag.length} voci selezionate`;
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 0, 0);
          setTimeout(() => document.body.removeChild(ghost), 0);
      }
  };

  const handleOpenBookModal = (editBook?: PriceBook) => {
      if (editBook) {
          setEditingBookId(editBook.id);
          setBookFormData({ name: editBook.name, desc: editBook.description || '' });
      } else {
          setEditingBookId(null);
          setBookFormData({ name: '', desc: '' });
      }
      setShowBookModal(true);
  };

  const handleSaveBook = () => {
      if (editingBookId) {
          const updatedBooks = books.map(b => b.id === editingBookId ? { ...b, name: bookFormData.name, description: bookFormData.desc } : b);
          updateBooksWrapper(updatedBooks);
      } else {
          const newBook: PriceBook = {
            id: generateId(),
            name: bookFormData.name || 'Nuovo Prezzario',
            description: bookFormData.desc,
            rootCategory: { id: generateId(), code: '', name: 'Root', items: [], children: [] }
          };
          updateBooksWrapper([...books, newBook]);
          setActiveBookId(newBook.id);
      }
      setShowBookModal(false);
  };

  const cloneCategoryDeep = (node: PriceBookCategory): PriceBookCategory => ({
      ...node,
      id: generateId(),
      items: node.items.map(item => ({ ...item, id: generateId() })),
      children: node.children.map(cloneCategoryDeep),
  });

  const handleDuplicateBook = () => {
      const newBook: PriceBook = {
          id: generateId(),
          name: `${activeBook.name} (Copia)`,
          description: activeBook.description,
          rootCategory: cloneCategoryDeep(activeBook.rootCategory),
      };
      updateBooksWrapper([...books, newBook]);
      setActiveBookId(newBook.id);
  };

  const handleImportXpwe = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      setIsImportingXpwe(true);
      setXpweMessage(null);
      try {
          const text = await file.text();
          const result = parseXpwePriceBook(text);
          const newBook = createPriceBookFromXpwe(result, file.name.replace(/\.(xpwe|xml)$/i, ''));
          updateBooksWrapper([...books, newBook]);
          setActiveBookId(newBook.id);
          setXpweMessage({
              type: 'success',
              text: `Prezzario "${newBook.name}" importato: ${result.itemCount} voci in ${result.categories.length} categorie.`,
          });
      } catch (err) {
          setXpweMessage({
              type: 'error',
              text: err instanceof Error ? err.message : 'Prezzario XPWE non valido.',
          });
      } finally {
          setIsImportingXpwe(false);
      }
  };

  const initiateDeleteBook = () => {
      if (books.length <= 1) {
          alert("Impossibile eliminare l'ultimo prezzario. Creane un altro prima di eliminare questo.");
          return;
      }
      if (!window.confirm(`Eliminare il prezzario "${activeBook.name}"?`)) return;

      const currentIndex = books.findIndex(b => b.id === activeBookId);
      if (currentIndex === -1) return;

      const newBooks = books.filter(b => b.id !== activeBookId);
      let nextBookId = newBooks[0].id;
      if (currentIndex > 0 && newBooks.length >= currentIndex) {
          nextBookId = newBooks[currentIndex - 1].id;
      }
      setActiveBookId(nextBookId);
      updateBooksWrapper(newBooks);
  };

  const initiateDeleteCategory = (node: PriceBookCategory) => {
      if (!window.confirm(`Eliminare la categoria "${node.name}" e tutto il suo contenuto?`)) return;

      const deleteRecursive = (current: PriceBookCategory): PriceBookCategory => {
          const idx = (current.children || []).findIndex(c => c.id === node.id);
          if (idx !== -1) {
              const newChildren = [...current.children];
              newChildren.splice(idx, 1);
              return { ...current, children: newChildren };
          }
          return { ...current, children: (current.children || []).map(deleteRecursive) };
      };

      const newRoot = deleteRecursive(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);

      if (selectedCategoryIds.has(node.id)) {
          const newSet = new Set(selectedCategoryIds);
          newSet.delete(node.id);
          setSelectedCategoryIds(newSet);
      }
  };
  
  const initiateDeleteSelectedCategories = () => {
      if (selectedCategoryIds.size === 0) return;
      if (!window.confirm(`Eliminare ${selectedCategoryIds.size} categorie selezionate e tutto il loro contenuto?`)) return;

      const deleteRecursive = (node: PriceBookCategory): PriceBookCategory => {
          const newChildren = node.children.filter(c => !selectedCategoryIds.has(c.id)).map(deleteRecursive);
          return { ...node, children: newChildren };
      };
      const newRoot = deleteRecursive(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
      setSelectedCategoryIds(new Set());
  };

  const initiateDeleteItem = (itemId: string, itemName: string) => {
      if (!window.confirm(`Eliminare la voce "${itemName}"?`)) return;

      const deleteFromTree = (node: PriceBookCategory): PriceBookCategory => {
          const idx = (node.items || []).findIndex(i => i.id === itemId);
          if (idx !== -1) {
              const newItems = [...node.items];
              newItems.splice(idx, 1);
              return { ...node, items: newItems };
          }
          return { ...node, children: (node.children || []).map(deleteFromTree) };
      };

      const newRoot = deleteFromTree(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
  };
  
  const initiateDeleteSelectedItems = () => {
      if (selectedItemIds.size === 0) return;
      if (!window.confirm(`Eliminare ${selectedItemIds.size} voci selezionate?`)) return;

      const deleteFromTree = (node: PriceBookCategory): PriceBookCategory => {
          const newItems = node.items.filter(i => !selectedItemIds.has(i.id));
          const newChildren = node.children.map(deleteFromTree);
          return { ...node, items: newItems, children: newChildren };
      };
      const newRoot = deleteFromTree(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
      setSelectedItemIds(new Set());
  };

  const handleOpenCopyModal = (items: PriceBookItem[]) => {
      setCopyItemTargets(items);
      setCopyCategoryTargets(null);
      setCopyTargetBookId("");
      setCopyTargetCategoryId(null);
  };

  const handleOpenCopyCategoryModal = (categories: PriceBookCategory[]) => {
      setCopyCategoryTargets(categories);
      setCopyItemTargets(null);
      setCopyTargetBookId("");
      setCopyTargetCategoryId(null);
  };
  
  const handleDuplicateCategory = (nodeToDuplicate: PriceBookCategory) => {
      const deepCloneCategory = (node: PriceBookCategory): PriceBookCategory => {
          return {
              ...node,
              id: generateId(),
              items: node.items.map(i => ({...i, id: generateId()})),
              children: node.children.map(c => deepCloneCategory(c))
          };
      };

      const findParentAndInsert = (root: PriceBookCategory): PriceBookCategory => {
          const childIndex = root.children.findIndex(c => c.id === nodeToDuplicate.id);
          if (childIndex !== -1) {
              let cloned = deepCloneCategory(nodeToDuplicate);
              cloned.name = `${cloned.name} (Copia)`;
              if (isAutoCode) {
                   const nextCode = findNextCategoryCode(root);
                   cloned = updatePriceBookCodes(cloned, cloned.code, nextCode);
                   cloned.code = nextCode;
              }
              const newChildren = [...root.children];
              newChildren.splice(childIndex + 1, 0, cloned);
              return { ...root, children: newChildren };
          }
          return { ...root, children: root.children.map(findParentAndInsert) };
      };
      
      const newRoot = findParentAndInsert(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
  };

  const handleDuplicateItemsLocal = () => {
     if (!copyItemTargets || copyItemTargets.length === 0) return;
     let newRoot = activeBook.rootCategory;
     copyItemTargets.forEach(target => {
         const findCatAndAdd = (node: PriceBookCategory): PriceBookCategory => {
             if (node.items.some(i => i.id === target.id)) {
                 const nextCode = getNextItemCode(node); 
                 const newItem: PriceBookItem = {
                     ...target,
                     id: generateId(),
                     code: nextCode,
                     description: `${target.description} (Copia)`
                 };
                 return { ...node, items: [...node.items, newItem] };
             }
             return { ...node, children: node.children.map(findCatAndAdd) };
         };
         newRoot = findCatAndAdd(newRoot);
     });
     const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
     updateBooksWrapper(updatedBooks);
     setCopyItemTargets(null);
  };

  const handleCopyItemsToRemote = () => {
      if (!copyItemTargets || !copyTargetBookId) return;
      const targetBookIndex = books.findIndex(b => b.id === copyTargetBookId);
      if (targetBookIndex === -1) return;
      const targetBook = books[targetBookIndex];
      let targetCatId = copyTargetCategoryId || targetBook.rootCategory.id;

      let newRoot = targetBook.rootCategory;

      copyItemTargets.forEach(target => {
          const addItemToCat = (node: PriceBookCategory): PriceBookCategory => {
              if (node.id === targetCatId) {
                 const newCode = getNextItemCode(node);
                 const newItem = {
                     ...target,
                     id: generateId(),
                     code: newCode,
                     description: target.description 
                 };
                 return { ...node, items: [...node.items, newItem] };
              }
              return { ...node, children: node.children.map(addItemToCat) };
          };
          newRoot = addItemToCat(newRoot);
      });

      const updatedBooks = [...books];
      updatedBooks[targetBookIndex] = { ...targetBook, rootCategory: newRoot };
      updateBooksWrapper(updatedBooks);
      setCopyItemTargets(null);
      setCopyTargetBookId("");
      setCopyTargetCategoryId(null);
      alert(`${copyItemTargets.length} voci copiate con successo in "${targetBook.name}".`);
  };

  const handleCopyCategoriesToRemote = () => {
      if (!copyCategoryTargets || !copyTargetBookId) return;
      const targetBookIndex = books.findIndex(b => b.id === copyTargetBookId);
      if (targetBookIndex === -1) return;
      
      const targetBook = books[targetBookIndex];
      let targetCatId = copyTargetCategoryId || targetBook.rootCategory.id;

      const deepCloneCategory = (node: PriceBookCategory): PriceBookCategory => {
          return {
              ...node,
              id: generateId(),
              items: node.items.map(i => ({...i, id: generateId()})),
              children: node.children.map(c => deepCloneCategory(c))
          };
      };

      const addCatsToNode = (node: PriceBookCategory): PriceBookCategory => {
          if (node.id === targetCatId) {
              const newCats = copyCategoryTargets.map(target => {
                  let cloned = deepCloneCategory(target);
                  if (isAutoCode) {
                      const nextCode = findNextCategoryCode(node);
                      cloned = updatePriceBookCodes(cloned, cloned.code, nextCode);
                      cloned.code = nextCode;
                  }
                  return cloned;
              });
              return { ...node, children: [...node.children, ...newCats] };
          }
          return { ...node, children: node.children.map(addCatsToNode) };
      };

      const newRoot = addCatsToNode(targetBook.rootCategory);
      const updatedBooks = [...books];
      updatedBooks[targetBookIndex] = { ...targetBook, rootCategory: newRoot };
      updateBooksWrapper(updatedBooks);
      
      setCopyCategoryTargets(null);
      setCopyTargetBookId("");
      setCopyTargetCategoryId(null);
      alert(`${copyCategoryTargets.length} categorie copiate con successo in "${targetBook.name}".`);
  };

  const handleSortBook = () => {
      const sortNode = (node: PriceBookCategory): PriceBookCategory => {
          const sortedChildren = [...node.children].sort((a, b) => compareNatural(a.code, b.code));
          const sortedItems = [...node.items].sort((a, b) => compareNatural(a.code, b.code));
          return { ...node, children: sortedChildren.map(sortNode), items: sortedItems };
      };
      const newRoot = sortNode(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
  };

  const handleAddToEstimate = () => {
      if (!onAddItems) return;
      const itemsToAdd = visibleItems.filter(i => selectedItemIds.has(i.id));
      if (itemsToAdd.length > 0) {
          const enrichedItems = itemsToAdd.map(i => ({
              ...i,
              sourceBookId: activeBookId
          }));
          onAddItems(enrichedItems);
      }
      setContextMenu(null);
  };

  const handleMoveCategory = (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const isDescendant = (parent: PriceBookCategory, target: string): boolean => {
          return parent.children.some(c => c.id === target || isDescendant(c, target));
      };
      const sourceNode = findNodeById(activeBook.rootCategory, sourceId);
      if (!sourceNode) return;
      if (isDescendant(sourceNode, targetId)) {
          alert("Non puoi spostare una categoria dentro una sua sottocategoria.");
          return;
      }
      let nodeToMove: PriceBookCategory | null = null;
      const removeNode = (node: PriceBookCategory): PriceBookCategory => {
          const childIndex = node.children.findIndex(c => c.id === sourceId);
          if (childIndex !== -1) {
              nodeToMove = node.children[childIndex];
              const newChildren = [...node.children];
              newChildren.splice(childIndex, 1);
              return { ...node, children: newChildren };
          }
          return { ...node, children: node.children.map(removeNode) };
      };
      const addNode = (node: PriceBookCategory): PriceBookCategory => {
          if (node.id === targetId && nodeToMove) {
              let updatedNode = { ...nodeToMove };
              if (isAutoCode) {
                  const nextCode = findNextCategoryCode(node); 
                  updatedNode = updatePriceBookCodes(updatedNode, updatedNode.code, nextCode);
                  updatedNode.code = nextCode;
              }
              return { ...node, children: [...node.children, updatedNode] };
          }
          return { ...node, children: node.children.map(addNode) };
      };
      let newRoot = removeNode(activeBook.rootCategory);
      if (nodeToMove) {
          newRoot = addNode(newRoot);
          const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
          updateBooksWrapper(updatedBooks);
      }
  };

  const handleMoveItemToCategory = (itemId: string, targetCategoryId: string) => {
      let itemToMove: PriceBookItem | null = null;
      const removeNode = (node: PriceBookCategory): PriceBookCategory => {
          const idx = node.items.findIndex(i => i.id === itemId);
          if (idx !== -1) {
              itemToMove = node.items[idx];
              const newItems = [...node.items];
              newItems.splice(idx, 1);
              return { ...node, items: newItems };
          }
          return { ...node, children: node.children.map(removeNode) };
      };
      let newRoot = removeNode(activeBook.rootCategory);
      if (!itemToMove) return;
      const addNode = (node: PriceBookCategory): PriceBookCategory => {
          if (node.id === targetCategoryId) {
              if (node.children.length > 0) {
                  alert("Impossibile spostare voce: La categoria di destinazione contiene sottocategorie. Seleziona una categoria di ultimo livello.");
                  return node; 
              }
              let newItem = { ...itemToMove! };
              if (isAutoCode) newItem.code = getNextItemCode(node);
              return { ...node, items: [...node.items, newItem] };
          }
          return { ...node, children: node.children.map(addNode) };
      };
      const targetNode = findNodeById(activeBook.rootCategory, targetCategoryId);
      if (targetNode && targetNode.children.length > 0) {
          alert("Impossibile spostare voce: La categoria di destinazione contiene sottocategorie.");
          return;
      }
      newRoot = addNode(newRoot);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
  };

  const handleAddItemFromDrop = (droppedItemData: any | any[]) => {
      if (selectedCategoryIds.size !== 1) {
          alert("Seleziona una categoria del prezzario dove importare la voce.");
          return;
      }
      const targetId = Array.from(selectedCategoryIds)[0];
      if (typeof targetId === 'string') {
          handleImportItemsToCategory(targetId, droppedItemData);
      }
  };

  const handleImportItemsToCategory = (targetId: string, droppedItemData: any | any[]) => {
      const targetNode = findNodeById(activeBook.rootCategory, targetId);
      if (targetNode && targetNode.children.length > 0) {
          alert("La categoria selezionata contiene sottocategorie. Non puoi importare voci qui.");
          return;
      }
      if (!targetNode) return;
      const itemsToImport = Array.isArray(droppedItemData) ? droppedItemData : [droppedItemData];
      const addToTree = (node: PriceBookCategory): PriceBookCategory => {
          if (node.id === targetId) {
              const newItems = itemsToImport.map(item => ({
                  id: generateId(),
                  code: getNextItemCode(node),
                  description: item.description || item.name || "Voce Importata",
                  uom: item.uom || 'cad',
                  price: item.price || item.amount || 0
              }));
              if (newItems.length > 1) {
                 const baseCode = newItems[0].code;
                 const parts = baseCode.split('.');
                 const lastPart = parts[parts.length-1];
                 const startNum = parseInt(lastPart);
                 if (!isNaN(startNum)) {
                     const prefix = parts.slice(0, parts.length-1).join('.');
                     newItems.forEach((it, idx) => {
                         it.code = `${prefix}.${(startNum + idx).toString().padStart(2, '0')}`;
                     });
                 }
              }
              return { ...node, items: [...node.items, ...newItems] };
          }
          return { ...node, children: node.children.map(addToTree) };
      };
      const newRoot = addToTree(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
  }

  const handleOpenCategoryModal = (node?: PriceBookCategory) => {
      if (node) {
          setEditingCatId(node.id);
          setCatFormData({ name: node.name, code: node.code, color: node.color || '#000000' });
          setTargetParentId(null); 
          setParentPrefix(""); 
      } else {
          setEditingCatId(null);
          const parentId = (selectedCategoryIds.size > 0 ? Array.from(selectedCategoryIds)[0] : null) || activeBook.rootCategory.id;
          setTargetParentId(parentId);
          const parent = findNodeById(activeBook.rootCategory, parentId);
          let nextCode = '';
          let prefix = '';
          let defaultColor = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
          if (parent) {
              nextCode = findNextCategoryCode(parent);
              if (parent.code) prefix = parent.code + ".";
          }
          setParentPrefix(prefix);
          setCatFormData({ name: '', code: nextCode, color: defaultColor });
      }
      setShowCatModal(true);
  };
  
  const handleParentChange = (newParentId: string) => {
      setTargetParentId(newParentId);
      const parent = findNodeById(activeBook.rootCategory, newParentId);
      if (parent) {
          const nextCode = findNextCategoryCode(parent);
          let prefix = "";
          if (parent.code) prefix = parent.code + ".";
          setParentPrefix(prefix);
          setCatFormData(prev => ({ ...prev, code: nextCode }));
      }
  };

  const handleSaveCategory = () => {
      if (editingCatId) {
          const updateTree = (node: PriceBookCategory): PriceBookCategory => {
              if (node.id === editingCatId) {
                  let updatedNode: PriceBookCategory = { ...node, name: catFormData.name, code: catFormData.code, color: catFormData.color };
                  if (isAutoCode && node.code !== catFormData.code) {
                      updatedNode = updatePriceBookCodes(updatedNode, node.code, catFormData.code);
                  }
                  return updatedNode;
              }
              return { ...node, children: node.children.map(updateTree) };
          };
          const newRoot = updateTree(activeBook.rootCategory);
          const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
          updateBooksWrapper(updatedBooks);
      } else {
          const parentId = targetParentId || (selectedCategoryIds.size > 0 ? Array.from(selectedCategoryIds)[0] : null) || activeBook.rootCategory.id;
          let added = false;
          const addToTree = (node: PriceBookCategory): PriceBookCategory => {
              if (node.id === parentId) {
                  const newCat: PriceBookCategory = {
                      id: generateId(),
                      code: catFormData.code || 'NEW',
                      name: catFormData.name || 'Nuova Categoria',
                      color: catFormData.color,
                      children: [],
                      items: []
                  };
                  added = true;
                  if (node.items.length > 0) {
                      newCat.items = [...node.items];
                      return { ...node, items: [], children: [...node.children, newCat] };
                  }
                  return { ...node, children: [...node.children, newCat] };
              }
              return { ...node, children: node.children.map(addToTree) };
          };
          let newRoot = addToTree(activeBook.rootCategory);
          if (!added) {
              const newCat: PriceBookCategory = {
                  id: generateId(),
                  code: catFormData.code || 'NEW',
                  name: catFormData.name || 'Nuova Categoria',
                  color: catFormData.color,
                  children: [],
                  items: []
              };
              newRoot = { ...newRoot, children: [...newRoot.children, newCat] };
          }
          const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
          updateBooksWrapper(updatedBooks);
      }
      setShowCatModal(false);
  };

  const handleOpenItemModal = (item?: PriceBookItem) => {
      if (item) {
          setEditingItemId(item.id);
          setItemFormData(item);
          setParentPrefix("");
      } else {
          if (selectedCategoryIds.size !== 1) return;
          const targetId = Array.from(selectedCategoryIds)[0];
          const selectedNode = findNodeById(activeBook.rootCategory, targetId);
          if (!selectedNode) return;
          if (selectedNode.children.length > 0) {
              alert("Non puoi aggiungere voci a una categoria che contiene sottocategorie. Seleziona una sottocategoria.");
              return;
          }
          setEditingItemId(null);
          const nextCode = getNextItemCode(selectedNode);
          const prefix = selectedNode.code ? selectedNode.code + "." : "";
          setParentPrefix(prefix);
          setItemFormData({ code: nextCode, description: '', uom: 'cad', price: 0 });
      }
      setShowItemModal(true);
  };

  const handleSaveItem = () => {
      let updatedItemInstance: PriceBookItem | null = null;
      let oldCode: string | undefined = undefined;

      const updateTree = (node: PriceBookCategory): PriceBookCategory => {
          if (editingItemId) {
              const itemIndex = node.items.findIndex(i => i.id === editingItemId);
              if (itemIndex !== -1) {
                  const newItems = [...node.items];
                  oldCode = newItems[itemIndex].code; 
                  updatedItemInstance = { ...newItems[itemIndex], ...itemFormData } as PriceBookItem;
                  newItems[itemIndex] = updatedItemInstance;
                  return { ...node, items: newItems };
              }
          } else if (selectedCategoryIds.has(node.id)) {
               if (selectedCategoryIds.size === 1 && selectedCategoryIds.has(node.id)) {
                   if (node.children.length > 0) return node;
                   updatedItemInstance = {
                        id: generateId(), code: itemFormData.code || 'NEW', description: itemFormData.description || '', uom: itemFormData.uom || 'cad', price: itemFormData.price || 0
                   };
                   return { ...node, items: [...node.items, updatedItemInstance] };
               }
          }
          return { ...node, children: node.children.map(updateTree) };
      };
      const newRoot = updateTree(activeBook.rootCategory);
      const updatedBooks = books.map(b => b.id === activeBookId ? { ...b, rootCategory: newRoot } : b);
      updateBooksWrapper(updatedBooks);
      
      if (updatedItemInstance && onPriceBookItemUpdate) {
          onPriceBookItemUpdate(activeBookId, updatedItemInstance, oldCode !== updatedItemInstance.code ? oldCode : undefined);
      }
      setShowItemModal(false);
  };

  const handleOpenPdfWizard = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsParsingPdf(true);
      try {
          const pdfjs = await import('pdfjs-dist');
          pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.mjs`;
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          
          let allRows: string[][] = [];
          const maxPages = Math.min(pdf.numPages, 50); 
          
          for (let i = 1; i <= maxPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              
              const items = textContent.items as any[];
              const rows: Record<number, any[]> = {};
              
              items.forEach(item => {
                  const y = Math.round(item.transform[5]);
                  const existingY = Object.keys(rows).find(ry => Math.abs(parseInt(ry) - y) < 4);
                  if (existingY) {
                      rows[parseInt(existingY)].push(item);
                  } else {
                      rows[y] = [item];
                  }
              });
              
              const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
              
              sortedYs.forEach(y => {
                  const rowItems = rows[y].sort((a, b) => a.transform[4] - b.transform[4]);
                  // Heuristic: group items that are very close horizontally into single columns
                  if (rowItems.length > 0) {
                      let currentCols = [(rowItems[0].str || '')];
                      for (let j = 1; j < rowItems.length; j++) {
                          const prevItem = rowItems[j-1];
                          const curItem = rowItems[j];
                          const gap = curItem.transform[4] - (prevItem.transform[4] + prevItem.width);
                          
                          if (gap < 15) { // Threshold for "same column"
                              currentCols[currentCols.length - 1] += " " + (curItem.str || '');
                          } else {
                              currentCols.push((curItem.str || ''));
                          }
                      }
                      const filtered = currentCols.map(s => (s || '').trim()).filter(s => s.length > 0);
                      if (filtered.length > 0) allRows.push(filtered);
                  }
              });
          }

          if (allRows.length > 0) {
              setCsvPreviewRows(allRows.slice(0, 50));
              setCsvRawLines(allRows.map(r => r.join('|||'))); // Use a very unique separator
              setCsvSeparator('|||');
              setCsvFileName(file.name);
              setCsvMapping({});
              setCsvSkipHeader(false);
              setWizardStep('mapping');
              setShowCsvWizard(true);
          } else {
              alert("Nessun dato testuale rilevato nel PDF.");
          }
      } catch (err) {
          console.error(err);
          alert("Errore durante la lettura del PDF.");
      } finally {
          setIsParsingPdf(false);
          e.target.value = '';
      }
  };

  const handleOpenCsvWizard = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          const lines = text.split(/\r?\n/).filter(l => (l || '').trim().length > 0);
          if (lines.length > 0) {
              setCsvRawLines(lines);
              const separator = lines[0].includes(';') ? ';' : ',';
              setCsvSeparator(separator);
              const preview = lines.slice(0, 15).map(l => l.split(new RegExp(`${separator}(?=(?:[^"]*"[^"]*")*[^"]*$)`)).map(c => (c || '').trim().replace(/^"|"$/g, '')));
              setCsvPreviewRows(preview);
              setCsvFileName(file.name);
              setCsvMapping({});
              setCsvSkipHeader(true);
              setWizardStep('mapping');
              setShowCsvWizard(true);
          } else {
              alert("Il file CSV sembra vuoto.");
          }
      };
      reader.readAsText(file);
      e.target.value = '';
  };

  const analyzeCsvCategories = () => {
      const separator = csvSeparator;
      const map = Object.entries(csvMapping);
      const getIdx = (type: string) => { const found = map.find(([, t]) => t === type); return found ? parseInt(found[0]) : -1; };
      const idxCatFull = getIdx('cat_full');
      const idxCatCode = getIdx('cat_code');
      const idxCatDesc = getIdx('cat_desc');
      const idxCode = getIdx('code');
      
      const cats = new Set<string>();
      const detected: Record<string, string> = {};

      csvRawLines.forEach((line, i) => {
          if (i === 0 && csvSkipHeader) return;
          const cols = line.split(separator === '|||' ? '|||' : new RegExp(`${separator}(?=(?:[^"]*"[^"]*")*[^"]*$)`)).map(c => (c || '').trim().replace(/^"|"$/g, ''));
          let catCodes: string[] = [];

          if (idxCatCode !== -1 && cols[idxCatCode]) {
              const code = cols[idxCatCode];
              catCodes.push(code);
              if (idxCatDesc !== -1 && cols[idxCatDesc]) {
                  detected[code] = cols[idxCatDesc];
              }
          } else if (idxCatFull !== -1 && cols[idxCatFull]) {
              const catCode = (cols[idxCatFull].split(' - ')[0] || '').trim();
              catCodes.push(catCode);
          } else {
              // Hierarchical columns (L1, L2, L3, L4, L5)
              let hierarchicalPath = "";
              for (let level = 1; level <= 5; level++) {
                  const idxSimple = getIdx(`cat_l${level}`);
                  const idxCode = getIdx(`cat_l${level}_code`);
                  const idxDesc = getIdx(`cat_l${level}_desc`);

                  let partCode = "";
                  let partDesc = "";

                  if (idxSimple !== -1 && cols[idxSimple]) {
                      partCode = cols[idxSimple];
                      partDesc = cols[idxSimple];
                  } else if (idxCode !== -1 && cols[idxCode]) {
                      partCode = cols[idxCode];
                      if (idxDesc !== -1 && cols[idxDesc]) {
                          partDesc = cols[idxDesc];
                      }
                  }

                  if (partCode) {
                      hierarchicalPath = hierarchicalPath ? `${hierarchicalPath}.${partCode}` : partCode;
                      catCodes.push(hierarchicalPath);
                      if (partDesc) {
                          detected[hierarchicalPath] = partDesc;
                      }
                  } else {
                      break; 
                  }
              }
          }
          
          if (catCodes.length === 0 && idxCode !== -1 && cols[idxCode]) {
              const parts = cols[idxCode].split('.');
              if (parts.length > 1) {
                  let current = parts[0];
                  catCodes.push(current);
                  for (let j = 1; j < parts.length - 1; j++) {
                      current += '.' + parts[j];
                      catCodes.push(current);
                  }
              }
          }

          catCodes.forEach(c => cats.add(c));
      });

      // Fill in names for codes that didn't have a description mapped
      Array.from(cats).sort().forEach(c => {
          if (!detected[c]) {
              // If it's a hierarchy path, maybe the last part is the name
              const parts = c.split('.');
              detected[c] = parts[parts.length - 1];
          }
      });
      
      setCsvDetectedCategories(detected);
      setWizardStep('categories');
  };

  const executeCsvImport = () => {
      const separator = csvSeparator;
      const map = Object.entries(csvMapping);
      const getIdx = (type: string) => { const found = map.find(([, t]) => t === type); return found ? parseInt(found[0]) : -1; };
      const idxCode = getIdx('code');
      const idxDesc = getIdx('desc');
      const idxUom = getIdx('uom');
      const idxPrice = getIdx('price');
      const idxCatFull = getIdx('cat_full');
      
      const root: PriceBookCategory = { id: generateId(), code: '', name: 'Root', items: [], children: [] };
      const catMap: Record<string, PriceBookCategory> = {};

      const ensurePath = (codePath: string): PriceBookCategory => {
          if (catMap[codePath]) return catMap[codePath];
          const parts = codePath.split('.');
          let currentPath = "";
          let parent = root;
          for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              const fullCode = currentPath ? `${currentPath}.${part}` : part;
              if (!catMap[fullCode]) {
                  const newCat: PriceBookCategory = { id: generateId(), code: fullCode, name: csvDetectedCategories[fullCode] || fullCode, children: [], items: [] };
                  parent.children.push(newCat);
                  catMap[fullCode] = newCat;
              }
              parent = catMap[fullCode];
              currentPath = fullCode;
          }
          return parent;
      };

      csvRawLines.forEach((line, i) => {
          if (i === 0 && csvSkipHeader) return;
          const cols = line.split(separator === '|||' ? '|||' : new RegExp(`${separator}(?=(?:[^"]*"[^"]*")*[^"]*$)`)).map(c => (c || '').trim().replace(/^"|"$/g, ''));
          const code = idxCode !== -1 ? cols[idxCode] : `IMP.${i}`;
          const desc = idxDesc !== -1 ? cols[idxDesc] : 'Voce importata';
          const uom = idxUom !== -1 ? cols[idxUom] : 'cad';
          const priceRaw = idxPrice !== -1 && cols[idxPrice] ? cols[idxPrice] : '0';
          const price = parseFloat(priceRaw.replace('€', '').replace(/\./g, '').replace(',', '.').trim()) || 0;

          let targetCat = root;
          const catCodeMapping = getIdx('cat_code');
          if (catCodeMapping !== -1 && cols[catCodeMapping]) {
              targetCat = ensurePath(cols[catCodeMapping]);
          } else if (idxCatFull !== -1 && cols[idxCatFull]) {
              const catCode = (cols[idxCatFull].split(' - ')[0] || '').trim();
              targetCat = ensurePath(catCode);
          } else {
              // Hierarchical columns
              let hierarchicalPath = "";
              for (let level = 1; level <= 5; level++) {
                  const idxSimple = getIdx(`cat_l${level}`);
                  const idxCode = getIdx(`cat_l${level}_code`);

                  let partCode = "";
                  if (idxSimple !== -1 && cols[idxSimple]) {
                      partCode = cols[idxSimple];
                  } else if (idxCode !== -1 && cols[idxCode]) {
                      partCode = cols[idxCode];
                  }

                  if (partCode) {
                      hierarchicalPath = hierarchicalPath ? `${hierarchicalPath}.${partCode}` : partCode;
                  } else {
                      break;
                  }
              }

              if (hierarchicalPath) {
                  targetCat = ensurePath(hierarchicalPath);
              } else if (idxCode !== -1 && (code || '').includes('.')) {
                  const parts = code.split('.');
                  if (parts.length > 1) {
                      const catCode = parts.slice(0, parts.length - 1).join('.');
                      targetCat = ensurePath(catCode);
                  }
              }
          }
          const newItem: PriceBookItem = { id: generateId(), code, description: desc, uom, price };
          targetCat.items.push(newItem);
      });
      const newBook: PriceBook = { id: generateId(), name: csvFileName.replace('.csv', '').replace('.pdf', ''), rootCategory: root };
      updateBooksWrapper([...books, newBook]);
      setActiveBookId(newBook.id);
      setShowCsvWizard(false);
  };
  
  const handleExportCSV = () => {
    let csv = "Codice;Categoria;Codice Voce;Descrizione;U.M.;Prezzo\n";
    const traverse = (node: PriceBookCategory, path: string) => {
        const catName = node.name !== 'Root' ? node.name : '';
        node.items.forEach(item => {
             csv += `"${node.code}";"${catName}";"${item.code}";"${item.description}";"${item.uom}";"${item.price.toLocaleString('it-IT')}"\n`;
        });
        node.children.forEach(c => traverse(c, path ? path + " > " + node.name : node.name));
    };
    traverse(activeBook.rootCategory, "");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${activeBook.name}.csv`;
    link.click();
  };

  const startResizing = useCallback((e: React.MouseEvent) => { e.preventDefault(); setIsResizing(true); }, []);
  const startResizingTree = useCallback((e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setIsResizingTree(true); }, []);

  useEffect(() => {
      const resize = (e: MouseEvent) => {
          if (isResizing) { setWidth(prev => Math.max(300, Math.min(prev - e.movementX, 800))); }
          if (isResizingTree) { setTreeHeight(prev => { const newH = prev + e.movementY; return Math.max(150, Math.min(newH, window.innerHeight - 300)); }); }
      };
      const stop = () => { setIsResizing(false); setIsResizingTree(false); };
      if (isResizing || isResizingTree) { window.addEventListener('mousemove', resize); window.addEventListener('mouseup', stop); }
      return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stop); };
  }, [isResizing, isResizingTree]);

  const canEditColor = (!editingCatId && targetParentId === activeBook.rootCategory.id) || (editingCatId && activeBook.rootCategory.children.some(c => c.id === editingCatId));

  return (
    <div 
        className="h-full bg-white border-l shadow-xl flex flex-col z-40 relative group/panel"
        style={{ width, maxWidth: '90vw' }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
             e.preventDefault();
             e.stopPropagation();
             const itemsData = e.dataTransfer.getData("application/edil-items");
             if (itemsData) { try { handleAddItemFromDrop(JSON.parse(itemsData)); return; } catch(err) { console.error(err); } }
             const wbsNodeData = e.dataTransfer.getData("application/edil-wbs-node-data");
             const wbsNodesData = e.dataTransfer.getData("application/edil-wbs-nodes-data");
             if (wbsNodeData || wbsNodesData) {
                  try {
                      const nodesToImport = wbsNodesData ? JSON.parse(wbsNodesData) : [JSON.parse(wbsNodeData)];
                      const convertNode = (wbsNode: any): PriceBookCategory => ({
                          id: generateId(), code: wbsNode.code, name: wbsNode.name, color: PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)],
                          items: (wbsNode.items || []).map((i: any) => ({ id: generateId(), code: i.code, description: i.description, uom: i.uom, price: i.price })),
                          children: (wbsNode.children || []).map(convertNode)
                      });
                      const importedCats = nodesToImport.map(convertNode);
                      const updatedRoot = { ...activeBook.rootCategory, children: [...activeBook.rootCategory.children, ...importedCats] };
                      updateBooksWrapper(books.map(b => b.id === activeBookId ? { ...b, rootCategory: updatedRoot } : b));
                      alert(`${importedCats.length} categorie importate nel prezzario.`);
                      return;
                  } catch(e) { console.error(e); }
             }
             const itemData = e.dataTransfer.getData("application/edil-price-book-item");
             if (itemData) { try { handleAddItemFromDrop(JSON.parse(itemData)); } catch(err) { console.error(err); } }
        }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-emerald-400 active:bg-emerald-600 transition-colors z-50 flex items-center justify-center group/handle" onMouseDown={startResizing}>
          <div className="h-8 w-1 bg-gray-300 rounded-full group-hover/handle:bg-white transition-colors"></div>
      </div>

      <div className="p-3 border-b bg-emerald-50/50 flex flex-col gap-2">
         <div className="flex justify-between items-start">
             <div className="flex-1 mr-2">
                 <div className="flex items-center gap-2 mb-1">
                     <BookOpen className="text-emerald-700" size={18} />
                     <select value={activeBookId} onChange={(e) => setActiveBookId(e.target.value)} className="font-bold text-gray-800 bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-sm w-full truncate">
                         {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                     </select>
                     <button onClick={() => handleOpenBookModal(activeBook)} className="p-1 text-gray-400 hover:text-emerald-600"><Edit2 size={12}/></button>
                 </div>
                 <p className="text-[10px] text-gray-400 ml-6 line-clamp-1">{activeBook.description || "Nessuna descrizione"}</p>
              {xpweMessage && (
                  <p className={`mt-1 rounded px-2 py-1 text-[10px] font-medium ${xpweMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {xpweMessage.text}
                  </p>
              )}
             </div>
             <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
         </div>

         <div className="flex justify-between items-center mt-1">
             <div className="flex gap-1">
                 <button onClick={() => handleOpenBookModal()} className="p-1.5 bg-white border rounded hover:bg-emerald-50 text-emerald-600" title="Nuovo Prezzario"><Plus size={14}/></button>
                 <button onClick={() => xpweInputRef.current?.click()} disabled={isImportingXpwe} className="p-1.5 bg-white border rounded hover:bg-emerald-50 text-emerald-600 disabled:opacity-50" title="Importa prezzario XPWE (.xpwe/.xml)">{isImportingXpwe ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14}/>}</button><input ref={xpweInputRef} type="file" accept=".xpwe,.xml,application/xml,text/xml" className="hidden" onChange={handleImportXpwe} disabled={isImportingXpwe} /><button onClick={handleDuplicateBook} className="p-1.5 bg-white border rounded hover:bg-emerald-50 text-emerald-600" title="Duplica Prezzario"><Copy size={14}/></button>
                  <button onClick={initiateDeleteBook} className="p-1.5 bg-white border rounded hover:bg-red-50 text-red-600" title="Elimina Prezzario"><Trash2 size={14}/></button>
                 <div className="w-px bg-gray-300 mx-1 h-6"></div>
                 <button onClick={handleSortBook} className="p-1.5 bg-white border rounded hover:bg-gray-100 text-gray-600" title="Ordina tutto"><ArrowDownAZ size={14}/></button>
                 <button onClick={() => setIsAutoCode(!isAutoCode)} className={`p-1.5 border rounded transition-colors ${isAutoCode ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`} title={isAutoCode ? "Codici Automatici" : "Codici Manuali"}>
                    {isAutoCode ? <Hash size={14}/> : <Hash size={14} className="opacity-50"/>}
                 </button>
             </div>
             <div className="flex gap-1">
                 <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"><Undo size={14}/></button>
                 <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"><Redo size={14}/></button>
                 <div className="w-px bg-gray-300 mx-1 h-6"></div>
                 {isParsingPdf ? (
                     <div className="p-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded animate-pulse flex items-center gap-2">
                         <Loader2 size={14} className="animate-spin" />
                         <span className="text-[10px] font-bold">PDF...</span>
                     </div>
                 ) : (
                     <label className="p-1.5 bg-white border rounded hover:bg-gray-100 text-gray-600 cursor-pointer" title="Importa PDF DEI">
                         <FileText size={14}/>
                         <input type="file" accept=".pdf" className="hidden" onChange={handleOpenPdfWizard} disabled={isParsingPdf}/>
                     </label>
                 )}
                 <label className="p-1.5 bg-white border rounded hover:bg-gray-100 text-gray-600 cursor-pointer" title="Importa CSV"><FileSpreadsheet size={14}/><input type="file" accept=".csv" className="hidden" onChange={handleOpenCsvWizard}/></label>
                 <button onClick={handleExportCSV} className="p-1.5 bg-white border rounded hover:bg-gray-100 text-gray-600" title="Esporta CSV"><Download size={14}/></button>
             </div>
         </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
          <div ref={treeContainerRef} className="border-b overflow-y-auto bg-gray-50 flex flex-col relative shrink-0" style={{ height: treeHeight }} onMouseDown={handleTreeMouseDown} onMouseMove={handleTreeMouseMove} onMouseUp={handleTreeMouseUp} onMouseLeave={handleTreeMouseUp}>
               {catSelectionRect && <div className="absolute bg-emerald-500/20 border border-emerald-500 pointer-events-none z-50" style={{ left: catSelectionRect.x, top: catSelectionRect.y, width: catSelectionRect.w, height: catSelectionRect.h }} />}
              <div className="p-2 border-b bg-gray-100 sticky top-0 z-10">
                  <input className="w-full text-xs p-1 border rounded mb-1" placeholder="Cerca Categoria..." value={categorySearchTerm} onChange={(e) => setCategorySearchTerm(e.target.value)} />
                  <div className="flex gap-1">
                    <button onClick={() => handleOpenCategoryModal()} className="flex-1 py-1 bg-white border border-dashed text-gray-500 text-xs hover:text-emerald-600 hover:border-emerald-300 rounded flex items-center justify-center gap-1"><Plus size={10} /> Categoria</button>
                     {selectedCategoryIds.size > 0 && <button onClick={initiateDeleteSelectedCategories} className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded text-xs hover:bg-red-100" title="Elimina categorie selezionate"><Trash2 size={12}/></button>}
                  </div>
              </div>
              <div className="p-1">
                 <CategoryTree node={activeBook.rootCategory} bookId={activeBookId} selectedIds={selectedCategoryIds} onSelect={handleCategorySelect} onEdit={handleOpenCategoryModal} onDuplicate={handleDuplicateCategory} onDelete={initiateDeleteCategory} onMove={handleMoveCategory} onMoveItem={handleMoveItemToCategory} onCategoryDragStart={handleCategoryDragStart} onImportCostItems={handleImportItemsToCategory} onContextMenu={handleCategoryContextMenu} duplicateCodes={duplicateCodes} filterText={categorySearchTerm} />
              </div>
              <div className="absolute left-0 right-0 bottom-0 h-1 cursor-row-resize hover:bg-emerald-400 active:bg-emerald-600 transition-colors z-20" onMouseDown={startResizingTree}></div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-white min-w-0 relative">
              <div className="p-2 border-b flex gap-2 items-center bg-gray-50">
                  <div className="relative flex-1"><Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-full focus:ring-1 focus:ring-emerald-500 outline-none" placeholder="Cerca voce..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                  {selectedItemIds.size > 0 && <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200"><button onClick={initiateDeleteSelectedItems} className="p-1.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100" title={`Elimina ${selectedItemIds.size} voci`}><Trash2 size={16} /></button><div className="text-xs text-gray-500 font-bold whitespace-nowrap px-1">{selectedItemIds.size} scelti</div></div>}
                  <button onClick={() => handleOpenItemModal()} disabled={selectedCategoryIds.size !== 1} className="p-1.5 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all" title="Aggiungi Voce"><Plus size={16} /></button>
              </div>
              {selectionRect && <div className="absolute bg-blue-500/20 border border-blue-500 pointer-events-none z-50" style={{ left: selectionRect.x, top: selectionRect.y, width: selectionRect.w, height: selectionRect.h }} />}
              <div ref={itemsContainerRef} className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50/50 relative" onMouseDown={handleContainerMouseDown} onMouseMove={handleContainerMouseMove} onMouseUp={handleContainerMouseUp} onMouseLeave={handleContainerMouseUp}>
                  {visibleItems.length === 0 ? <div className="text-center text-gray-400 mt-10 text-xs italic p-4">{selectedCategoryIds.size > 0 ? "Nessuna voce nelle categorie selezionate. Aggiungine una o trascinala dal computo." : "Seleziona una categoria a sinistra per vedere le voci."}</div> : visibleItems.map((item, index) => {
                          const isDuplicate = duplicateCodes.has(item.code);
                          const isSelected = selectedItemIds.has(item.id);
                          return (
                              <div key={item.id} data-item-id={item.id} draggable onClick={(e) => handleItemClick(item, index, e)} onContextMenu={(e) => handleItemContextMenu(e, item)} onDragStart={(e) => handleDragStartItem(e, item)} className={`bg-white p-2 rounded border hover:shadow-md transition-all group relative border-l-4 select-none cursor-default ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50 shadow-md z-10' : 'hover:border-emerald-300'}`} style={{ borderLeftColor: isSelected ? '#10b981' : (item.categoryColor || '#d1d5db') }}>
                                  <div className="flex justify-between items-start mb-1">
                                      <div className="flex items-center gap-2">
                                          <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${isDuplicate ? 'bg-red-100 text-red-700' : ''}`} style={!isDuplicate && item.categoryColor ? { backgroundColor: item.categoryColor, color: '#1f2937' } : (!isDuplicate ? { backgroundColor: '#f3f4f6', color: '#4b5563' } : {})}>{item.code}</span>
                                          {isDuplicate && <AlertTriangle size={12} className="text-red-500" />}
                                      </div>
                                      <div className={`flex gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                          <button onClick={(e) => { e.stopPropagation(); handleOpenCopyModal([item]); }} className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Copia Voce" type="button" onMouseDown={e => e.stopPropagation()}><Copy size={12}/></button>
                                          <button onClick={(e) => { e.stopPropagation(); handleOpenItemModal(item); }} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Modifica" type="button" aria-label="Modifica Voce" onMouseDown={e => e.stopPropagation()}><Edit2 size={12}/></button>
                                          <button onClick={(e) => { e.stopPropagation(); initiateDeleteItem(item.id, item.description); }} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Elimina" type="button" aria-label="Elimina Voce" onMouseDown={e => e.stopPropagation()}><Trash2 size={12}/></button>
                                      </div>
                                  </div>
                                  <p className="text-xs text-gray-800 font-medium leading-snug mb-1.5 pr-6">{item.description}</p>
                                  <div className="flex justify-between items-end border-t border-dashed pt-1.5 mt-1">
                                      <span className="text-[10px] text-gray-400 flex items-center gap-1"><Tag size={10} /> {item.categoryName}</span>
                                      <div className="text-right"><span className="text-[10px] text-gray-500 mr-2">{item.uom}</span><span className="font-bold text-sm text-emerald-700">€ {item.price.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span></div>
                                  </div>
                              </div>
                          );
                      })}
              </div>
          </div>
      </div>
      
      {/* Context Menus */}
      {catContextMenu && (
          <div className="fixed z-[100] bg-white border border-gray-200 shadow-xl rounded-lg py-1 w-56 text-sm" style={{ top: Math.min(catContextMenu.y, window.innerHeight - 200), left: Math.min(catContextMenu.x, window.innerWidth - 200) }} onClick={(e) => e.stopPropagation()}>
              <div className="px-3 py-2 border-b border-gray-100 text-xs font-bold text-gray-500 bg-gray-50">{selectedCategoryIds.size > 1 ? `${selectedCategoryIds.size} Categorie Selezionate` : 'Opzioni Categoria'}</div>
              <button onClick={() => handleCatAction('add_to_estimate')} className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 flex items-center gap-2"><BookUp size={16} /> Copia nel computo</button>
              <button onClick={() => handleCatAction('copy_to_other')} className="w-full text-left px-4 py-2 hover:bg-purple-50 text-gray-700 hover:text-purple-700 flex items-center gap-2"><ArrowRight size={16} /> Copia/Sposta in...</button>
              <div className="border-t border-gray-100 my-1"></div>
              {selectedCategoryIds.size <= 1 && (
                  <>
                      {/* Check restriction: Level 1 only */}
                      {catContextMenu.level === 1 && <button onClick={() => handleCatAction('change_color')} className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 flex items-center gap-2"><Palette size={16} /> Cambia Colore</button>}
                      <button onClick={() => handleCatAction('add_sub')} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-gray-700 hover:text-blue-700 flex items-center gap-2"><Plus size={16} /> Aggiungi Sottocategoria</button>
                      <button onClick={() => handleCatAction('rename')} className="w-full text-left px-4 py-2 hover:bg-yellow-50 text-gray-700 hover:text-yellow-700 flex items-center gap-2"><Edit2 size={16} /> Rinomina</button>
                      <button onClick={() => handleCatAction('duplicate')} className="w-full text-left px-4 py-2 hover:bg-purple-50 text-gray-700 hover:text-purple-700 flex items-center gap-2"><Copy size={16} /> Duplica</button>
                      <div className="border-t border-gray-100 my-1"></div>
                  </>
              )}
              <button onClick={() => handleCatAction('delete')} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 size={16} /> Elimina</button>
          </div>
      )}
      {contextMenu && contextMenu.visible && <div className="fixed z-[100] bg-white border border-gray-200 shadow-xl rounded-lg py-1 w-48 text-sm" style={{ top: Math.min(contextMenu.y, window.innerHeight - 200), left: Math.min(contextMenu.x, window.innerWidth - 200) }} onClick={(e) => e.stopPropagation()}><div className="px-3 py-2 border-b border-gray-100 text-xs font-bold text-gray-500 bg-gray-50">{selectedItemIds.size} voci selezionate</div><button onClick={handleAddToEstimate} className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 flex items-center gap-2"><Plus size={16} /> Aggiungi al computo</button><button onClick={() => { if (selectedItemIds.size > 0) { const itemsToCopy = visibleItems.filter(i => selectedItemIds.has(i.id)); handleOpenCopyModal(itemsToCopy); } setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-purple-50 text-gray-700 hover:text-purple-700 flex items-center gap-2"><Copy size={16} /> Copia/Sposta in...</button><div className="border-t border-gray-100 my-1"></div><button onClick={() => { initiateDeleteSelectedItems(); setContextMenu(null); }} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 size={16} /> Elimina</button></div>}

      {/* Color Picker, Category, Book, Copy Modals ... */}
      {showColorModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
                <div className="p-4 border-b font-bold text-gray-700 flex justify-between items-center"><span className="flex items-center gap-2"><Palette size={18}/> Seleziona Colore</span><button onClick={() => setShowColorModal(false)}><X size={18}/></button></div>
                <div className="p-4"><div className="mb-4"><label className="block text-xs font-bold text-gray-500 mb-2">Colori Suggeriti</label><div className="flex flex-wrap gap-3">{PASTEL_COLORS.map(c => (<button key={c} onClick={() => setTempColor(c)} className={`w-8 h-8 rounded-full border shadow-sm transition-transform ${tempColor === c ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110' : 'border-gray-200 hover:scale-105'}`} style={{ backgroundColor: c }} title={c} />))}</div></div><div className="mb-4"><label className="block text-xs font-bold text-gray-500 mb-2">Colore Personalizzato</label><div className="flex items-center gap-3"><input type="color" value={tempColor} onChange={(e) => setTempColor(e.target.value)} className="w-12 h-12 rounded cursor-pointer border-none bg-transparent p-0 overflow-hidden" /><div className="flex-1"><input type="text" value={tempColor} onChange={(e) => setTempColor(e.target.value)} className="w-full border rounded p-2 text-sm font-mono uppercase" placeholder="#RRGGBB" /></div></div></div><div className="flex justify-end pt-2"><button onClick={handleSaveColor} className="bg-emerald-600 text-white px-6 py-2 rounded font-bold hover:bg-emerald-700 shadow-sm w-full">Applica Colore</button></div></div>
            </div>
        </div>
      )}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
                <div className="p-4 border-b font-bold text-gray-700 flex justify-between items-center"><span>{editingCatId ? 'Modifica Categoria' : 'Nuova Categoria'}</span><button onClick={() => setShowCatModal(false)}><X size={18}/></button></div>
                <div className="p-4 space-y-3">{!editingCatId && (<div><label className="block text-xs font-bold text-gray-500 mb-1">Categoria Padre</label><select className="w-full border rounded p-2 text-sm" value={targetParentId || activeBook.rootCategory.id} onChange={(e) => handleParentChange(e.target.value)}>{getAllCategoriesFlat.map(c => (<option key={c.id} value={c.id}>{'\u00A0'.repeat(c.depth * 2)} {c.code} {c.name}</option>))}</select></div>)}<div><label className="block text-xs font-bold text-gray-500 mb-1">Codice</label><div className="flex items-center gap-1">{parentPrefix && <span className="text-gray-400 text-sm font-mono">{parentPrefix}</span>}<input autoFocus className="w-full border p-2 rounded text-sm font-mono" value={catFormData.code.replace(parentPrefix, '')} onChange={(e) => setCatFormData({...catFormData, code: parentPrefix + e.target.value})} placeholder="01" /></div></div><div><label className="block text-xs font-bold text-gray-500 mb-1">Nome</label><input className="w-full border p-2 rounded text-sm" value={catFormData.name} onChange={(e) => setCatFormData({...catFormData, name: e.target.value})} placeholder="Nome categoria"/></div>{canEditColor && (<div><label className="block text-xs font-bold text-gray-500 mb-1">Colore (Opzionale)</label><div className="flex flex-wrap gap-2">{PASTEL_COLORS.map(c => (<button key={c} onClick={() => setCatFormData({...catFormData, color: c})} className={`w-6 h-6 rounded-full border ${catFormData.color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'border-gray-200'}`} style={{ backgroundColor: c }} />))}<input type="color" value={catFormData.color} onChange={(e) => setCatFormData({...catFormData, color: e.target.value})} className="w-6 h-6 rounded-full overflow-hidden cursor-pointer border-none p-0"/></div></div>)}<button onClick={handleSaveCategory} className="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700 mt-2">Salva</button></div>
            </div>
        </div>
      )}

      {/* Item Modal with Toggle Button */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-4 border-b font-bold text-gray-700 flex justify-between items-center"><span>{editingItemId ? 'Modifica Voce' : 'Nuova Voce'}</span><button onClick={() => setShowItemModal(false)}><X size={18}/></button></div>
                <div className="p-4 space-y-3">
                    <div className="flex gap-2">
                        <div className="w-1/3 relative">
                            <label className="block text-xs font-bold text-gray-500 mb-1 flex justify-between items-center">
                                Codice
                                <button onClick={() => setIsAutoCode(!isAutoCode)} className="text-gray-400 hover:text-emerald-600" title={isAutoCode ? "Passa a Manuale" : "Passa ad Automatico"}>
                                    <Hash size={12} className={isAutoCode ? "text-emerald-600" : ""} />
                                </button>
                            </label>
                            <input className={`w-full border p-2 rounded text-sm font-mono ${isAutoCode ? 'bg-gray-100 text-gray-600' : ''}`} value={itemFormData.code} onChange={(e) => setItemFormData({...itemFormData, code: e.target.value})} readOnly={isAutoCode} title={isAutoCode ? "Codice generato automaticamente (Disattiva # per modificare)" : ""} />
                        </div>
                        <div className="w-2/3"><label className="block text-xs font-bold text-gray-500 mb-1">Unità di Misura</label><input className="w-full border p-2 rounded text-sm text-center" list="uoms" value={itemFormData.uom} onChange={(e) => setItemFormData({...itemFormData, uom: e.target.value})} /></div>
                    </div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Descrizione</label><textarea className="w-full border p-2 rounded text-sm h-24 resize-none" value={itemFormData.description} onChange={(e) => setItemFormData({...itemFormData, description: e.target.value})} placeholder="Descrizione voce..."/></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Prezzo Unitario (€)</label><input type="number" step="0.01" className="w-full border p-2 rounded text-sm font-bold text-right" value={itemFormData.price} onChange={(e) => setItemFormData({...itemFormData, price: parseFloat(e.target.value) || 0})} /></div>
                    <button onClick={handleSaveItem} className="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700 mt-2">Salva</button>
                </div>
            </div>
        </div>
      )}
      
      {showBookModal && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
                <div className="p-4 border-b font-bold text-gray-700 flex justify-between items-center"><span>{editingBookId ? 'Modifica Prezzario' : 'Nuovo Prezzario'}</span><button onClick={() => setShowBookModal(false)}><X size={18}/></button></div>
                <div className="p-4 space-y-3"><div><label className="block text-xs font-bold text-gray-500 mb-1">Nome Listino</label><input className="w-full border p-2 rounded text-sm" value={bookFormData.name} onChange={(e) => setBookFormData({...bookFormData, name: e.target.value})} placeholder="Es. Listino 2024"/></div><div><label className="block text-xs font-bold text-gray-500 mb-1">Descrizione</label><textarea className="w-full border p-2 rounded text-sm h-20 resize-none" value={bookFormData.desc} onChange={(e) => setBookFormData({...bookFormData, desc: e.target.value})} placeholder="Dettagli..."/></div><button onClick={handleSaveBook} className="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700 mt-2">Salva</button></div>
            </div>
        </div>
      )}
      {(copyItemTargets || copyCategoryTargets) && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-4 border-b font-bold text-gray-700 flex justify-between items-center">
                    <span>
                        {copyItemTargets ? `Copia ${copyItemTargets.length} Voci` : `Copia ${copyCategoryTargets?.length} Categorie`}
                    </span>
                    <button onClick={() => { setCopyItemTargets(null); setCopyCategoryTargets(null); }}><X size={18}/></button>
                </div>
                <div className="p-6 space-y-6">
                    {copyItemTargets && (
                        <div className="space-y-3">
                            <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2"><CornerDownLeft size={16}/> Duplica qui (Locale)</h4>
                            <p className="text-xs text-gray-500">Crea una copia delle voci selezionate nella stessa categoria o in una sottocategoria.</p>
                            <button onClick={handleDuplicateItemsLocal} className="w-full py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm font-medium">Duplica in loco</button>
                        </div>
                    )}
                    <div className={`${copyItemTargets ? 'border-t pt-4' : ''} space-y-3`}>
                        <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2"><ArrowRight size={16}/> Copia in altro Prezzario</h4>
                        <p className="text-xs text-gray-500">
                            {copyItemTargets ? 'Sposta o copia le voci in un altro listino esistente.' : 'Copia le intere categorie in un altro listino.'}
                        </p>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Prezzario di Destinazione</label>
                            <select className="w-full border p-2 rounded text-sm" value={copyTargetBookId} onChange={(e) => setCopyTargetBookId(e.target.value)}>
                                <option value="">Seleziona...</option>
                                {books.filter(b => b.id !== activeBookId).map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        {copyTargetBookId && (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Categoria di Destinazione (Opzionale)</label>
                                <select className="w-full border p-2 rounded text-sm" value={copyTargetCategoryId || ''} onChange={(e) => setCopyTargetCategoryId(e.target.value || null)}>
                                    <option value="">Radice (Principale)</option>
                                    {copyTargetBookId && (() => {
                                        const targetBook = books.find(b => b.id === copyTargetBookId);
                                        if (targetBook) {
                                            return getCategoriesFlat(targetBook.rootCategory).map(c => (
                                                <option key={c.id} value={c.id}>{'\u00A0'.repeat(c.depth * 2)} {c.code} {c.name}</option>
                                            ));
                                        }
                                        return null;
                                    })()}
                                </select>
                            </div>
                        )}
                        <button 
                            onClick={copyItemTargets ? handleCopyItemsToRemote : handleCopyCategoriesToRemote} 
                            disabled={!copyTargetBookId} 
                            className="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700 disabled:opacity-50 mt-2"
                        >
                            Copia
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
      {showCsvWizard && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
                  <div className="p-4 border-b font-bold text-gray-700 flex justify-between items-center bg-emerald-50">
                      <span className="flex items-center gap-2">
                          {csvSeparator === '|||' ? <FileText size={18}/> : <FileSpreadsheet size={18}/>} 
                          Importazione {csvSeparator === '|||' ? 'PDF' : 'CSV'} - {wizardStep === 'mapping' ? 'Mappatura Colonne' : 'Verifica Categorie'}
                      </span>
                      <button onClick={() => setShowCsvWizard(false)}><X size={18}/></button>
                  </div>
                                    <div className="flex-1 overflow-auto p-6">
                                        {wizardStep === 'mapping' && (
                                            <div className="space-y-6">
                                                <p className="text-sm text-gray-600">Mappa le colonne del tuo file CSV ai campi del prezzario. Seleziona "Ignora" per le colonne non necessarie.</p>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <input type="checkbox" id="skipHeader" checked={csvSkipHeader} onChange={(e) => setCsvSkipHeader(e.target.checked)} />
                                                    <label htmlFor="skipHeader" className="text-sm font-medium">La prima riga contiene i titoli (Header)</label>
                                                </div>
                                                <div className="overflow-x-auto border rounded">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="bg-gray-50 text-gray-700">
                                                            <tr>
                                                                {csvPreviewRows[0]?.map((_, idx) => (
                                                                    <th key={idx} className="p-2 border-b min-w-[150px]">
                                                                        <select 
                                                                            className="w-full border rounded p-1 text-xs font-bold" 
                                                                            value={csvMapping[idx] || 'ignore'} 
                                                                            onChange={(e) => setCsvMapping({...csvMapping, [idx]: e.target.value as any})}
                                                                        >
                                                                            <option value="ignore">Ignora</option>
                                                                            <option value="code">Codice Voce</option>
                                                                            <option value="desc">Descrizione</option>
                                                                            <option value="uom">Unità Misura</option>
                                                                            <option value="price">Prezzo</option>
                                                                            <option value="cat_full">Categoria (Completa)</option>
                                                                            <option value="cat_code">Codice Categoria</option>
                                                                            <option value="cat_desc">Descrizione Categoria</option>
                                                                            <option value="cat_l1">Categoria L1</option>
                                                                            <option value="cat_l2">Categoria L2</option>
                                                                            <option value="cat_l3">Categoria L3</option>
                                                                            <option value="cat_l4">Categoria L4</option>
                                                                            <option value="cat_l5">Categoria L5</option>
                                                                            <optgroup label="Gerarchia Avanzata (Codice + Descr)">
                                                                                <option value="cat_l1_code">L1 Codice</option>
                                                                                <option value="cat_l1_desc">L1 Descrizione</option>
                                                                                <option value="cat_l2_code">L2 Codice</option>
                                                                                <option value="cat_l2_desc">L2 Descrizione</option>
                                                                                <option value="cat_l3_code">L3 Codice</option>
                                                                                <option value="cat_l3_desc">L3 Descrizione</option>
                                                                                <option value="cat_l4_code">L4 Codice</option>
                                                                                <option value="cat_l4_desc">L4 Descrizione</option>
                                                                                <option value="cat_l5_code">L5 Codice</option>
                                                                                <option value="cat_l5_desc">L5 Descrizione</option>
                                                                            </optgroup>
                                                                        </select>
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {csvPreviewRows.slice(0, 10).map((row, rIdx) => (
                                                                <tr key={rIdx} className={`border-b ${rIdx === 0 && csvSkipHeader ? 'bg-gray-100 opacity-50' : ''}`}>
                                                                    {row.map((cell, cIdx) => (
                                                                        <td key={cIdx} className="p-2 truncate max-w-[200px] border-r last:border-r-0 font-mono text-xs text-gray-600">
                                                                            {cell}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                        {wizardStep === 'categories' && (
                                            <div className="space-y-6">
                                                <p className="text-sm text-gray-600">Abbiamo rilevato le seguenti categorie dai dati. Puoi rinominarle prima di importare.</p>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {Object.keys(csvDetectedCategories).sort().map(catCode => (
                                                        <div key={catCode} className="flex items-center gap-2 p-2 border rounded bg-gray-50">
                                                            <span className="font-mono font-bold text-xs bg-white px-1 border rounded">{catCode}</span>
                                                            <input 
                                                                className="flex-1 border-b bg-transparent outline-none text-sm" 
                                                                value={csvDetectedCategories[catCode]} 
                                                                onChange={(e) => setCsvDetectedCategories({...csvDetectedCategories, [catCode]: e.target.value})} 
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                  <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">{wizardStep === 'categories' && (<button onClick={() => setWizardStep('mapping')} className="px-4 py-2 border rounded text-gray-600 hover:bg-white">Indietro</button>)}{wizardStep === 'mapping' ? (<button onClick={analyzeCsvCategories} disabled={Object.values(csvMapping).every(v => v === 'ignore')} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 disabled:opacity-50">Avanti: Verifica Categorie</button>) : (<button onClick={executeCsvImport} className="px-4 py-2 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-2"><Download size={16}/> Importa Dati</button>)}</div>
              </div>
          </div>
      )}

    </div>
  );
};