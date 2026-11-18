import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDA, formatPct } from '@/lib/format';
import { computeReferencePrice } from '@/lib/analysis';
import { METHOD_LABELS, type Analysis, type AnalysisItemRow, type AnalysisSummary, type CalcMethod, type Decision, type MatchRecord, type Project } from '@/lib/types';
import { PageHeader, Card, Spinner, Button, EmptyState, ErrorBanner, inputCls } from '@/components/ui';
import type { PageId } from '@/components/Layout';

interface LoadedItem extends AnalysisItemRow {
  dbId: string;
}

export function Validation({ setPage, analysisId }: { setPage: (p: PageId) => void; analysisId: string | null }) {
  const { canWrite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<LoadedItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!analysisId) { setLoading(false); return; }
    setLoading(true);
    const { data: a, error: e1 } = await supabase.from('analyses').select('*').eq('id', analysisId).maybeSingle();
    if (e1) setError(e1.message);
    if (!a) { setLoading(false); return; }
    setAnalysis(a);
    const { data: p } = await supabase.from('projects').select('*').eq('id', a.project_id).maybeSingle();
    setProject(p ?? null);
    const { data: rows } = await supabase
      .from('analysis_items').select('*, offer_items(code, designation, unit, quantity, unit_price, total_price)')
      .eq('analysis_id', analysisId);
    const mapped: LoadedItem[] = (rows ?? []).map((r) => ({
      dbId: r.id,
      itemId: r.offer_item_id ?? '',
      code: r.offer_items?.code ?? null,
      designation: r.offer_items?.designation ?? '(item supprimé)',
      unit: r.offer_items?.unit ?? null,
      quantity: r.offer_items?.quantity ?? 1,
      unitPrice: r.offer_items?.unit_price ?? 0,
      totalPrice: r.offer_items?.total_price ?? 0,
      decision: r.decision,
      referencePrice: r.reference_price,
      methodUsed: r.method_used,
      matches: ((r.matches ?? []) as MatchRecord[]).map((match) => ({ ...match, selected: match.selected !== false })),
    }));
    setItems(mapped);
    setExpanded(new Set(mapped.slice(0, 1).map((i) => i.dbId)));
    setLoading(false);
  }, [analysisId]);

  useEffect(() => { void load(); }, [load]);

  const setDecision = (dbId: string, decision: Decision) =>
    setItems((its) => its.map((i) => (i.dbId === dbId ? { ...i, decision } : i)));

  const setMethod = (dbId: string, method: CalcMethod) =>
    setItems((its) => its.map((i) => {
      if (i.dbId !== dbId) return i;
      const activeMatches = i.matches.filter((match) => match.selected !== false);
      const refPrice = computeReferencePrice(method, activeMatches);
      return { ...i, methodUsed: method, referencePrice: refPrice };
    }));

  const setMatchSelected = (dbId: string, itemId: string, selected: boolean) =>
    setItems((its) => its.map((i) => {
      if (i.dbId !== dbId) return i;
      const matches = i.matches.map((match) => match.itemId === itemId ? { ...match, selected } : match);
      const activeMatches = matches.filter((match) => match.selected !== false);
      const referencePrice = i.methodUsed ? computeReferencePrice(i.methodUsed, activeMatches) : i.referencePrice;
      return { ...i, matches, referencePrice };
    }));

  const toggleExpand = (dbId: string) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(dbId)) n.delete(dbId); else n.add(dbId); return n; });

  const persistItems = async () => {
    for (const it of items) {
      const { error: err } = await supabase.from('analysis_items').update({
        decision: it.decision,
        reference_price: it.referencePrice,
        method_used: it.methodUsed,
        matches: it.matches,
      }).eq('id', it.dbId);
      if (err) throw err;
    }
  };

  const saveProgress = async () => {
    if (!analysis) return;
    setSaving(true); setError(null);
    try {
      await persistItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde de la progression.');
    }
    setSaving(false);
  };

  const save = async () => {
    if (!analysis) return;
    setSaving(true); setError(null);
    try {
      await persistItems();
      // Compute and persist the summary
      const offreTotal = items.reduce((s, i) => s + i.totalPrice, 0);
      const estimeTotal = items.reduce((s, i) => s + (i.referencePrice ?? i.unitPrice) * i.quantity, 0);
      const diff = offreTotal - estimeTotal;
      const budget = project?.budget ?? 0;
      const counts = { bon_prix: 0, prix_correct: 0, a_negocier: 0 } as Record<Decision, number>;
      const amounts = { bon_prix: 0, prix_correct: 0, a_negocier: 0 } as Record<Decision, number>;
      for (const i of items) {
        counts[i.decision] += 1;
        amounts[i.decision] += i.totalPrice;
      }
      const summary: AnalysisSummary = {
        offreTotal, estimeTotal, difference: diff,
        ecartPct: estimeTotal > 0 ? (diff / estimeTotal) * 100 : 0,
        budget,
        budgetDiffOffre: offreTotal - budget,
        budgetDiffOffrePct: budget > 0 ? ((offreTotal - budget) / budget) * 100 : 0,
        budgetDiffEstime: estimeTotal - budget,
        budgetDiffEstimePct: budget > 0 ? ((estimeTotal - budget) / budget) * 100 : 0,
        counts, amounts,
      };
      const { error: err2 } = await supabase.from('analyses').update({ status: 'terminee', summary }).eq('id', analysis.id);
      if (err2) throw err2;
      setPage('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la validation.');
    }
    setSaving(false);
  };

  if (!analysisId) {
    return (
      <div>
        <PageHeader title="Atelier de validation manuelle" />
        <Card><EmptyState icon={<CheckSquare className="w-5 h-5" />} title="Aucune analyse sélectionnée" hint="Lancez d'abord une analyse IA depuis l'écran d'analyse, puis revenez ici pour valider les items." /></Card>
      </div>
    );
  }
  if (loading) return <Spinner />;

  const allDecided = items.length > 0 && items.every((item) => item.decision && (item.matches.length === 0 || item.methodUsed));
  const offerTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <div>
      <PageHeader
        title="Atelier de validation manuelle"
        subtitle={`${project?.title ?? ''} — Revue item par item des correspondances et des prix de référence.`}
        action={canWrite ? <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void saveProgress()} disabled={saving}><Save className="w-4 h-4" /> Enregistrer la progression</Button>
          {allDecided && <Button onClick={() => void save()} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Validation…' : 'Valider et voir les résultats'}</Button>}
        </div> : undefined}
      />
      {error && <ErrorBanner message={error} />}
      <div className="space-y-4">
        {items.map((it, idx) => {
          const open = expanded.has(it.dbId);
          const weightPct = offerTotal > 0 ? (it.totalPrice / offerTotal) * 100 : 0;
          const ecartPct = it.referencePrice ? ((it.unitPrice - it.referencePrice) / it.referencePrice) * 100 : null;
          return (
            <Card key={it.dbId} className="overflow-hidden">
              <button className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors" onClick={() => toggleExpand(it.dbId)}>
                {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                <span className="text-xs font-mono text-slate-400 w-6">{idx + 1}</span>
                <span className="font-medium text-slate-900 flex-1 min-w-0 truncate">{it.designation}</span>
                <span className="hidden sm:block text-sm text-slate-600 shrink-0">{formatDA(it.unitPrice)}</span>
                <span className="hidden md:inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 shrink-0">{weightPct.toFixed(1)} % de l'offre</span>
                {it.matches.length > 0 && it.matches[0] && (
                  <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 shrink-0">
                    {Math.round(it.matches[0].similarity * 100)} % sim.
                  </span>
                )}
              </button>
              {open && (
                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/60">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Correspondances historiques ({it.matches.length})</h4>
                      {it.matches.length === 0 ? (
                        <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg px-3 py-4 text-center">Aucune correspondance au-dessus du seuil de similarité.</p>
                      ) : (
                        <div className="space-y-2">
                          {it.matches.map((m, mi) => (
                            <div key={m.itemId} className="bg-white border border-slate-200 rounded-lg p-3">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="text-sm font-medium text-slate-900">{m.designation}</p>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${
                                  m.similarity >= 0.85 ? 'bg-emerald-50 text-emerald-700' : m.similarity >= 0.7 ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
                                }`}>{Math.round(m.similarity * 100)} %</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-600">
                                <span>Année : <strong>{m.year}</strong></span>
                                <span>Unité : <strong>{m.unit ?? '—'}</strong></span>
                                <span>Contrat : <strong>{m.contractRef}</strong></span>
                                <span>Entrepreneur : <strong>{m.entrepreneur}</strong></span>
                                <span>Prix brut : <strong>{formatDA(m.rawUnitPrice)}</strong></span>
                                <span>Prix ajusté : <strong className="text-orange-600">{formatDA(m.adjustedUnitPrice)}</strong></span>
                                <label className="flex items-center gap-1.5 font-semibold text-orange-700"><input type="checkbox" checked={m.selected !== false} onChange={(event) => setMatchSelected(it.dbId, m.itemId, event.target.checked)} className="accent-orange-600" /> Retenir</label>
                              </div>
                              {mi === 0 && <p className="text-[11px] text-slate-400 mt-2">Meilleure correspondance sémantique</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Prix de référence & décision</p>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div><p className="text-xs text-slate-500">Prix de l'offre</p><p className="font-bold text-slate-900">{formatDA(it.unitPrice)}</p></div>
                          <div><p className="text-xs text-slate-500">Prix de référence validé</p><p className="font-bold text-orange-600">{it.referencePrice === null ? '—' : formatDA(it.referencePrice)}</p></div>
                          <div><p className="text-xs text-slate-500">Écart</p><p className={`font-bold ${ecartPct !== null && ecartPct > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{ecartPct === null ? '—' : formatPct(ecartPct)}</p></div>
                          <div><p className="text-xs text-slate-500">Montant estimé (qté × réf.)</p><p className="font-bold text-slate-900">{it.referencePrice === null ? '—' : formatDA(it.referencePrice * it.quantity)}</p></div>
                        </div>
                        {canWrite ? (
                          <>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Méthode de calcul du prix de référence</label>
                            <select value={it.methodUsed ?? ''} onChange={(e) => setMethod(it.dbId, e.target.value as CalcMethod)} className={`${inputCls} !py-1.5 !text-xs`}>
                              <option value="" disabled>Choisir une méthode…</option>
                              {(Object.keys(METHOD_LABELS) as CalcMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                            </select>
                            <p className="text-xs text-slate-500 mt-3 mb-1.5 font-medium">Décision manuelle</p>
                            <div className="flex gap-2">
                              {(['bon_prix', 'prix_correct', 'a_negocier'] as Decision[]).map((d) => {
                                const on = it.decision === d;
                                const styles: Record<Decision, string> = {
                                  bon_prix: on ? 'bg-emerald-600 text-white border-emerald-600' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
                                  prix_correct: on ? 'bg-sky-600 text-white border-sky-600' : 'border-sky-200 text-sky-700 hover:bg-sky-50',
                                  a_negocier: on ? 'bg-orange-600 text-white border-orange-600' : 'border-orange-300 text-orange-700 hover:bg-orange-50',
                                };
                                return (
                                  <button key={d} onClick={() => setDecision(it.dbId, d)}
                                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors ${styles[d]}`}>
                                    {d === 'bon_prix' ? 'Bon prix' : d === 'prix_correct' ? 'Prix correct' : 'À négocier'}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">Méthode : {it.methodUsed ? METHOD_LABELS[it.methodUsed] : '—'} · Décision : {it.decision}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
