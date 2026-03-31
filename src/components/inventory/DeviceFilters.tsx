import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Download } from 'lucide-react';

const CATEGORIES = ['phone', 'laptop', 'tablet', 'accessory', 'smartwatch', 'other'];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All', color: 'bg-muted text-muted-foreground' },
  { value: 'in_stock', label: 'In Stock', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  { value: 'reserved', label: 'Reserved', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30' },
  { value: 'hold_for_refurbishment', label: 'Hold for Refurb', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  { value: 'sold', label: 'Sold', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30' },
  { value: 'returned', label: 'Returned', color: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' },
];

interface DeviceFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  channelFilter: string;
  onChannelChange: (value: string) => void;
  onExport: () => void;
}

export function DeviceFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  channelFilter,
  onChannelChange,
  onExport,
}: DeviceFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Quick-filter status chips */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = statusFilter === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onStatusChange(opt.value)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-all cursor-pointer
                ${isActive
                  ? `${opt.color} ring-2 ring-primary/30 shadow-sm`
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:border-border'
                }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Search + secondary filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by model, IMEI, SKU..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={onCategoryChange}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={onChannelChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="local">Local Warehouse</SelectItem>
            <SelectItem value="fba">At FBA</SelectItem>
            <SelectItem value="in_transit_fba">In Transit to FBA</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
    </div>
  );
}
