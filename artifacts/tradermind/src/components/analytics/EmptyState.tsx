/**
 * EmptyState.tsx — حالت خالی مشترک
 *
 * قبلاً:
 *   Reports       → EmptyState (L51)
 *   EdgeAnalytics → EmptyState (L107)
 *   PerformanceDashboard → inline
 *   AdvancedAnalytics    → inline
 */
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';
import { Button } from '../ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** اگر CTA لازم است */
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: { wrapper: 'py-8', icon: 'h-8 w-8', iconBox: 'w-10 h-10', title: 'text-sm', desc: 'text-xs' },
  md: { wrapper: 'py-14', icon: 'h-7 w-7', iconBox: 'w-14 h-14', title: 'text-base', desc: 'text-sm' },
  lg: { wrapper: 'py-20', icon: 'h-9 w-9', iconBox: 'w-18 h-18', title: 'text-lg', desc: 'text-sm' },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
  size = 'md',
}: EmptyStateProps) {
  const s = sizes[size];
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center gap-3',
      s.wrapper,
      className,
    )}>
      {Icon && (
        <div className={cn(
          'rounded-full bg-muted/50 flex items-center justify-center shrink-0',
          s.iconBox,
        )}>
          <Icon className={cn('text-muted-foreground', s.icon)} />
        </div>
      )}
      <div>
        <h3 className={cn('font-semibold', s.title)}>{title}</h3>
        {description && (
          <p className={cn('text-muted-foreground mt-1 max-w-sm', s.desc)}>
            {description}
          </p>
        )}
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
