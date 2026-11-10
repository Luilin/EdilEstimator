import { ActiveDimensions, CostItem, Measurement, PriceBook, PriceBookItem, Project, WBSNode } from '../types';

/**
 * Scambio dati in formato XPWE (XML) usato da PriMus e dagli altri software
 * di computo italiani. L'import è tollerante: legge i nodi standard
 * PweElencoPrezzi / PweVociComputo / PweDGWBS e, se presenti, le righe di
 * misura. L'export produce un XML strutturato secondo gli stessi nodi.
 */

export interface XpweImportResult {
  projectName?: string;
  nodes: WBSNode[];
  counts: { prices: number; entries: number; measurements: number };
  warnings: string[];
}

const ACTIVE_NONE: ActiveDimensions = { length: false, area: false, height: false, weight: false };

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `xpwe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const escapeXml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;
const round2 = (value: number) => Math.round(value * 100) / 100;

// XPWE/PriMus usa comunemente le forme ASCII per le unità di misura.
const exportUom = (uom: string): string =>
  String(uom || 'cad')
    .replace(/m²/gi, 'm2')
    .replace(/m³/gi, 'm3')
    .trim();

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const analyzeRows = (project: Project) => {
  const rows: { item: CostItem; categoryCode: string }[] = [];
  const walk = (node: WBSNode) => {
    node.items.forEach(item => rows.push({ item, categoryCode: node.code }));
    node.children.forEach(walk);
  };
  walk(project.rootWBS);
  return rows;
};

const percentage = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/* -------------------------------------------------------------------------- */
/*                                   EXPORT                                   */
/* -------------------------------------------------------------------------- */

export function buildXpwe(project: Project): string {
  const entries = analyzeRows(project);

  const wbsLines: string[] = [];
  let cu = 0;
  const walkWbs = (node: WBSNode, parentCu: number) => {
    if (node.level > 0) {
      cu += 1;
      const currentCu = cu;
      wbsLines.push(
        `      <WBSItem CU="${currentCu}" CUParent="${parentCu}" Titolo="${escapeXml(node.name)}" Codice="${escapeXml(node.code)}" CodiceExt="${escapeXml(node.code)}" />`
      );
      node.children.forEach(child => walkWbs(child, currentCu));
    } else {
      node.children.forEach(child => walkWbs(child, 0));
    }
  };
  walkWbs(project.rootWBS, 0);

  const priceLines: string[] = [];
  const entryLines: string[] = [];

  entries.forEach(({ item, categoryCode }, index) => {
    const idEp = index + 1;
    const idVc = index + 1;

    let materialPart = 0;
    let laborPart = 0;
    let equipmentPart = 0;
    let safetyPart = 0;

    if (item.priceAnalysis) {
      item.priceAnalysis.rows.forEach(row => {
        const line = (row.quantity || 0) * (row.unitPrice || 0);
        if (row.type === 'material') materialPart += line;
        else if (row.type === 'labor') laborPart += line;
        else if (row.type === 'equipment') equipmentPart += line;
        else if (row.type === 'safety') safetyPart += line;
      });
    } else {
      materialPart = item.materialPrice || 0;
      laborPart = item.laborPrice || 0;
    }

    priceLines.push(
      `      <EPItem ID="${idEp}" TipoEP="0" Tariffa="${escapeXml(item.code)}" Articolo="${escapeXml(item.code)}" ` +
      `Desridotta="${escapeXml(item.description.slice(0, 120))}" Desestesa="${escapeXml(item.description)}" ` +
      `UnMisura="${escapeXml(exportUom(item.uom))}" Prezzo="${round4(item.price)}" ` +
      `IncMAT="${round4(percentage(materialPart, item.price))}" IncMDO="${round4(percentage(laborPart, item.price))}" ` +
      `IncATTR="${round4(percentage(equipmentPart, item.price))}" IncSic="${round4(percentage(safetyPart, item.price))}" />`
    );

    entryLines.push(
      `      <VCItem ID="${idVc}" IDEP="${idEp}" Quantita="${round4(item.qty)}" CodiceWBS="${escapeXml(categoryCode)}" DataMis="${new Date().toLocaleDateString('it-IT')}">`
    );

    const measurements = (item.measurements || []).filter(measure =>
      measure.qty !== 0 || measure.length !== 0 || measure.area !== 0 || measure.height !== 0 || measure.weight !== 0
    );

    if (measurements.length > 0) {
      entryLines.push('        <PweVCMisure>');
      measurements.forEach((measure, measureIndex) => {
        entryLines.push(
          `          <VCMisura ID="${measureIndex + 1}" Descrizione="${escapeXml(measure.name || '')}" ` +
          `PartiUguali="${round4(measure.factor || 1)}" Lunghezza="${round4(measure.length)}" ` +
          `Larghezza="${round4(measure.area)}" H_Peso="${round4(measure.height || measure.weight)}" ` +
          `Quantita="${round4(measure.qty || measure.factor * measure.length * measure.area * measure.height)}" />`
        );
      });
      entryLines.push('        </PweVCMisure>');
    } else {
      entryLines.push('        <PweVCMisure>');
      entryLines.push(
        `          <VCMisura ID="1" Descrizione="${escapeXml(item.description.slice(0, 120))}" PartiUguali="${round4(item.qty)}" Quantita="${round4(item.qty)}" />`
      );
      entryLines.push('        </PweVCMisure>');
    }

    entryLines.push('      </VCItem>');
  });

  const projectName = project.name || 'Computo';
  const fileName = `${projectName.replace(/[^\w.-]+/g, '_')}.xpwe`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<PWE>
  <Intestazione>
    <TipoDocumento>1</TipoDocumento>
    <TipoFormato>XPWE</TipoFormato>
    <Versione>1.0</Versione>
    <FileNameDocumento>${escapeXml(fileName)}</FileNameDocumento>
    <Copyright>Stimia</Copyright>
  </Intestazione>
  <PweDatiGenerali>
    <PweDGProgetto>
      <Descrizione>${escapeXml(project.description || projectName)}</Descrizione>
      <Committente>${escapeXml(project.createdBy || '')}</Committente>
    </PweDGProgetto>
    <PweDGWBS>
${wbsLines.join('\n')}
    </PweDGWBS>
    <PweDGModuli>
      <PweDGAnalisi>
        <SpeseGenerali>0</SpeseGenerali>
        <UtiliImpresa>0</UtiliImpresa>
        <OneriAccessoriSc>0</OneriAccessoriSc>
        <ConfQuantita>10.2|0</ConfQuantita>
      </PweDGAnalisi>
    </PweDGModuli>
    <PweDGConfigurazioni>
      <PweDGConfigNumeri>
        <Divisa>Euro</Divisa>
        <ConversioniIN>Euro</ConversioniIN>
        <FattoreConversione>1</FattoreConversione>
        <Cambio>0</Cambio>
      </PweDGConfigNumeri>
    </PweDGConfigurazioni>
  </PweDatiGenerali>
  <PweMisurazioni>
    <PweElencoPrezzi>
${priceLines.join('\n')}
    </PweElencoPrezzi>
    <PweVociComputo>
${entryLines.join('\n')}
    </PweVociComputo>
  </PweMisurazioni>
</PWE>`;
}

