import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Lock, Mail, ArrowRight, Sparkles } from 'lucide-react';
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
    
    try {
      emailSchema.parse(loginEmail);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.loginEmail = e.errors[0].message;
      }
    }

    try {
      passwordSchema.parse(loginPassword);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.loginPassword = e.errors[0].message;
      }
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
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-secondary/5 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/3 blur-3xl" />

      {/* Left side - Branding (desktop) */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center">
        <div className="relative z-10 flex flex-col items-center text-center p-12 max-w-lg">
          <div className="mb-8 relative">
            <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl scale-150" />
            <img 
              src={warehouseLogo} 
              alt="Tech Genius Warehouse" 
              className="relative w-24 h-24 rounded-2xl shadow-2xl" 
            />
          </div>
          
          <h1 className="text-5xl font-display font-bold text-foreground mb-4">
            Tech Genius
            <span className="block text-primary">Warehouse</span>
          </h1>
          
          <div className="w-16 h-1 rounded-full bg-gradient-to-r from-primary to-secondary mb-8" />
          
          <div className="space-y-4 text-left w-full">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/30">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-foreground text-sm">Real-time inventory tracking</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/30">
              <div className="w-8 h-8 rounded-lg bg-secondary/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-secondary" />
              </div>
              <span className="text-foreground text-sm">Complete P&L accounting</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/30">
              <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-accent" />
              </div>
              <span className="text-foreground text-sm">Multi-marketplace integration</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile branding */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-block mb-3 relative">
              <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl scale-150" />
              <img 
                src={warehouseLogo} 
                alt="Tech Genius Warehouse" 
                className="relative w-16 h-16 rounded-xl shadow-xl" 
              />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Tech Genius <span className="text-primary">Warehouse</span>
            </h1>
          </div>

          <Card className="border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/5">
            <CardHeader className="text-center pb-4">
              <CardTitle className="font-display text-2xl text-foreground">Welcome back</CardTitle>
              <CardDescription>Sign in to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 bg-muted/30 border-border/50 focus:border-primary"
                    />
                  </div>
                  {errors.loginEmail && (
                    <p className="text-sm text-destructive">{errors.loginEmail}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 bg-muted/30 border-border/50 focus:border-primary"
                    />
                  </div>
                  {errors.loginPassword && (
                    <p className="text-sm text-destructive">{errors.loginPassword}</p>
                  )}
                </div>

                <Button type="submit" className="w-full gradient-primary group text-primary-foreground font-semibold" disabled={isLoading}>
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
