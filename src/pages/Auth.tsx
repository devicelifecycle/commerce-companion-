import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, Mail, ArrowRight, Package, BarChart3, Globe, Zap } from 'lucide-react';
import { z } from 'zod';
import warehouseLogo from '@/assets/warehouse-logo.png';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const validateLogin = () => {
    const newErrors: Record<string, string> = {};
    try { emailSchema.parse(loginEmail); } catch (e) {
      if (e instanceof z.ZodError) newErrors.loginEmail = e.errors[0].message;
    }
    try { passwordSchema.parse(loginPassword); } catch (e) {
      if (e instanceof z.ZodError) newErrors.loginPassword = e.errors[0].message;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLogin()) return;
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);
    if (error) {
      toast({
        title: 'Login failed',
        description: error.message === 'Invalid login credentials'
          ? 'Invalid email or password. Please try again.'
          : error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Full-screen ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] rounded-full bg-primary/12 blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-secondary/12 blur-[150px]" />
        <div className="absolute top-[30%] right-[20%] w-[500px] h-[500px] rounded-full bg-accent/10 blur-[150px]" />
        <div className="absolute bottom-[20%] left-[30%] w-[300px] h-[300px] rounded-full bg-primary/6 blur-[100px]" />
      </div>

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-[480px] mx-4 animate-fade-in">
        {/* Logo & branding */}
        <div className="text-center mb-8">
          <div className="inline-block relative mb-5">
            <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-2xl scale-[2.5]" />
            <div className="absolute inset-0 rounded-2xl bg-accent/15 blur-3xl scale-[3] -translate-y-2" />
            <img
              src={warehouseLogo}
              alt="Tech Genius Warehouse"
              className="relative w-20 h-20 rounded-2xl shadow-2xl ring-2 ring-primary/30"
            />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Tech Genius
          </h1>
          <h1 className="text-3xl font-display font-bold gradient-text mb-3">
            Warehouse
          </h1>
          <div className="w-16 h-1 rounded-full gradient-vibrant mx-auto" />
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
          {/* Top gradient accent */}
          <div className="absolute top-0 left-0 right-0 h-[3px] gradient-vibrant" />

          {/* Subtle inner glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[100px] bg-primary/8 blur-[60px] pointer-events-none" />

          <div className="relative p-8 pt-10">
            <div className="text-center mb-6">
              <h2 className="font-display text-xl font-semibold text-foreground">Welcome back</h2>
              <p className="text-muted-foreground text-sm mt-1">Sign in to continue</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-foreground/80 text-sm">Email</Label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@company.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="pl-11 h-12 bg-muted/20 border-border/50 focus:border-primary/70 focus:bg-muted/30 transition-all rounded-xl"
                  />
                </div>
                {errors.loginEmail && <p className="text-sm text-destructive">{errors.loginEmail}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-foreground/80 text-sm">Password</Label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="pl-11 h-12 bg-muted/20 border-border/50 focus:border-primary/70 focus:bg-muted/30 transition-all rounded-xl"
                  />
                </div>
                {errors.loginPassword && <p className="text-sm text-destructive">{errors.loginPassword}</p>}
              </div>

              <Button
                type="submit"
                className="w-full gradient-primary group text-primary-foreground font-semibold h-12 text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 hover:scale-[1.01]"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Feature strip */}
          <div className="border-t border-border/30 bg-muted/10 px-8 py-5">
            <div className="flex items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Package className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Inventory</span>
              </div>
              <div className="w-px h-4 bg-border/50" />
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
                  <BarChart3 className="w-3.5 h-3.5 text-secondary" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Accounting</span>
              </div>
              <div className="w-px h-4 bg-border/50" />
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
                  <Globe className="w-3.5 h-3.5 text-accent" />
                </div>
                <span className="text-xs text-muted-foreground font-medium">Marketplace</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Contact your administrator to request an account
        </p>
      </div>
    </div>
  );
}
