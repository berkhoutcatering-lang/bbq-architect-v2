'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    if (!supabase) { setLoading(false); return; }

    // Get initial session
    supabase.auth.getSession().then(function ({ data: { session: s } }) {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    /* Supabase vuurt op de achtergrond herhaaldelijk auth-events af (elke ~2
       seconden een SIGNED_IN, ook als er niets verandert). Werden die één op
       één doorgezet, dan kreeg `user` telkens een nieuw object — en omdat
       OrgContext daarop reageert, ging bij élk event opnieuw de organisatie-
       query de deur uit, waarna de meter weer een maand aan ai_usage-rijen
       ophaalde. Dat hield zichzelf in stand: een eeuwigdurende cyclus van
       twee queries per 2 seconden, op élke pagina.

       We schrijven daarom alleen nieuwe state weg als er echt iets veranderd
       is: een andere gebruiker, of een vers token. Blijft alles gelijk, dan
       geven we exact hetzelfde object terug en slaat React de re-render over
       — daarmee is de lus gebroken. */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      function (_event, s) {
        setSession(function (vorige) {
          return vorige?.access_token === s?.access_token ? vorige : s;
        });
        setUser(function (vorige) {
          const nieuw = s?.user ?? null;
          return vorige?.id === nieuw?.id ? vorige : nieuw;
        });
        setLoading(false);
      }
    );

    return function () {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async function () {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
