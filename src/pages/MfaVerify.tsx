import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Shield, LogOut } from 'lucide-react';
import warehouseLogo from '@/assets/warehouse-logo.png';

export default function MfaVerify() {
  const [verifyCode, setVerifyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [factorId, setFactorId] = useState('');
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    loadFactor();
  }, [user]);

  const loadFactor = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verifiedFactor = data?.totp?.find(f => f.status === 'verified');
    if (!verifiedFactor) {
      // No verified factor — should be on enroll page
      navigate('/mfa-enroll');
      return;
    }
    setFactorId(verifiedFactor.id);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length !== 6 || !factorId) return;

    setIsLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      navigate('/');
    } catch (error: any) {
      toast({
        title: 'Verification failed',
        description: error.message === 'Invalid TOTP code'
          ? 'The code you entered is incorrect. Please try again.'
          : error.message,
        variant: 'destructive',
      });
      setVerifyCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[20%] right-[-20%] w-[500px] h-[500px] rounded-full bg-primary/6 blur-[120px]" />
        <div className="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-6 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-block relative mb-4">
            <div className="absolute inset-0 rounded-xl bg-primary/25 blur-xl scale-[2]" />
            <img src={warehouseLogo} alt="Tech Genius Warehouse" className="relative w-16 h-16 rounded-xl ring-1 ring-primary/30" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Two-Factor Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter the code from your authenticator app</p>
        </div>

        <Card className="border-border/40 bg-card/50 backdrop-blur-xl shadow-2xl">
          <div className="h-[2px] gradient-vibrant" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Authenticator Code
            </CardTitle>
            <CardDescription>
              Open your authenticator app and enter the 6-digit code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="mfa-code" className="sr-only">Verification Code</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14 bg-muted/20 border-border/50 focus:border-primary/70 rounded-xl"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground font-semibold h-12 text-base rounded-xl shadow-lg shadow-primary/25"
                disabled={isLoading || verifyCode.length !== 6}
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </Button>
            </form>

            <div className="mt-4 pt-4 border-t border-border/30">
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out and use a different account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
