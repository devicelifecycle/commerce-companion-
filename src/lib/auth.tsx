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

// Use sessionStorage so sessions end when the browser is fully closed
const SESSION_STORAGE_KEY = 'sb-session-active';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Track login/logout events in audit_logs
        if (event === 'SIGNED_IN' && session?.user) {
          // Use setTimeout to avoid Supabase deadlock on auth state change
          setTimeout(() => {
            supabase.from('audit_logs').insert({
              action: 'LOGIN',
              table_name: 'auth.users',
              module: 'System',
              notes: `User signed in: ${session.user.email}`,
              user_id: session.user.id,
              status: 'success',
            }).then(() => {});
          }, 0);
        }
        if (event === 'SIGNED_OUT') {
          // Can't log after sign out since user is gone, handled in signOut below
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) return { error: error as Error | null };

    // Login guard: check if user account is active and has company assignments
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

      const { data: assignments } = await supabase
        .from('user_company_assignments')
        .select('id')
        .eq('user_id', data.user.id)
        .limit(1);

      if (!assignments || assignments.length === 0) {
        await supabase.auth.signOut();
        return { error: new Error('Your account has no company access. Contact your administrator.') };
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
    // Log logout before signing out (while we still have the session)
    if (user) {
      await supabase.from('audit_logs').insert({
        action: 'LOGOUT',
        table_name: 'auth.users',
        module: 'System',
        notes: `User signed out: ${user.email}`,
        user_id: user.id,
        status: 'success',
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
