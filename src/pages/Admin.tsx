import { useEffect, useState, useCallback } from 'react';
import { History, ScrollText, Users, Settings as SettingsIcon, Search, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatDA } from '@/lib/format';
import { METHOD_LABELS, type Analysis, type AuditLog, type Profile, type Project, type Role } from '@/lib/types';
import { PageHeader, Card, Spinner, EmptyState, Button, Badge, inputCls, ErrorBanner } from '@/components/ui';

const ACTION_LABELS: Record<string, { label: string; tone: 'slate' | 'orange' | 'green' | 'red' | 'blue' }> = {
  LOGIN: { label: 'Connexion utilisateur', tone: 'blue' },
  IMPORT_OFFER: { label: 'Import de fichier', tone: 'orange' },
  INFLATION_UPDATE: { label: 'Mise à jour inflation', tone: 'slate' },
  ANALYSIS_RUN: { label: 'Exécution analyse IA', tone: 'green' },
};

const ROLE_LABELS: Record<Role, string> = {
  administrateur: 'Administrateur',
  utilisateur: 'Utilisateur métier',
  lecteur: 'Lecteur',
};

export function HistoryPage() {
  const { isAdmin, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('analyses').select('*').order('created_at', { ascending: false });
    if (!isAdmin && profile?.email) query = query.eq('run_email', profile.email);
    const [a, p] = await Promise.all([query, supabase.from('projects').select('*').order('title')]);
    setAnalyses(a.data ?? []);
    setProjects(p.data ?? []);
    setLoading(false);
  }, [isAdmin, profile?.email]);

  useEffect(() => { void load(); }, [load]);

  const filtered = analyses.filter((a) => {
    if (filterProject && a.project_id !== filterProject) return false;
    const q = search.toLowerCase();
    return !q || (a.run_email ?? '').toLowerCase().includes(q) || a.id.slice(0, 8).includes(q);
  });

  return (
    <div>
      <PageHeader
        title="Historique des analyses IA"
        subtitle={isAdmin ? 'Toutes les analyses exécutées sur la plateforme.' : 'Vos analyses exécutées.'}
        action={<Button variant="secondary" onClick={() => void load()}><RefreshCw className="w-4 h-4" /> Actualiser</Button>}
      />
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={`${inputCls} max-w-xs`}>
          <option value="">Tous les projets</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par utilisateur ou numéro…" className={`${inputCls} pl-9`} />
        </div>
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Card><EmptyState icon={<History className="w-5 h-5" />} title="Aucune analyse enregistrée" hint="Les analyses IA exécutées apparaîtront ici." /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Projet</th><th className="px-4 py-3">Exécuté par</th>
              <th className="px-4 py-3">Statut</th><th className="px-4 py-3">Paramètres</th><th className="px-4 py-3 text-right">Écart</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((a) => {
                const p = projects.find((x) => x.id === a.project_id);
                return (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(a.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p?.title ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{a.run_email ?? '—'}</td>
                    <td className="px-4 py-3"><Badge tone={a.status === 'terminee' ? 'green' : 'orange'}>{a.status === 'terminee' ? 'Terminée' : 'En cours'}</Badge></td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {a.params?.method ? METHOD_LABELS[a.params.method as keyof typeof METHOD_LABELS] : '—'}
                      {a.params?.similarityThreshold ? ` · seuil ${a.params.similarityThreshold} %` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{a.summary ? formatDA(a.summary.difference) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function AuditLogs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300);
    if (err) setError(err.message);
    setLogs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = filter ? logs.filter((l) => l.action === filter) : logs;

  return (
    <div>
      <PageHeader
        title="Logs et opérations système"
        subtitle="Journal complet des connexions, imports, mises à jour et analyses."
        action={<Button variant="secondary" onClick={() => void load()}><RefreshCw className="w-4 h-4" /> Actualiser</Button>}
      />
      {error && <ErrorBanner message={error} />}
      <div className="mb-4 flex gap-2 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === '' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-500'}`}>Tous</button>
        {Object.entries(ACTION_LABELS).map(([key, v]) => (
          <button key={key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filter === key ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-600 hover:border-orange-400'}`}>{v.label}</button>
        ))}
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Card><EmptyState icon={<ScrollText className="w-5 h-5" />} title="Aucune opération enregistrée" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">Horodatage</th><th className="px-4 py-3">Opération</th><th className="px-4 py-3">Utilisateur</th>
              <th className="px-4 py-3">Rôle</th><th className="px-4 py-3">Détails</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((l) => {
                const meta = ACTION_LABELS[l.action] ?? { label: l.action, tone: 'slate' as const };
                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{l.user_email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{l.user_role ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono max-w-md truncate">{JSON.stringify(l.details)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function UserManagement() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (err) setError(err.message);
    setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setRole = async (id: string, role: Role) => {
    const { error: err } = await supabase.rpc('admin_set_user_role', { p_user: id, p_role: role });
    if (err) setError(err.message);
    else void load();
  };

  const setActive = async (id: string, active: boolean) => {
    const { error: err } = await supabase.rpc('admin_set_user_active', { p_user: id, p_active: active });
    if (err) setError(err.message);
    else void load();
  };

  return (
    <div>
      <PageHeader title="Gestion des comptes" subtitle="Attribution des rôles et activation des comptes utilisateurs." />
      {error && <ErrorBanner message={error} />}
      {loading ? <Spinner /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-4 py-3">Utilisateur</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Rôle</th><th className="px-4 py-3">Statut</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.full_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <select value={u.role} onChange={(e) => void setRole(u.id, e.target.value as Role)} className={`${inputCls} !py-1.5 !text-xs max-w-44`}>
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => void setActive(u.id, !u.is_active)} title={u.is_active ? 'Désactiver' : 'Activer'}>
                      <Badge tone={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Actif' : 'Désactivé'}</Badge>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-slate-400 mt-3">Les nouveaux comptes sont créés depuis l'écran de connexion via l'administrateur système. Le rôle par défaut est « Utilisateur métier ».</p>
    </div>
  );
}

export function GlobalSettings() {
  return (
    <div>
      <PageHeader title="Paramétrage global" subtitle="Configuration générale de la plateforme Benchly." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <SettingsIcon className="w-6 h-6 text-orange-600 mb-3" />
          <h3 className="font-semibold text-slate-900 mb-1">Taux d'inflation</h3>
          <p className="text-sm text-slate-500 mb-4">Les taux annuels sont gérés dans la section « Gestion de l'inflation » et appliqués à toutes les analyses.</p>
        </Card>
        <Card className="p-6">
          <Users className="w-6 h-6 text-orange-600 mb-3" />
          <h3 className="font-semibold text-slate-900 mb-1">Rôles & accès</h3>
          <p className="text-sm text-slate-500 mb-4">Trois rôles : Administrateur (accès complet), Utilisateur métier (import, analyse, validation, export) et Lecteur (consultation seule).</p>
        </Card>
        <Card className="p-6">
          <History className="w-6 h-6 text-orange-600 mb-3" />
          <h3 className="font-semibold text-slate-900 mb-1">Journalisation</h3>
          <p className="text-sm text-slate-500 mb-4">Les connexions, imports de fichiers, mises à jour d'inflation et exécutions d'analyses sont journalisées automatiquement.</p>
        </Card>
        <Card className="p-6">
          <ScrollText className="w-6 h-6 text-orange-600 mb-3" />
          <h3 className="font-semibold text-slate-900 mb-1">Moteur sémantique</h3>
          <p className="text-sm text-slate-500">La similarité sémantique compare les désignations d'items entre elles (normalisation linguistique, tolérance aux variantes et fautes), avec normalisation des prix historiques par l'inflation vers l'année cible du projet.</p>
        </Card>
      </div>
    </div>
  );
}
