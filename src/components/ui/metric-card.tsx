import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}

export function MetricCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  className,
  children,
}: MetricCardProps) {
  return (
    <div className={cn('metric-card', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {change && (
            <p
              className={cn(
                'text-sm mt-1',
                changeType === 'positive' && 'text-success',
                changeType === 'negative' && 'text-destructive',
                changeType === 'neutral' && 'text-muted-foreground'
              )}
            >
              {change}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
