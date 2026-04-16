import { useState } from 'react';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActivityLog } from './ActivityLog';
import { Link } from 'react-router-dom';

interface ActivityFooterProps {
  module?: string;
  tableNames?: string[];
  defaultOpen?: boolean;
  limit?: number;
}

/**
 * Collapsible footer that shows recent activity for the current page/module.
 * Drop in at the bottom of any page.
 */
export function ActivityFooter({ module, tableNames, defaultOpen = false, limit = 10 }: ActivityFooterProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="mt-6 border-dashed">
      <div className="flex items-center justify-between p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          <Activity className="h-4 w-4" />
          <span className="text-sm font-medium">
            Recent Activity{module ? ` · ${module}` : ''}
          </span>
        </Button>
        <Link to="/activity" className="text-xs text-primary hover:underline">
          View all →
        </Link>
      </div>
      {open && (
        <div className="px-3 pb-3">
          <ActivityLog
            module={module}
            tableNames={tableNames}
            compact
            showFilters={false}
            showHeader={false}
            limit={limit}
            defaultDays={7}
          />
        </div>
      )}
    </Card>
  );
}
