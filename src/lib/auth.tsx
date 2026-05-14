import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// sessionStorage clears when the browser is fully closed (unlike localStorage).
// We use this to detect a fresh browser open vs. a page refresh within the same session.
const SESSION_STORAGE_KEY = 'sb-session-active';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Captured synchronously at mount — before any async auth events fire.
    const wasActive = sessionStorage.getItem(SESSION_STORAGE_KEY);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // INITIAL_SESSION fires when the auth library restores a session from localStorage
        // on page load. If wasActive is null, the browser was closed and this is a stale
        // session — sign out immediately WITHOUT updating state, so the user never sees
        // the authenticated UI (eliminates the 1-2s flicker before forced logout).
        if (event === 'INITIAL_SESSION' && session && !wasActive) {
          supabase.auth.signOut();
          return; // loading stays true; SIGNED_OUT event below will finalize state
        }

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        if (event === 'SIGNED_IN' && session?.user) {
          sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
          // Fire-and-forget audit log — intentionally non-blocking, non-critical
          void supabase.from('audit_logs').insert({
            action: 'LOGIN',
            table_name: 'auth.users',
            module: 'System',
            notes: `User signed in: ${session.user.email}`,
            user_id: session.user.id,
            status: 'success',
          }).then(({ error }) => {
            if (error) console.warn('Audit log insert failed (non-critical):', error.message);
          });
        }
        if (event === 'SIGNED_OUT') {
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return { error: error as Error | null };

    // Only check is_active — the company assignment check was removed because the
    // client-side RLS on user_company_assignments blocks the query immediately after
    // sign-in despite valid assignments existing. Access control for specific data
    // is enforced by RLS on every table; users with no assignments simply see no data.
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('user_id', data.user.id)
        .single();

      if (profile && !profile.is_active) {
        await supabase.auth.signOut();
        return { error: new Error('Your account has been deactivated. Contact your administrator.') };
      }
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Fire-and-forget audit log — non-critical, must not block sign-out
    if (user) {
      void supabase.from('audit_logs').insert({
        action: 'LOGOUT',
        table_name: 'auth.users',
        module: 'System',
        notes: `User signed out: ${user.email}`,
        user_id: user.id,
        status: 'success',
      }).then(({ error }) => {
        if (error) console.warn('Logout audit log failed (non-critical):', error.message);
      });
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
