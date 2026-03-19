import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Shield, LogOut, KeyRound } from 'lucide-react';
import warehouseLogo from '@/assets/warehouse-logo.png';

export default function MfaVerify() {
  const [verifyCode, setVerifyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [factorId, setFactorId] = useState('');
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    loadFactor();
  }, [user]);

  const loadFactor = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verifiedFactor = data?.totp?.find(f => f.status === 'verified');
    if (!verifiedFactor) { navigate('/mfa-enroll'); return; }
    setFactorId(verifiedFactor.id);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length !== 6 || !factorId) return;

    setIsLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: verifyCode });
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
    <div className="min-h-screen flex items-center justify-center bg-background relative select-none overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[10%] right-[-15%] w-[550px] h-[550px] rounded-full bg-primary/8 blur-[140px] animate-[pulse_9s_ease-in-out_infinite]" />
        <div className="absolute bottom-[5%] left-[-10%] w-[450px] h-[450px] rounded-full bg-accent/6 blur-[120px] animate-[pulse_11s_ease-in-out_infinite_1.5s]" />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-secondary/5 blur-[100px] animate-[pulse_13s_ease-in-out_infinite_3s]" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-6">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-block relative mb-5">
            <div className="absolute inset-0 rounded-xl bg-primary/30 blur-xl scale-[2]" />
            <img
              src={warehouseLogo}
              alt="Tech Genius Warehouse"
              className="relative w-16 h-16 rounded-xl ring-1 ring-primary/30 shadow-lg shadow-primary/20"
              draggable={false}
            />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Two-Factor Verification</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Enter the code from your authenticator app</p>
        </div>

        {/* Glass card */}
        <div className="animate-fade-in rounded-2xl border border-border/30 bg-card/40 backdrop-blur-2xl shadow-2xl shadow-black/20 overflow-hidden relative">
          {/* Accent bar with glow */}
          <div className="h-[2px] gradient-vibrant relative">
            <div className="absolute inset-0 gradient-vibrant blur-md opacity-60" />
          </div>

          {/* Inner glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-primary/5 blur-3xl pointer-events-none" />

          <div className="relative p-8 pt-7">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Authenticator Code</h2>
                <p className="text-xs text-muted-foreground">Open your app and enter the 6-digit code</p>
              </div>
            </div>

            <div className="my-5 h-px bg-border/30" />

            <form onSubmit={handleVerify} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="mfa-code" className="text-sm text-foreground/80 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Verification Code
                </Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14 bg-muted/15 border-border/40 focus:border-primary/60 focus:bg-muted/25 focus:ring-2 focus:ring-primary/10 rounded-xl select-text cursor-text transition-all duration-200"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground font-semibold h-12 text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 transition-all duration-300 hover:scale-[1.015] active:scale-[0.985]"
                disabled={isLoading || verifyCode.length !== 6}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                    Verifying...
                  </div>
                ) : 'Verify'}
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-border/20">
              <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground transition-colors" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out and use a different account
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
