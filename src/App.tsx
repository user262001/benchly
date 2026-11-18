import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Layout, NAV_ITEMS, type PageId } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Projects } from '@/pages/Projects';
import { Suppliers } from '@/pages/Suppliers';
import { Offers } from '@/pages/Offers';
import { Inflation } from '@/pages/Inflation';
import { Analysis } from '@/pages/Analysis';
import { Validation } from '@/pages/Validation';
import { Results } from '@/pages/Results';
import { HistoryPage, AuditLogs, UserManagement, GlobalSettings } from '@/pages/Admin';
import { Spinner } from '@/components/ui';

function Shell() {
  const { profile, loading, role } = useAuth();
  const [page, setPage] = useState<PageId>('dashboard');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [projectPreselect, setProjectPreselect] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      void supabase.from('audit_logs').insert({
        action: 'LOGIN',
        entity: 'auth',
        details: { at: new Date().toISOString() },
        user_id: profile.id,
        user_email: profile.email,
        user_role: profile.role,
      });
    }
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Spinner label="Chargement de Benchly…" /></div>;
  if (!profile) return <Login />;

  const allowed = NAV_ITEMS.find((i) => i.id === page);
  const effectivePage: PageId = allowed && role && allowed.roles.includes(role) ? page : 'dashboard';

  const render = () => {
    switch (effectivePage) {
      case 'dashboard': return <Dashboard setPage={setPage} />;
      case 'projects': return <Projects preselect={projectPreselect} />;
      case 'suppliers': return <Suppliers />;
      case 'offers': return <Offers />;
      case 'inflation': return <Inflation />;
      case 'analysis': return <Analysis setPage={setPage} onRun={setAnalysisId} />;
      case 'validation': return <Validation setPage={setPage} analysisId={analysisId} />;
      case 'results': return <Results />;
      case 'history': return <HistoryPage />;
      case 'logs': return <AuditLogs />;
      case 'users': return <UserManagement />;
      case 'settings': return <GlobalSettings />;
      default: return <Dashboard setPage={setPage} />;
    }
  };

  return (
    <Layout page={effectivePage} setPage={(p) => { setPage(p); if (p === 'projects') setProjectPreselect(null); }}>
      {render()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
