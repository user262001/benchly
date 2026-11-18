import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import type { Profile, Role } from './types';

interface AuthState {
  loading: boolean;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  canWrite: boolean;
  isReadOnly: boolean;
  role: Role | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      setProfile(data ?? null);
    } catch (err) {
      console.error('Erreur chargement profil:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        void loadProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        void loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => { 
      mounted = false; 
      sub.subscription.unsubscribe(); 
    };
  }, [loadProfile]);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? traduireErreur(error.message) : null };
  };

  const signOut = async () => { 
    await supabase.auth.signOut(); 
    setProfile(null);
  };

  const value: AuthState = {
    loading,
    profile,
    signIn,
    signOut,
    isAdmin: profile?.role === 'administrateur',
    canWrite: profile?.role === 'administrateur' || profile?.role === 'utilisateur',
    isReadOnly: profile?.role === 'lecteur',
    role: profile?.role ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function traduireErreur(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Identifiants incorrects. Vérifiez votre email et votre mot de passe.';
  if (msg.includes('Email not confirmed')) return 'Email non confirmé.';
  return 'Connexion impossible. Réessayez plus tard.';
}
