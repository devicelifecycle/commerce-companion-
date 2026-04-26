import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Shield, CheckCircle2, AlertTriangle, LogIn, Clock, User, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';

export function SecuritySettings() {
  const { user } = useAuth();
  const { isSuperAdmin } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  // Password change dialog state
  const [pwOpen, setPwOpen] = useState(false);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    checkMfaStatus();
    fetchSessionLogs();
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

  const fetchSessionLogs = async () => {
    setSessionLoading(true);
    try {
      const { data } = await supabase
        .from('audit_logs')
        .select('id, action, user_id, created_at, notes, ip_address')
        .in('action', ['LOGIN', 'LOGOUT'])
        .gte('created_at', subDays(new Date(), 30).toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      setSessionLogs(data || []);

      // Fetch profiles
      const userIds = [...new Set((data || []).map(e => e.user_id).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
        if (profs) {
          const map: Record<string, string> = {};
          profs.forEach(p => { map[p.user_id] = p.full_name || 'Unknown'; });
          setProfiles(map);
        }
      }
    } catch {
      // ignore
    } finally {
      setSessionLoading(false);
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
      toast({ title: '2FA has been reset', description: 'Two-factor authentication is currently disabled for this workspace.' });
    } catch (error: any) {
      toast({ title: 'Failed to reset 2FA', description: error.message, variant: 'destructive' });
    }
  };

  const handlePasswordChange = async () => {
    if (pwNew.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (pwNew !== pwConfirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      // Audit log entry — best-effort, RLS allows self-inserts after our hardening
      await supabase.from('audit_logs').insert({
        action: 'PASSWORD_CHANGED',
        table_name: 'auth.users',
        user_id: user?.id,
        notes: 'User changed password from Settings → Security',
      });
      toast({ title: 'Password updated', description: 'Use your new password next time you sign in.' });
      setPwOpen(false);
      setPwNew('');
      setPwConfirm('');
    } catch (error: any) {
      toast({ title: 'Failed to update password', description: error.message, variant: 'destructive' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Security</CardTitle>
          <CardDescription>Manage your security settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Password */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">Password</p>
                <p className="text-sm text-muted-foreground">Last changed: Never</p>
              </div>
              <Button variant="outline" onClick={() => setPwOpen(true)}>Change Password</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password change dialog */}
      <Dialog open={pwOpen} onOpenChange={(o) => { setPwOpen(o); if (!o) { setPwNew(''); setPwConfirm(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Enter and confirm your new password (min 8 characters).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pw-new">New password</Label>
              <Input id="pw-new" type="password" autoComplete="new-password" value={pwNew} onChange={e => setPwNew(e.target.value)} disabled={pwSaving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} disabled={pwSaving} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwOpen(false)} disabled={pwSaving}>Cancel</Button>
            <Button onClick={handlePasswordChange} disabled={pwSaving || !pwNew || !pwConfirm}>
              {pwSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LogIn className="h-5 w-5" />Session History</CardTitle>
          <CardDescription>Login and logout events from the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionLoading ? (
            <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : sessionLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No session events recorded</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Timestamp</TableHead>
                    {isSuperAdmin && <TableHead>User</TableHead>}
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessionLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm font-mono">
                        <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{format(new Date(log.created_at), 'MMM d, HH:mm:ss')}</div>
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{profiles[log.user_id] || log.user_id?.slice(0, 8) || 'System'}</div>
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge className={`text-white text-[10px] ${log.action === 'LOGIN' ? 'bg-blue-500' : 'bg-slate-500'}`}>{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
