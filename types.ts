

export interface ActiveDimensions {
  length: boolean;
  area: boolean;
  height: boolean;
  weight: boolean;
}

export interface Measurement {
  id: string;
  name: string;
  factor: number;
  length: number;
  area: number;
  height: number;
  weight: number;
  qty: number;
}

export type PriceAnalysisRowType = 'material' | 'labor' | 'equipment' | 'safety' | 'other';

export interface PriceAnalysisRow {
  id: string;
  type: PriceAnalysisRowType;
  description: string;
  uom: string;
  quantity: number;
  unitPrice: number;
}

export interface PriceAnalysis {
  rows: PriceAnalysisRow[];
  overheadsPercent: number;
  profitPercent: number;
  notes?: string;
  updatedAt?: number;
}

export interface CostItem {
  id: string;
  code: string; // Analysis code (e.g., A.01.05)
  description: string;
  uom: string; // Unit of measure
  
  factor: number; // Number of equal parts (N°)

  // Dimensions for detailed estimation
  length: number;
  area: number;   // Can be Width or pre-calculated Area
  height: number;
  weight: number;

  measurements?: Measurement[];

  // Configuration for custom UOM logic
  activeDimensions: ActiveDimensions;

  qty: number; // Calculated based on activeDimensions
  price: number;
  amount: number; // calculated: qty * price

  // Reference to source PriceBook if dragged/copied from there
  sourceBookId?: string;
  sourceCode?: string;
  sourceColor?: string; // Color of the source category

  // Material & Labor breakdown fields
  materialPrice?: number;        // Prezzo unitario base materiali
  laborPrice?: number;           // Prezzo unitario base manodopera

  // Analisi del prezzo unitario (EPU)
  priceAnalysis?: PriceAnalysis;

  // Contractor Offer Fields (Computo in Bianco / Offerta Ditta)
  offerPrice?: number;           // Prezzo unitario totale offerto dalla ditta
  offerMaterialPrice?: number;   // Prezzo unitario materiali offerto dalla ditta
  offerLaborPrice?: number;      // Prezzo unitario manodopera offerto dalla ditta
  offerDays?: number;            // Tempi stimati in giorni
  offerNotes?: string;           // Note o marche per la singola voce
  isContractorItem?: boolean;    // Se aggiunta dalla ditta come variante/nuova voce
}

export interface PriceBookItem {
  id: string;
  code: string;
  description: string;
  uom: string;
  price: number;
  category?: string; // Optional, useful for flat exports or drag context
  sourceBookId?: string;
  sourceCode?: string;
}

export interface PriceBookCategory {
  id: string;
  code: string;
  name: string;
  color?: string; // Hex color for visual distinction
  children: PriceBookCategory[];
  items: PriceBookItem[];
}

export interface PriceBook {
  id: string;
  name: string;
  description?: string;
  rootCategory: PriceBookCategory;
  /** Prezzario di grandi dimensioni salvato in IndexedDB invece che nel progetto. */
  external?: boolean;
  itemCount?: number;
}

export interface WBSNode {
  id: string;
  code: string; // User customizable code (e.g., "1", "A", "1.1")
  name: string;
  items: CostItem[];
  children: WBSNode[];
  level: number;
}

export interface SALRow {
  costItemId: string;
  qty: number; // Accounting quantity (cumulative)
}

export interface SAL {
  id: string;
  code: string; // e.g. "SAL 1"
  name: string; // Title
  description?: string;
  date: number;
  status: 'OPEN' | 'CLOSED';
  rows: SALRow[];
  notes?: string;
}

export type RoleType = 'admin' | 'geometra' | 'tecnico' | 'computista' | 'contabile' | 'ditta' | 'viewer' | 'custom';

export interface MemberPermission {
  email: string;
  name?: string;
  role: RoleType;
  roleName?: string;
  canRead: boolean;
  canWrite: boolean;
  canManageMembers: boolean;
  canEditSAL: boolean;
  canEditPriceBooks: boolean;
  canExport: boolean;
  addedAt?: number;
}

export interface ContractorDetails {
  companyName?: string;
  vatNumber?: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  validityDays?: number;
  totalDays?: number;
  notes?: string;
  signatureDate?: string;
}

export interface OfferItemPrice {
  price: number;
  materialPrice?: number;
  laborPrice?: number;
  days?: number;
  notes?: string;
}

export type OfferAwardCriterion = 'price' | 'time' | 'weighted';

export interface OfferComparisonSettings {
  criterion: OfferAwardCriterion;
  priceWeight: number;
  timeWeight: number;
  requireComplete: boolean;
}

export interface ScheduleActivity {
  id: string;
  name: string;
  wbsNodeId?: string;
  predecessorId?: string;
  lagDays?: number;
  start: number;
  durationDays: number;
  weight: number;
  notes?: string;
}

export interface ProjectSchedule {
  activities: ScheduleActivity[];
  updatedAt?: number;
}

export interface ProjectVariant {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: 'variante' | 'perizia';
  status: 'bozza' | 'approvata' | 'respinta';
  date: number;
  wbsNodeId?: string;
  amount: number;
  notes?: string;
}

