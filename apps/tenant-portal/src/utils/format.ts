import { format, parseISO, isValid } from 'date-fns';
import type { LeaseStatus, DocumentType } from '@/types';

export function formatCurrency(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, 'dd MMM yyyy') : '—';
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, 'dd MMM yyyy HH:mm') : '—';
}

export function formatArea(sqm: number): string {
  return sqm >= 10_000
    ? `${(sqm / 10_000).toFixed(2)} ha`
    : `${sqm.toLocaleString()} m²`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function leaseStatusLabel(status: LeaseStatus): string {
  const map: Record<LeaseStatus, string> = {
    PENDING_SIGNATURE: 'Pending Signature',
    ACTIVE: 'Active',
    EXPIRED: 'Expired',
    TERMINATED: 'Terminated',
  };
  return map[status] ?? status;
}

export function documentTypeLabel(type: DocumentType): string {
  const map: Record<DocumentType, string> = {
    BOUNDARY_CERTIFICATE: 'Boundary Certificate',
    TENANCY_AGREEMENT: 'Tenancy Agreement',
    RENT_RECEIPT: 'Rent Receipt',
    ARREARS_NOTICE: 'Arrears Notice',
  };
  return map[type] ?? type;
}

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
}
