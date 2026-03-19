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

  const features = [
    { icon: Package, label: 'Inventory Tracking', desc: 'Real-time stock across warehouses & FBA' },
    { icon: BarChart3, label: 'Financial Reports', desc: 'P&L, balance sheets, and tax filing' },
    { icon: Globe, label: 'Marketplace Sync', desc: 'Shopify, Amazon & Best Buy integration' },
    { icon: TrendingUp, label: 'Profit Analytics', desc: 'Per-unit COGS, margins & fee analysis' },
    { icon: Shield, label: 'Tax Compliance', desc: 'GST/HST/PST tracking & CRA reporting' },
    { icon: Zap, label: 'Automation', desc: 'Auto journal entries & order imports' },
  ];

  return (
    <div className="min-h-screen flex bg-background select-none overflow-hidden">
      {/* ── Left Panel — Branding ── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
        {/* Layered background */}
        <div className="absolute inset-0 bg-gradient-to-br from-card via-background to-card" />

        {/* Animated ambient orbs — drifting with keyframes */}
        <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-[140px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-secondary/10 blur-[140px] animate-[pulse_10s_ease-in-out_infinite_1s]" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-accent/8 blur-[120px] animate-[pulse_12s_ease-in-out_infinite_2s]" />

        {/* Floating ring elements instead of grid */}
        <div className="absolute top-[12%] left-[15%] w-40 h-40 rounded-full border border-primary/10 animate-[spin_30s_linear_infinite]" />
        <div className="absolute top-[8%] left-[12%] w-52 h-52 rounded-full border border-primary/5 animate-[spin_45s_linear_infinite_reverse]" />
        <div className="absolute bottom-[18%] right-[12%] w-32 h-32 rounded-full border border-secondary/10 animate-[spin_25s_linear_infinite]" />
        <div className="absolute bottom-[14%] right-[8%] w-48 h-48 rounded-full border border-secondary/5 animate-[spin_40s_linear_infinite_reverse]" />
        <div className="absolute top-[55%] left-[35%] w-24 h-24 rounded-full border border-accent/8 animate-[spin_20s_linear_infinite]" />

        {/* Small floating dots */}
        <div className="absolute top-[25%] right-[30%] w-2 h-2 rounded-full bg-primary/30 animate-[pulse_3s_ease-in-out_infinite]" />
        <div className="absolute top-[60%] left-[20%] w-1.5 h-1.5 rounded-full bg-secondary/30 animate-[pulse_4s_ease-in-out_infinite_1s]" />
        <div className="absolute bottom-[35%] right-[25%] w-2.5 h-2.5 rounded-full bg-accent/25 animate-[pulse_5s_ease-in-out_infinite_2s]" />
        <div className="absolute top-[15%] left-[55%] w-1.5 h-1.5 rounded-full bg-primary/20 animate-[pulse_3.5s_ease-in-out_infinite_0.5s]" />
        <div className="absolute bottom-[50%] left-[65%] w-2 h-2 rounded-full bg-secondary/20 animate-[pulse_4.5s_ease-in-out_infinite_1.5s]" />

        {/* Diagonal glass divider on right edge */}
        <div className="absolute top-0 right-0 bottom-0 w-24 bg-gradient-to-l from-background/80 to-transparent backdrop-blur-sm z-20" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo & title */}
          <div className="animate-fade-in">
            <div className="flex items-center gap-4 mb-20">
              <div className="relative group">
                <div className="absolute inset-0 rounded-xl bg-primary/30 blur-xl scale-[2] group-hover:scale-[2.2] transition-transform duration-700" />
                <img
                  src={warehouseLogo}
                  alt="Warehouse"
                  className="relative w-14 h-14 rounded-xl ring-1 ring-primary/30 shadow-lg shadow-primary/20"
                  draggable={false}
                />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
                Warehouse Management
              </h1>
            </div>
          </div>

          {/* Hero statement */}
          <div className="mb-10 max-w-md animate-fade-in" style={{ animationDelay: '100ms' }}>
            <h2 className="text-3xl font-display font-bold text-foreground leading-tight mb-3">
              Your entire operation,
              <br />
              <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                one dashboard.
              </span>
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
              Multi-entity inventory, marketplace orders, and full accrual accounting — purpose-built for Canadian e-commerce.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3 max-w-lg animate-fade-in" style={{ animationDelay: '200ms' }}>
            {features.map(({ icon: Icon, label, desc }, i) => (
              <div
                key={label}
                className="group flex items-start gap-3 p-3.5 rounded-xl bg-card/30 border border-border/20 backdrop-blur-md hover:bg-card/50 hover:border-border/40 transition-all duration-300"
                style={{ animationDelay: `${300 + i * 60}ms` }}
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary/15 group-hover:border-primary/30 transition-colors duration-300">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom tagline */}
          <div className="mt-10 animate-fade-in" style={{ animationDelay: '500ms' }}>
            <div className="w-12 h-[2px] gradient-vibrant rounded-full mb-3" />
            <p className="text-xs text-muted-foreground">
              Multi-entity&ensp;•&ensp;Canadian tax compliant&ensp;•&ensp;Real-time sync
            </p>
          </div>
        </div>
      </div>

      {/* ── Right Panel — Login Form ── */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Background ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[15%] right-[-15%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[140px] animate-[pulse_9s_ease-in-out_infinite]" />
          <div className="absolute bottom-[5%] left-[-10%] w-[400px] h-[400px] rounded-full bg-accent/6 blur-[120px] animate-[pulse_11s_ease-in-out_infinite_1.5s]" />
        </div>

        <div className="relative z-10 w-full max-w-[420px] mx-6">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8 animate-fade-in">
            <div className="inline-block relative mb-4">
              <div className="absolute inset-0 rounded-xl bg-primary/30 blur-xl scale-[2]" />
              <img
                src={warehouseLogo}
                alt="Tech Genius Warehouse"
                className="relative w-16 h-16 rounded-xl ring-1 ring-primary/30 shadow-lg shadow-primary/20"
                draggable={false}
              />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">Tech Genius</h1>
            <p className="text-sm text-primary font-medium">Warehouse</p>
          </div>

          {/* ── Glass login card ── */}
          <div className="animate-fade-in rounded-2xl border border-border/30 bg-card/40 backdrop-blur-2xl shadow-2xl shadow-black/20 overflow-hidden relative">
            {/* Top accent with glow */}
            <div className="h-[2px] gradient-vibrant relative">
              <div className="absolute inset-0 gradient-vibrant blur-md opacity-60" />
            </div>

            {/* Inner glow reflection */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-primary/5 blur-3xl pointer-events-none" />

            <div className="relative p-8 pt-10">
              <div className="mb-8">
                <h2 className="font-display text-2xl font-bold text-foreground">Welcome back</h2>
                <p className="text-muted-foreground text-sm mt-1.5">Sign in to your account</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-foreground/80 text-sm">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-11 h-12 bg-muted/15 border-border/40 focus:border-primary/60 focus:bg-muted/25 focus:ring-2 focus:ring-primary/10 transition-all duration-200 rounded-xl select-text cursor-text"
                    />
                  </div>
                  {errors.loginEmail && <p className="text-sm text-destructive animate-fade-in">{errors.loginEmail}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-foreground/80 text-sm">Password</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-11 h-12 bg-muted/15 border-border/40 focus:border-primary/60 focus:bg-muted/25 focus:ring-2 focus:ring-primary/10 transition-all duration-200 rounded-xl select-text cursor-text"
                    />
                  </div>
                  {errors.loginPassword && <p className="text-sm text-destructive animate-fade-in">{errors.loginPassword}</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full gradient-primary group text-primary-foreground font-semibold h-12 text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 transition-all duration-300 hover:scale-[1.015] active:scale-[0.985]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      Signing in...
                    </div>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground/60 mt-6 animate-fade-in" style={{ animationDelay: '400ms' }}>
            Contact your administrator to request an account
          </p>
        </div>
      </div>
    </div>
  );
}
