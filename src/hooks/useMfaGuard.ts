import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

type MfaStatus = 'none' | 'enroll' | 'verify';

export function useMfaGuard() {
  const { user, loading } = useAuth();
  const [mfaRequired, setMfaRequired] = useState<MfaStatus>('none');
  const [mfaChecking, setMfaChecking] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setMfaChecking(false);
      setMfaRequired('none');
      return;
    }

    checkMfa();
  }, [user, loading]);

  const checkMfa = async () => {
    try {
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        setMfaChecking(false);
        return;
      }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasVerifiedTotp = factors?.totp?.some(f => f.status === 'verified') ?? false;

      if (!hasVerifiedTotp) {
        // User hasn't enrolled in 2FA yet
        setMfaRequired('enroll');
      } else if (aalData.currentLevel !== aalData.nextLevel) {
        // User has 2FA but hasn't verified this session
        setMfaRequired('verify');
      } else {
        setMfaRequired('none');
      }
    } catch {
      // If MFA check fails, don't block — let them through
      setMfaRequired('none');
    } finally {
      setMfaChecking(false);
    }
  };

  return { mfaRequired, mfaChecking };
}
