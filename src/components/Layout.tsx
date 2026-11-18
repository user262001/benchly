import { useState } from 'react';
import {
  LayoutDashboard, FolderKanban, Truck, FileSpreadsheet, Percent, Sparkles,
  CheckSquare, BarChart3, History, ScrollText, Users, Settings, LogOut, Zap, Menu, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { DECISION_LABELS } from '@/lib/types';
import type { Decision } from '@/lib/types';

export type PageId =
  | 'dashboard' | 'projects' | 'suppliers' | 'offers' | 'inflation'
  | 'analysis' | 'validation' | 'results' | 'history' | 'logs' | 'users' | 'settings';

export interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  roles: ('administrateur' | 'utilisateur' | 'lecteur')[];
  section: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, roles: ['administrateur', 'utilisateur', 'lecteur'], section: 'Pilotage' },
  { id: 'projects', label: 'Projets', icon: FolderKanban, roles: ['administrateur', 'utilisateur', 'lecteur'], section: 'Données' },
  { id: 'suppliers', label: 'Fournisseurs', icon: Truck, roles: ['administrateur', 'utilisateur', 'lecteur'], section: 'Données' },
  { id: 'offers', label: 'Offres et items', icon: FileSpreadsheet, roles: ['administrateur', 'utilisateur', 'lecteur'], section: 'Données' },
  { id: 'inflation', label: "Inflation", icon: Percent, roles: ['administrateur', 'utilisateur'], section: 'Données' },
  { id: 'analysis', label: 'Analyse IA & filtrage', icon: Sparkles, roles: ['administrateur', 'utilisateur'], section: 'Analyse' },
  { id: 'validation', label: 'Atelier de validation', icon: CheckSquare, roles: ['administrateur', 'utilisateur'], section: 'Analyse' },
  { id: 'results', label: 'Résultats après validation', icon: BarChart3, roles: ['administrateur', 'utilisateur', 'lecteur'], section: 'Analyse' },
  { id: 'history', label: 'Historique des analyses IA', icon: History, roles: ['administrateur', 'utilisateur'], section: 'Suivi' },
  { id: 'logs', label: 'Logs et opérations système', icon: ScrollText, roles: ['administrateur'], section: 'Administration' },
  { id: 'users', label: 'Gestion des comptes', icon: Users, roles: ['administrateur'], section: 'Administration' },
  { id: 'settings', label: 'Paramétrage global', icon: Settings, roles: ['administrateur'], section: 'Administration' },
];

const ROLE_LABELS: Record<string, string> = {
  administrateur: 'Administrateur',
  utilisateur: 'Utilisateur métier',
  lecteur: 'Lecteur (consultation)',
};

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm shrink-0">
        <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <span className="block font-bold text-white text-lg tracking-tight">Benchly</span>
          <span className="block text-[10px] font-medium text-orange-200 uppercase tracking-widest">Benchmarking prix</span>
        </div>
      )}
    </div>
  );
}

export function Layout({ page, setPage, children }: { page: PageId; setPage: (p: PageId) => void; children: React.ReactNode }) {
  const { profile, signOut, role } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV_ITEMS.filter((i) => role && i.roles.includes(role));
  const sections = [...new Set(items.map((i) => i.section))];

  const sidebar = (
    <div className="flex flex-col h-full bg-slate-900 w-64">
      <div className="h-16 flex items-center px-5 border-b border-slate-800 shrink-0">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {sections.map((sec) => (
          <div key={sec}>
            <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">{sec}</p>
            <div className="space-y-0.5">
              {items.filter((i) => i.section === sec).map((item) => {
                const Icon = item.icon;
                const active = page === item.id || (page === 'validation' && item.id === 'analysis');
                return (
                  <button
                    key={item.id}
                    onClick={() => { setPage(item.id); setMobileOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                      active ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-orange-300 shrink-0">
            {(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{profile?.full_name || profile?.email}</p>
            <p className="text-[11px] text-slate-400 truncate">{role ? ROLE_LABELS[role] : ''}</p>
          </div>
          <button onClick={() => void signOut()} title="Se déconnecter" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0"><div className="relative h-full">{sidebar}</div></div>
        </div>
      )}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="lg:hidden h-14 bg-slate-900 flex items-center justify-between px-4 sticky top-0 z-30">
          <Logo compact />
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 text-white">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

export { DECISION_LABELS };
export type { Decision };
