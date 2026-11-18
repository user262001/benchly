import { useEffect, useState, useCallback } from 'react';
import { FolderKanban, FileSpreadsheet, PiggyBank, Sparkles, ArrowRight, Upload, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDA, formatDate } from '@/lib/format';
import type { Analysis, Offer, Project } from '@/lib/types';
import { PageHeader, Kpi, Card, Spinner, EmptyState, Button, Badge } from '@/components/ui';
import type { PageId } from '@/components/Layout';

export function Dashboard({ setPage }: { setPage: (p: PageId) => void }) {
  const { profile, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, o, a] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('offers').select('*').eq('is_reference', false),
      supabase.from('analyses').select('*').order('created_at', { ascending: false }).limit(5),
    ]);
    setProjects(p.data ?? []);
    setOffers(o.data ?? []);
    setAnalyses(a.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Spinner />;
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const completed = analyses.filter((a) => a.status === 'terminee');

  return (
    <div>
      <PageHeader
        title={`Bonjour, ${profile?.full_name || 'bienvenue'}`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <Kpi icon={<FolderKanban className="w-5 h-5" />} label="Projets actifs" value={String(projects.filter((p) => p.status === 'actif').length)} sub={`${projects.length} au total`} />
        <Kpi icon={<FileSpreadsheet className="w-5 h-5" />} label="Offres analysées" value={String(offers.length)} sub="offres fournisseurs importées" tone="slate" />
        <Kpi icon={<PiggyBank className="w-5 h-5" />} label="Budget cumulé" value={formatDA(totalBudget)} sub="tous projets confondus" tone="green" />
        <Kpi icon={<Sparkles className="w-5 h-5" />} label="Analyses IA récentes" value={String(analyses.length)} sub={`${completed.length} terminée(s)`} tone="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Projets récents</h2>
            <Button variant="ghost" onClick={() => setPage('projects')}>Tout voir <ArrowRight className="w-4 h-4" /></Button>
          </div>
          {projects.length === 0 ? (
            <EmptyState icon={<FolderKanban className="w-5 h-5" />} title="Aucun projet pour le moment" hint="Créez votre premier projet de benchmarking pour commencer." />
          ) : (
            <div className="divide-y divide-slate-100">
              {projects.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{p.title}</p>
                    <p className="text-xs text-slate-500">{p.region} · Année cible {p.target_year}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-900">{formatDA(p.budget)}</p>
                    <Badge tone={p.status === 'actif' ? 'green' : 'slate'}>{p.status === 'actif' ? 'Actif' : 'Clôturé'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Actions rapides</h2>
            <div className="space-y-2">
              {role !== 'lecteur' && (
                <>
                  <button onClick={() => setPage('offers')} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left">
                    <Upload className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-medium text-slate-800">Importer une offre</span>
                  </button>
                  <button onClick={() => setPage('analysis')} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-medium text-slate-800">Lancer une analyse IA</span>
                  </button>
                </>
              )}
              <button onClick={() => setPage('suppliers')} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left">
                <Users className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-slate-800">Consulter les fournisseurs</span>
              </button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Dernières analyses IA</h2>
            {analyses.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune analyse pour l'instant.</p>
            ) : (
              <div className="space-y-3">
                {analyses.slice(0, 4).map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium text-slate-800">{formatDate(a.created_at)}</p>
                      <p className="text-xs text-slate-400">{a.run_email ?? '—'}</p>
                    </div>
                    <Badge tone={a.status === 'terminee' ? 'green' : 'orange'}>{a.status === 'terminee' ? 'Terminée' : 'En cours'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
