import { cn } from '@/utils/cn';
import type { LeaseStatus, DocumentType, NotificationStatus } from '@/types';

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

export function LeaseStatusBadge({ status }: { status: LeaseStatus }) {
  const map: Record<LeaseStatus, { variant: Variant; label: string }> = {
    PENDING_SIGNATURE: { variant: 'yellow', label: 'Pending Signature' },
    ACTIVE:            { variant: 'green',  label: 'Active' },
    EXPIRED:           { variant: 'slate',  label: 'Expired' },
    TERMINATED:        { variant: 'red',    label: 'Terminated' },
  };
  const { variant, label } = map[status] ?? { variant: 'slate' as Variant, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

export function DocumentTypeBadge({ type }: { type: DocumentType }) {
  const map: Record<DocumentType, { variant: Variant; label: string }> = {
    BOUNDARY_CERTIFICATE: { variant: 'blue',   label: 'Boundary Certificate' },
    TENANCY_AGREEMENT:    { variant: 'green',  label: 'Tenancy Agreement' },
    RENT_RECEIPT:         { variant: 'purple', label: 'Rent Receipt' },
    ARREARS_NOTICE:       { variant: 'red',    label: 'Arrears Notice' },
  };
  const { variant, label } = map[type] ?? { variant: 'slate' as Variant, label: type };
  return <Badge variant={variant}>{label}</Badge>;
}

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  const map: Record<NotificationStatus, { variant: Variant; label: string }> = {
    QUEUED:    { variant: 'slate',  label: 'Queued' },
    SENT:      { variant: 'blue',   label: 'Sent' },
    DELIVERED: { variant: 'green',  label: 'Delivered' },
    FAILED:    { variant: 'red',    label: 'Failed' },
  };
  const { variant, label } = map[status] ?? { variant: 'slate' as Variant, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}
