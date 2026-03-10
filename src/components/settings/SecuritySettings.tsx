import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Shield, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function SecuritySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkMfaStatus();
  }, []);

  const checkMfaStatus = async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verifiedFactor = data?.totp?.find(f => f.status === 'verified');
      setMfaEnabled(!!verifiedFactor);
      setMfaFactorId(verifiedFactor?.id ?? null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleResetMfa = async () => {
    if (!mfaFactorId) return;
    
    const confirmed = window.confirm(
      'This will remove your current 2FA setup. You will need to set up a new authenticator on your next login. Continue?'
    );
    if (!confirmed) return;

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      
      toast({
        title: '2FA has been reset',
        description: 'You will be redirected to set up a new authenticator.',
      });
      
      // Redirect to re-enroll
      setTimeout(() => navigate('/mfa-enroll'), 1500);
    } catch (error: any) {
      toast({
        title: 'Failed to reset 2FA',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security
        </CardTitle>
        <CardDescription>
          Manage your security settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 2FA Status */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              {mfaEnabled ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">Two-Factor Authentication</p>
                  {!loading && (
                    <Badge variant={mfaEnabled ? 'default' : 'destructive'} className="text-xs">
                      {mfaEnabled ? 'Enabled' : 'Not Set Up'}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {mfaEnabled
                    ? 'Your account is protected with an authenticator app'
                    : 'Required for all team members'}
                </p>
              </div>
            </div>
            {mfaEnabled ? (
              <Button variant="outline" onClick={handleResetMfa}>
                Reset 2FA
              </Button>
            ) : (
              <Button variant="outline" onClick={() => navigate('/mfa-enroll')}>
                Set Up Now
              </Button>
            )}
          </div>

          {/* Password */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Password</p>
              <p className="text-sm text-muted-foreground">Last changed: Never</p>
            </div>
            <Button variant="outline">Change Password</Button>
          </div>

          {/* Sessions */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <p className="font-medium">Active Sessions</p>
              <p className="text-sm text-muted-foreground">Manage your logged-in devices</p>
            </div>
            <Button variant="outline" disabled>
              View Sessions
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
