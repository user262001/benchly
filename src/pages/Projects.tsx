import { useEffect, useState, useCallback } from 'react';
import { FolderKanban, Plus, Eye, Upload, Search, Trash2, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { logAction } from '@/lib/analysis';
import { formatDA } from '@/lib/format';
import { REGIONS, type Offer, type Project, type Supplier } from '@/lib/types';
import { PageHeader, Card, Spinner, EmptyState, Button, Badge, Modal, Field, inputCls, ErrorBanner } from '@/components/ui';
import { OfferFormModal } from './Offers';

export function Projects({ preselect }: { preselect?: string | null }) {
  const { canWrite, role } = useAuth();
  const isAdmin = role === 'administrateur';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [analysedOfferIds, setAnalysedOfferIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detail, setDetail] = useState<Project | null>(null);
  useEffect(() => { if (preselect) setDetail(projects.find((p) => p.id === preselect) ?? null); }, [preselect, projects]);
  const [importFor, setImportFor] = useState<Project | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [p, o, s, a] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('offers').select('*').eq('is_reference', false),
      supabase.from('suppliers').select('*'),
      supabase.from('analyses').select('offer_id'),
    ]);
    if (p.error) setError(p.error.message);
    setProjects(p.data ?? []);
    setOffers(o.data ?? []);
    setSuppliers(s.data ?? []);
    setAnalysedOfferIds(new Set((a.data ?? []).map((r: { offer_id: string | null }) => r.offer_id).filter((v): v is string => Boolean(v))));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = projects.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()) || p.region.toLowerCase().includes(search.toLowerCase()));

  const deleteOffer = async (o: Offer) => {
    if (!window.confirm(`Supprimer définitivement l'offre « ${o.file_name ?? o.id.slice(0, 8)} » et ses items ?`)) return;
    setError(null);
    await supabase.from('analyses').delete().eq('offer_id', o.id);
    const { error: err } = await supabase.from('offers').delete().eq('id', o.id);
    if (err) setError(err.message);
    else await logAction('DELETE_OFFER', 'offers', { offer: o.file_name ?? o.id });
    void load();
  };

  const deleteProject = async (p: Project) => {
    if (!window.confirm(`Supprimer définitivement le projet « ${p.title} », ses offres et ses analyses ?`)) return;
    setError(null);
    const { error: err } = await supabase.from('projects').delete().eq('id', p.id);
    if (err) setError(err.message);
    else {
      await logAction('DELETE_PROJECT', 'projects', { title: p.title });
      setDetail(null);
    }
    void load();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    const { error: err } = await supabase.from('projects').insert({
      title: String(fd.get('title')),
      budget: Number(fd.get('budget')),
      target_year: Number(fd.get('target_year')),
      region: String(fd.get('region')),
    });
    if (err) setError(err.message);
    else { setModalOpen(false); void load(); }
  };

  const updateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingProject) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    const { error: err } = await supabase.from('projects').update({
      title: String(fd.get('title')),
      budget: Number(fd.get('budget')),
      target_year: Number(fd.get('target_year')),
      region: String(fd.get('region')),
      status: String(fd.get('status')),
    }).eq('id', editingProject.id);
    if (err) setError(err.message);
    else {
      await logAction('UPDATE_PROJECT', 'projects', { title: String(fd.get('title')) });
      setEditingProject(null);
      if (detail?.id === editingProject.id) setDetail({ ...editingProject, title: String(fd.get('title')), budget: Number(fd.get('budget')), target_year: Number(fd.get('target_year')), region: String(fd.get('region')), status: String(fd.get('status')) as Project['status'] });
      void load();
    }
  };

  if (detail) {
    const linkedOffers = offers.filter((o) => o.project_id === detail.id);
    return (
      <div>
        <PageHeader
          title={detail.title}
          subtitle={`${detail.region} · Année cible ${detail.target_year} · Budget ${formatDA(detail.budget)}`}
          action={<div className="flex flex-wrap gap-2">
            {canWrite && <Button variant="secondary" onClick={() => setEditingProject(detail)}><Pencil className="w-4 h-4" /> Modifier</Button>}
            <Button variant="secondary" onClick={() => setDetail(null)}>Retour aux projets</Button>
          </div>}
        />
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-slate-900">Offres liées ({linkedOffers.length})</h2>
          <div className="flex gap-2">
            {canWrite && <Button onClick={() => setImportFor(detail)}><Upload className="w-4 h-4" /> Importer une offre</Button>}
            {isAdmin && <Button variant="danger" onClick={() => void deleteProject(detail)}><Trash2 className="w-4 h-4" /> Supprimer le projet</Button>}
          </div>
        </div>
        {error && <ErrorBanner message={error} />}
        {linkedOffers.length === 0 ? (
          <Card><EmptyState icon={<FolderKanban className="w-5 h-5" />} title="Aucune offre liée" hint="Importez une offre pour ce projet depuis un fichier Excel." /></Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-4 py-3">Fichier</th><th className="px-4 py-3">Fournisseur</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Items</th><th className="px-4 py-3 text-center">Analyse</th><th className="px-4 py-3 text-right">Montant total</th>{isAdmin && <th className="px-4 py-3"></th>}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {linkedOffers.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{o.file_name ?? o.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-600">{suppliers.find((s) => s.id === o.supplier_id)?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{o.offer_date ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{o.item_count}</td>
                    <td className="px-4 py-3 text-center"><Badge tone={analysedOfferIds.has(o.id) ? 'green' : 'slate'}>{analysedOfferIds.has(o.id) ? 'Analysée' : 'Non analysée'}</Badge></td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDA(o.total_amount)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" className="!px-2 !py-1 !text-xs !text-rose-600 hover:!bg-rose-50" onClick={() => void deleteOffer(o)}><Trash2 className="w-3.5 h-3.5" /> Supprimer</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <OfferFormModal open={!!importFor} onClose={() => setImportFor(null)} initialProjectId={importFor?.id ?? null} onSaved={() => void load()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Projets"
        action={canWrite ? <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Nouveau projet</Button> : undefined}
      />
      {error && <ErrorBanner message={error} />}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un projet…" className={`${inputCls} pl-9`} />
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Card><EmptyState icon={<FolderKanban className="w-5 h-5" />} title="Aucun projet" hint="Créez un projet avec son intitulé, son budget notifié, son année de référence et sa région." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const count = offers.filter((o) => o.project_id === p.id).length;
            return (
              <Card key={p.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-slate-900 leading-snug">{p.title}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge tone={p.status === 'actif' ? 'green' : 'slate'}>{p.status === 'actif' ? 'Actif' : 'Clôturé'}</Badge>
                    {canWrite && <button type="button" title="Modifier le projet" aria-label={`Modifier le projet ${p.title}`} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" onClick={() => setEditingProject(p)}><Pencil className="w-4 h-4" /></button>}
                    {isAdmin && <button type="button" title="Supprimer le projet" aria-label={`Supprimer le projet ${p.title}`} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" onClick={() => void deleteProject(p)}><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
                <dl className="space-y-1.5 text-sm mb-4">
                  <div className="flex justify-between"><dt className="text-slate-500">Budget notifié</dt><dd className="font-semibold text-slate-900">{formatDA(p.budget)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Année de référence</dt><dd className="text-slate-800">{p.target_year}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Région</dt><dd className="text-slate-800">{p.region}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Offres liées</dt><dd className="text-slate-800">{count}</dd></div>
                </dl>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                  <Button variant="secondary" className={`w-full !border-slate-200 !bg-slate-50 !text-slate-700 hover:!border-orange-200 hover:!bg-orange-50 hover:!text-orange-700 ${!canWrite ? 'col-span-2' : ''}`} onClick={() => setDetail(p)}>
                    <Eye className="w-4 h-4" /> Consulter
                  </Button>
                  {canWrite && <Button className="w-full !bg-orange-600 hover:!bg-orange-700" onClick={() => setImportFor(p)}><Upload className="w-4 h-4" /> Importer</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Créer un projet de benchmarking">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Intitulé du projet"><input name="title" required className={inputCls} placeholder="Ex : Extension réseau MT Alger Centre" /></Field>
          <Field label="Budget notifié (DA)"><input name="budget" type="number" min="0" step="1000" required className={inputCls} placeholder="48000000" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Année de référence cible"><input name="target_year" type="number" min="2015" max="2035" required className={inputCls} defaultValue={2026} /></Field>
            <Field label="Région">
              <select name="region" required className={inputCls} defaultValue="TRC Siège">
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Button type="submit" className="w-full">Créer le projet</Button>
        </form>
      </Modal>

      <Modal open={!!editingProject} onClose={() => setEditingProject(null)} title="Modifier le projet">
        {editingProject && (
          <form key={editingProject.id} onSubmit={updateProject} className="space-y-4">
            <Field label="Intitulé du projet"><input name="title" required className={inputCls} defaultValue={editingProject.title} /></Field>
            <Field label="Budget notifié (DA)"><input name="budget" type="number" min="0" step="1000" required className={inputCls} defaultValue={editingProject.budget} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Année de référence cible"><input name="target_year" type="number" min="2015" max="2035" required className={inputCls} defaultValue={editingProject.target_year} /></Field>
              <Field label="Région">
                <select name="region" required className={inputCls} defaultValue={editingProject.region}>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Statut">
              <select name="status" required className={inputCls} defaultValue={editingProject.status}>
                <option value="actif">Actif</option>
                <option value="cloture">Clôturé</option>
              </select>
            </Field>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditingProject(null)}>Annuler</Button>
              <Button type="submit" className="flex-1">Enregistrer</Button>
            </div>
          </form>
        )}
      </Modal>

      <OfferFormModal open={!!importFor} onClose={() => setImportFor(null)} initialProjectId={importFor?.id ?? null} onSaved={() => void load()} />
    </div>
  );
}
