import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, ChevronRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { LeaseStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { leasesApi } from '@/api/leases';
import { propertiesApi } from '@/api/properties';
import { tenantsApi } from '@/api/tenants';
import { getApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { hasMinRole } from '@geolandpro/rbac';
import { formatCurrency, formatDate } from '@/utils/format';
import type { LeaseStatus } from '@/types';

const STATUS_TABS: { label: string; value: LeaseStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING_SIGNATURE' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Terminated', value: 'TERMINATED' },
];

const EMPTY_FORM = {
  propertyId: '',
  plotId: '',
  tenantUserId: '',
  startDate: '',
  endDate: '',
  monthlyRentGHS: '',
  depositAmountGHS: '',
};

const selectClass =
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 border-slate-300 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-400';

function AddLeaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data: properties } = useQuery({
    queryKey: ['properties', 'all-for-lease'],
    queryFn: () => propertiesApi.list({ limit: 100 }),
    enabled: open,
  });

  const { data: vacantPlots } = useQuery({
    queryKey: ['plots', form.propertyId, 'vacant'],
    queryFn: () => propertiesApi.listPlots(form.propertyId, { status: 'VACANT', limit: 100 }),
    enabled: open && !!form.propertyId,
  });

  const { data: tenants } = useQuery({
    queryKey: ['tenants', 'all-for-lease'],
    queryFn: () => tenantsApi.list({ limit: 100 }),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      leasesApi.create({
        plotId: form.plotId,
        tenantUserId: form.tenantUserId,
        startDate: form.startDate,
        endDate: form.endDate,
        monthlyRentGHS: Number(form.monthlyRentGHS),
        depositAmountGHS: form.depositAmountGHS ? Number(form.depositAmountGHS) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leases'] });
      setForm(EMPTY_FORM);
      onClose();
    },
  });

  const handleClose = () => {
    createMutation.reset();
    setForm(EMPTY_FORM);
    onClose();
  };

  const isValid =
    form.propertyId &&
    form.plotId &&
    form.tenantUserId &&
    form.startDate &&
    form.endDate &&
    Number(form.monthlyRentGHS) > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Create Lease" size="md">
      <div className="space-y-4">
        {createMutation.error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {getApiError(createMutation.error)}
          </div>
        )}

        <div>
          <label htmlFor="lease-property" className="form-label">Property</label>
          <select
            id="lease-property"
            className={selectClass}
            value={form.propertyId}
            onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value, plotId: '' }))}
          >
            <option value="">Select a property…</option>
            {properties?.data.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="lease-plot" className="form-label">Vacant Plot</label>
          <select
            id="lease-plot"
            className={selectClass}
            value={form.plotId}
            disabled={!form.propertyId}
            onChange={(e) => setForm((f) => ({ ...f, plotId: e.target.value }))}
          >
            <option value="">
              {form.propertyId ? 'Select a vacant plot…' : 'Select a property first'}
            </option>
            {vacantPlots?.data.map((plot) => (
              <option key={plot.id} value={plot.id}>{plot.plotNumber}</option>
            ))}
          </select>
          {form.propertyId && vacantPlots && vacantPlots.data.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">No vacant plots on this property.</p>
          )}
        </div>

        <div>
          <label htmlFor="lease-tenant" className="form-label">Tenant</label>
          <select
            id="lease-tenant"
            className={selectClass}
            value={form.tenantUserId}
            onChange={(e) => setForm((f) => ({ ...f, tenantUserId: e.target.value }))}
          >
            <option value="">Select a tenant…</option>
            {tenants?.data.map((t) => (
              <option key={t.userId} value={t.userId}>
                {t.user.firstName} {t.user.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />
          <Input
            label="End date"
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Monthly rent (GHS)"
            type="number"
            min={0}
            placeholder="e.g. 1500"
            value={form.monthlyRentGHS}
            onChange={(e) => setForm((f) => ({ ...f, monthlyRentGHS: e.target.value }))}
          />
          <Input
            label="Deposit (GHS, optional)"
            type="number"
            min={0}
            placeholder="e.g. 3000"
            value={form.depositAmountGHS}
            onChange={(e) => setForm((f) => ({ ...f, depositAmountGHS: e.target.value }))}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button loading={createMutation.isPending} disabled={!isValid} onClick={() => createMutation.mutate()}>
            Create Lease
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function LeasesPage() {
  const { user, impersonation } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LeaseStatus | ''>('');
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['leases', { page, status }],
    queryFn: () => leasesApi.list({ page, limit: 15, status: status || undefined }),
  });

  const canCreate = hasMinRole(user?.role, 'MANAGER') && !impersonation;

  return (
    <div>
      <Header
        title="Leases"
        subtitle={`${data?.meta.total ?? 0} lease agreements`}
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Create Lease
            </Button>
          )
        }
      />

      <div className="p-6 space-y-4">
        {/* Status filter tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                status === tab.value
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card>
          {isLoading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : !data?.data.length ? (
            <EmptyState
              icon={<FileText size={22} />}
              title="No lease agreements"
              description="Create a lease to link a tenant to a plot and start tracking rent payments"
              actionLabel={canCreate ? '+ Create Lease' : undefined}
              onAction={canCreate ? () => setAddOpen(true) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Lease #</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Tenant</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Property / Plot</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Monthly Rent</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Arrears</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Expires</th>
                    <th className="px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.data.map((lease) => (
                    <tr
                      key={lease.id}
                      onClick={() => navigate(`/leases/${lease.id}`)}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono text-xs text-slate-700">{lease.leaseNumber}</td>
                      <td className="px-6 py-3 text-slate-700">
                        {lease.tenant
                          ? `${lease.tenant.user.firstName} ${lease.tenant.user.lastName}`
                          : '—'}
                      </td>
                      <td className="px-6 py-3 text-slate-600 text-xs">
                        {lease.plot
                          ? `${lease.plot.property.name} / ${lease.plot.plotNumber}`
                          : '—'}
                      </td>
                      <td className="px-6 py-3"><LeaseStatusBadge status={lease.status} /></td>
                      <td className="px-6 py-3">{formatCurrency(lease.monthlyRentGHS)}</td>
                      <td className="px-6 py-3">
                        {lease.arrearsGHS > 0
                          ? <span className="text-red-600 font-medium">{formatCurrency(lease.arrearsGHS)}</span>
                          : <span className="text-slate-400">—</span>
                        }
                      </td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(lease.endDate)}</td>
                      <td className="px-6 py-3">
                        <span className="flex items-center gap-1 text-brand-600 text-xs font-medium">
                          View <ChevronRight size={14} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-center p-4">
                <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <AddLeaseModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
