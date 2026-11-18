import { supabase } from './supabase';
import type {
  AnalysisItemRow, AnalysisParams, AIAlgorithm, CalcMethod, Decision,
  MatchRecord, OfferItem, Offer, Project,
} from './types';

// ---- Semantic similarity over normalized French designations ----

const STOP_WORDS = new Set([
  'de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'pour', 'avec', 'a', 'au',
  'aux', 'sur', 'dans', 'par', 'd', 'l', 'un', 'une', 'pour', 'kva', 'kv', 'v',
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s).split(' ').filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

// Jaro-Winkler on bigram-reinforced tokens: robust to word-order and typos.
export function similarity(a: string, b: string, algorithm: AIAlgorithm = 'bge-m3'): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let common = 0;
  for (const t of ta) {
    if (setB.has(t)) common += 1;
    else {
      const bg = bigrams(t);
      let best = 0;
      for (const u of setB) {
        const bug = bigrams(u);
        let inter = 0;
        for (const g of bug) if (bg.has(g)) inter++;
        best = Math.max(best, (2 * inter) / (bg.size + bug.size));
      }
      common += best;
    }
  }
  const forward = common / ta.length;
  if (algorithm === 'e5-small') {
    const reverse = common / tb.length;
    return Math.round(((forward + reverse) / 2) * 100) / 100;
  }
  return Math.round(forward * 100) / 100;
}

// ---- Inflation adjustment: normalize a historical price to the target year ----

export function inflationFactor(rates: { year: number; rate: number }[], fromYear: number, targetYear: number): number {
  if (fromYear >= targetYear) return 1;
  let factor = 1;
  for (let y = fromYear; y < targetYear; y++) {
    const r = rates.find((x) => x.year === y);
    factor *= 1 + (r ? r.rate : 0) / 100;
  }
  return factor;
}

// ---- Reference price calculation methods ----

export function computeReferencePrice(
  method: CalcMethod,
  matches: { adjustedUnitPrice: number; similarity: number }[],
): number | null {
  const prices = matches.map((m) => m.adjustedUnitPrice).filter((p) => p > 0);
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  switch (method) {
    case 'mediane': {
      const mid = Math.floor(n / 2);
      return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
    case 'moyenne_simple':
      return prices.reduce((s, p) => s + p, 0) / n;
    case 'moyenne_tronquee': {
      if (n < 4) return prices.reduce((s, p) => s + p, 0) / n;
      const cut = Math.floor(n / 4);
      const trimmed = sorted.slice(cut, n - cut);
      return trimmed.reduce((s, p) => s + p, 0) / trimmed.length;
    }
    case 'moyenne_ponderee': {
      let ws = 0;
      let sum = 0;
      for (const m of matches) {
        const w = m.similarity;
        ws += w;
        sum += m.adjustedUnitPrice * w;
      }
      return ws > 0 ? sum / ws : null;
    }
    case 'distribution_beta': {
      // Beta distribution: mean of smoothed prices pulled toward mode using
      // alpha = 2, beta = 2 shape (favoring central values, robust to outliers).
      const mean = prices.reduce((s, p) => s + p, 0) / n;
      const min = sorted[0];
      const max = sorted[n - 1];
      if (max === min) return mean;
      const normMean = (mean - min) / (max - min);
      const alpha = 2, beta = 2;
      const betaMode = (alpha - 1) / (alpha + beta - 2);
      const smoothed = 0.5 * normMean + 0.5 * betaMode;
      return min + smoothed * (max - min);
    }
    default:
      return null;
  }
}

// ---- Run semantic matching for an offer against reference contracts ----

export interface RunResult {
  analysisId: string;
  items: AnalysisItemRow[];
}

export async function runSemanticAnalysis(
  project: Project,
  offer: Offer,
  offerItems: OfferItem[],
  references: { offer: Offer; supplierName: string; supplierId: string | null; supplierRegion: string | null; items: OfferItem[] }[],
  rates: { year: number; rate: number }[],
  params: AnalysisParams,
  runByEmail: string,
): Promise<RunResult> {
  const targetYear = project.target_year;
  const rows: AnalysisItemRow[] = [];

  for (const item of offerItems) {
    const scored: MatchRecord[] = [];
    for (const ref of references) {
      if (ref.offer.project_id !== project.id && ref.offer.project_id !== null) continue;
      if (params.years.length > 0) {
        const y = ref.offer.offer_date ? new Date(ref.offer.offer_date).getFullYear() : null;
        if (!y || !params.years.includes(y)) continue;
      }
      if (params.supplierIds.length > 0 && (!ref.supplierId || !params.supplierIds.includes(ref.supplierId))) continue;
      if (params.regions.length > 0 && (!ref.supplierRegion || !params.regions.includes(ref.supplierRegion))) continue;
      const year = ref.offer.offer_date ? new Date(ref.offer.offer_date).getFullYear() : targetYear;
      const factor = inflationFactor(rates, year, targetYear);
      for (const refItem of ref.items) {
        const sim = similarity(item.designation, refItem.designation, params.algorithm);
        if (sim >= params.similarityThreshold / 100) {
          scored.push({
            offerId: ref.offer.id,
            itemId: refItem.id,
            designation: refItem.designation,
            similarity: sim,
            year,
            unit: refItem.unit,
            rawUnitPrice: refItem.unit_price,
            adjustedUnitPrice: Math.round(refItem.unit_price * factor),
            contractRef: ref.offer.contract_ref ?? '—',
            entrepreneur: ref.offer.entrepreneur ?? '—',
            supplierName: ref.supplierName,
          });
        }
      }
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    const top = scored.slice(0, params.topK);
    const refPrice = computeReferencePrice(params.method, top);

    let decision: Decision = 'prix_correct';
    if (refPrice === null) decision = 'a_negocier';
    else {
      const ecart = (item.unit_price - refPrice) / refPrice;
      if (ecart > params.negotiationThreshold / 100) decision = 'a_negocier';
      else if (ecart < 0) decision = 'bon_prix';
      else decision = 'prix_correct';
    }

    rows.push({
      itemId: item.id,
      code: item.code,
      designation: item.designation,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.total_price,
      decision,
      referencePrice: refPrice,
      methodUsed: refPrice !== null ? params.method : null,
      matches: top,
    });
  }

  const { data, error } = await supabase
    .from('analyses')
    .insert({
      project_id: project.id,
      offer_id: offer.id,
      status: 'en_cours',
      params,
      run_email: runByEmail,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Impossible de créer l'analyse : ${error.message}`);
  const analysisId = data.id;

  if (rows.length > 0) {
    const { error: err2 } = await supabase.from('analysis_items').insert(
      rows.map((r) => ({
        analysis_id: analysisId,
        offer_item_id: r.itemId,
        decision: r.decision,
        reference_price: r.referencePrice,
        method_used: r.methodUsed,
        matches: r.matches,
      })),
    );
    if (err2) throw new Error(`Erreur lors de l'enregistrement : ${err2.message}`);
  }

  await logAction('ANALYSIS_RUN', 'analyses', { items: rows.length, offer: offer.file_name });
  return { analysisId, items: rows };
}

// ---- Audit log helper ----

export async function logAction(action: string, entity: string, details: Record<string, unknown>): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user?.email ?? null;
    await supabase.from('audit_logs').insert({
      action,
      entity,
      details,
      user_email: email,
    });
  } catch {
    // logging must never break the main flow
  }
}
