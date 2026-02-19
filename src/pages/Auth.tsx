import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, Mail, ArrowRight, Package, BarChart3, Globe, Shield, Zap, TrendingUp } from 'lucide-react';
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
    try {emailSchema.parse(loginEmail);} catch (e) {
      if (e instanceof z.ZodError) newErrors.loginEmail = e.errors[0].message;
    }
    try {passwordSchema.parse(loginPassword);} catch (e) {
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
        description: error.message === 'Invalid login credentials' ?
        'Invalid email or password. Please try again.' :
        error.message,
        variant: 'destructive'
      });
    }
  };

  const features = [
  { icon: Package, label: 'Inventory Tracking', desc: 'Real-time stock across warehouses & FBA' },
  { icon: BarChart3, label: 'Financial Reports', desc: 'P&L, balance sheets, and tax filing' },
  { icon: Globe, label: 'Marketplace Sync', desc: 'Shopify, Amazon & Best Buy integration' },
  { icon: TrendingUp, label: 'Profit Analytics', desc: 'Per-unit COGS, margins & fee analysis' },
  { icon: Shield, label: 'Tax Compliance', desc: 'GST/HST/PST tracking & CRA reporting' },
  { icon: Zap, label: 'Automation', desc: 'Auto journal entries & order imports' }];


  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Background gradient layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-card" />
        <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-secondary/8 blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-accent/6 blur-[100px]" />

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Top — Logo & title */}
          <div>
            <div className="flex items-center gap-4 mb-16">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-primary/25 blur-xl scale-[1.8]" />
                <img
                  src={warehouseLogo}
                  alt="Tech Genius Warehouse"
                  className="relative w-14 h-14 rounded-xl ring-1 ring-primary/30" />

              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Warehouse Management</h1>
              </div>
            </div>

            {/* Headline */}
            <div className="max-w-lg mb-12">
              <h2 className="text-4xl font-display font-bold text-foreground leading-tight mb-4">

operations hub
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Inventory, accounting, and marketplace management — unified in one platform built for resellers.
              </p>
            </div>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            {features.map(({ icon: Icon, label, desc }) =>
            <div key={label} className="flex items-start gap-3 p-3 rounded-lg bg-card/40 border border-border/30 backdrop-blur-sm">
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom tagline */}
          <div className="mt-8">
            <div className="w-12 h-[2px] gradient-vibrant rounded-full mb-3" />
            <p className="text-xs text-muted-foreground">
              Multi-entity • Canadian tax compliant • Real-time sync
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Ambient glow on login side */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[20%] right-[-20%] w-[500px] h-[500px] rounded-full bg-primary/6 blur-[120px]" />
          <div className="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px]" />
        </div>

        <div className="relative z-10 w-full max-w-[400px] mx-6 animate-fade-in">
          {/* Mobile logo (hidden on desktop) */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-block relative mb-4">
              <div className="absolute inset-0 rounded-xl bg-primary/25 blur-xl scale-[2]" />
              <img
                src={warehouseLogo}
                alt="Tech Genius Warehouse"
                className="relative w-16 h-16 rounded-xl ring-1 ring-primary/30" />

            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Tech Genius</h1>
            <p className="text-sm text-primary font-medium">Warehouse</p>
          </div>

          {/* Login form card */}
          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-xl shadow-2xl overflow-hidden">
            {/* Top accent line */}
            <div className="h-[2px] gradient-vibrant" />

            <div className="p-8">
              <div className="mb-8">
                <h2 className="font-display text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-muted-foreground text-sm mt-1">Sign in to your account</p>
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
                      className="pl-11 h-12 bg-muted/20 border-border/50 focus:border-primary/70 focus:bg-muted/30 transition-all rounded-xl" />

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
                      className="pl-11 h-12 bg-muted/20 border-border/50 focus:border-primary/70 focus:bg-muted/30 transition-all rounded-xl" />

                  </div>
                  {errors.loginPassword && <p className="text-sm text-destructive">{errors.loginPassword}</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full gradient-primary group text-primary-foreground font-semibold h-12 text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 hover:scale-[1.01]"
                  disabled={isLoading}>

                  {isLoading ? 'Signing in...' :
                  <>
                      Sign In
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  }
                </Button>
              </form>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Contact your administrator to request an account
          </p>
        </div>
      </div>
    </div>);

}