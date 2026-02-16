import { cn } from '@/lib/utils';

type StatusType = 'in_stock' | 'reserved' | 'sold' | 'returned';
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
        className
      )}
    >
      {statusLabels[status]}
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
