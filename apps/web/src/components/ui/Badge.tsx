import { cn } from '@/utils/cn';
import { accessRequestStatusLabel } from '@/utils/format';
import type { AccessRequestStatus, PlotStatus, LeaseStatus, TransactionStatus, Role } from '@/types';

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

export function PlotStatusBadge({ status }: { status: PlotStatus }) {
  const map: Record<PlotStatus, { variant: Variant; label: string }> = {
    VACANT:       { variant: 'green',  label: 'Vacant' },
    OCCUPIED:     { variant: 'blue',   label: 'Occupied' },
    DISPUTED:     { variant: 'red',    label: 'Disputed' },
    RESERVED:     { variant: 'yellow', label: 'Reserved' },
    UNDER_SURVEY: { variant: 'orange', label: 'Under Survey' },
  };
  const { variant, label } = map[status] ?? { variant: 'slate' as Variant, label: status };
  return <Badge variant={variant}>{label}</Badge>;
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

export function TxStatusBadge({ status }: { status: TransactionStatus }) {
  const map: Record<TransactionStatus, { variant: Variant; label: string }> = {
    PENDING:   { variant: 'yellow', label: 'Pending' },
    COMPLETED: { variant: 'green',  label: 'Completed' },
    FAILED:    { variant: 'red',    label: 'Failed' },
    REVERSED:  { variant: 'slate',  label: 'Reversed' },
  };
  const { variant, label } = map[status] ?? { variant: 'slate' as Variant, label: status };
  return <Badge variant={variant}>{label}</Badge>;
}

export function AccessRequestStatusBadge({ status }: { status: AccessRequestStatus }) {
  const map: Record<AccessRequestStatus, Variant> = {
    PENDING: 'yellow',
    APPROVED: 'blue',
    DENIED: 'red',
    ACTIVE: 'green',
    EXPIRED: 'slate',
    REVOKED: 'red',
    ENDED: 'slate',
  };
  return <Badge variant={map[status] ?? 'slate'}>{accessRequestStatusLabel(status)}</Badge>;
}

export function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, { variant: Variant; label: string }> = {
    SUPER_ADMIN:    { variant: 'purple', label: 'Super Admin' },
    ADMIN:          { variant: 'blue',   label: 'Admin' },
    MANAGER:        { variant: 'green',  label: 'Manager' },
    FIELD_SURVEYOR: { variant: 'orange', label: 'Field Surveyor' },
    TENANT:         { variant: 'slate',  label: 'Tenant' },
  };
  const { variant, label } = map[role] ?? { variant: 'slate' as Variant, label: role };
  return <Badge variant={variant}>{label}</Badge>;
}
