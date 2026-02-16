import { X, Trash2, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BatchAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline';
}

interface BatchActionBarProps {
  count: number;
  onClear: () => void;
  actions: BatchAction[];
}

export function BatchActionBar({ count, onClear, actions }: BatchActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-50 flex items-center justify-between gap-3 rounded-lg border bg-background/95 backdrop-blur px-4 py-3 shadow-lg mx-auto max-w-2xl">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{count} selected</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
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
