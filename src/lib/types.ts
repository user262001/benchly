export type Role = 'administrateur' | 'utilisateur' | 'lecteur';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  region: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  title: string;
  budget: number;
  target_year: number;
  region: string;
  status: 'actif' | 'cloture';
  created_by: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  nif: string | null;
  region: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  project_id: string | null;
  supplier_id: string | null;
  is_reference: boolean;
  offer_date: string | null;
  total_amount: number;
  item_count: number;
  file_name: string | null;
  entrepreneur: string | null;
  contract_ref: string | null;
  created_at: string;
}

export interface OfferItem {
  id: string;
  offer_id: string;
  code: string | null;
  designation: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InflationRate {
  id: string;
  year: number;
  rate: number;
}

export type Decision = 'bon_prix' | 'prix_correct' | 'a_negocier';
export type CalcMethod = 'mediane' | 'moyenne_simple' | 'moyenne_tronquee' | 'moyenne_ponderee' | 'distribution_beta';
export type AIAlgorithm = 'bge-m3' | 'e5-small';

export interface AnalysisParams {
  years: number[];
  regions: string[];
  supplierIds: string[];
  algorithm: AIAlgorithm;
  similarityThreshold: number;
  topK: number;
  method: CalcMethod;
  negotiationThreshold: number;
}

export interface MatchRecord {
  offerId: string;
  itemId: string;
  designation: string;
  similarity: number;
  year: number;
  unit: string | null;
  rawUnitPrice: number;
  adjustedUnitPrice: number;
  contractRef: string;
  entrepreneur: string;
  supplierName: string;
  selected?: boolean;
}

export interface AnalysisItemRow {
  itemId: string;
  code: string | null;
  designation: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  decision: Decision;
  referencePrice: number | null;
  methodUsed: CalcMethod | null;
  matches: MatchRecord[];
}

export interface AnalysisSummary {
  offreTotal: number;
  estimeTotal: number;
  difference: number;
  ecartPct: number;
  budget: number;
  budgetDiffOffre: number;
  budgetDiffOffrePct: number;
  budgetDiffEstime: number;
  budgetDiffEstimePct: number;
  counts: Record<Decision, number>;
  amounts: Record<Decision, number>;
}

export interface Analysis {
  id: string;
  project_id: string;
  offer_id: string | null;
  status: 'en_cours' | 'terminee';
  params: AnalysisParams;
  summary: AnalysisSummary | null;
  run_email: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string | null;
  details: Record<string, unknown>;
  user_email: string | null;
  user_role: string | null;
  created_at: string;
}

export const REGIONS = [
  'RTO', 'RTI', 'GPDF', 'RCL', 'GPDF', 'HRM',
  'RTC', 'TRC Siège', 'RTH', 'RTE','GEM','MNB','MNO','GIC'
] as const;

export const DECISION_LABELS: Record<Decision, string> = {
  bon_prix: 'Bon prix',
  prix_correct: 'Prix correct',
  a_negocier: 'À négocier',
};

export const METHOD_LABELS: Record<CalcMethod, string> = {
  mediane: 'Médiane',
  moyenne_simple: 'Moyenne simple',
  moyenne_tronquee: 'Moyenne tronquée',
  moyenne_ponderee: 'Moyenne pondérée par la similarité',
  distribution_beta: 'Distribution Bêta',
};
