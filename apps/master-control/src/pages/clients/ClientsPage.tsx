import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Search, Plus, Eye, LogIn, Clock, ArrowUpRight, Ban, CheckCircle2, Building2, Users, MapPin, DollarSign } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, StatCard } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { platformApi } from '@/api/platform';
import { brand } from '@/config/brand.config';
import { useAuth } from '@/auth/AuthContext';
import { PlatformCapabilityGate } from '@/auth/PlatformCapabilityGate';
import { canAnyPlatform, DEFAULT_GRANTED_ACCESS_SCOPES, PlatformCapability } from '@geolandpro/rbac';
import { formatCurrency, formatDate } from '@/utils/format';
import { getApiError } from '@/api/client';
import type { AccessRequestStatus, OrgAccessRequest } from '@/types';

const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL as string | undefined) ?? 'http://localhost:5173';

const TERMINAL_ACCESS_REQUEST_STATUSES = new Set<AccessRequestStatus>(['DENIED', 'EXPIRED', 'REVOKED', 'ENDED']);

/** Status-aware row action: request access, show pending state, or hand off to apps/web. */
function OrgAccessAction({
  accessRequest,
  onRequestAccess,
  requesting,
}: {
  accessRequest: OrgAccessRequest | undefined;
  onRequestAccess: () => void;
  requesting: boolean;
}) {
  if (accessRequest?.status === 'PENDING') {
    return (
      <span className="p-1.5 text-amber-500" title="Pending — waiting for landowner to accept">
        <Clock size={15} />
      </span>
    );
  }

  if (accessRequest?.status === 'APPROVED' || accessRequest?.status === 'ACTIVE') {
    return (
      <a
        href={`${WEB_APP_URL}/access-requests`}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50"
        title="Continue in app"
      >
        <ArrowUpRight size={15} />
      </a>
    );
  }

  return (
    <button
      onClick={onRequestAccess}
      disabled={requesting}
      className="p-1.5 rounded text-brand-500 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed"
      title="Request access"
    >
      <LogIn size={15} />
    </button>
  );
}

export function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [actionError, setActionError] = useState('');

  const canRequestAccess = canAnyPlatform(user?.platformRole, [PlatformCapability.ORG_IMPERSONATE]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => platformApi.getStats(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['platform-organisations', { page, search }],
    queryFn: () => platformApi.listOrganisations({ page, limit: 15, search: search || undefined }),
  });

  const { data: myAccessRequests } = useQuery({
    queryKey: ['my-access-requests'],
    queryFn: () => platformApi.listMyAccessRequests({ limit: 100 }),
    enabled: canRequestAccess,
  });

  // Latest non-terminal access request per organisation, for the row action.
  const accessRequestByOrgId = useMemo(() => {
    const map = new Map<string, OrgAccessRequest>();
    for (const req of myAccessRequests?.data ?? []) {
      if (TERMINAL_ACCESS_REQUEST_STATUSES.has(req.status)) continue;
      const existing = map.get(req.organisationId);
      if (!existing || new Date(req.createdAt) > new Date(existing.createdAt)) {
        map.set(req.organisationId, req);
      }
    }
    return map;
  }, [myAccessRequests]);

  const suspendMutation = useMutation({
    mutationFn: platformApi.suspendOrganisation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-organisations'] }),
    onError: (err) => setActionError(getApiError(err)),
  });

  const activateMutation = useMutation({
    mutationFn: platformApi.activateOrganisation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-organisations'] }),
    onError: (err) => setActionError(getApiError(err)),
  });

  const requestAccessMutation = useMutation({
    // Lightweight-now: request the landowner's default grant; the landowner
    // narrows scopes to least privilege at Accept time (ApproveModal,
    // apps/web). Per-request scope selection in Master Control is a future
    // enhancement.
    mutationFn: (organisationId: string) =>
      platformApi.createAccessRequest(organisationId, {
        requestedScopes: [...DEFAULT_GRANTED_ACCESS_SCOPES],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-access-requests'] }),
    onError: (err) => setActionError(getApiError(err)),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div>
      <Header
        title="Client Management"
        subtitle={`${brand.name} — organisations on the platform`}
        actions={
          <PlatformCapabilityGate capabilities={[PlatformCapability.ORG_CREATE]}>
            <Button size="sm" onClick={() => navigate('/clients/new')}>
              <Plus size={16} /> New Organisation
            </Button>
          </PlatformCapabilityGate>
        }
      />

      <div className="p-6 space-y-4">
        {actionError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Stats */}
        {statsLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Organisations" value={`${stats.activeOrganisations} / ${stats.totalOrganisations}`} icon={<Globe size={20} />} />
            <StatCard label="Total Users" value={stats.totalUsers} icon={<Users size={20} />} />
            <StatCard label="Total Properties" value={stats.totalProperties} icon={<MapPin size={20} />} />
            <StatCard label="Revenue This Month" value={formatCurrency(stats.totalRevenueThisMonthGHS)} icon={<DollarSign size={20} />} />
          </div>
        ) : null}

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search organisations by name or slug…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-72"
          />
          <button type="submit" className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700">
            <Search size={18} />
          </button>
        </form>

        <Card>
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : !data?.data.length ? (
            <div className="text-center py-16">
              <Globe size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No organisations found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Organisation</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Plan</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Users</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Properties</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Last Active</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.data.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 flex-shrink-0">
                            <Building2 size={15} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{org.name}</p>
                            <p className="text-xs text-slate-500 truncate">{org.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3"><Badge variant="purple">{org.subscriptionTier}</Badge></td>
                      <td className="px-6 py-3 text-slate-600">{org.userCount} / {org.maxUsers}</td>
                      <td className="px-6 py-3 text-slate-600">{org.propertyCount} / {org.maxProperties}</td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(org.lastActiveAt)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          org.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {org.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(`/clients/${org.id}`)}
                            className="p-1.5 rounded text-slate-400 hover:bg-slate-100"
                            title="View details"
                          >
                            <Eye size={15} />
                          </button>
                          <PlatformCapabilityGate capabilities={[PlatformCapability.ORG_IMPERSONATE]}>
                            <OrgAccessAction
                              accessRequest={accessRequestByOrgId.get(org.id)}
                              onRequestAccess={() => requestAccessMutation.mutate(org.id)}
                              requesting={requestAccessMutation.isPending && requestAccessMutation.variables === org.id}
                            />
                          </PlatformCapabilityGate>
                          <PlatformCapabilityGate capabilities={[PlatformCapability.ORG_MANAGE]}>
                            {org.isActive ? (
                              <button
                                onClick={() => suspendMutation.mutate(org.id)}
                                className="p-1.5 rounded text-red-400 hover:bg-red-50"
                                title="Suspend"
                              >
                                <Ban size={15} />
                              </button>
                            ) : (
                              <button
                                onClick={() => activateMutation.mutate(org.id)}
                                className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50"
                                title="Activate"
                              >
                                <CheckCircle2 size={15} />
                              </button>
                            )}
                          </PlatformCapabilityGate>
                        </div>
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
    </div>
  );
}
