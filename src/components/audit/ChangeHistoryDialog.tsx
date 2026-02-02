import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { History, Clock, ArrowRight, User } from 'lucide-react';

interface ChangeHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  recordId: string;
  title?: string;
}

interface HistoryEntry {
  id: string;
  action: string;
  old_data: any;
  new_data: any;
  created_at: string;
  user_id: string | null;
}

export function ChangeHistoryDialog({
  open,
  onOpenChange,
  tableName,
  recordId,
  title = 'Change History',
}: ChangeHistoryDialogProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && recordId) {
      fetchHistory();
    }
  }, [open, recordId, tableName]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, old_data, new_data, created_at, user_id')
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'INSERT': return 'bg-emerald-500';
      case 'UPDATE': return 'bg-amber-500';
      case 'DELETE': return 'bg-destructive';
      default: return 'bg-muted-foreground';
    }
  };

  const getChangedFields = (oldData: any, newData: any) => {
    if (!oldData && newData) {
      return Object.keys(newData).map(key => ({
        field: key,
        oldValue: null,
        newValue: newData[key],
      }));
    }
    if (oldData && !newData) {
      return Object.keys(oldData).map(key => ({
        field: key,
        oldValue: oldData[key],
        newValue: null,
      }));
    }

    const changes: { field: string; oldValue: any; newValue: any }[] = [];
    const allKeys = new Set([
      ...Object.keys(oldData || {}),
      ...Object.keys(newData || {}),
    ]);

    allKeys.forEach(key => {
      const oldVal = oldData?.[key];
      const newVal = newData?.[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field: key, oldValue: oldVal, newValue: newVal });
      }
    });

    return changes;
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No change history found</p>
            </div>
          ) : (
            <div className="relative space-y-6 pr-4">
              {/* Timeline line */}
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

              {history.map((entry, index) => {
                const changes = getChangedFields(entry.old_data, entry.new_data);
                
                return (
                  <div key={entry.id} className="relative pl-10">
                    {/* Timeline dot */}
                    <div className={`absolute left-1 top-1 w-5 h-5 rounded-full ${getActionColor(entry.action)} flex items-center justify-center`}>
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>

                    <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={getActionColor(entry.action)}>
                            {entry.action}
                          </Badge>
                          {index === 0 && (
                            <Badge variant="outline" className="text-xs">Latest</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(entry.created_at), 'MMM d, yyyy HH:mm')}
                        </div>
                      </div>

                      {/* User */}
                      {entry.user_id && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span className="font-mono">{entry.user_id.slice(0, 8)}...</span>
                        </div>
                      )}

                      {/* Changes */}
                      {changes.length > 0 && (
                        <div className="space-y-2">
                          {changes.slice(0, 8).map((change, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <span className="font-medium text-muted-foreground min-w-[120px]">
                                {change.field}:
                              </span>
                              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                {change.oldValue !== null && (
                                  <span className="bg-destructive/10 text-destructive px-1 rounded text-xs truncate max-w-[150px]">
                                    {formatValue(change.oldValue)}
                                  </span>
                                )}
                                {change.oldValue !== null && change.newValue !== null && (
                                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                )}
                                {change.newValue !== null && (
                                  <span className="bg-emerald-500/10 text-emerald-600 px-1 rounded text-xs truncate max-w-[150px]">
                                    {formatValue(change.newValue)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                          {changes.length > 8 && (
                            <p className="text-xs text-muted-foreground">
                              +{changes.length - 8} more changes
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
