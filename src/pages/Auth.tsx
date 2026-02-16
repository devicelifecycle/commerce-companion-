import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Lock, Mail, ArrowRight, Package, BarChart3, Globe } from 'lucide-react';
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
    if (user) {
      navigate('/');
    }
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
    { icon: Package, label: 'Real-time inventory tracking', color: 'primary' },
    { icon: BarChart3, label: 'Complete P&L accounting', color: 'secondary' },
    { icon: Globe, label: 'Multi-marketplace integration', color: 'accent' },
  ] as const;

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute top-[-10%] left-[10%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[15%] w-[400px] h-[400px] rounded-full bg-secondary/8 blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-[150px] pointer-events-none" />

      {/* Left branding panel (desktop) */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center bg-card/40 border-r border-border/30">
        {/* Ambient glows inside branding panel */}
        <div className="absolute top-[10%] left-[20%] w-[300px] h-[300px] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[15%] right-[10%] w-[250px] h-[250px] rounded-full bg-secondary/10 blur-[100px] pointer-events-none" />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-accent/8 blur-[120px] pointer-events-none" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative z-10 flex flex-col items-center text-center px-12 max-w-lg">
          {/* Logo with glow */}
          <div className="mb-10 relative">
            <div className="absolute inset-0 rounded-3xl bg-primary/30 blur-3xl scale-[2]" />
            <img
              src={warehouseLogo}
              alt="Tech Genius Warehouse"
              className="relative w-28 h-28 rounded-2xl shadow-2xl ring-2 ring-primary/20"
            />
          </div>

          <h1 className="text-5xl font-display font-bold text-foreground mb-2 leading-tight">
            Tech Genius
          </h1>
          <h1 className="text-5xl font-display font-bold mb-6">
            <span className="gradient-text">Warehouse</span>
          </h1>

          <div className="w-20 h-1 rounded-full gradient-vibrant mb-10" />

          <div className="space-y-3 w-full">
            {features.map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="flex items-center gap-4 p-4 rounded-xl bg-card/60 border border-border/40 backdrop-blur-sm transition-all duration-300 hover:border-border/70 hover:bg-card/80"
              >
                <div className={`w-10 h-10 rounded-lg bg-${color}/15 flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 text-${color}`} />
                </div>
                <span className="text-foreground/90 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>

          <p className="text-muted-foreground text-xs mt-10">
            Inventory & Accounting Management System
          </p>
        </div>
      </div>

      {/* Right side — Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile branding */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-block mb-4 relative">
              <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-2xl scale-[2]" />
              <img
                src={warehouseLogo}
                alt="Tech Genius Warehouse"
                className="relative w-16 h-16 rounded-xl shadow-xl ring-2 ring-primary/20"
              />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Tech Genius <span className="gradient-text">Warehouse</span>
            </h1>
          </div>

          <Card className="border-border/40 bg-card/70 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] gradient-vibrant" />

            <CardHeader className="text-center pb-2 pt-8">
              <CardTitle className="font-display text-2xl text-foreground">Welcome back</CardTitle>
              <CardDescription className="text-muted-foreground">Sign in to your account</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-foreground/80">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 bg-muted/30 border-border/50 focus:border-primary transition-colors"
                    />
                  </div>
                  {errors.loginEmail && (
                    <p className="text-sm text-destructive">{errors.loginEmail}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-foreground/80">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 bg-muted/30 border-border/50 focus:border-primary transition-colors"
                    />
                  </div>
                  {errors.loginPassword && (
                    <p className="text-sm text-destructive">{errors.loginPassword}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full gradient-primary group text-primary-foreground font-semibold h-11 text-base shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow"
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
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Contact your administrator to request an account
          </p>
        </div>
      </div>
    </div>
  );
}