/* -------------------------------------------------------------------------- */
/*                                   IMPORT                                   */
/* -------------------------------------------------------------------------- */

/**
 * Legge un valore sia dagli attributi sia dagli elementi figli.
 * I file PriMus reali usano spesso <Tariffa>...</Tariffa> invece di Tariffa="...".
 */
const readAttr = (element: Element, ...names: string[]): string => {
  const wanted = names.map(name => name.toLowerCase());

  for (const attribute of Array.from(element.attributes)) {
    if (wanted.includes(attribute.name.toLowerCase()) && attribute.value !== '') {
      return attribute.value;
    }
  }

  for (const child of Array.from(element.children)) {
    if (wanted.includes(child.localName.toLowerCase())) {
      const text = (child.textContent || '').trim();
      if (text) return text;
    }
  }

  return '';
};

const directChildren = (element: Element): Element[] =>
  Array.from(element.children);

const findDescendants = (root: Document | Element, names: string[]): Element[] => {
  const found: Element[] = [];

  for (const name of names) {
    try {
      const matches = root.getElementsByTagName(name);
      for (let i = 0; i < matches.length; i++) found.push(matches[i]);
    } catch {
      /* nome non valido */
    }
  }

  if (found.length > 0) {
    return Array.from(new Set(found));
  }

  const wanted = names.map(name => name.toLowerCase());
  return Array.from(root.querySelectorAll('*')).filter(element =>
    wanted.includes(element.localName.toLowerCase())
  );
};

const isPriceElement = (element: Element): boolean => {
  const hasPrice = readAttr(element, 'Prezzo', 'Prezzo1', 'PrezzoUnitario') !== '';
  const hasCode = readAttr(element, 'Tariffa', 'Codice', 'Articolo') !== '';
  const hasDescription = readAttr(element, 'Desestesa', 'DesEstesa', 'Desridotta', 'Descrizione') !== '';
  return hasPrice && (hasCode || hasDescription);
};

