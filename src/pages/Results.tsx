import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3, FileDown, FileSpreadsheet, FileText, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Wallet, CheckCircle2, AlertTriangle, ThumbsUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatDA, formatPct } from '@/lib/format';
import { exportCsv, exportExcel, exportPdf } from '@/lib/exports';
import { DECISION_LABELS, type Analysis, type AnalysisItemRow, type Decision, type MatchRecord, type Project, type Supplier } from '@/lib/types';
import { PageHeader, Card, Spinner, EmptyState, Button, DecisionBadge, inputCls } from '@/components/ui';

interface LoadedItem extends AnalysisItemRow { dbId: string }

const COLORS: Record<Decision, string> = { bon_prix: '#059669', prix_correct: '#0284c7', a_negocier: '#FF6B00' };

export function Results() {
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<Analysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<LoadedItem[]>([]);

  const loadList = useCallback(async () => {
    const { data } = await supabase.from('analyses').select('*').eq('status', 'terminee').order('created_at', { ascending: false });
    setCompleted(data ?? []);
    if ((data ?? []).length > 0) setSelectedId((prev) => prev ?? data![0].id);
    else setLoading(false);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    const { data: a } = await supabase.from('analyses').select('*').eq('id', id).maybeSingle();
    if (!a) { setLoading(false); return; }
    setAnalysis(a);
    const { data: p } = await supabase.from('projects').select('*').eq('id', a.project_id).maybeSingle();
    setProject(p ?? null);
    if (a.offer_id) {
      const { data: o } = await supabase.from('offers').select('*, suppliers(*)').eq('id', a.offer_id).maybeSingle();
      setSupplier((o as unknown as (Supplier & { suppliers: Supplier }) | null)?.suppliers ?? null);
    }
    const { data: rows } = await supabase
      .from('analysis_items').select('*, offer_items(code, designation, unit, quantity, unit_price, total_price)')
      .eq('analysis_id', id);
    setItems((rows ?? []).map((r) => ({
      dbId: r.id,
      itemId: r.offer_item_id ?? '',
      code: r.offer_items?.code ?? null,
      designation: r.offer_items?.designation ?? '(item)',
      unit: r.offer_items?.unit ?? null,
      quantity: r.offer_items?.quantity ?? 1,
      unitPrice: r.offer_items?.unit_price ?? 0,
      totalPrice: r.offer_items?.total_price ?? 0,
      decision: r.decision,
      referencePrice: r.reference_price,
      methodUsed: r.method_used,
      matches: (r.matches ?? []) as MatchRecord[],
    })));
    setLoading(false);
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  if (loading) return <Spinner />;
  if (completed.length === 0 || !analysis) {
    return (
      <div>
        <PageHeader title="Résultats après validation complète" />
        <Card><EmptyState icon={<BarChart3 className="w-5 h-5" />} title="Aucune analyse terminée" hint="Validez une analyse dans l'atelier de validation pour voir les résultats complets ici." /></Card>
      </div>
    );
  }

  const s = analysis.summary;

  return (
    <div>
      <PageHeader title="Résultats après validation complète" subtitle="Synthèse, comparaison budgétaire, répartition et exports." />
      <div className="mb-6 max-w-md">
        <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)} className={inputCls}>
          {completed.map((a) => (
            <option key={a.id} value={a.id}>{new Date(a.created_at).toLocaleDateString('fr-FR')} — analyse {a.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>


      {/* Section 01 */}
      <SectionTitle num="01" title="Synthèse des résultats" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <SummaryCard icon={<Wallet className="w-5 h-5" />} label="Montant total de l'offre" value={formatDA(s?.offreTotal ?? 0)} tone="slate" />
        <SummaryCard icon={<BarChart3 className="w-5 h-5" />} label="Montant total estimé" value={formatDA(s?.estimeTotal ?? 0)} tone="orange" />
        <SummaryCard icon={s && s.difference >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />} label="Différence" value={formatDA(s?.difference ?? 0)} tone={s && s.difference > 0 ? 'red' : 'green'} />
        <SummaryCard icon={<TrendingUp className="w-5 h-5" />} label="Écart en pourcentage" value={formatPct(s?.ecartPct ?? 0)} tone={s && s.ecartPct > 0 ? 'red' : 'green'} />
      </div>

      {/* Section 02 */}
      <SectionTitle num="02" title="Comparaison avec le budget notifié" />
      <Card className="p-6 mb-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5 pb-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Intitulé du projet</p>
            <p className="font-semibold text-slate-900">{project?.title ?? '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Budget notifié</p>
            <p className="font-bold text-lg text-slate-900">{formatDA(project?.budget ?? 0)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BudgetRow label="Différence Offre vs Budget" amount={s?.budgetDiffOffre ?? 0} pct={s?.budgetDiffOffrePct ?? 0} />
          <BudgetRow label="Écart Montant Estimé vs Budget" amount={s?.budgetDiffEstime ?? 0} pct={s?.budgetDiffEstimePct ?? 0} />
        </div>
      </Card>

      {/* Section 03 */}
      <SectionTitle num="03" title="Répartition des items" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <DistributionCard icon={<AlertTriangle className="w-5 h-5" />} decision="a_negocier" count={s?.counts?.a_negocier ?? 0} amount={s?.amounts?.a_negocier ?? 0} />
        <DistributionCard icon={<CheckCircle2 className="w-5 h-5" />} decision="prix_correct" count={s?.counts?.prix_correct ?? 0} amount={s?.amounts?.prix_correct ?? 0} />
        <DistributionCard icon={<ThumbsUp className="w-5 h-5" />} decision="bon_prix" count={s?.counts?.bon_prix ?? 0} amount={s?.amounts?.bon_prix ?? 0} />
      </div>

      {/* Section 04 */}
      <SectionTitle num="04" title="Résultats détaillés & visualisations" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-4 text-sm">Top 8 — Items aux montants les plus élevés</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[...items].sort((a, b) => b.totalPrice - a.totalPrice).slice(0, 8).map((i) => ({ name: i.designation.length > 22 ? i.designation.slice(0, 22) + '…' : i.designation, montant: i.totalPrice }))} layout="vertical">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatDA(Number(v))} />
              <Bar dataKey="montant" fill="#FF6B00" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900 mb-4 text-sm">Écart de prix (offre vs référence) — histogramme</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={histogramData(items)} barCategoryGap="10%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(v) => `${v} item(s)`} />
              <Bar dataKey="count" fill="#0284c7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5 xl:col-span-2">
          <h3 className="font-semibold text-slate-900 mb-4 text-sm">Prix de l'offre vs Prix estimé — nuage de points par catégorie</h3>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Prix de l'offre" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis type="number" dataKey="y" name="Prix estimé" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => formatDA(Number(v))} />
              <Legend />
              {(['bon_prix', 'prix_correct', 'a_negocier'] as Decision[]).map((d) => (
                <Scatter key={d} name={DECISION_LABELS[d]} data={items.filter((i) => i.decision === d).map((i) => ({ x: i.unitPrice, y: i.referencePrice ?? i.unitPrice }))} fill={COLORS[d]} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Tableau 1 */}
      <h3 className="font-semibold text-slate-900 mb-3">Tableau 1 — Items validés</h3>
      <Card className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
            <th className="px-3 py-3">Désignation</th><th className="px-3 py-3">Unité</th><th className="px-3 py-3 text-right">Prix unitaire</th>
            <th className="px-3 py-3 text-right">Montant offre</th><th className="px-3 py-3 text-right">Prix de référence validé</th>
            <th className="px-3 py-3 text-right">Montant estimé</th><th className="px-3 py-3 text-right">Écart montant</th>
            <th className="px-3 py-3 text-right">Écart %</th><th className="px-3 py-3">Catégorie</th>
            <th className="px-3 py-3 text-right">Prix minimum</th><th className="px-3 py-3 text-right">Prix maximum</th><th className="px-3 py-3 text-right">Écart min-max</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it) => {
              const prices = it.matches.map((m) => m.adjustedUnitPrice);
              const min = prices.length ? Math.min(...prices) : null;
              const max = prices.length ? Math.max(...prices) : null;
              const estime = (it.referencePrice ?? 0) * it.quantity;
              const ecart = it.referencePrice === null ? null : it.totalPrice - estime;
              const ecartPct = it.referencePrice ? ((it.unitPrice - it.referencePrice) / it.referencePrice) * 100 : null;
              return (
                <tr key={it.dbId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-slate-900 max-w-[220px] truncate">{it.designation}</td>
                  <td className="px-3 py-2.5 text-slate-600">{it.unit ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{formatDA(it.unitPrice)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{formatDA(it.totalPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-orange-600">{it.referencePrice === null ? '—' : formatDA(it.referencePrice)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{it.referencePrice === null ? '—' : formatDA(estime)}</td>
                  <td className={`px-3 py-2.5 text-right font-medium ${ecart !== null && ecart > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{ecart === null ? '—' : formatDA(ecart)}</td>
                  <td className={`px-3 py-2.5 text-right font-medium ${ecartPct !== null && ecartPct > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{ecartPct === null ? '—' : formatPct(ecartPct)}</td>
                  <td className="px-3 py-2.5"><DecisionBadge decision={it.decision} /></td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{min === null ? '—' : formatDA(min)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{max === null ? '—' : formatDA(max)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500">{min === null || max === null ? '—' : formatDA(max - min)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Tableau 2 */}
      <h3 className="font-semibold text-slate-900 mb-3">Tableau 2 — Correspondances sélectionnées</h3>
      <div className="space-y-3 mb-8">
        {items.map((it) => <MatchesGroup key={it.dbId} item={it} />)}
      </div>

      {/* Section 05 */}
      <SectionTitle num="05" title="Export des résultats" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 text-center">
          <FileSpreadsheet className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
          <h4 className="font-semibold text-slate-900 mb-1">Export Excel (.xlsx)</h4>
          <p className="text-xs text-slate-500 mb-4">Classeur multi-feuilles : Synthèse, Items validés, Correspondances sélectionnées.</p>
          <Button variant="secondary" className="w-full" onClick={() => exportExcel(analysis, project!, supplier, items)}><FileDown className="w-4 h-4" /> Télécharger</Button>
        </Card>
        <Card className="p-6 text-center">
          <FileText className="w-8 h-8 text-rose-600 mx-auto mb-3" />
          <h4 className="font-semibold text-slate-900 mb-1">Rapport PDF officiel</h4>
          <p className="text-xs text-slate-500 mb-4">Rapport de benchmarking officiel prêt à être signé et archivé.</p>
          <Button className="w-full" onClick={() => exportPdf(analysis, project!, supplier, items)}><FileDown className="w-4 h-4" /> Générer le rapport</Button>
        </Card>
        <Card className="p-6 text-center">
          <FileDown className="w-8 h-8 text-sky-600 mx-auto mb-3" />
          <h4 className="font-semibold text-slate-900 mb-1">Export CSV</h4>
          <p className="text-xs text-slate-500 mb-4">Données brutes des items validés pour réutilisation.</p>
          <Button variant="secondary" className="w-full" onClick={() => exportCsv(items)}><FileDown className="w-4 h-4" /> Exporter</Button>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-2">
      <span className="w-9 h-9 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{num}</span>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'slate' | 'orange' | 'green' | 'red' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600', orange: 'bg-orange-50 text-orange-600',
    green: 'bg-emerald-50 text-emerald-600', red: 'bg-rose-50 text-rose-600',
  };
  return (
    <Card className="p-5">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${tones[tone]}`}>{icon}</div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
    </Card>
  );
}

function BudgetRow({ label, amount, pct }: { label: string; amount: number; pct: number }) {
  const positive = amount > 0;
  return (
    <div className={`rounded-lg border p-4 ${positive ? 'border-rose-200 bg-rose-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`font-bold text-lg ${positive ? 'text-rose-600' : 'text-emerald-600'}`}>{formatDA(amount)}</p>
      <p className="text-xs text-slate-500">{formatPct(pct)} par rapport au budget</p>
    </div>
  );
}

function DistributionCard({ icon, decision, count, amount }: { icon: React.ReactNode; decision: Decision; count: number; amount: number }) {
  const accents: Record<Decision, string> = {
    bon_prix: 'border-t-4 border-t-emerald-500',
    prix_correct: 'border-t-4 border-t-sky-500',
    a_negocier: 'border-t-4 border-t-orange-500',
  };
  return (
    <Card className={`p-5 ${accents[decision]}`}>
      <div className="flex items-center gap-2 mb-2">{icon}<DecisionBadge decision={decision} /></div>
      <p className="text-2xl font-bold text-slate-900">{count} <span className="text-sm font-medium text-slate-500">item(s)</span></p>
      <p className="text-sm text-slate-600 mt-1">{formatDA(amount)}</p>
    </Card>
  );
}

function MatchesGroup({ item }: { item: LoadedItem }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <span className="font-medium text-slate-900 flex-1 min-w-0 truncate text-sm">{item.designation}</span>
        <span className="hidden sm:block text-xs text-slate-500">{item.unit ?? '—'} · {formatDA(item.unitPrice)}</span>
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{item.matches.length} match(s)</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500 uppercase tracking-wide border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2">Désignation</th><th className="px-4 py-2">Taux de similarité</th><th className="px-4 py-2">Année</th>
              <th className="px-4 py-2">Unité</th><th className="px-4 py-2 text-right">Prix unitaire</th>
              <th className="px-4 py-2">Contrat de référence</th><th className="px-4 py-2">Entrepreneur</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {item.matches.map((m) => (
                <tr key={m.itemId}>
                  <td className="px-4 py-2 text-slate-800">{m.designation}</td>
                  <td className="px-4 py-2 font-bold text-orange-600">{Math.round(m.similarity * 100)} %</td>
                  <td className="px-4 py-2 text-slate-600">{m.year}</td>
                  <td className="px-4 py-2 text-slate-600">{m.unit ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-800">{formatDA(m.adjustedUnitPrice)}</td>
                  <td className="px-4 py-2 text-slate-600">{m.contractRef}</td>
                  <td className="px-4 py-2 text-slate-600">{m.entrepreneur}</td>
                </tr>
              ))}
              {item.matches.length === 0 && <tr><td colSpan={7} className="px-4 py-3 text-center text-slate-400">Aucune correspondance sélectionnée</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function histogramData(items: LoadedItem[]): { bucket: string; count: number }[] {
  const buckets = [
    { label: '< -25 %', test: (e: number) => e < -25 },
    { label: '-25 à -10 %', test: (e: number) => e >= -25 && e < -10 },
    { label: '-10 à 0 %', test: (e: number) => e >= -10 && e < 0 },
    { label: '0 à +10 %', test: (e: number) => e >= 0 && e < 10 },
    { label: '+10 à +25 %', test: (e: number) => e >= 10 && e < 25 },
    { label: '> +25 %', test: (e: number) => e >= 25 },
  ];
  return buckets.map((b) => ({
    bucket: b.label,
    count: items.filter((i) => {
      if (!i.referencePrice) return false;
      return b.test(((i.unitPrice - i.referencePrice) / i.referencePrice) * 100);
    }).length,
  }));
}
