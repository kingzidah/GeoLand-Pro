import { format, parseISO, isValid } from 'date-fns';
import type { AccessScope } from '@geolandpro/rbac';
import type { AccessRequestStatus, PlotStatus, LeaseStatus, TransactionStatus, Role } from '@/types';

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

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

export function plotStatusLabel(status: PlotStatus): string {
  const map: Record<PlotStatus, string> = {
    VACANT: 'Vacant',
    OCCUPIED: 'Occupied',
    DISPUTED: 'Disputed',
    RESERVED: 'Reserved',
    UNDER_SURVEY: 'Under Survey',
  };
  return map[status] ?? status;
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

export function txStatusLabel(status: TransactionStatus): string {
  const map: Record<TransactionStatus, string> = {
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    REVERSED: 'Reversed',
  };
  return map[status] ?? status;
}

export function roleLabel(role: Role): string {
  const map: Record<Role, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    FIELD_SURVEYOR: 'Field Surveyor',
    TENANT: 'Tenant',
  };
  return map[role] ?? role;
}

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
}

export function accessScopeLabel(scope: AccessScope): string {
  const map: Record<AccessScope, string> = {
    PLOTS: 'Properties & Plots',
    SATELLITE: 'Satellite',
    LEASES: 'Leases',
    TENANTS: 'Tenants',
    FINANCE: 'Finance',
    DOCUMENTS: 'Documents',
  };
  return map[scope] ?? scope;
}

export function accessRequestStatusLabel(status: AccessRequestStatus): string {
  const map: Record<AccessRequestStatus, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    DENIED: 'Denied',
    ACTIVE: 'Active',
    EXPIRED: 'Expired',
    REVOKED: 'Revoked',
    ENDED: 'Ended',
  };
  return map[status] ?? status;
}
