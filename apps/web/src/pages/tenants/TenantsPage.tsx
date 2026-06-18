import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ChevronRight, Copy, Check } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { tenantsApi } from '@/api/tenants';
import { organisationApi } from '@/api/organisation';
import { getApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { hasMinRole } from '@geolandpro/rbac';
import { formatDate } from '@/utils/format';

function AddTenantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () => organisationApi.createInvite({ role: 'TENANT', expiresInDays: 7 }),
  });

  const handleClose = () => {
    inviteMutation.reset();
    setCopied(false);
    onClose();
  };

  const handleCopy = async () => {
    if (!inviteMutation.data) return;
    await navigator.clipboard.writeText(inviteMutation.data.link);
    setCopied(true);
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Tenant" size="sm">
      {inviteMutation.data ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Share this invite link with the tenant. It expires{' '}
            {formatDate(inviteMutation.data.expiresAt)}.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 break-all">
              {inviteMutation.data.link}
            </code>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </Button>
          </div>
          <div className="flex justify-end pt-1">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {inviteMutation.error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {getApiError(inviteMutation.error)}
            </div>
          )}
          <p className="text-sm text-slate-500">
            Generate an invite link for a new tenant. They'll use it to register and complete their KYC profile.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={handleClose} disabled={inviteMutation.isPending}>
              Cancel
            </Button>
            <Button loading={inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
              Generate Invite Link
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function TenantsPage() {
  const { user, impersonation } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', { page, search }],
    queryFn: () => tenantsApi.list({ page, limit: 15, search: search || undefined }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const canCreate = hasMinRole(user?.role, 'SUPER_ADMIN') && !impersonation;

  return (
    <div>
      <Header
        title="Tenants"
        subtitle={`${data?.meta.total ?? 0} registered tenants`}
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Add Tenant
            </Button>
          )
        }
      />

      <div className="p-6 space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2 max-w-sm">
          <Input
            placeholder="Search by name or ID number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button
            type="submit"
            aria-label="Search"
            className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700"
          >
            <Search size={18} />
          </button>
        </form>

        <Card>
          {isLoading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : !data?.data.length ? (
            <EmptyState
              icon={<Users size={22} />}
              title="No tenants registered"
              description="Add tenants to assign them to plots and manage their leases"
              actionLabel={canCreate ? '+ Add Tenant' : undefined}
              onAction={canCreate ? () => setAddOpen(true) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Tenant</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">ID Type</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">ID Number</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Occupation</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Registered</th>
                    <th className="px-6 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.data.map((tenant) => (
                    <tr
                      key={tenant.id}
                      onClick={() => navigate(`/tenants/${tenant.id}`)}
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                            {tenant.user.firstName[0]}{tenant.user.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {tenant.user.firstName} {tenant.user.lastName}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{tenant.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-slate-600">{tenant.nationalIdType}</td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-600">{tenant.nationalIdNumber}</td>
                      <td className="px-6 py-3 text-slate-600">{tenant.occupation ?? '—'}</td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(tenant.createdAt)}</td>
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

      <AddTenantModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
