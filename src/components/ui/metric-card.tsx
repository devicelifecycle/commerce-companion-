import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: LucideIcon;
  iconClassName?: string;
  className?: string;
  children?: ReactNode;
}

export function MetricCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  iconClassName,
  className,
  children,
}: MetricCardProps) {
  return (
    <div className={cn('metric-card group', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold font-display mt-1">{value}</p>
          {change && (
            <p
              className={cn(
                'text-sm mt-2 flex items-center gap-1',
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
          <div className={cn(
            'p-3 rounded-xl bg-primary/10 group-hover:scale-110 transition-transform',
            iconClassName
          )}>
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