export type SOACategory =
  | 'OG1' | 'OG2' | 'OG3' | 'OG4' | 'OG5' | 'OG6' | 'OG7' | 'OG8' | 'OG9' | 'OG10'
  | 'OG11' | 'OG12' | 'OG13'
  | 'OS1' | 'OS2' | 'OS3' | 'OS4' | 'OS5' | 'OS6' | 'OS7' | 'OS8' | 'OS9' | 'OS10'
  | 'OS11' | 'OS12' | 'OS13' | 'OS14' | 'OS15' | 'OS16' | 'OS17' | 'OS18' | 'OS19'
  | 'OS20' | 'OS21' | 'OS22' | 'OS23' | 'OS24' | 'OS25' | 'OS26' | 'OS27' | 'OS28'
  | 'OS29' | 'OS30' | 'OS31' | 'OS32' | 'OS33' | 'OS34' | 'OS35';

export interface QuadroEconomicoSettings {
  ivaPercent: number;
  imprevistiPercent: number;
  accantonamentiPercent: number;
  speseTecnichePercent: number;
  oneriSicurezzaMode: 'auto' | 'percent';
  oneriSicurezzaPercent: number;
  ribassoPercent: number;
  sogliaAnomaliaPercent: number;
  categorySoa: Record<string, string>; // nodeId -> categoria SOA
  notes?: string;
}

export interface RfqRequest {
  id: string;
  companyName: string;
  contactName?: string;
  email?: string;
  pec?: string;
  deadline?: number;
  sentAt?: number;
  status: 'da_inviare' | 'inviata' | 'risposta';
  notes?: string;
}

export interface Supplier {
  id: string;
  companyName: string;
  vatNumber?: string;
  type: 'fornitore' | 'subappaltatore';
  email?: string;
  pec?: string;
  phone?: string;
  soa?: string;
  contractAmount?: number;
  durcExpiry?: number;
  policyExpiry?: number;
  notes?: string;
}

export interface SignatureRecord {
  id: string;
  documentType: 'computo' | 'sal' | 'verbale' | 'offerta' | 'altro';
  documentLabel: string;
  signerName: string;
  signerEmail?: string;
  signerRole?: string;
  signedAt: number;
  hash: string;
  algorithm: 'SHA-256';
  notes?: string;
}

export interface InvoiceSettings {
  companyName: string;
  vatNumber: string;
  taxCode?: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  regimeFiscale: string;
  iban?: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  invoiceType: string; // TD01, TD06, ...
  vatPercent: number;
  splitPayment: boolean;
  ritenutaPercent: number;
  cassaPercent: number;
  bollo: boolean;
  clientName: string;
  clientVatNumber: string;
  clientTaxCode?: string;
  clientAddress: string;
  clientPostalCode: string;
  clientCity: string;
  clientProvince: string;
  clientCodeDestinatario?: string;
  clientPec?: string;
  paymentTerms: string;
}

export interface ContractorOffer {
  id: string;
  companyName: string;
  vatNumber?: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  date: number;
  validityDays?: number;
  totalDays?: number;
  notes?: string;
  source?: 'excel' | 'compilazione' | 'manuale';
  items: Record<string, OfferItemPrice>; // chiave: CostItem.id
}

export interface Project {
  id: string;
  name: string;
  description: string;
  lastModified: number;
  createdBy: string;
  userId?: string; // ID of the user in Firebase Auth
  rootWBS: WBSNode; // The root node of the tree
  sals?: SAL[]; // List of Progress Payments
  collaborators?: Record<string, 'editor' | 'viewer' | 'ditta'>; // email -> role
  memberPermissions?: Record<string, MemberPermission>; // email -> MemberPermission details
  sharedWithEmails?: string[]; // Array of emails for querying
  priceBooks?: PriceBook[]; // List of Price Books associated with the project
  contractorDetails?: ContractorDetails; // Detagli della ditta offerente per computo in bianco
  offers?: ContractorOffer[]; // Offerte ricevute dalle ditte per la comparazione
  offerComparisonSettings?: OfferComparisonSettings; // Criterio e opzioni di comparazione
  schedule?: ProjectSchedule; // Cronoprogramma lavori
  variants?: ProjectVariant[]; // Varianti e perizie suppletive
  quadroEconomico?: QuadroEconomicoSettings; // Parametri del quadro economico
  cloudFolderUrl?: string; // Cartella OneDrive/Drive collegata agli allegati
  rfqRequests?: RfqRequest[]; // Richieste preventivo inviate alle ditte
  suppliers?: Supplier[]; // Fornitori e subappaltatori
  signatures?: SignatureRecord[]; // Firme elettroniche e impronte documenti
  invoiceSettings?: InvoiceSettings; // Dati per la fatturazione elettronica
}

export enum ViewState {
  LOGIN,
  DASHBOARD,
  EDITOR
}

export const COMMON_UOMS = [
  "m", 
  "m²", 
  "m³", 
  "kg", 
  "q", 
  "t", 
  "cad", 
  "h", 
  "a corpo",
  "litri"
];

export interface EffectivePermissions {
  canRead: boolean;
  canWrite: boolean;
  canManageMembers: boolean;
  canEditSAL: boolean;
  canEditPriceBooks: boolean;
  canExport: boolean;
}

export const FULL_PERMISSIONS: EffectivePermissions = {
  canRead: true,
  canWrite: true,
  canManageMembers: true,
  canEditSAL: true,
  canEditPriceBooks: true,
  canExport: true,
};