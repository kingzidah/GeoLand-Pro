import { cn } from '@/utils/cn';

type Variant = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'slate' | 'orange';

const variants: Record<Variant, string> = {
  green:  'bg-emerald-100 text-emerald-700',
  red:    'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue:   'bg-blue-100 text-blue-700',
  purple: 'bg-violet-100 text-violet-700',
  slate:  'bg-slate-100 text-slate-600',
  orange: 'bg-orange-100 text-orange-700',
};

interface Props {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'slate', children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
