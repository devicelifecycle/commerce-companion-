import { X, Trash2, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowRightLeft } from 'lucide-react';

interface BatchAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline';
}

interface StatusOption {
  value: string;
  label: string;
}

interface BatchActionBarProps {
  count: number;
  onClear: () => void;
  actions: BatchAction[];
  statusActions?: {
    onStatusChange: (status: any) => void;
    options: StatusOption[];
  };
}

export function BatchActionBar({ count, onClear, actions, statusActions }: BatchActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-50 flex items-center justify-between gap-3 rounded-lg border bg-background/95 backdrop-blur px-4 py-3 shadow-lg mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{count} selected</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {statusActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <ArrowRightLeft className="h-4 w-4 mr-1" />
                Change Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {statusActions.options.map((opt) => (
                <DropdownMenuItem key={opt.value} onClick={() => statusActions.onStatusChange(opt.value)}>
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {actions.map((action, i) => (
          <Button
            key={i}
            size="sm"
            variant={action.variant || 'outline'}
            onClick={action.onClick}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// Helper to generate CSV and download
export function exportToCsv(headers: string[], rows: (string | number)[][], filename: string) {
  const escapeCsv = (val: string | number) => {
    const str = String(val);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(r => r.map(escapeCsv).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