const isEntryElement = (element: Element): boolean =>
  readAttr(element, 'IDEP', 'IdEp') !== '' || readAttr(element, 'Quantita', 'Quantità') !== '';

const collectPriceElements = (doc: Document): Element[] => {
  const priceElements: Element[] = [];
  findDescendants(doc, ['PweElencoPrezzi']).forEach(container => {
    directChildren(container).filter(isPriceElement).forEach(element => priceElements.push(element));
  });
  if (priceElements.length === 0) {
    findDescendants(doc, ['EPItem', 'VoceEP', 'VoceElencoPrezzi'])
      .filter(isPriceElement)
      .forEach(element => priceElements.push(element));
  }
  return priceElements;
};

const parseMeasurements = (entry: Element): Measurement[] => {
  const containers = findDescendants(entry, ['PweVCMisure']);
  const candidates = containers.length > 0
    ? containers.flatMap(container => directChildren(container))
    : directChildren(entry).filter(child => child.localName.toLowerCase().includes('misura'));

  return candidates.map(row => {
    const factor = toNumber(readAttr(row, 'PartiUguali', 'PartiUguali'), 1);
    const length = toNumber(readAttr(row, 'Lunghezza'), 0);
    const area = toNumber(readAttr(row, 'Larghezza', 'Area'), 0);
    const height = toNumber(readAttr(row, 'H_Peso', 'HPeso', 'Altezza', 'H/Peso'), 0);
    const storedQty = toNumber(readAttr(row, 'Quantita', 'Quantità'), 0);
    const computed = factor * (length || 1) * (area || 1) * (height || 1);
    return {
      id: newId(),
      name: readAttr(row, 'Descrizione') || '',
      factor,
      length,
      area,
      height,
      weight: 0,
      qty: storedQty || computed,
    };
  }).filter(measure => measure.qty !== 0 || measure.name !== '');
};

