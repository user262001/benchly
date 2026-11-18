import { useEffect, useState, useCallback, useMemo } from 'react';
import { Sparkles, Play, SlidersHorizontal, ChevronDown, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { METHOD_LABELS, type AIAlgorithm, type Analysis, type AnalysisParams, type CalcMethod, type InflationRate, type Offer, type OfferItem, type Project, type Supplier } from '@/lib/types';
import { runSemanticAnalysis } from '@/lib/analysis';
import { PageHeader, Card, Spinner, Button, Field, inputCls, ErrorBanner } from '@/components/ui';
import type { PageId } from '@/components/Layout';

export function Analysis({ setPage, onRun }: { setPage: (p: PageId) => void; onRun: (id: string) => void }) {
  const { profile, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rates, setRates] = useState<InflationRate[]>([]);
  const [refOffers, setRefOffers] = useState<{ offer: Offer; supplierName: string; supplierId: string | null; supplierRegion: string | null; items: OfferItem[] }[]>([]);
  const [draftAnalyses, setDraftAnalyses] = useState<Analysis[]>([]);

  const [projectId, setProjectId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [params, setParams] = useState<AnalysisParams>({
    years: [], regions: [], supplierIds: [], algorithm: 'bge-m3',
    similarityThreshold: 60, topK: 3, method: 'mediane', negotiationThreshold: 15,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [p, o, s, r, ro, drafts] = await Promise.all([
      supabase.from('projects').select('*').eq('status', 'actif').order('title'),
      supabase.from('offers').select('*').eq('is_reference', false).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('inflation_rates').select('*').order('year'),
      supabase.from('offers').select('*, suppliers(name, region)').eq('is_reference', true),
      supabase.from('analyses').select('*').eq('status', 'en_cours').order('created_at', { ascending: false }),
    ]);
    setProjects(p.data ?? []);
    setOffers(o.data ?? []);
    setSuppliers(s.data ?? []);
    setRates(r.data ?? []);
    setDraftAnalyses(drafts.data ?? []);
    const refs = await Promise.all(
      (ro.data ?? []).map(async (off: Offer & { suppliers: { name: string; region: string | null } | null }) => {
        const { data: items } = await supabase.from('offer_items').select('*').eq('offer_id', off.id);
        return { offer: off, supplierName: off.suppliers?.name ?? '—', supplierId: off.supplier_id, supplierRegion: off.suppliers?.region ?? null, items: items ?? [] };
      }),
    );
    setRefOffers(refs);
    if ((p.data ?? []).length > 0) setProjectId(p.data![0].id);
    if ((o.data ?? []).length > 0) setOfferId(o.data![0].id);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const r of refOffers) {
      const y = r.offer.offer_date ? new Date(r.offer.offer_date).getFullYear() : null;
      if (y) ys.add(y);
    }
    return [...ys].sort();
  }, [refOffers]);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const projectOffers = offers.filter((o) => o.project_id === projectId);
  const regionOptions = useMemo(() => [...new Set(suppliers.map((s) => s.region).filter((region): region is string => Boolean(region)))].sort(), [suppliers]);

  useEffect(() => {
    if (!projectOffers.some((o) => o.id === offerId)) setOfferId(projectOffers[0]?.id ?? '');
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: 'years' | 'regions' | 'supplierIds', value: number | string) => {
    setParams((p) => {
      const arr = p[key] as (number | string)[];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...p, [key]: next } as AnalysisParams;
    });
  };

  const run = async () => {
    if (!project || !offerId) return;
    setRunning(true); setError(null);
    try {
      const { data: offerItems, error: e1 } = await supabase.from('offer_items').select('*').eq('offer_id', offerId);
      if (e1) throw e1;
      const offer = offers.find((o) => o.id === offerId)!;
      const res = await runSemanticAnalysis(project, offer, offerItems ?? [], refOffers, rates, params, profile?.email ?? '');
      onRun(res.analysisId);
      setPage('validation');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur pendant l'analyse.");
    }
    setRunning(false);
  };

  if (loading) return <Spinner />;
  if (projects.length === 0) {
    return (
      <div>
        <PageHeader title="Analyse IA & filtrage multicritères" />
        <Card className="p-8 text-center text-slate-500">Aucun projet actif. Créez d'abord un projet et importez une offre.</Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Analyse IA & filtrage multicritères" subtitle="Configurez les filtres et les paramètres sémantiques avant l'exécution." />
      {error && <ErrorBanner message={error} />}
      {running && (
        <Card className="p-8 mb-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
            <p className="font-semibold text-slate-900">Analyse sémantique en cours…</p>
            <p className="text-sm text-slate-500">Comparaison des désignations avec les contrats de référence, normalisation par l'inflation et calcul des prix de référence.</p>
          </div>
        </Card>
      )}
      {draftAnalyses.length > 0 && (
        <Card className="mb-6 border-orange-200 bg-orange-50/40 p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="font-semibold text-slate-900">Validations à reprendre</h2>
              <p className="text-sm text-slate-600 mt-1">Vos analyses enregistrées restent disponibles jusqu'à leur validation finale.</p>
            </div>
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-700">{draftAnalyses.length}</span>
          </div>
          <div className="space-y-2">
            {draftAnalyses.map((draft) => (
              <div key={draft.id} className="flex items-center justify-between gap-3 rounded-lg border border-orange-100 bg-white px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{projects.find((p) => p.id === draft.project_id)?.title ?? 'Projet'}</p><p className="text-xs text-slate-500">Créée le {new Date(draft.created_at).toLocaleDateString('fr-FR')}</p></div>
                <Button variant="secondary" className="shrink-0 !px-3 !py-1.5 !text-xs" onClick={() => { onRun(draft.id); setPage('validation'); }}>Reprendre</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><SlidersHorizontal className="w-4 h-4 text-orange-600" /> Périmètre d'exécution</h2>
          <div className="space-y-4">
            <Field label="Projet">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputCls}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
            <Field label="Offre à analyser">
              <select value={offerId} onChange={(e) => setOfferId(e.target.value)} className={inputCls}>
                {projectOffers.length === 0 && <option value="">Aucune offre liée à ce projet</option>}
                {projectOffers.map((o) => <option key={o.id} value={o.id}>{o.file_name ?? o.id.slice(0, 8)} — {o.item_count} items</option>)}
              </select>
            </Field>
            <p className="text-xs text-slate-400">
              {refOffers.length} contrats de référence historiques constituent la base comparative.
            </p>
          </div>

          <h3 className="font-semibold text-slate-900 mt-6 mb-3">Filtres avancés</h3>
          <div className="space-y-4">
            <MultiSelect label="Années" options={years.map((y) => ({ value: y, label: String(y) }))} selected={params.years} onToggle={(v) => toggle('years', v)} emptyLabel="Toutes les années" />
            <MultiSelect label="Régions" options={regionOptions.map((region) => ({ value: region, label: region }))} selected={params.regions} onToggle={(v) => toggle('regions', v)} emptyLabel="Toutes les régions" />
            <MultiSelect label="Fournisseurs" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} selected={params.supplierIds} onToggle={(v) => toggle('supplierIds', v)} emptyLabel="Tous les fournisseurs" />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Sparkles className="w-4 h-4 text-orange-600" /> Paramètres IA</h2>
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">Seuil de similarité</span>
                <span className="text-sm font-bold text-orange-600">{params.similarityThreshold} %</span>
              </div>
              <input type="range" min={30} max={95} step={5} value={params.similarityThreshold}
                onChange={(e) => setParams((p) => ({ ...p, similarityThreshold: Number(e.target.value) }))}
                className="w-full accent-orange-600" />
              <p className="text-xs text-slate-400 mt-1">Score minimal pour considérer deux désignations comme équivalentes.</p>
            </div>
            <Field label="Top-K (nombre maximum de correspondances par item)">
              <input type="number" min={1} max={10} value={params.topK}
                onChange={(e) => setParams((p) => ({ ...p, topK: Math.max(1, Math.min(10, Number(e.target.value))) }))}
                className={inputCls} />
            </Field>
            <Field label="Algorithme IA">
              <select value={params.algorithm} onChange={(e) => setParams((p) => ({ ...p, algorithm: e.target.value as AIAlgorithm }))} className={inputCls}>
                <option value="bge-m3">BGE-M3 — meilleure compréhension sémantique</option>
                <option value="e5-small">E5-small — comparaison légère et rapide</option>
              </select>
            </Field>
            <Field label="Méthode de calcul par défaut">
              <select value={params.method} onChange={(e) => setParams((p) => ({ ...p, method: e.target.value as CalcMethod }))} className={inputCls}>
                {(Object.keys(METHOD_LABELS) as CalcMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
              </select>
            </Field>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">Seuil de négociation</span>
                <span className="text-sm font-bold text-orange-600">+{params.negotiationThreshold} %</span>
              </div>
              <input type="range" min={5} max={50} step={1} value={params.negotiationThreshold}
                onChange={(e) => setParams((p) => ({ ...p, negotiationThreshold: Number(e.target.value) }))}
                className="w-full accent-orange-600" />
              <p className="text-xs text-slate-400 mt-1">Au-delà de cet écart avec le prix de référence, l'item est classé « À négocier ».</p>
            </div>
          </div>
          <Button className="w-full mt-6 !py-2.5" onClick={() => void run()} disabled={running || !offerId || (!isAdmin && profile?.role !== 'utilisateur')}>
            <Play className="w-4 h-4" /> {running ? 'Analyse en cours…' : "Lancer l'analyse IA"}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function MultiSelect({ label, options, selected, onToggle, emptyLabel }: {
  label: string; options: { value: number | string; label: string }[]; selected: (number | string)[]; onToggle: (v: number | string) => void; emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabels = options.filter((option) => selected.includes(option.value)).map((option) => option.label);

  return (
    <div className="relative">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      {options.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyLabel}</p>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500">
            <span className="truncate">{selectedLabels.length === 0 ? emptyLabel : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} sélectionné(s)`}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
              {options.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <button key={String(option.value)} type="button" onClick={() => onToggle(option.value)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-orange-50">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-300 bg-white'}`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
