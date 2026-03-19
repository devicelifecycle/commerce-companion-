import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Shield, Smartphone, Copy, Check } from 'lucide-react';
import warehouseLogo from '@/assets/warehouse-logo.png';

export default function MfaEnroll() {
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(true);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    enrollFactor();
  }, [user]);

  const enrollFactor = async () => {
    setIsEnrolling(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (factors?.totp) {
        for (const factor of factors.totp) {
          if (factor.factor_type === 'totp' && factor.status !== 'verified') {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          }
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'TG Warehouse Authenticator',
      });
      if (error) throw error;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (error: any) {
      toast({ title: 'Enrollment failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length !== 6) return;
    setIsLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: verifyCode });
      if (verifyError) throw verifyError;
      toast({ title: '2FA enabled', description: 'Two-factor authentication has been successfully set up.' });
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

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <h1 className="text-2xl font-display font-bold text-foreground">Set Up Two-Factor Auth</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Required for all team members</p>
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
                <h2 className="font-display text-lg font-bold text-foreground">Authenticator Setup</h2>
                <p className="text-xs text-muted-foreground">Scan with Google Authenticator, Authy, etc.</p>
              </div>
            </div>

            <div className="my-5 h-px bg-border/30" />

            {isEnrolling ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              </div>
            ) : (
              <div className="space-y-5">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-xl border border-border/20 shadow-lg shadow-black/10">
                    <img src={qrCode} alt="QR Code for 2FA" className="w-48 h-48" draggable={false} />
                  </div>
                </div>

                {/* Manual secret */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Can't scan? Enter this code manually:</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted/20 p-2.5 rounded-lg border border-border/30 font-mono break-all select-all cursor-text">
                      {secret}
                    </code>
                    <Button variant="outline" size="icon" onClick={copySecret} className="shrink-0 h-9 w-9 border-border/30">
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Verify form */}
                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="verify-code" className="text-sm text-foreground/80 flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> Enter 6-digit code from your app
                    </Label>
                    <Input
                      id="verify-code"
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
                    ) : 'Verify & Enable 2FA'}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