export function parseXpwe(xmlText: string): XpweImportResult {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Il file non è un XML valido.');
  }

  const fileNameLabel = findDescendants(doc, ['Intestazione'])[0]
    ?.querySelector('FileNameDocumento')?.textContent?.trim();
  const projectName =
    (fileNameLabel ? fileNameLabel.replace(/\.(xpwe|xml)$/i, '') : '') ||
    findDescendants(doc, ['PweDGProgetto'])[0]?.querySelector('Descrizione')?.textContent?.trim() ||
    undefined;

  // Elenco prezzi
  const priceElements = collectPriceElements(doc);

  const priceById = new Map<string, Element>();
  priceElements.forEach((element, index) => {
    const id = readAttr(element, 'ID', 'Id') || String(index + 1);
    priceById.set(id, element);
  });

  // Voci di computo
  const entryElements: Element[] = [];
  findDescendants(doc, ['PweVociComputo']).forEach(container => {
    directChildren(container).filter(isEntryElement).forEach(element => entryElements.push(element));
  });
  if (entryElements.length === 0) {
    findDescendants(doc, ['VCItem', 'VoceComputo']).filter(isEntryElement).forEach(el => entryElements.push(el));
  }

  // Struttura WBS
  const wbsElements: Element[] = [];
  findDescendants(doc, ['PweDGWBS']).forEach(container => {
    directChildren(container).forEach(element => wbsElements.push(element));
  });
  if (wbsElements.length === 0) {
    findDescendants(doc, ['WBSItem', 'DGWBSItem', 'PweWBS']).forEach(el => wbsElements.push(el));
  }

  const wbsByCode = new Map<string, WBSNode>();
  const wbsByCu = new Map<string, WBSNode>();
  const rootNode: WBSNode = {
    id: 'root',
    code: '',
    name: projectName || 'Computo importato',
    level: 0,
    items: [],
    children: [],
  };

  if (wbsElements.length > 0) {
    const records = wbsElements
      .filter(element => readAttr(element, 'CU', 'Codice', 'Titolo', 'TITOLO') !== '')
      .map((element, index) => ({
        element,
        cu: readAttr(element, 'CU', 'Cu') || String(index + 1),
        parent: readAttr(element, 'CUParent', 'CuParent') || '0',
        title: readAttr(element, 'Titolo', 'TITOLO', 'Descrizione', 'DesSintetica') || `Categoria ${index + 1}`,
        code: readAttr(element, 'Codice', 'CODICE') || String(index + 1),
      }));

    records.forEach(record => {
      const node: WBSNode = {
        id: newId(),
        code: record.code,
        name: record.title,
        level: 1,
        items: [],
        children: [],
      };
      wbsByCu.set(record.cu, node);
      if (!wbsByCode.has(record.code.toLowerCase())) wbsByCode.set(record.code.toLowerCase(), node);
    });

    records.forEach(record => {
      const node = wbsByCu.get(record.cu)!;
      const parent = wbsByCu.get(record.parent);
      if (parent) {
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        rootNode.children.push(node);
      }
    });
  }

  const fallbackCategory = (label: string): WBSNode => {
    const key = label.trim().toLowerCase() || 'senza categoria';
    const existing = rootNode.children.find(child => child.code.toLowerCase() === key);
    if (existing) return existing;
    const node: WBSNode = {
      id: newId(),
      code: label || '1',
      name: label || 'Voci importate',
      level: 1,
      items: [],
      children: [],
    };
    rootNode.children.push(node);
    wbsByCode.set(key, node);
    return node;
  };

  if (rootNode.children.length === 0) {
    const categories = new Set<string>();
    entryElements.forEach(entry => {
      const code = readAttr(entry, 'CodiceWBS', 'CodiceWbs') || '';
      if (code) categories.add(code);
    });
    if (categories.size === 0) {
      fallbackCategory('Voci importate');
    } else {
      Array.from(categories)
        .sort((a, b) => a.localeCompare(b, 'it', { numeric: true }))
        .forEach(code => fallbackCategory(code));
    }
  }

  let entries = 0;
  let measurements = 0;
  let prices = 0;
  const usedCodes = new Set<string>();

  entryElements.forEach(entry => {
    const idEp = readAttr(entry, 'IDEP', 'IdEp', 'IDEP');
    const ep = priceById.get(idEp);
    if (!ep) {
      warnings.push(`Voce di computo senza prezzo collegato (IDEP ${idEp || '?'}).`);
      return;
    }

    const code = readAttr(ep, 'Tariffa', 'Codice', 'Articolo') || `IMP.${entries + 1}`;
    const description = readAttr(ep, 'Desestesa', 'DesEstesa', 'Desridotta', 'Descrizione') || 'Voce importata';
    const uom = readAttr(ep, 'UnMisura', 'UM', 'UnitàMisura') || 'cad';
    const price = toNumber(readAttr(ep, 'Prezzo', 'Prezzo1', 'PrezzoUnitario'), 0);
    const measureRows = parseMeasurements(entry);
    const qty =
      toNumber(readAttr(entry, 'Quantita', 'Quantità'), 0) ||
      sum(measureRows.map(row => row.qty));

    const finalCode = usedCodes.has(code) ? `${code}_${entries + 1}` : code;
    usedCodes.add(finalCode);

    const incMat = toNumber(readAttr(ep, 'IncMAT', 'IncMat'), 0);
    const incMdo = toNumber(readAttr(ep, 'IncMDO', 'IncMdo'), 0);
    const incSic = toNumber(readAttr(ep, 'IncSic'), 0);
    const incAttr = toNumber(readAttr(ep, 'IncATTR', 'IncAttr'), 0);

    const item: CostItem = {
      id: newId(),
      code: finalCode,
      description,
      uom,
      factor: 1,
      length: 1,
      area: 1,
      height: 1,
      weight: 1,
      measurements: measureRows.length > 1 ? measureRows : undefined,
      activeDimensions: ACTIVE_NONE,
      qty: round4(qty),
      price: round2(price),
      amount: round2(qty * price),
    };

    if (incMat > 0) item.materialPrice = round2(price * incMat / 100);
    if (incMdo > 0) item.laborPrice = round2(price * incMdo / 100);

    const categoryCode = readAttr(entry, 'CodiceWBS', 'CodiceWbs');
    const category =
      wbsByCode.get(categoryCode.toLowerCase()) ||
      wbsByCode.get(categoryCode.split('.').slice(0, -1).join('.').toLowerCase()) ||
      (categoryCode ? fallbackCategory(categoryCode) : fallbackCategory('Voci importate'));

    category.items.push(item);
    entries += 1;
    measurements += measureRows.length;
    prices += 1;

    if (incSic > 0 || incAttr > 0) {
      // Le incidenze sono già lette; un'eventuale analisi prezzi sintetica
      // viene creata solo quando ci sono dati sufficienti.
    }
  });

  if (entries === 0) {
    throw new Error('Nessuna voce di computo riconosciuta nel file XPWE.');
  }

  return {
    projectName,
    nodes: rootNode.children,
    counts: { prices, entries, measurements },
    warnings,
  };
}

export interface XpwePriceBookResult {
  name?: string;
  categories: { code: string; name: string; items: PriceBookItem[] }[];
  itemCount: number;
  warnings: string[];
}

