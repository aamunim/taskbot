import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEMO } from './demo';
import { supabase } from './supabase';

type AuthState = { signedIn: boolean; session: Session | null; loading: boolean; signOut: () => void; demoSignIn: () => void };
const AuthContext = createContext<AuthState>({ signedIn: false, session: null, loading: true, signOut: () => {}, demoSignIn: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: !DEMO });
  // Demo builds have no account; this flag only lets the sign-in screen be previewed.
  const [demoIn, setDemoIn] = useState(true);

  useEffect(() => {
    // Demo builds show sample data only and never talk to the server.
    if (DEMO) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setState({ session: data.session, loading: false }))
      .catch(() => setState({ session: null, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    ...state,
    signedIn: DEMO ? demoIn : !!state.session,
    signOut: () => {
      if (DEMO) setDemoIn(false);
      else supabase.auth.signOut();
    },
    demoSignIn: () => {
      if (DEMO) setDemoIn(true);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
