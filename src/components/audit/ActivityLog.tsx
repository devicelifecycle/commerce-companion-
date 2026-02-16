import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Activity, ChevronDown, User, Bot } from 'lucide-react';

interface ActivityEntry {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
  user_id: string | null;
  module: string | null;
  notes: string | null;
  status: string | null;
  profile_name?: string | null;
}

interface ActivityLogProps {
  /** Filter by module name (e.g., 'Sales', 'Inventory', 'Expenses') */
  module?: string;
  /** Filter by table name */
  tableName?: string;
  /** Filter by specific record */
  recordId?: string;
  /** Max entries to show initially */
  limit?: number;
  /** Title override */
  title?: string;
  /** Compact mode for embedding in sidebars */
  compact?: boolean;
}

const ACTION_STYLES: Record<string, { label: string; className: string }> = {
  INSERT: { label: 'Created', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  UPDATE: { label: 'Updated', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  DELETE: { label: 'Deleted', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  EXPORT: { label: 'Exported', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  IMPORT: { label: 'Imported', className: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  LOGIN: { label: 'Login', className: 'bg-muted text-muted-foreground' },
  LOGOUT: { label: 'Logout', className: 'bg-muted text-muted-foreground' },
  VIEW: { label: 'Viewed', className: 'bg-muted text-muted-foreground' },
  ACCOUNTING: { label: 'Accounting', className: 'bg-primary/10 text-primary border-primary/20' },
};

function getActionStyle(action: string) {
  return ACTION_STYLES[action.toUpperCase()] || { label: action, className: 'bg-muted text-muted-foreground' };
}

function summarizeChanges(oldData: any, newData: any): string | null {
  if (!oldData && newData) return null; // INSERT — notes usually cover this
  if (!oldData || !newData) return null;
  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    if (['updated_at', 'created_at', 'id'].includes(key)) continue;
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      const label = key.replace(/_/g, ' ');
      changes.push(label);
    }
  }
  if (changes.length === 0) return null;
  if (changes.length <= 3) return `Changed: ${changes.join(', ')}`;
  return `Changed ${changes.length} fields: ${changes.slice(0, 3).join(', ')}…`;
}

export function ActivityLog({
  module,
  tableName,
  recordId,
  limit = 15,
  title = 'Recent Activity',
  compact = false,
}: ActivityLogProps) {
  const { selectedCompany } = useCompany();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const displayLimit = showAll ? 50 : limit;

  useEffect(() => {
    fetchActivity();
  }, [module, tableName, recordId, selectedCompany?.id, displayLimit]);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('id, action, table_name, record_id, old_data, new_data, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(displayLimit);

      if (selectedCompany) {
        query = query.eq('company_id', selectedCompany.id);
      }
      if (tableName) {
        query = query.eq('table_name', tableName);
      }
      if (recordId) {
        query = query.eq('record_id', recordId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profile names for user_ids
      const userIds = [...new Set((data || []).map(e => e.user_id).filter(Boolean))] as string[];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        if (profiles) {
          profiles.forEach(p => { profileMap[p.user_id] = p.full_name || 'Unknown'; });
        }
      }

      const enriched: ActivityEntry[] = (data || []).map(e => ({
        ...e,
        module: null,
        notes: null,
        status: null,
        profile_name: e.user_id ? (profileMap[e.user_id] || null) : null,
      }));

      setEntries(enriched);
    } catch (err) {
      console.error('Error fetching activity:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && entries.length === 0) {
    return (
      <Card>
        <CardHeader className={compact ? 'pb-2' : undefined}>
          <CardTitle className={`flex items-center gap-2 ${compact ? 'text-sm' : 'text-base'}`}>
            <Activity className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <CardTitle className={`flex items-center gap-2 ${compact ? 'text-sm' : 'text-base'}`}>
          <Activity className="h-4 w-4" />
          {title}
          {entries.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {entries.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No activity recorded yet
          </div>
        ) : (
          <ScrollArea className={compact ? 'max-h-[300px]' : 'max-h-[400px]'}>
            <div className="divide-y divide-border">
              {entries.map((entry) => {
                const style = getActionStyle(entry.action);
                const changeSummary = summarizeChanges(entry.old_data, entry.new_data);
                const isSystem = !entry.user_id || entry.action === 'ACCOUNTING';

                return (
                  <div key={entry.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isSystem ? (
                          <Bot className="h-4 w-4 text-primary" />
                        ) : (
                          <User className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${style.className}`}>
                            {style.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {entry.table_name}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">
                            {entry.profile_name || (isSystem ? 'System' : 'User')}
                          </span>
                          {' '}
                          <span className="text-muted-foreground">
                            {style.label.toLowerCase()} a {entry.table_name.replace(/_/g, ' ')} record
                          </span>
                        </div>
                        {changeSummary && (
                          <p className="text-xs text-muted-foreground">{changeSummary}</p>
                        )}
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.created_at), 'MMM d, HH:mm')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
        {entries.length >= limit && !showAll && (
          <div className="p-2 text-center border-t">
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              <ChevronDown className="h-4 w-4 mr-1" />
              Show more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