/** Importa un prezzario XPWE (solo PweElencoPrezzi, senza voci di computo). */
export function parseXpwePriceBook(xmlText: string): XpwePriceBookResult {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Il file prezzario non è un XML valido.');
  }

  const fileNameLabel = findDescendants(doc, ['FileNameDocumento'])[0]?.textContent?.trim();
  const baseName = fileNameLabel
    ? fileNameLabel.split(/[\\/]/).pop()!.replace(/\.(xpwe|xml|dcf)$/i, '')
    : '';
  const name =
    (baseName ? baseName.replace(/[_-]+/g, ' ').trim() : '') ||
    findDescendants(doc, ['PweDGProgetto'])[0]?.querySelector('Descrizione')?.textContent?.trim() ||
    undefined;

  const priceElements = collectPriceElements(doc);
  if (priceElements.length === 0) {
    throw new Error('Nessuna voce di elenco prezzi riconosciuta nel file XPWE.');
  }

  const chapterMap = new Map<string, string>();
  const subChapterMap = new Map<string, string>();
  const superChapterMap = new Map<string, string>();

  const registerChapters = (target: Map<string, string>, names: string[]) => {
    findDescendants(doc, names).forEach(element => {
      const id = readAttr(element, 'ID', 'Id');
      const label = readAttr(element, 'DesSintetica', 'Desestesa', 'DesEstesa', 'Desridotta', 'Descrizione', 'Titolo');
      if (id && label) target.set(id, label);
    });
  };

  registerChapters(superChapterMap, ['DGSuperCapitoliItem', 'SuperCapitolo', 'SuperCategoria']);
  registerChapters(chapterMap, ['DGCapitoliItem', 'Capitolo', 'Categoria']);
  registerChapters(subChapterMap, ['DGSubCapitoliItem', 'Sottocapitolo', 'SottoCapitolo', 'Sottocategoria', 'SottoCategoria']);

  const groups = new Map<string, PriceBookItem[]>();
  let importedCount = 0;

  priceElements.forEach((element, index) => {
    const code = readAttr(element, 'Tariffa', 'Articolo', 'Codice') || `EP.${index + 1}`;
    const description =
      readAttr(element, 'Desestesa', 'DesEstesa', 'Desridotta', 'Descrizione') || code;
    const rawUom = readAttr(element, 'UnMisura', 'UM', 'UnitàMisura');
    const price = toNumber(readAttr(element, 'Prezzo', 'Prezzo1', 'PrezzoUnitario'), 0);

    // Le voci di gruppo/capitolo hanno unità di misura vuota e prezzo zero.
    if (!rawUom && price === 0) return;

    const uom = rawUom || 'cad';
    const idCap = readAttr(element, 'IDCap', 'IdCap');
    const idSbCap = readAttr(element, 'IDSbCap', 'IdSbCap');
    const idSpCap = readAttr(element, 'IDSpCap', 'IdSpCap');

    const chapter =
      (idCap && idCap !== '0' ? chapterMap.get(idCap) : '') ||
      (idSpCap && idSpCap !== '0' ? superChapterMap.get(idSpCap) : '') ||
      (idSbCap && idSbCap !== '0' ? subChapterMap.get(idSbCap) : '') ||
      'Prezzario';

    const subChapter = idSbCap && idSbCap !== '0' ? subChapterMap.get(idSbCap) : '';

    const item: PriceBookItem = {
      id: newId(),
      code,
      description,
      uom,
      price: round2(price),
    };
    if (subChapter) item.category = subChapter;

    if (!groups.has(chapter)) groups.set(chapter, []);
    groups.get(chapter)!.push(item);
    importedCount += 1;
  });

  if (importedCount === 0) {
    throw new Error('Il file non contiene voci di prezzario valorizzate.');
  }

  const categories = Array.from(groups.entries()).map(([chapter, items], index) => ({
    code: String(index + 1),
    name: chapter,
    items,
  }));

  return {
    name,
    categories,
    itemCount: importedCount,
    warnings,
  };
}

export function createPriceBookFromXpwe(
  result: XpwePriceBookResult,
  fallbackName = 'Prezzario importato'
): PriceBook {
  return {
    id: newId(),
    name: result.name || fallbackName,
    description: `Prezzario importato da XPWE (${result.itemCount} voci)`,
    rootCategory: {
      id: newId(),
      code: '',
      name: 'Root',
      items: [],
      children: result.categories.map((category, index) => ({
        id: newId(),
        code: category.code || String(index + 1),
        name: category.name,
        items: category.items,
        children: [],
      })),
    },
  };
}

export function downloadXpwe(project: Project): void {
  const xml = buildXpwe(project);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[^\w.-]+/g, '_') || 'computo'}.xpwe`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
