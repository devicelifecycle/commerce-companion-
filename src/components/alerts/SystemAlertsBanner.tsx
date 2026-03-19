import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { AlertTriangle, ShieldAlert, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  source: string;
  title: string;
  message: string;
  details: any;
  created_at: string;
  updated_at: string;
}

export function SystemAlertsBanner() {
  const { isSuperAdmin } = useCompany();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('is_dismissed', false)
      .order('severity', { ascending: true }) // critical first
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAlerts(data as SystemAlert[]);
    }
  };

  const handleDismiss = async (alertId: string) => {
    setDismissing(alertId);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('system_alerts')
      .update({
        is_dismissed: true,
        dismissed_by: user?.id,
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setDismissing(null);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map(alert => {
        const isCritical = alert.severity === 'critical';
        const isExpanded = expanded === alert.id;

        return (
          <div
            key={alert.id}
            className={`rounded-lg border-2 p-4 animate-fade-in ${
              isCritical
                ? 'border-destructive bg-destructive/10'
                : 'border-yellow-500/60 bg-yellow-500/10'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                {isCritical ? (
                  <ShieldAlert className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-bold text-sm ${isCritical ? 'text-destructive' : 'text-foreground'}`}>
                      {alert.title}
                    </h3>
                    <Badge variant="outline" className="text-[10px]">{alert.source}</Badge>
                    <Badge
                      variant={isCritical ? 'destructive' : 'outline'}
                      className="text-[10px]"
                    >
                      {alert.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>

                  {/* Expandable details */}
                  {alert.details && (
                    <button
                      className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                      onClick={() => setExpanded(isExpanded ? null : alert.id)}
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? 'Hide details' : 'Show technical details'}
                    </button>
                  )}

                  {isExpanded && alert.details && (
                    <div className="mt-2 p-3 rounded bg-muted/50 border border-border text-xs font-mono space-y-1.5 max-h-40 overflow-y-auto">
                      {alert.details.missing_required?.length > 0 && (
                        <div>
                          <span className="text-destructive font-semibold">Missing required fields:</span>{' '}
                          {alert.details.missing_required.join(', ')}
                        </div>
                      )}
                      {alert.details.unexpected_fields?.length > 0 && (
                        <div>
                          <span className="text-yellow-600 font-semibold">Unexpected new fields:</span>{' '}
                          {alert.details.unexpected_fields.join(', ')}
                        </div>
                      )}
                      {alert.details.sample_keys?.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Received top-level keys:</span>{' '}
                          {alert.details.sample_keys.join(', ')}
                        </div>
                      )}
                      <div className="text-muted-foreground">
                        Detected: {new Date(alert.details.detected_at).toLocaleString('en-CA')}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    <Link
                      to="/integration-health"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Integration Health
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {new Date(alert.updated_at).toLocaleDateString('en-CA')}
                    </span>
                  </div>
                </div>
              </div>

              {isSuperAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 h-7 w-7"
                  onClick={() => handleDismiss(alert.id)}
                  disabled={dismissing === alert.id}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
