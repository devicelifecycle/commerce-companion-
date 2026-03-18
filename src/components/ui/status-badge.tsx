import { cn } from '@/lib/utils';

type StatusType = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'hold_for_refurbishment';
type MarketplaceType = 'shopify' | 'amazon' | 'bestbuy' | 'other';
type ConditionType = 'new' | 'refurbished' | 'used' | 'damaged';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusLabels: Record<StatusType, string> = {
  in_stock: 'In Stock',
  reserved: 'Reserved',
  sold: 'Sold',
  returned: 'Returned',
  hold_for_refurbishment: 'Hold for Refurb',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'status-badge',
        status === 'in_stock' && 'status-in-stock',
        status === 'reserved' && 'status-reserved',
        status === 'sold' && 'status-sold',
        status === 'returned' && 'status-returned',
        status === 'hold_for_refurbishment' && 'bg-violet-500/15 text-violet-600',
        className
      )}
    >
      {statusLabels[status] || status}
    </span>
  );
}

interface MarketplaceBadgeProps {
  marketplace: MarketplaceType;
  className?: string;
}

const marketplaceLabels: Record<MarketplaceType, string> = {
  shopify: 'Shopify',
  amazon: 'Amazon',
  bestbuy: 'Best Buy',
  other: 'Other',
};

export function MarketplaceBadge({ marketplace, className }: MarketplaceBadgeProps) {
  return (
    <span
      className={cn(
        'status-badge',
        marketplace === 'shopify' && 'marketplace-shopify',
        marketplace === 'amazon' && 'marketplace-amazon',
        marketplace === 'bestbuy' && 'marketplace-bestbuy',
        marketplace === 'other' && 'bg-muted text-muted-foreground',
        className
      )}
    >
      {marketplaceLabels[marketplace]}
    </span>
  );
}

interface ConditionBadgeProps {
  condition: ConditionType;
  className?: string;
}

const conditionLabels: Record<ConditionType, string> = {
  new: 'New',
  refurbished: 'Refurbished',
  used: 'Used',
  damaged: 'Damaged',
};

const conditionStyles: Record<ConditionType, string> = {
  new: 'bg-success/15 text-success',
  refurbished: 'bg-info/15 text-info',
  used: 'bg-warning/15 text-warning',
  damaged: 'bg-destructive/15 text-destructive',
};

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  return (
    <span className={cn('status-badge', conditionStyles[condition], className)}>
      {conditionLabels[condition]}
    </span>
  );
}

type FulfillmentStatusType = 'received' | 'pending' | 'shipped' | 'delivered' | 'cancelled';

interface FulfillmentBadgeProps {
  status: FulfillmentStatusType;
  className?: string;
}

const fulfillmentLabels: Record<FulfillmentStatusType, string> = {
  received: 'Received',
  pending: 'Pending',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const fulfillmentStyles: Record<FulfillmentStatusType, string> = {
  received: 'bg-info/15 text-info',
  pending: 'bg-warning/15 text-warning',
  shipped: 'bg-success/15 text-success',
  delivered: 'bg-emerald-500/15 text-emerald-600',
  cancelled: 'bg-destructive/15 text-destructive',
};

export function FulfillmentBadge({ status, className }: FulfillmentBadgeProps) {
  const safeStatus = fulfillmentLabels[status] ? status : 'received';
  return (
    <span className={cn('status-badge', fulfillmentStyles[safeStatus], className)}>
      {fulfillmentLabels[safeStatus]}
    </span>
  );
}

// Marketplace-specific status badge - shows the raw status from each marketplace
interface MarketplaceStatusBadgeProps {
  marketplace: string;
  marketplaceStatus: string | null;
  className?: string;
}

// Color mapping for marketplace-specific statuses
function getMarketplaceStatusStyle(marketplace: string, status: string): string {
  const s = status?.toUpperCase() || '';
  
  // Common patterns across marketplaces
  if (s.includes('CANCEL') || s.includes('REFUSED') || s.includes('VOID')) 
    return 'bg-destructive/15 text-destructive';
  if (s.includes('REFUND')) 
    return 'bg-orange-500/15 text-orange-600';
  if (s.includes('DELIVER') || s === 'CLOSED' || s === 'RECEIVED' || s.includes('FULFILLED'))
    return 'bg-emerald-500/15 text-emerald-600';
  if (s.includes('SHIP') || s === 'SHIPPING')
    return 'bg-success/15 text-success';
  if (s.includes('PAID') || s.includes('AUTHORIZED'))
    return 'bg-blue-500/15 text-blue-600';
  if (s.includes('PENDING') || s.includes('WAITING') || s.includes('STAGING') || s.includes('UNSHIPPED'))
    return 'bg-warning/15 text-warning';
  
  return 'bg-muted text-muted-foreground';
}

function formatMarketplaceStatus(status: string): string {
  // Convert UPPER_CASE or camelCase to readable format
  return status
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function MarketplaceStatusBadge({ marketplace, marketplaceStatus, className }: MarketplaceStatusBadgeProps) {
  if (!marketplaceStatus) {
    return (
      <span className={cn('status-badge bg-muted text-muted-foreground', className)}>
        Unknown
      </span>
    );
  }
  
  return (
    <span className={cn('status-badge', getMarketplaceStatusStyle(marketplace, marketplaceStatus), className)}>
      {formatMarketplaceStatus(marketplaceStatus)}
    </span>
  );
}
