import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Bell, Mail, Save, Loader2 } from 'lucide-react';

interface Preferences {
  email_large_expenses: boolean;
  email_low_inventory: boolean;
  email_tax_due_dates: boolean;
  email_unusual_login: boolean;
  email_failed_sync: boolean;
  email_monthly_summary: boolean;
  in_app_all: boolean;
}

export function NotificationPreferences() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({
    email_large_expenses: true,
    email_low_inventory: true,
    email_tax_due_dates: true,
    email_unusual_login: true,
    email_failed_sync: true,
    email_monthly_summary: true,
    in_app_all: true,
  });

  useEffect(() => {
    if (user) {
      fetchPreferences();
    }
  }, [user]);

  const fetchPreferences = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (data) {
        setPreferences({
          email_large_expenses: data.email_large_expenses ?? true,
          email_low_inventory: data.email_low_inventory ?? true,
          email_tax_due_dates: data.email_tax_due_dates ?? true,
          email_unusual_login: data.email_unusual_login ?? true,
          email_failed_sync: data.email_failed_sync ?? true,
          email_monthly_summary: data.email_monthly_summary ?? true,
          in_app_all: data.in_app_all ?? true,
        });
      }
    } catch (error) {
      // No preferences yet, use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          ...preferences,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success('Notification preferences saved');
    } catch (error: any) {
      console.error('Error saving:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (key: keyof Preferences, value: boolean) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
        <CardDescription>
          Choose which notifications you'd like to receive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Notifications */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium">Email Notifications</h4>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Large expenses requiring approval</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when expenses exceed the approval threshold
                </p>
              </div>
              <Switch
                checked={preferences.email_large_expenses}
                onCheckedChange={(v) => updatePreference('email_large_expenses', v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Low inventory alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when inventory falls below threshold
                </p>
              </div>
              <Switch
                checked={preferences.email_low_inventory}
                onCheckedChange={(v) => updatePreference('email_low_inventory', v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Tax filing due dates</Label>
                <p className="text-sm text-muted-foreground">
                  Reminders for upcoming tax filing deadlines
                </p>
              </div>
              <Switch
                checked={preferences.email_tax_due_dates}
                onCheckedChange={(v) => updatePreference('email_tax_due_dates', v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Unusual login activity</Label>
                <p className="text-sm text-muted-foreground">
                  Security alerts for new device logins
                </p>
              </div>
              <Switch
                checked={preferences.email_unusual_login}
                onCheckedChange={(v) => updatePreference('email_unusual_login', v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Failed marketplace sync</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified when data import fails
                </p>
              </div>
              <Switch
                checked={preferences.email_failed_sync}
                onCheckedChange={(v) => updatePreference('email_failed_sync', v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Monthly financial summary</Label>
                <p className="text-sm text-muted-foreground">
                  Receive a monthly overview of key metrics
                </p>
              </div>
              <Switch
                checked={preferences.email_monthly_summary}
                onCheckedChange={(v) => updatePreference('email_monthly_summary', v)}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* In-App Notifications */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium">In-App Notifications</h4>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>All in-app notifications</Label>
              <p className="text-sm text-muted-foreground">
                Show notifications in the notification center
              </p>
            </div>
            <Switch
              checked={preferences.in_app_all}
              onCheckedChange={(v) => updatePreference('in_app_all', v)}
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
