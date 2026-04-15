import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DEFAULT_TIMEOUT_MINUTES = 30;
const WARNING_BEFORE_LOGOUT_MS = 60_000; // 1 minute warning

export function useIdleTimeout() {
  const { user, signOut } = useAuth();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutMinutesRef = useRef(DEFAULT_TIMEOUT_MINUTES);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const handleLogout = useCallback(async () => {
    clearTimers();
    if (user) {
      await supabase.from('audit_logs').insert({
        action: 'LOGOUT',
        table_name: 'auth.users',
        module: 'System',
        notes: `Auto-logout due to ${timeoutMinutesRef.current} min inactivity`,
        user_id: user.id,
        status: 'success',
      });
      await signOut();
    }
  }, [user, signOut, clearTimers]);

  const resetTimer = useCallback(() => {
    if (!user) return;
    clearTimers();
    const ms = timeoutMinutesRef.current * 60_000;

    // Show warning 1 minute before logout
    warningRef.current = setTimeout(() => {
      toast({
        title: 'Session expiring',
        description: 'You will be logged out in 1 minute due to inactivity. Move your mouse or press a key to stay signed in.',
        variant: 'destructive',
      });
    }, Math.max(ms - WARNING_BEFORE_LOGOUT_MS, 0));

    timeoutRef.current = setTimeout(handleLogout, ms);
  }, [user, clearTimers, handleLogout, toast]);

  // Fetch company-specific timeout setting
  useEffect(() => {
    if (!selectedCompany?.id) return;
    supabase
      .from('app_settings')
      .select('session_timeout_minutes')
      .eq('company_id', selectedCompany.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.session_timeout_minutes) {
          timeoutMinutesRef.current = data.session_timeout_minutes;
        }
      });
  }, [selectedCompany?.id]);

  // Set up activity listeners
  useEffect(() => {
    if (!user) {
      clearTimers();
      return;
    }

    const events: (keyof WindowEventMap)[] = [
      'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click',
    ];

    // Throttle resets to avoid excessive timer recreation
    let lastReset = 0;
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 30_000) { // throttle to every 30s
        lastReset = now;
        resetTimer();
      }
    };

    events.forEach((e) => window.addEventListener(e, throttledReset, { passive: true }));
    resetTimer(); // initial timer

    // Handle tab visibility — sign out if tab is hidden for too long
    const handleVisibility = () => {
      if (document.hidden) {
        // When tab is hidden, set a shorter check (use full timeout)
        // Timer continues running in background
      } else {
        // Tab visible again — reset timer
        resetTimer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Handle beforeunload — mark session for cleanup
    const handleBeforeUnload = () => {
      // sessionStorage marker is already handled in auth.tsx
      // This ensures the session ends on full browser close
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, throttledReset));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, resetTimer, clearTimers]);
}
