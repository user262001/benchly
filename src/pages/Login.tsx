import { useState } from 'react';
import { Zap, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase';
import { Button, inputCls } from '@/components/ui';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await signIn(email.trim(), password);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-900">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600 via-orange-500 to-amber-600" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -top-24 right-0 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-white font-bold text-2xl tracking-tight">Benchly</p>
              <p className="text-orange-100 text-xs font-medium uppercase tracking-widest">Benchmarking des prix</p>
            </div>
          </div>
          <div className="max-w-md">
            <h2 className="text-white text-3xl font-bold leading-tight">
              Analysez vos offres fournisseurs en profondeur.
            </h2>
            <p className="text-orange-100 mt-4 leading-relaxed">
              Analyse sémantique IA multicritères, prix de référence normalisés par l'inflation et décisions de négociation éclairées — sur l'ensemble de vos sites régionaux.
            </p>
          </div>
          <p className="text-orange-200/80 text-xs">© 2026 Benchly — Analyse comparative pour la commande publique</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <p className="text-white font-bold text-xl">Benchly</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-white">Connexion à Benchly</h1>
            <p className="text-slate-400 text-sm mt-1.5 mb-6">Accédez à votre espace d'analyse des prix.</p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">Adresse email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@entreprise.dz" className={`${inputCls} bg-slate-800 border-slate-700 text-white placeholder-slate-500 pl-9`} />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" className={`${inputCls} bg-slate-800 border-slate-700 text-white placeholder-slate-500 pl-9`} />
                </div>
              </div>
              {error && (
                <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg px-3 py-2.5 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
              {!supabaseConfigured && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg px-3 py-2.5 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  La connexion au serveur n'est pas configurée dans cette version déployée. Rechargez la page ou redéployez l'application.
                </div>
              )}
              <Button type="submit" disabled={busy} className="w-full !py-2.5">
                {busy ? 'Connexion…' : 'Se connecter'}
              </Button>

              <div className="pt-2 border-t border-slate-800">
                <p className="text-xs text-slate-500 text-center mb-2">Connexion rapide (comptes de démonstration)</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Admin', email: 'admin@benchly.dz' },
                    { label: 'Utilisateur', email: 'user@benchly.dz' },
                    { label: 'Lecteur', email: 'lecteur@benchly.dz' },
                  ].map((d) => (
                    <button
                      key={d.email}
                      type="button"
                      disabled={busy}
                      onClick={() => { setEmail(d.email); setPassword('Benchly2026!'); setError(null); }}
                      className="text-xs rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-2 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>
            <p className="text-xs text-slate-500 mt-6 text-center">
              Pas de compte ? Contactez votre administrateur système.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
