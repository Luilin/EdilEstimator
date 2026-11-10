import React, { useState, useEffect, useRef } from 'react';
import { Project, WBSNode } from '../types';
import { Printer, FileText, X, Settings, CheckCircle2, History, Building2 } from 'lucide-react';
import * as ReactToPrintModule from 'react-to-print';
import {
  PRINT_DOCUMENT_GROUPS,
  PRINT_DOCUMENT_LABELS,
  PrintDocumentContent,
  PrintDocumentType,
  isStandardPrintDocument,
} from './print/PrintDocuments';
import { createVectorPdfBlob, downloadVectorPdf } from '../services/vectorPdf';

// Robust extraction of useReactToPrint hook
const getReactToPrintHook = () => {
  const pkg = ReactToPrintModule as any;
  if (typeof pkg.useReactToPrint === 'function') return pkg.useReactToPrint;
  if (pkg.default && typeof pkg.default.useReactToPrint === 'function') return pkg.default.useReactToPrint;
  return null;
}

const useReactToPrintFn = getReactToPrintHook();

const GOOGLE_FONTS = [
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Oswald",
    "Playfair Display",
    "Merriweather",
    "Nunito",
    "Raleway",
    "Ubuntu"
];

// --- STYLE CONTROL COMPONENT ---
const StyleControl = ({ label, size, setSize, color, setColor, bgColor, setBgColor, min=8, max=36 }: { 
    label: string, 
    size: number, 
    setSize: (val: number) => void, 
    color: string,
    setColor: (val: string) => void,
    bgColor?: string,
    setBgColor?: (val: string) => void,
    min?: number, 
    max?: number 
}) => (
    <div className="mb-4 pb-2 border-b border-gray-100 last:border-0">
        <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] uppercase font-bold text-gray-600">{label}</span>
            <div className="flex items-center gap-2">
                 <span className="text-[10px] font-mono font-bold text-gray-500">{size}px</span>
                 <div className="flex items-center gap-1 border rounded p-0.5 bg-gray-50">
                    <span className="text-[9px] text-gray-400 px-1">T</span>
                    <input 
                        type="color" 
                        value={color} 
                        onChange={(e) => setColor(e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-none bg-transparent"
                        title="Colore Testo"
                    />
                 </div>
                 {bgColor && setBgColor && (
                     <div className="flex items-center gap-1 border rounded p-0.5 bg-gray-50">
                        <span className="text-[9px] text-gray-400 px-1">BG</span>
                        <input 
                            type="color" 
                            value={bgColor} 
                            onChange={(e) => setBgColor(e.target.value)}
                            className="w-5 h-5 rounded cursor-pointer border-none bg-transparent"
                            title="Colore Sfondo"
                        />
                     </div>
                 )}
            </div>
        </div>
        <input 
            type="range" min={min} max={max} step={1} 
            value={size} 
            onChange={(e) => setSize(parseInt(e.target.value))} 
            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-700 hover:accent-gray-900"
        />
    </div>
);

type PrintLayoutMode = 'details' | 'summary' | 'both';

interface PrintPreviewProps {
    project: Project;
    editorMode: 'ESTIMATE' | 'SAL';
    activeSalId: string | null;
    currentUser: string;
    onClose: () => void;
    initialRFQMode?: boolean;
}

export const PrintPreview: React.FC<PrintPreviewProps> = ({ 
    project, 
    editorMode: initialEditorMode, 
    activeSalId, 
    currentUser, 
    onClose,
    initialRFQMode = false
}) => {
    // Print Mode State (Allows toggling inside preview)
    const [printMode, setPrintMode] = useState<'ESTIMATE' | 'SAL'>(initialEditorMode);

    // Documento selezionato nel pannello stampa
    const [printDocument, setPrintDocument] = useState<PrintDocumentType>(
        initialRFQMode ? 'rfq' : initialEditorMode === 'SAL' ? 'sal' : 'computo'
    );
    const isStandardDocument = isStandardPrintDocument(printDocument);

    // RFQ / Computo in Bianco State
    const [isRFQMode, setIsRFQMode] = useState<boolean>(initialRFQMode);
    const [printShowMaterialLabor, setPrintShowMaterialLabor] = useState<boolean>(false);
    const [rfqShowTimeCol, setRfqShowTimeCol] = useState<boolean>(true);
    const [rfqShowMaterialLabor, setRfqShowMaterialLabor] = useState<boolean>(true);
    const [rfqShowContractorForm, setRfqShowContractorForm] = useState<boolean>(true);

    // Print Settings State
    const [printSelectedIds, setPrintSelectedIds] = useState<Set<string>>(new Set());
    const [printLayoutMode, setPrintLayoutMode] = useState<PrintLayoutMode>('details');
  
    // SAL Selection State (Local to print preview)
    const [previewSalId, setPreviewSalId] = useState<string | null>(activeSalId);

    const [printAppTitle, setPrintAppTitle] = useState("Stimia");
    const [printDocTitle, setPrintDocTitle] = useState("");
    const [printSubtitle, setPrintSubtitle] = useState("");
    const [printDate, setPrintDate] = useState("");
    const [printTechnician, setPrintTechnician] = useState("");
    const [printProjectId, setPrintProjectId] = useState("");
  
    const [printShowFooterInfo, setPrintShowFooterInfo] = useState(true);
    const [printFooterText, setPrintFooterText] = useState("");

    // Numeri di pagina
    const [printShowPageNumbers, setPrintShowPageNumbers] = useState(true);
    const [printPageNumberColor, setPrintPageNumberColor] = useState("#475569");
    const [printPageNumberSize, setPrintPageNumberSize] = useState(9);
    const [printPageNumberFont, setPrintPageNumberFont] = useState("Roboto");
    const [previewPageCount, setPreviewPageCount] = useState(1);
    const [pdfBusy, setPdfBusy] = useState(false);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [pdfInfo, setPdfInfo] = useState<string | null>(null);
    const [pdfOpenUrl, setPdfOpenUrl] = useState<string | null>(null);
    const [pdfPagesLoading, setPdfPagesLoading] = useState(false);
    const [pdfPagesError, setPdfPagesError] = useState<string | null>(null);
    
    // New state to toggle showing prices/amounts
    const [printShowPrices, setPrintShowPrices] = useState(!initialRFQMode);
  
    const [printTitleFont, setPrintTitleFont] = useState("Roboto");
    const [printBodyFont, setPrintBodyFont] = useState("Roboto");
  
    // Print Sizes
    const [printFontSizeTitle, setPrintFontSizeTitle] = useState(20);
    const [printFontSizeDocTitle, setPrintFontSizeDocTitle] = useState(14);
    const [printFontSizeDesc, setPrintFontSizeDesc] = useState(11);
    const [printFontSizeMeta, setPrintFontSizeMeta] = useState(10);
    const [printFontSizeHeaderL1, setPrintFontSizeHeaderL1] = useState(16);
    const [printFontSizeHeaderSub, setPrintFontSizeHeaderSub] = useState(13);
    const [printFontSizeCatAmount, setPrintFontSizeCatAmount] = useState(13);
    const [printFontSizeBody, setPrintFontSizeBody] = useState(11);
    const [printFontSizeAmount, setPrintFontSizeAmount] = useState(11);
    const [printFontSizeMeasurements, setPrintFontSizeMeasurements] = useState(9);
    const [printFontSizeTableHead] = useState(10);
    const [printFontSizeTotal, setPrintFontSizeTotal] = useState(18);
    const [printFontSizeFooter, setPrintFontSizeFooter] = useState(10);

    // Print Colors
    const [printColorTitle, setPrintColorTitle] = useState("#0f172a");
    const [printColorDocTitle, setPrintColorDocTitle] = useState("#4b5563");
    const [printColorSubtitle, setPrintColorSubtitle] = useState("#6b7280");
    const [printColorDesc, setPrintColorDesc] = useState("#6b7280");
    const [printColorMeta, setPrintColorMeta] = useState("#6b7280");
    const [printColorTableHead] = useState("#4b5563");
  
    const [printColorCategoryBgL1, setPrintColorCategoryBgL1] = useState("#f3f4f6");
    const [printColorCategoryTextL1, setPrintColorCategoryTextL1] = useState("#111827");
  
    const [printColorCategoryBgSub, setPrintColorCategoryBgSub] = useState("#ffffff");
    const [printColorCategoryTextSub, setPrintColorCategoryTextSub] = useState("#1f2937");
    const [printColorCatAmount, setPrintColorCatAmount] = useState("#111827");
  
    const [printColorItemText, setPrintColorItemText] = useState("#374151");
    const [printColorAmount, setPrintColorAmount] = useState("#111827");
    const [printColorTotal, setPrintColorTotal] = useState("#000000");
    const [printColorFooter, setPrintColorFooter] = useState("#9ca3af");

    // Borders
    const [printBorderWidth, setPrintBorderWidth] = useState(2);
    const [printHeaderLineWidth, setPrintHeaderLineWidth] = useState(3);
    const [printBorderColor, setPrintBorderColor] = useState("#1f2937");

    const printRef = useRef<HTMLDivElement>(null);
    const pdfPagesRef = useRef<HTMLDivElement>(null);
    const pdfRenderGeneration = useRef(0);

    // Initial Setup
    useEffect(() => {
        // Select all nodes by default
        const allIds = new Set<string>();
        const traverse = (n: WBSNode) => {
            allIds.add(n.id);
            n.children.forEach(traverse);
        };
        traverse(project.rootWBS);
        setPrintSelectedIds(allIds);
        
        // Default text update based on selected document
        const baseTitle = project.name;
        let suffix = ' - Computo Metrico';
        if (printDocument === 'rfq') {
            suffix = ' - Richiesta Preventivo Ditte (Computo in Bianco)';
        } else if (printDocument === 'sal') {
            const activeSal = project.sals?.find(s => s.id === previewSalId);
            suffix = activeSal ? ` - ${activeSal.name}` : ' - Stato Avanzamento Lavori';
        } else if (!isStandardPrintDocument(printDocument)) {
            suffix = ` - ${PRINT_DOCUMENT_LABELS[printDocument]}`;
        }
        
        setPrintDocTitle(baseTitle + suffix);
        setPrintSubtitle(project.description);
        setPrintDate(new Date().toLocaleDateString('it-IT'));
        setPrintTechnician(currentUser);
        setPrintProjectId(project.id.toUpperCase().substring(0, 8));
        setPrintFooterText(new Date().toLocaleDateString('it-IT'));
    }, [project, currentUser, printMode, printDocument, previewSalId, isRFQMode]); // Re-run when mode changes

    // Font Loading
    useEffect(() => {
        const fontsToLoad = [...new Set([printTitleFont, printBodyFont])];
        if (fontsToLoad.length === 0) return;
        const linkId = 'edil-estimator-fonts';
        let link = document.getElementById(linkId) as HTMLLinkElement;
        if (!link) {
            link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        const fontQuery = fontsToLoad.map(f => `family=${f.replace(/ /g, '+')}:wght@400;700`).join('&');
        link.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`;
    }, [printTitleFont, printBodyFont]);

    // Anteprima paginata: genera il PDF (lo stesso dell'export) e ne mostra
    // le pagine reali, così l'anteprima coincide con il file esportato.
    useEffect(() => {
        const generation = ++pdfRenderGeneration.current;
        const timer = window.setTimeout(async () => {
            setPdfPagesLoading(true);
            setPdfPagesError(null);
            try {
                const { blob } = await createVectorPdfBlob(buildVectorOptions());
                if (generation !== pdfRenderGeneration.current) return;

                const pdfjs = await import('pdfjs-dist');
                pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.mjs`;
                const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
                if (generation !== pdfRenderGeneration.current) return;

                const container = pdfPagesRef.current;
                if (!container) return;
                container.innerHTML = '';

                const total = pdfDocument.numPages;
                setPreviewPageCount(total);

                for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
                    if (generation !== pdfRenderGeneration.current) return;

                    const page = await pdfDocument.getPage(pageNumber);
                    const viewport = page.getViewport({ scale: 2 });
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mb-6 flex w-[210mm] max-w-full flex-col items-center';

                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.style.width = '100%';
                    canvas.style.height = 'auto';
                    canvas.className = 'w-full rounded-sm bg-white shadow-lg';
                    const context = canvas.getContext('2d');
                    if (!context) continue;
                    // intent 'print' disabilita lo scheduling via requestAnimationFrame:
                    // il rendering procede anche quando la finestra non è in primo piano.
                    await page.render({ canvas, canvasContext: context, viewport, intent: 'print' }).promise;
                    if (generation !== pdfRenderGeneration.current) return;

                    wrapper.appendChild(canvas);
                    const label = document.createElement('div');
                    label.className = 'mt-2 text-[10px] font-semibold text-slate-500';
                    label.textContent = `Pagina ${pageNumber} di ${total}`;
                    wrapper.appendChild(label);
                    container.appendChild(wrapper);
                }
            } catch (error) {
                if (generation === pdfRenderGeneration.current) {
                    setPdfPagesError(error instanceof Error ? error.message : 'Impossibile generare l’anteprima.');
                }
            } finally {
                if (generation === pdfRenderGeneration.current) setPdfPagesLoading(false);
            }
        }, 600);

        return () => {
            window.clearTimeout(timer);
            if (pdfRenderGeneration.current === generation) {
                pdfRenderGeneration.current += 1;
            }
        };
    }, [
        project,
        printDocument,
        printMode,
        previewSalId,
        printSelectedIds,
        printLayoutMode,
        printShowPrices,
        printShowMaterialLabor,
        printFooterText,
        printShowFooterInfo,
        printColorFooter,
        printFontSizeFooter,
        printPageNumberColor,
        printPageNumberSize,
        rfqShowMaterialLabor,
        rfqShowTimeCol,
        rfqShowContractorForm,
        printAppTitle,
        printDocTitle,
        printSubtitle,
        printProjectId,
        printTechnician,
        printDate,
        printTitleFont,
        printBodyFont,
        printFontSizeTitle,
        printFontSizeDocTitle,
        printFontSizeDesc,
        printFontSizeMeta,
        printFontSizeHeaderL1,
        printFontSizeHeaderSub,
        printFontSizeCatAmount,
        printFontSizeBody,
        printFontSizeAmount,
        printFontSizeMeasurements,
        printFontSizeTotal,
        printColorTitle,
        printColorDocTitle,
        printColorSubtitle,
        printColorMeta,
        printColorCategoryBgL1,
        printColorCategoryTextL1,
        printColorCategoryBgSub,
        printColorCategoryTextSub,
        printColorCatAmount,
        printColorItemText,
        printColorAmount,
        printColorTotal,
        printBorderWidth,
        printHeaderLineWidth,
        printBorderColor,
    ]);

    // --- Helpers ---
    
    // Updated to use the local previewSalId
    const getSalQty = (costItemId: string): number => {
        if (!previewSalId || !project.sals) return 0;
        const sal = project.sals.find(s => s.id === previewSalId);
        if (!sal) return 0;
        const row = sal.rows.find(r => r.costItemId === costItemId);
        return row ? row.qty : 0;
    };

    // Calculate previous cumulative quantity relative to the previewSalId
    const getPreviousSalQty = (costItemId: string): number => {
        if (!project.sals || !previewSalId) return 0;
        const currentSal = project.sals.find(s => s.id === previewSalId);
        if (!currentSal) return 0;

        // Find closed SALs with earlier date than the current preview SAL
        const closedSals = project.sals
            .filter(s => s.status === 'CLOSED' && s.date < currentSal.date)
            .sort((a, b) => b.date - a.date); // Most recent first
        
        for (const sal of closedSals) {
            const row = sal.rows.find(r => r.costItemId === costItemId);
            if (row && row.qty > 0) {
                // Since our model is cumulative, the latest closed SAL row quantity 
                // IS the sum of all progress up to that point.
                return row.qty;
            }
        }
        return 0;
    };

    const calculateTotal = (node: WBSNode): number => {
        let total = node.items.reduce((acc, item) => acc + item.amount, 0);
        node.children.forEach(child => total += calculateTotal(child));
        return total;
    };
    
    const calculateFilteredTotal = (node: WBSNode, selectedIds: Set<string>): number => {
        if (!selectedIds.has(node.id)) return 0;
        
        const isSalMode = printMode === 'SAL';
        
        let total = node.items.reduce((acc, item) => {
            if (isSalMode) {
                 const qty = getSalQty(item.id);
                 if (qty > 0) return acc + (qty * item.price);
                 return acc;
            }
            return acc + item.amount;
        }, 0);
        
        node.children.forEach(child => total += calculateFilteredTotal(child, selectedIds));
        return total;
    };

    const handlePrintToggle = (nodeId: string, isChecked: boolean) => {
        const newSet = new Set(printSelectedIds);
        const findNode = (id: string, nodes: WBSNode[]): WBSNode | null => {
            for (const node of nodes) {
              if (node.id === id) return node;
              const found = findNode(id, node.children);
              if (found) return found;
            }
            return null;
        };
        const targetNode = findNode(nodeId, project.rootWBS.children) || (project.rootWBS.id === nodeId ? project.rootWBS : null);
        
        if (!targetNode) return;
        const toggleRecursively = (n: WBSNode, checked: boolean) => {
            if (checked) newSet.add(n.id); else newSet.delete(n.id);
            n.children.forEach(c => toggleRecursively(c, checked));
        };
        toggleRecursively(targetNode, isChecked);
        setPrintSelectedIds(newSet);
    };

    // --- Manual Print ---
    const escapeCssContent = (value: string) =>
        String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r?\n/g, ' ');

    const pageFooterContent = printShowFooterInfo ? escapeCssContent(printFooterText) : '';

    const printPageCss = `
        @page {
            size: A4;
            margin: 16mm 15mm 18mm;
            ${printShowFooterInfo ? `@bottom-left {
                content: "${pageFooterContent}";
                font-family: Arial, Helvetica, sans-serif;
                font-size: ${printFontSizeFooter}px;
                color: ${printColorFooter};
            }` : ''}
            ${printShowPageNumbers ? `@bottom-right {
                content: "Pag. " counter(page) " / " counter(pages);
                font-family: ${printPageNumberFont}, Arial, Helvetica, sans-serif;
                font-size: ${printPageNumberSize}px;
                color: ${printPageNumberColor};
            }` : ''}
        }
    `;

    const printRulesCss = `
        @media print {
            html, body {
                margin: 0;
                padding: 0;
                background: white;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .print-page { display: block !important; }
            .print-page, .print-page * {
                box-shadow: none !important;
                text-shadow: none !important;
                filter: none !important;
                -webkit-filter: none !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                background-image: none !important;
            }
            .print-page * { opacity: 1 !important; }
            .page-break { break-before: page; page-break-before: always; }
            .break-inside-avoid, tr, img { break-inside: avoid; page-break-inside: avoid; }
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
            a { color: inherit; text-decoration: none; }
        }
    `;

    const handleManualPrint = () => {
        const content = printRef.current;
        if (!content) return;
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(`<!DOCTYPE html>
                <html>
                <head>
                    <title>${project.name}</title>
                    <meta charset="utf-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <script src="https://cdn.tailwindcss.com"></script>
                    <script>
                       tailwind.config = {
                          theme: {
                            extend: {
                              colors: {
                                primary: '#0f172a',
                                secondary: '#334155',
                                accent: '#0ea5e9',
                              },
                              screens: {
                                  'print': {'raw': 'print'},
                              }
                            }
                          }
                        }
                    </script>
                    <style>
                       ${printPageCss}
                       ${printRulesCss}
                    </style>
                    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans:wght@400;700&display=swap" rel="stylesheet">
                </head>
                <body>
                    ${content.innerHTML}
                </body>
                </html>
            `);
            doc.close();
            iframe.contentWindow?.focus();
            
            setTimeout(() => {
                iframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            }, 1000);
        }
    };

    // React To Print
    const handleReactToPrint = useReactToPrintFn ? useReactToPrintFn({
        contentRef: printRef,
        documentTitle: project.name || "Computo Metrico",
        onBeforePrint: async () => {
            if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
                await (document as any).fonts.ready;
            }
        }
    }) : null;
    
    const handlePrintClick = () => {
        if (handleReactToPrint) {
            handleReactToPrint();
        } else {
            handleManualPrint();
        }
    };

    const buildVectorOptions = () => ({
        document: printDocument,
        project,
        salId: previewSalId,
        selectedIds: printSelectedIds,
        layoutMode: printLayoutMode,
        showPrices: printShowPrices,
        showMaterialLabor: printShowMaterialLabor,
        footerText: printFooterText,
        showFooter: printShowFooterInfo,
        footerColor: printColorFooter,
        footerSize: printFontSizeFooter,
        pageNumberColor: printPageNumberColor,
        pageNumberSize: printPageNumberSize,
        technician: printTechnician || currentUser,
        // Stile identico all'anteprima: stesse dimensioni, colori e testi.
        styles: {
            appTitle: printAppTitle,
            docTitle: printDocTitle,
            subtitle: printSubtitle,
            projectId: printProjectId,
            technician: printTechnician,
            date: printDate,
            sizes: {
                title: printFontSizeTitle,
                docTitle: printFontSizeDocTitle,
                desc: printFontSizeDesc,
                meta: printFontSizeMeta,
                headerL1: printFontSizeHeaderL1,
                headerSub: printFontSizeHeaderSub,
                catAmount: printFontSizeCatAmount,
                body: printFontSizeBody,
                amount: printFontSizeAmount,
                measurements: printFontSizeMeasurements,
                tableHead: printFontSizeTableHead,
                total: printFontSizeTotal,
            },
            colors: {
                title: printColorTitle,
                docTitle: printColorDocTitle,
                subtitle: printColorSubtitle,
                meta: printColorMeta,
                tableHead: printColorTableHead,
                catBgL1: printColorCategoryBgL1,
                catTextL1: printColorCategoryTextL1,
                catBgSub: printColorCategoryBgSub,
                catTextSub: printColorCategoryTextSub,
                catAmount: printColorCatAmount,
                itemText: printColorItemText,
                amount: printColorAmount,
                total: printColorTotal,
            },
            borderWidth: printBorderWidth,
            headerLineWidth: printHeaderLineWidth,
            borderColor: printBorderColor,
        },
        rfq: {
            showMaterialLabor: rfqShowMaterialLabor,
            showTimeCol: rfqShowTimeCol,
            showContractorForm: rfqShowContractorForm,
        },
    });

    const openPdfExternal = (url: string) => {
        // Un link reale (con gesto utente) è più affidabile di window.open,
        // che in alcuni contesti Electron/PWA viene bloccato.
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const handleVectorPdf = async () => {
        setPdfBusy(true);
        setPdfError(null);
        setPdfInfo(null);
        if (pdfOpenUrl) {
            URL.revokeObjectURL(pdfOpenUrl);
            setPdfOpenUrl(null);
        }
        try {
            const result = await downloadVectorPdf(buildVectorOptions());

            if (result.status === 'saved') {
                setPdfInfo('PDF salvato nella posizione scelta.');
            } else if (result.status === 'downloaded') {
                const reason = (result.reason || '').replace(/\.$/, '').toLowerCase();
                const detail = reason
                    ? `La finestra di salvataggio non ha scritto il file (${reason}).`
                    : 'Download avviato.';
                setPdfInfo(`${detail} Trovi il PDF valido nella cartella Download.`);
                setPdfOpenUrl(result.url || null);
            }
        } catch (error) {
            console.error('Errore PDF vettoriale:', error);
            setPdfError(error instanceof Error ? error.message : 'Errore durante la generazione del PDF.');
        } finally {
            setPdfBusy(false);
        }
    };

    const handleDocumentChange = (value: PrintDocumentType) => {
        setPrintDocument(value);

        if (value === 'rfq') {
            setIsRFQMode(true);
            setPrintMode('ESTIMATE');
            setPrintShowPrices(false);
            return;
        }

        if (value === 'sal') {
            setIsRFQMode(false);
            setPrintMode('SAL');
            setPrintShowPrices(true);
            if (!previewSalId && project.sals && project.sals.length > 0) {
                const latest = [...project.sals].sort((a, b) => b.date - a.date)[0];
                setPreviewSalId(latest.id);
            }
            return;
        }

        setIsRFQMode(false);
        setPrintMode('ESTIMATE');
        setPrintShowPrices(true);
    };

    // --- Sub-Components ---
    
    const RenderPrintSelectTree = ({ node, level = 0 }: { node: WBSNode, level?: number, key?: any }) => {
        const isChecked = printSelectedIds.has(node.id);
        return (
            <div className="text-sm">
               <div className="flex items-center gap-2 hover:bg-gray-100 p-1 rounded cursor-pointer" style={{ marginLeft: `${level * 16}px` }}>
                   <input type="checkbox" checked={isChecked} onChange={(e) => handlePrintToggle(node.id, e.target.checked)} className="w-4 h-4 cursor-pointer"/>
                   <span className={`font-mono text-xs font-bold px-1 rounded border ${isChecked ? 'bg-white border-gray-200 text-gray-700' : 'bg-gray-50 border-transparent text-gray-400'}`}>{node.code}</span>
                   <span className={`truncate ${isChecked ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{node.name}</span>
               </div>
               {node.children.map(child => <RenderPrintSelectTree key={child.id} node={child} level={level + 1} />)}
            </div>
        );
    };

    const RenderPrintPreviewNode = ({ node, level = 1, showItems = true }: { node: WBSNode, level?: number, showItems?: boolean, key?: any }) => {
        if (!printSelectedIds.has(node.id)) return null;
        
        const isSalMode = printMode === 'SAL';
        
        // --- FILTER LOGIC ---
        const visibleItems = node.items.filter(item => {
            if (isSalMode) {
                const qty = getSalQty(item.id);
                return qty > 0;
            }
            return true;
        });

        const nodeTotal = visibleItems.reduce((acc, item) => {
            if (isSalMode) return acc + (getSalQty(item.id) * item.price);
            return acc + item.amount;
        }, 0);
        
        const childrenTotals = node.children.map(c => {
             return calculateFilteredTotal(c, printSelectedIds);
        });
        const childrenTotalSum = childrenTotals.reduce((a, b) => a + b, 0);
        
        const fullTotal = nodeTotal + childrenTotalSum;
        
        if (fullTotal === 0 && visibleItems.length === 0 && node.children.length > 0 && childrenTotalSum === 0) return null;
        if (fullTotal === 0 && visibleItems.length === 0 && node.children.length === 0) return null;

        const categoryStyle = level === 1 
            ? { fontSize: printFontSizeHeaderL1, backgroundColor: printColorCategoryBgL1, color: printColorCategoryTextL1 }
            : { fontSize: printFontSizeHeaderSub, backgroundColor: printColorCategoryBgSub, color: printColorCategoryTextSub };

        return (
          <div className="mb-4" style={{ fontFamily: printBodyFont }}>
             {/* Category Header */}
             <div className="flex justify-between items-end mb-2 pb-1 px-2 pt-1 rounded-sm break-inside-avoid" style={categoryStyle}>
                 <div className="font-bold">
                     <span className="mr-3">{node.code}</span>
                     <span>{node.name}</span>
                 </div>
                 {printShowPrices && !isRFQMode && (
                     <div className="font-bold" style={{ fontSize: printFontSizeCatAmount, color: printColorCatAmount }}>
                         Tot. € {fullTotal.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})}
                     </div>
                 )}
             </div>

             {/* Items Table - Render if showItems is true */}
             {visibleItems.length > 0 && showItems && (
               <div className="mb-4 pl-2">
                 <table className="w-full text-sm border-collapse">
                     <thead className="break-inside-avoid">
                         <tr style={{ color: printColorTableHead, fontSize: printFontSizeTableHead }}>
                             <th className="border-b text-left py-1 w-14 px-0.5">Codice</th>
                             <th className="border-b text-left py-1 pr-2">Descrizione</th>
                             <th className="border-b text-center py-1 w-8 px-0.5 text-xs whitespace-nowrap">U.M.</th>
                             <th className="border-b text-right py-1 w-16">{isSalMode ? "Q.tà SAL" : "Q.tà"}</th>
                             {isSalMode && <th className="border-b text-right py-1 w-12">%</th>}
                              {printShowPrices && !isRFQMode && (
                                  <>
                                      {printShowMaterialLabor && <th className="border-b text-right py-1 w-16">Mat. (€)</th>}
                                      {printShowMaterialLabor && <th className="border-b text-right py-1 w-16">Man. (€)</th>}
                                      <th className="border-b text-right py-1 w-20">Prezzo (€)</th>
                                      <th className="border-b text-right py-1 w-24">Importo (€)</th>
                                  </>
                              )}
                              {isRFQMode && (
                                  <>
                                      {rfqShowMaterialLabor ? (
                                          <>
                                              <th className="border-b text-center py-1 w-16">Mat. (€)</th>
                                              <th className="border-b text-center py-1 w-16">Man. (€)</th>
                                              <th className="border-b text-center py-1 w-20">Prezzo Tot. (€)</th>
                                          </>
                                      ) : (
                                          <th className="border-b text-center py-1 w-24">Prezzo Offerto (€)</th>
                                      )}
                                      {rfqShowTimeCol && <th className="border-b text-center py-1 w-20">Tempi (gg)</th>}
                                      <th className="border-b text-center py-1 w-24">Importo Offerto (€)</th>
                                  </>
                              )}
                         </tr>
                     </thead>
                     <tbody style={{ fontSize: printFontSizeBody }}>
                         {visibleItems.map(item => {
                             const qty = isSalMode ? getSalQty(item.id) : item.qty;
                             const amount = qty * item.price;
                             
                             // Cumulative Progress calculation for SAL reports
                             const prevQty = isSalMode ? getPreviousSalQty(item.id) : 0;
                             const cumulativeQty = prevQty + (isSalMode ? qty : 0);
                             const progressPercent = item.qty > 0 ? (cumulativeQty / item.qty) * 100 : 0;
                             
                             return (
                                 <React.Fragment key={item.id}>
                                 <tr className="border-b border-gray-100 break-inside-avoid" style={{ color: printColorItemText }}>
                                     <td className="py-1 align-top font-mono text-[10px] px-0.5 whitespace-nowrap">{item.code}</td>
                                     <td className="py-1 align-top pr-2 break-words">{item.description}</td>
                                     <td className="py-1 align-top text-center text-xs px-0.5 whitespace-nowrap">{item.uom}</td>
                                     <td className="py-1 align-top text-right font-medium">{qty.toLocaleString('it-IT', {maximumFractionDigits:2})}</td>
                                     {isSalMode && (
                                         <td className="py-1 align-top text-right font-bold text-[10px]">
                                             {progressPercent.toFixed(0)}%
                                         </td>
                                     )}
                                      {printShowPrices && !isRFQMode && (
                                          <>
                                              {printShowMaterialLabor && (
                                                  <td className="py-1 align-top text-right text-[10px] text-gray-600 font-mono">
                                                      {item.materialPrice !== undefined && item.materialPrice !== null ? `€ ${item.materialPrice.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '-'}
                                                  </td>
                                              )}
                                              {printShowMaterialLabor && (
                                                  <td className="py-1 align-top text-right text-[10px] text-gray-600 font-mono">
                                                      {item.laborPrice !== undefined && item.laborPrice !== null ? `€ ${item.laborPrice.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '-'}
                                                  </td>
                                              )}
                                              <td className="py-1 align-top text-right">€ {item.price.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                                              <td className="py-1 align-top text-right font-medium" style={{ color: printColorAmount, fontSize: printFontSizeAmount }}>
                                                  € {amount.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})}
                                              </td>
                                          </>
                                      )}
                                      {isRFQMode && (
                                          <>
                                              {rfqShowMaterialLabor ? (
                                                  <>
                                                      <td className="py-1.5 align-middle text-center">
                                                          <div className="border border-gray-400 border-dashed rounded h-5 w-14 mx-auto bg-white"></div>
                                                      </td>
                                                      <td className="py-1.5 align-middle text-center">
                                                          <div className="border border-gray-400 border-dashed rounded h-5 w-14 mx-auto bg-white"></div>
                                                      </td>
                                                      <td className="py-1.5 align-middle text-center">
                                                          <div className="border border-gray-400 border-dashed rounded h-5 w-16 mx-auto bg-white"></div>
                                                      </td>
                                                  </>
                                              ) : (
                                                  <td className="py-1.5 align-middle text-center">
                                                      <div className="border border-gray-400 border-dashed rounded h-5 w-20 mx-auto bg-white"></div>
                                                  </td>
                                              )}
                                              {rfqShowTimeCol && (
                                                  <td className="py-1.5 align-middle text-center">
                                                      <div className="border border-gray-400 border-dashed rounded h-5 w-14 mx-auto bg-white"></div>
                                                  </td>
                                              )}
                                              <td className="py-1.5 align-middle text-center">
                                                  <div className="border border-gray-400 border-dashed rounded h-5 w-20 mx-auto bg-white"></div>
                                              </td>
                                          </>
                                      )}
                                 </tr>
                                 {(!isSalMode && item.measurements && item.measurements.length > 0 && (item.measurements.length > 1 || item.measurements[0].name || item.measurements[0].factor !== 1)) && (
                                     <>
                                         {item.measurements.map((m, idx) => (
                                             <tr key={m.id || idx} className="break-inside-avoid bg-gray-50/50" style={{ color: printColorSubtitle, fontSize: printFontSizeMeasurements }}>
                                                 <td></td>
                                                 <td className="py-0.5 align-top pl-2 italic">└ {m.name || `-`}</td>
                                                 <td className="py-0.5 align-top"></td>
                                                 <td className="py-0.5 align-top text-right">{m.qty.toLocaleString('it-IT', {maximumFractionDigits:2})}</td>
                                                 {isSalMode && <td className="w-12"></td>}
                                                  {printShowPrices && !isRFQMode && (
                                                      <>
                                                          {printShowMaterialLabor && <td className="w-16"></td>}
                                                          {printShowMaterialLabor && <td className="w-16"></td>}
                                                          <td className="w-20"></td>
                                                          <td className="w-24"></td>
                                                      </>
                                                  )}
                                                  {isRFQMode && (
                                                      <>
                                                          {rfqShowMaterialLabor ? (
                                                              <>
                                                                  <td className="w-16"></td>
                                                                  <td className="w-16"></td>
                                                                  <td className="w-20"></td>
                                                              </>
                                                          ) : (
                                                              <td className="w-24"></td>
                                                          )}
                                                          {rfqShowTimeCol && <td className="w-20"></td>}
                                                          <td className="w-24"></td>
                                                      </>
                                                  )}
                                             </tr>
                                         ))}
                                     </>
                                 )}
                                 </React.Fragment>
                             );
                         })}
                     </tbody>
                 </table>
               </div>
             )}

             {/* Recursive Children */}
             <div className="pl-4">
                 {node.children.map(child => (
                     <RenderPrintPreviewNode key={child.id} node={child} level={level + 1} showItems={showItems} />
                 ))}
             </div>
          </div>
        );
    };

    // Global totals for percentage calculation
    const globalProjectTotal = calculateTotal(project.rootWBS);
    const filteredTotal = calculateFilteredTotal(project.rootWBS, printSelectedIds);
    const globalProgressPercent = globalProjectTotal > 0 ? (filteredTotal / globalProjectTotal) * 100 : 0;

    const calculateContractorOfferTotal = (node: WBSNode): number => {
        let sum = node.items.reduce((acc, item) => {
            const op = item.offerPrice || 0;
            return acc + (item.qty * op);
        }, 0);
        node.children.forEach(child => {
            sum += calculateContractorOfferTotal(child);
        });
        return sum;
    };
    const totalContractorOffer = calculateContractorOfferTotal(project.rootWBS);

    return (
        <div className="fixed inset-0 bg-gray-900/90 z-[100] flex flex-col">
              {/* Toolbar */}
              <div className="h-14 bg-gray-800 text-white flex items-center justify-between px-4 shrink-0 shadow-md">
                  <div className="flex items-center gap-4">
                      <h3 className="font-bold flex items-center gap-2"><Printer/> Anteprima di Stampa</h3>
                      
                      <div className="flex items-center gap-2">
                          <FileText size={15} className="text-slate-400" />
                          <label htmlFor="print-document" className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Documento
                          </label>
                          <select
                            id="print-document"
                            value={printDocument}
                            onChange={event => handleDocumentChange(event.target.value as PrintDocumentType)}
                            className="h-8 max-w-[280px] rounded-lg border border-gray-600 bg-gray-700 px-2 text-xs font-semibold text-white outline-none focus:border-emerald-400"
                          >
                            {PRINT_DOCUMENT_GROUPS.map(group => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map(option => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                      </div>
                      <span className="rounded-full bg-gray-700 px-2.5 py-1 text-[10px] font-bold text-slate-300" title="Stima delle pagine della stampa in formato A4">
                          {previewPageCount} {previewPageCount === 1 ? 'pagina' : 'pagine'}
                      </span>
                  </div>

                  <div className="flex items-center gap-2">
                      <button
                        onClick={handlePrintClick}
                        title="Stampa tramite il dialogo del browser"
                        className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-2"
                      >
                          <Printer size={16}/>
                          Stampa
                      </button>
                      <button
                        onClick={() => handleVectorPdf()}
                        disabled={pdfBusy}
                        title="Genera un PDF vettoriale nativo, indipendente dal dialogo di stampa"
                        className="bg-red-600 hover:bg-red-500 disabled:opacity-60 px-4 py-1.5 rounded text-sm font-bold flex items-center gap-2"
                      >
                          <FileText size={16}/>
                          {pdfBusy ? 'Generazione…' : 'Scarica PDF'}
                      </button>
                      <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 px-4 py-1.5 rounded text-sm"><X size={18}/></button>
                  </div>
              </div>

              {pdfError && (
                  <div className="no-print border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
                      {pdfError}
                  </div>
              )}
              {pdfInfo && (
                  <div className="no-print flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                      <span>{pdfInfo}</span>
                      <div className="flex items-center gap-2">
                          {pdfOpenUrl && (
                              <button
                                  type="button"
                                  onClick={() => openPdfExternal(pdfOpenUrl)}
                                  className="rounded border border-emerald-300 bg-white px-2 py-1 text-emerald-700 hover:bg-emerald-100"
                              >
                                  Apri PDF
                              </button>
                          )}
                          <button type="button" onClick={() => setPdfInfo(null)} className="text-emerald-700 hover:text-emerald-900" aria-label="Chiudi messaggio">
                              <X size={14} />
                          </button>
                      </div>
                  </div>
              )}

              <div className="flex-1 flex overflow-hidden">
                  {/* Print Settings Sidebar (Left) */}
                  <div className="w-80 bg-white border-r overflow-y-auto p-6 text-sm text-gray-800 no-print shadow-xl z-20">
                      <h4 className="font-bold text-gray-500 uppercase mb-4 text-xs tracking-wider flex items-center gap-2"><Settings size={14}/> Configurazione Documento</h4>
                      
                      <div className="space-y-4 mb-6">
                          <div>
                              <label className="block text-xs font-bold mb-1">Titolo Azienda / Intestazione</label>
                              <input className="w-full border p-2 rounded" value={printAppTitle} onChange={e => setPrintAppTitle(e.target.value)} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold mb-1">Titolo Documento</label>
                              <input className="w-full border p-2 rounded" value={printDocTitle} onChange={e => setPrintDocTitle(e.target.value)} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold mb-1">Sottotitolo Progetto</label>
                              <input className="w-full border p-2 rounded" value={printSubtitle} onChange={e => setPrintSubtitle(e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              <div>
                                  <label className="block text-xs font-bold mb-1">Data</label>
                                  <input className="w-full border p-2 rounded" value={printDate} onChange={e => setPrintDate(e.target.value)} />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold mb-1">Tecnico</label>
                                  <input className="w-full border p-2 rounded" value={printTechnician} onChange={e => setPrintTechnician(e.target.value)} />
                              </div>
                          </div>
                          <div>
                              <label className="block text-xs font-bold mb-1">Numero Pratica / ID</label>
                              <input className="w-full border p-2 rounded" value={printProjectId} onChange={e => setPrintProjectId(e.target.value)} />
                          </div>
                      </div>

                      {isStandardDocument && (
                      <div className="border-t pt-4 mb-6">
                           <label className="block text-xs font-bold mb-2">Visibilità Dati Formato</label>
                           <div className="flex items-center gap-2 mb-2">
                              <input type="checkbox" id="showPrices" checked={printShowPrices} onChange={e => {
                                  setPrintShowPrices(e.target.checked);
                                  if (e.target.checked) setIsRFQMode(false);
                              }} />
                              <label htmlFor="showPrices">Mostra Prezzi e Totali</label>
                           </div>
                            {printShowPrices && !isRFQMode && (
                                <div className="flex items-center gap-2 ml-5 mb-2">
                                    <input 
                                        type="checkbox" 
                                        id="showMaterialLaborPrint" 
                                        checked={printShowMaterialLabor} 
                                        onChange={e => setPrintShowMaterialLabor(e.target.checked)} 
                                        className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <label htmlFor="showMaterialLaborPrint" className="text-xs text-gray-700 cursor-pointer">
                                        Distinzione "Materiali" e "Manodopera"
                                    </label>
                                </div>
                            )}
                      </div>
                      )}

                      {printDocument === 'rfq' && (
                      <div className="border-t pt-4 mb-6 bg-emerald-50/50 -mx-6 px-6 py-4 border-b">
                           <h5 className="font-bold text-emerald-900 mb-2 text-xs flex items-center gap-1.5 uppercase tracking-wide">
                               <Building2 size={14} className="text-emerald-600"/> Opzioni Richiesta Preventivi Ditte
                           </h5>
                           <div className="space-y-2 text-xs">
                               <label className="flex items-center gap-2 cursor-pointer text-gray-600">
                                   <input 
                                       type="checkbox" 
                                       checked={rfqShowMaterialLabor} 
                                       onChange={e => setRfqShowMaterialLabor(e.target.checked)} 
                                       className="rounded text-indigo-600 focus:ring-indigo-500"
                                   />
                                   <span>Distinzione "Materiali" e "Manodopera"</span>
                               </label>
                               <label className="flex items-center gap-2 cursor-pointer text-gray-600">
                                   <input 
                                       type="checkbox" 
                                       checked={rfqShowTimeCol} 
                                       onChange={e => setRfqShowTimeCol(e.target.checked)} 
                                       className="rounded text-indigo-600 focus:ring-indigo-500"
                                   />
                                   <span>Colonna "Tempi Stimati (gg)"</span>
                               </label>
                               <label className="flex items-center gap-2 cursor-pointer text-gray-600">
                                   <input 
                                       type="checkbox" 
                                       checked={rfqShowContractorForm} 
                                       onChange={e => setRfqShowContractorForm(e.target.checked)} 
                                       className="rounded text-indigo-600 focus:ring-indigo-500"
                                   />
                                   <span>Include Modulo Offerta e Firma Ditta</span>
                               </label>
                           </div>
                      </div>
                      )}

                      <div className="border-t pt-4 mb-6">
                          <label className="block text-xs font-bold mb-2">Piè di Pagina</label>
                           <div className="flex items-center gap-2 mb-2">
                              <input type="checkbox" id="showFooter" checked={printShowFooterInfo} onChange={e => setPrintShowFooterInfo(e.target.checked)} />
                              <label htmlFor="showFooter">Mostra Piè di Pagina</label>
                           </div>
                           <input className="w-full border p-2 rounded" value={printFooterText} onChange={e => setPrintFooterText(e.target.value)} placeholder="Testo piè di pagina..." disabled={!printShowFooterInfo} />
                      </div>

                      <div className="border-t pt-4 mb-6">
                          <label className="block text-xs font-bold mb-2">Numeri di Pagina</label>
                          <div className="flex items-center gap-2 mb-2">
                              <input type="checkbox" id="showPageNumbers" checked={printShowPageNumbers} onChange={e => setPrintShowPageNumbers(e.target.checked)} />
                              <label htmlFor="showPageNumbers">Mostra numeri di pagina</label>
                          </div>
                          <label className="block text-[10px] font-bold text-gray-500 mb-1">Font</label>
                          <select
                              className="w-full border p-2 rounded mb-2"
                              value={printPageNumberFont}
                              onChange={e => setPrintPageNumberFont(e.target.value)}
                          >
                              {GOOGLE_FONTS.map(font => (
                                  <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>
                              ))}
                          </select>
                          <StyleControl
                              label="Dimensione e colore"
                              size={printPageNumberSize}
                              setSize={setPrintPageNumberSize}
                              color={printPageNumberColor}
                              setColor={setPrintPageNumberColor}
                              min={6}
                              max={18}
                          />
                          <div className="mt-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Anteprima</span>
                              <span
                                  className="font-semibold"
                                  style={{
                                      color: printPageNumberColor,
                                      fontFamily: printPageNumberFont,
                                      fontSize: printPageNumberSize,
                                  }}
                              >
                                  Pag. 1 / {previewPageCount}
                              </span>
                          </div>
                      </div>

                      {isStandardDocument && (
                      <div className="border-t pt-4 mb-6">
                          <label className="block text-xs font-bold mb-2">Layout di Stampa</label>
                          <div className="space-y-2">
                              <label className="flex items-center gap-2">
                                  <input type="radio" name="layout" value="details" checked={printLayoutMode === 'details'} onChange={() => setPrintLayoutMode('details')} />
                                  <span>Standard</span>
                              </label>
                              <label className="flex items-center gap-2">
                                  <input type="radio" name="layout" value="summary" checked={printLayoutMode === 'summary'} onChange={() => setPrintLayoutMode('summary')} />
                                  <span>Riepilogo categorie</span>
                              </label>
                              <label className="flex items-center gap-2">
                                  <input type="radio" name="layout" value="both" checked={printLayoutMode === 'both'} onChange={() => setPrintLayoutMode('both')} />
                                  <span>Standard + Tabella Riepilogativa</span>
                              </label>
                          </div>
                      </div>
                      )}

                      <div className="border-t pt-4 mb-6">
                           <h4 className="font-bold text-gray-500 uppercase mb-2 text-xs">Stili e Font</h4>
                           <div className="mb-2">
                               <label className="block text-xs font-bold mb-1">Font Titoli</label>
                               <select className="w-full border p-2 rounded" value={printTitleFont} onChange={e => setPrintTitleFont(e.target.value)}>
                                   {GOOGLE_FONTS.map(f => <option key={f} value={f} style={{fontFamily: f}}>{f}</option>)}
                               </select>
                           </div>
                           <div className="mb-4">
                               <label className="block text-xs font-bold mb-1">Font Testo</label>
                               <select className="w-full border p-2 rounded" value={printBodyFont} onChange={e => setPrintBodyFont(e.target.value)}>
                                   {GOOGLE_FONTS.map(f => <option key={f} value={f} style={{fontFamily: f}}>{f}</option>)}
                               </select>
                           </div>
                           
                           <StyleControl label="Intestazione Azienda" size={printFontSizeTitle} setSize={setPrintFontSizeTitle} color={printColorTitle} setColor={setPrintColorTitle} />
                           <StyleControl label="Titolo Documento" size={printFontSizeDocTitle} setSize={setPrintFontSizeDocTitle} color={printColorDocTitle} setColor={setPrintColorDocTitle} />
                           <StyleControl label="Descrizione Documento" size={printFontSizeDesc} setSize={setPrintFontSizeDesc} color={printColorDesc} setColor={setPrintColorDesc} />
                           
                           <StyleControl label="Frontespizio" size={printFontSizeMeta} setSize={setPrintFontSizeMeta} color={printColorMeta} setColor={setPrintColorMeta} />

                           <div className="border-t border-gray-100 my-2 pt-2">
                               <h5 className="text-[10px] font-bold text-gray-400 uppercase mb-2">TABELLA</h5>
                               <StyleControl 
                                    label="Categoria L1" 
                                    size={printFontSizeHeaderL1} setSize={setPrintFontSizeHeaderL1} 
                                    color={printColorCategoryTextL1} setColor={setPrintColorCategoryTextL1} 
                                    bgColor={printColorCategoryBgL1} setBgColor={setPrintColorCategoryBgL1}
                               />
                               
                               <StyleControl 
                                    label="Sottocategorie" 
                                    size={printFontSizeHeaderSub} setSize={setPrintFontSizeHeaderSub} 
                                    color={printColorCategoryTextSub} setColor={setPrintColorCategoryTextSub} 
                                    bgColor={printColorCategoryBgSub} setBgColor={setPrintColorCategoryBgSub}
                               />
                               
                               <StyleControl label="Importi Categorie" size={printFontSizeCatAmount} setSize={setPrintFontSizeCatAmount} color={printColorCatAmount} setColor={setPrintColorCatAmount} />

                               <StyleControl label="Testo Voci e Codici" size={printFontSizeBody} setSize={setPrintFontSizeBody} color={printColorItemText} setColor={setPrintColorItemText} />
                               <StyleControl label="Sottovoci Misura" size={printFontSizeMeasurements} setSize={setPrintFontSizeMeasurements} color={printColorSubtitle} setColor={setPrintColorSubtitle} />
                               <StyleControl label="Importi" size={printFontSizeAmount} setSize={setPrintFontSizeAmount} color={printColorAmount} setColor={setPrintColorAmount} />
                               <StyleControl label="Totale Generale" size={printFontSizeTotal} setSize={setPrintFontSizeTotal} color={printColorTotal} setColor={setPrintColorTotal} />
                               
                               <div className="border-t border-gray-100 my-2"></div>
                               <StyleControl label="Piè di Pagina" size={printFontSizeFooter} setSize={setPrintFontSizeFooter} color={printColorFooter} setColor={setPrintColorFooter} />
                           </div>

                           <div className="border-t border-gray-100 my-2 pt-2">
                               <label className="block text-xs font-bold mb-2">LINEE & BORDI</label>
                               
                               <div className="mb-2">
                                   <label className="block text-[10px] font-bold text-gray-500 mb-1">LINEA FRONTESPIZIO (px)</label>
                                   <input type="range" min={0} max={10} value={printHeaderLineWidth} onChange={e => setPrintHeaderLineWidth(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-700"/>
                               </div>

                               <label className="block text-[10px] font-bold text-gray-500 mb-1">BORDI TABELLA & TOTALI</label>
                               <div className="flex items-center gap-4">
                                   <input type="range" min={1} max={10} value={printBorderWidth} onChange={e => setPrintBorderWidth(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-700"/>
                                   <input type="color" value={printBorderColor} onChange={e => setPrintBorderColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-none bg-transparent" />
                               </div>
                           </div>
                      </div>
                  </div>

                  {/* Preview Canvas (Center) */}
                  <div className="flex-1 bg-gray-200 overflow-y-auto p-4 sm:p-8">
                      <div className="no-print flex w-full flex-col items-center">
                          {pdfPagesLoading && (
                              <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
                                  Aggiornamento anteprima…
                              </div>
                          )}
                          {pdfPagesError && (
                              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                                  {pdfPagesError}
                              </div>
                          )}
                          <div ref={pdfPagesRef} className="flex w-full flex-col items-center" />
                      </div>
                      <div ref={printRef} className="print-page preview-pages-only mx-auto bg-white shadow-lg w-[210mm] min-h-[297mm] p-[15mm] relative print:w-full print:min-h-0 print:h-auto print:shadow-none print:p-0 print:m-0 box-border flex flex-col">
                          <style>
                              {`
                                ${printPageCss}
                                ${printRulesCss}
                              `}
                          </style>
                          
                          {/* Header */}
                          <div className="mb-6 pb-2" style={{ borderBottomWidth: printHeaderLineWidth, borderBottomColor: printBorderColor }}>
                               <div className="flex justify-between items-start">
                                   <div className="max-w-[60%]">
                                       <h1 className="font-bold tracking-wide leading-tight" style={{ fontSize: printFontSizeTitle, color: printColorTitle, fontFamily: printTitleFont }}>{printAppTitle}</h1>
                                       <h2 className="mt-2 font-bold leading-tight" style={{ fontSize: printFontSizeDocTitle, color: printColorDocTitle, fontFamily: printTitleFont }}>{printDocTitle}</h2>
                                       {printSubtitle && <p className="mt-2 text-justify" style={{ fontSize: printFontSizeDesc, color: printColorSubtitle, fontFamily: printBodyFont }}>{printSubtitle}</p>}
                                   </div>
                                   <div className="text-right">
                                       <div className="space-y-1" style={{ fontSize: printFontSizeMeta, color: printColorMeta, fontFamily: printBodyFont }}>
                                           <p><span className="font-bold">Rif. Pratica:</span> {printProjectId}</p>
                                           <p><span className="font-bold">Tecnico:</span> {printTechnician}</p>
                                           <p><span className="font-bold">Data:</span> {printDate}</p>
                                       </div>
                                   </div>
                               </div>
                          </div>

                          {/* Content */}
                          <div>
                            {!isStandardDocument ? (
                              <PrintDocumentContent
                                document={printDocument}
                                project={project}
                                bodyFont={printBodyFont}
                              />
                            ) : (
                              <>
                              {(printLayoutMode === 'details' || printLayoutMode === 'both') && (
                                  <div>
                                    {project.rootWBS.children.map(child => (
                                        <RenderPrintPreviewNode 
                                            key={child.id} 
                                            node={child} 
                                            level={1} 
                                            showItems={true}
                                        />
                                    ))}
                                    {printLayoutMode === 'both' && printShowPrices && (
                                        <div className="mt-2 pt-2 border-t-2 break-inside-avoid" style={{ borderColor: printColorTotal, borderTopWidth: printBorderWidth }}>
                                             <div className="flex justify-between items-center">
                                                 <div className="flex flex-col">
                                                     <span className="font-bold text-gray-800 uppercase" style={{ fontSize: printFontSizeTotal * 0.8, fontFamily: printTitleFont }}>
                                                         Totale {printMode === 'SAL' ? 'Avanzamento Lavori' : 'Generale'}
                                                     </span>
                                                     {printMode === 'SAL' && (
                                                         <div className="mt-1">
                                                             <span className="text-xs text-orange-600 font-black uppercase tracking-tight">
                                                                 Percentuale Avanzamento: {globalProgressPercent.toFixed(2)}%
                                                             </span>
                                                         </div>
                                                     )}
                                                 </div>
                                                 <div className="flex flex-col items-end">
                                                     <span className="font-bold" style={{ fontSize: printFontSizeTotal, color: printColorTotal }}>
                                                         € {filteredTotal.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                     </span>
                                                     {printMode === 'SAL' && (
                                                         <span className="text-[10px] text-gray-500 font-medium">
                                                             su un preventivo totale di € {globalProjectTotal.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                         </span>
                                                     )}
                                                 </div>
                                             </div>
                                        </div>
                                    )}
                                  </div>
                              )}
                              
                              {printLayoutMode === 'both' && <div className="page-break my-8 border-b-2 border-dashed border-gray-200 print:border-none relative">
                                  <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-white px-2 text-gray-400 text-xs font-bold no-print">Pagina Successiva (Riepilogo)</span>
                              </div>}

                              {(printLayoutMode === 'summary' || printLayoutMode === 'both') && (
                                  <div>
                                    {printLayoutMode === 'both' && <h2 className="mb-4 font-bold uppercase tracking-wide border-b pb-2" style={{ fontSize: printFontSizeHeaderL1, fontFamily: printTitleFont }}>Riepilogo Categorie</h2>}
                                    {project.rootWBS.children.map(child => (
                                        <RenderPrintPreviewNode 
                                            key={`${child.id}-summary`} 
                                            node={child} 
                                            level={1} 
                                            showItems={false}
                                        />
                                    ))}
                                  </div>
                              )}

                          {/* Grand Total */}
                          {printShowPrices && !isRFQMode && (
                              <div className="mt-2 pt-2 border-t-2 break-inside-avoid" style={{ borderColor: printColorTotal, borderTopWidth: printBorderWidth }}>
                                   <div className="flex justify-between items-center">
                                       <div className="flex flex-col">
                                           <span className="font-bold text-gray-800 uppercase" style={{ fontSize: printFontSizeTotal * 0.8, fontFamily: printTitleFont }}>
                                               Totale {printMode === 'SAL' ? 'Avanzamento Lavori' : 'Generale'}
                                           </span>
                                           {printMode === 'SAL' && (
                                               <div className="mt-1">
                                                   <span className="text-xs text-orange-600 font-black uppercase tracking-tight">
                                                       Percentuale Avanzamento: {globalProgressPercent.toFixed(2)}%
                                                   </span>
                                               </div>
                                           )}
                                       </div>
                                       <div className="flex flex-col items-end">
                                           <span className="font-bold" style={{ fontSize: printFontSizeTotal, color: printColorTotal }}>
                                               € {filteredTotal.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                           </span>
                                           {printMode === 'SAL' && (
                                               <span className="text-[10px] text-gray-500 font-medium">
                                                   su un preventivo totale di € {globalProjectTotal.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                               </span>
                                           )}
                                       </div>
                                   </div>
                              </div>
                          )}

                          {/* Modulo Offerta e Firma Ditta per Computo in Bianco */}
                          {isRFQMode && rfqShowContractorForm && (
                              <div className="mt-8 pt-6 border-t-2 border-gray-800 break-inside-avoid text-xs font-sans text-gray-800">
                                  <div className="flex justify-between items-center border-b border-gray-400 pb-2 mb-4">
                                      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-900 flex items-center gap-2">
                                          <Building2 size={16} /> SCHEDA OFFERTA E DICHIARAZIONE DELL'IMPRESA
                                      </h3>
                                      <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-2 py-0.5 rounded border border-gray-300">
                                          Da restituire compilato e firmato
                                      </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4 mb-4 bg-gray-50/80 p-3 rounded border border-gray-300">
                                      <div>
                                          <p className="font-bold text-gray-900 mb-1 uppercase text-[10px] tracking-wider">Anagrafica Ditta Offerente:</p>
                                          <p className="mb-1.5"><span className="font-semibold text-gray-700">Ragione Sociale:</span> <span className="font-mono text-gray-400">__________________________________________</span></p>
                                          <p className="mb-1.5"><span className="font-semibold text-gray-700">P.IVA / Cod. Fiscale:</span> <span className="font-mono text-gray-400">____________________________________</span></p>
                                          <p><span className="font-semibold text-gray-700">Indirizzo Sede:</span> <span className="font-mono text-gray-400">__________________________________________</span></p>
                                      </div>
                                      <div>
                                          <p className="font-bold text-gray-900 mb-1 uppercase text-[10px] tracking-wider">Contatti e Referente:</p>
                                          <p className="mb-1.5"><span className="font-semibold text-gray-700">Referente Lavori:</span> <span className="font-mono text-gray-400">__________________________________________</span></p>
                                          <p className="mb-1.5"><span className="font-semibold text-gray-700">Telefono / Cell.:</span> <span className="font-mono text-gray-400">_______________________________________</span></p>
                                          <p><span className="font-semibold text-gray-700">Email / PEC:</span> <span className="font-mono text-gray-400">_____________________________________________</span></p>
                                      </div>
                                  </div>

                                  <div className="space-y-3 mb-6 bg-white p-4 rounded border border-gray-300">
                                      <div className="flex justify-between items-center border-b pb-2">
                                          <span className="font-bold text-gray-900 text-sm">TOTALE GENERALE OFFERTO PER I LAVORI (escluso IVA):</span>
                                          <span className="font-mono font-bold text-base text-gray-900 border-b-2 border-gray-900 px-3 py-0.5">
                                               {totalContractorOffer > 0 ? `€ ${totalContractorOffer.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "€ _______________________"}
                                           </span>
                                      </div>
                                      <div className="border-b pb-2">
                                          <span className="font-semibold text-gray-700">Importo totale in lettere:</span>
                                          <p className="font-mono text-gray-400 mt-1">___________________________________________________________________________________</p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                          <div className="border-r pr-2">
                                              <span className="font-semibold text-gray-800">Tempo complessivo di esecuzione stimato:</span>
                                              <p className="mt-1"><span className="font-mono font-bold text-sm">_______</span> giorni naturali e consecutivi</p>
                                          </div>
                                          <div>
                                              <span className="font-semibold text-gray-800">Validità temporale della presente offerta:</span>
                                              <p className="mt-1"><span className="font-mono font-bold text-sm">_______</span> giorni solari</p>
                                          </div>
                                      </div>
                                      <div className="pt-2 border-t">
                                          <span className="font-semibold text-gray-800">Note, specifiche tecniche, o marche/sistemi proposti:</span>
                                          <div className="border border-gray-300 rounded p-2 min-h-[45px] mt-1 bg-gray-50/50 text-gray-400 font-mono text-[10px] italic">
                                              (Spazio a disposizione della ditta per annotare eventuali precisazioni sul preventivo o varianti migliorative)
                                          </div>
                                      </div>
                                  </div>

                                  <div className="flex justify-between items-end pt-4 px-2">
                                      <div>
                                          <p className="font-semibold text-gray-800">Data e Luogo:</p>
                                          <p className="font-mono text-gray-600 mt-1">______________________, ____/____/2026</p>
                                      </div>
                                      <div className="text-center w-72 border-t-2 border-gray-800 pt-2">
                                          <p className="font-bold text-gray-900">Timbro e Firma del Legale Rappresentante</p>
                                          <p className="text-[10px] text-gray-500 italic mt-8">(Firma per estesa e leggibile)</p>
                                      </div>
                                  </div>
                              </div>
                          )}
                          
                              </>
                            )}
                          </div>

                          {/* Anteprima piè di pagina e numerazione (non stampata: in stampa usano i margin box) */}
                          <div
                              className="no-print mt-auto flex items-end justify-between gap-4 border-t border-slate-200 pt-2"
                              style={{ color: printColorFooter, fontFamily: printBodyFont }}
                          >
                              <div className="min-w-0 truncate" style={{ fontSize: printFontSizeFooter }}>
                                  {printShowFooterInfo ? printFooterText : ''}
                              </div>
                              {printShowPageNumbers && (
                                  <div
                                      className="shrink-0 font-semibold"
                                      style={{
                                          color: printPageNumberColor,
                                          fontFamily: printPageNumberFont,
                                          fontSize: printPageNumberSize,
                                      }}
                                      title="Anteprima: la numerazione definitiva viene calcolata in stampa"
                                  >
                                      Pag. 1 / {previewPageCount}
                                  </div>
                              )}
                          </div>

                      </div>
                  </div>

                  {/* Right Sidebar - Selection */}
                  {isStandardDocument && (
                  <div className="w-80 bg-white border-l overflow-y-auto p-6 text-sm text-gray-800 no-print shadow-xl z-20 flex flex-col">
                      
                      {printMode === 'SAL' && (
                          <div className="mb-6 pb-6 border-b border-gray-100">
                               <h4 className="font-bold text-gray-500 uppercase mb-2 text-xs tracking-wider flex items-center gap-2">
                                   <History size={14}/> Selezione SAL da Stampare
                               </h4>
                               <p className="text-xs text-gray-400 mb-2">Scegli quale stato di avanzamento includere.</p>
                               <select 
                                 value={previewSalId || ''} 
                                 onChange={(e) => setPreviewSalId(e.target.value)}
                                 className="w-full border p-2 rounded text-sm bg-orange-50 border-orange-200 text-orange-900 font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                               >
                                    {project.sals && project.sals.length > 0 ? (
                                        [...project.sals].sort((a,b) => b.date - a.date).map(sal => (
                                            <option key={sal.id} value={sal.id}>
                                                {sal.code} - {sal.name} ({new Date(sal.date).toLocaleDateString()})
                                            </option>
                                        ))
                                    ) : (
                                        <option disabled value="">Nessun SAL disponibile</option>
                                    )}
                               </select>
                               {previewSalId && (
                                   <div className="mt-2 text-[10px] text-orange-600 bg-orange-50 p-2 rounded border border-orange-100 font-medium">
                                       Nota: Verranno stampate solo le voci con quantità &gt; 0 in questo documento.
                                   </div>
                               )}
                          </div>
                      )}

                      <div className="mb-4">
                           <h4 className="font-bold text-gray-500 uppercase mb-2 text-xs tracking-wider flex items-center gap-2">
                               <CheckCircle2 size={14}/> Selezione Capitoli
                           </h4>
                           <p className="text-xs text-gray-400 mb-2">Scegli quali parti del computo stampare.</p>
                      </div>
                      <div className="flex-1 overflow-y-auto border rounded bg-gray-50 p-2">
                          <RenderPrintSelectTree node={project.rootWBS} />
                      </div>
                  </div>
                  )}
              </div>
          </div>
    );
};