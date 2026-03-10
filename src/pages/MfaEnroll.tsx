import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    if (!user) {
      navigate('/auth');
      return;
    }
    enrollFactor();
  }, [user]);

  const enrollFactor = async () => {
    setIsEnrolling(true);
    try {
      // Unenroll any existing unverified factors first
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (factors?.totp) {
        for (const factor of factors.totp) {
          if (factor.status === 'unverified') {
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
      toast({
        title: 'Enrollment failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length !== 6) return;

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

      toast({
        title: '2FA enabled',
        description: 'Two-factor authentication has been successfully set up.',
      });
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
          <h1 className="text-2xl font-display font-bold text-foreground">Set Up Two-Factor Authentication</h1>
          <p className="text-sm text-muted-foreground mt-1">Required for all team members</p>
        </div>

        <Card className="border-border/40 bg-card/50 backdrop-blur-xl shadow-2xl">
          <div className="h-[2px] gradient-vibrant" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Authenticator Setup
            </CardTitle>
            <CardDescription>
              Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isEnrolling ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              </div>
            ) : (
              <>
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-xl border border-border/30">
                    <img src={qrCode} alt="QR Code for 2FA" className="w-48 h-48" />
                  </div>
                </div>

                {/* Manual entry secret */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Can't scan? Enter this code manually:</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted/30 p-2.5 rounded-lg border border-border/30 font-mono break-all select-all">
                      {secret}
                    </code>
                    <Button variant="outline" size="icon" onClick={copySecret} className="shrink-0">
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Verify */}
                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="verify-code" className="text-sm">
                      <Smartphone className="inline h-4 w-4 mr-1" />
                      Enter 6-digit code from your app
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
                      className="text-center text-2xl tracking-[0.5em] font-mono h-14 bg-muted/20 border-border/50 focus:border-primary/70 rounded-xl"
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full gradient-primary text-primary-foreground font-semibold h-12 text-base rounded-xl shadow-lg shadow-primary/25"
                    disabled={isLoading || verifyCode.length !== 6}
                  >
                    {isLoading ? 'Verifying...' : 'Verify & Enable 2FA'}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
