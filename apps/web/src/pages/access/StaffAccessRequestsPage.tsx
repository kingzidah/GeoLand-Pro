import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogIn, LogOut } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { AccessRequestStatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/auth/AuthContext';
import { accessRequestsApi } from '@/api/accessRequests';
import { getApiError } from '@/api/client';
import { accessScopeLabel, accessRequestStatusLabel, formatDateTime } from '@/utils/format';
import { firstGrantedRoute } from '@/utils/impersonation';
import {
  ALL_ACCESS_SCOPES,
  DEFAULT_GRANTED_ACCESS_SCOPES,
  canAnyPlatform,
  PlatformCapability,
  type AccessScope,
} from '@geolandpro/rbac';
import type { AccessRequestStatus } from '@/types';

const STATUS_OPTIONS: AccessRequestStatus[] = [
  'PENDING',
  'APPROVED',
  'ACTIVE',
  'DENIED',
  'EXPIRED',
  'REVOKED',
  'ENDED',
];

function RequestAccessForm() {
  const queryClient = useQueryClient();
  const [organisationId, setOrganisationId] = useState('');
  const [requestedScopes, setRequestedScopes] = useState<AccessScope[]>([...DEFAULT_GRANTED_ACCESS_SCOPES]);
  const [reason, setReason] = useState('');

  const { data: organisations, isLoading: orgsLoading } = useQuery({
    queryKey: ['organisations-lite'],
    queryFn: () => accessRequestsApi.listOrganisationsLite({ isActive: true }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      accessRequestsApi.create(organisationId, {
        requestedScopes,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-access-requests'] });
      setReason('');
    },
  });

  function toggleScope(scope: AccessScope) {
    setRequestedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  return (
    <Card>
      <CardHeader title="Request Access" subtitle="Ask an organisation to grant you a temporary, read-only view of their data" />
      <CardBody>
        <div className="space-y-4">
          {createMutation.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {getApiError(createMutation.error)}
            </div>
          )}

          {createMutation.isSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Request submitted. The organisation's admin will review it.
            </div>
          )}

          <div>
            <label className="form-label" htmlFor="organisationId">
              Organisation
            </label>
            {orgsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <select
                id="organisationId"
                value={organisationId}
                onChange={(e) => setOrganisationId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Select an organisation…</option>
                {organisations?.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <span className="form-label">Requested scopes</span>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ACCESS_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={requestedScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {accessScopeLabel(scope)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="reason">
              Reason (optional)
            </label>
            <textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Investigating a support ticket about a lease discrepancy"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          <div className="flex justify-end">
            <Button
              loading={createMutation.isPending}
              disabled={!organisationId || requestedScopes.length === 0}
              onClick={() => createMutation.mutate()}
            >
              Submit request
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function MyRequestsList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { refreshSession, exitImpersonation } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AccessRequestStatus | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-access-requests', { page, status }],
    queryFn: () => accessRequestsApi.listMine({ page, limit: 10, status: status || undefined }),
  });

  const enterMutation = useMutation({
    mutationFn: (id: string) => accessRequestsApi.enter(id),
    onSuccess: async (result) => {
      await refreshSession();
      queryClient.invalidateQueries({ queryKey: ['my-access-requests'] });
      navigate(firstGrantedRoute(result.grantedScopes));
    },
  });

  const exitMutation = useMutation({
    mutationFn: () => exitImpersonation(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-access-requests'] });
    },
  });

  return (
    <Card>
      <CardHeader
        title="My Requests"
        action={
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AccessRequestStatus | '');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {accessRequestStatusLabel(s)}
              </option>
            ))}
          </select>
        }
      />

      {(enterMutation.error || exitMutation.error) && (
        <div className="border-b border-red-100 bg-red-50 px-6 py-2 text-sm text-red-700">
          {getApiError(enterMutation.error ?? exitMutation.error)}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={5} columns={5} />
      ) : !data?.data.length ? (
        <EmptyState
          icon={<KeyRound size={22} />}
          title="No access requests yet"
          description="Requests you submit will appear here along with their approval status."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Organisation</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Requested scopes</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Granted / Expires</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Requested</th>
                <th className="px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.data.map((req) => (
                <tr key={req.id}>
                  <td className="px-6 py-3 font-medium text-slate-900">{req.organisation?.name ?? '—'}</td>
                  <td className="px-6 py-3">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {req.requestedScopes.map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {accessScopeLabel(s)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <AccessRequestStatusBadge status={req.status} />
                  </td>
                  <td className="px-6 py-3 text-xs text-slate-500">
                    {req.grantedScopes.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {req.grantedScopes.map((s) => (
                          <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                            {accessScopeLabel(s)}
                          </span>
                        ))}
                      </div>
                    )}
                    {req.expiresAt ? formatDateTime(req.expiresAt) : '—'}
                  </td>
                  <td className="px-6 py-3 text-slate-500">{formatDateTime(req.createdAt)}</td>
                  <td className="whitespace-nowrap px-6 py-3 text-right">
                    {req.status === 'APPROVED' && (
                      <Button
                        size="sm"
                        loading={enterMutation.isPending && enterMutation.variables === req.id}
                        onClick={() => enterMutation.mutate(req.id)}
                      >
                        <LogIn size={14} /> Enter
                      </Button>
                    )}
                    {req.status === 'ACTIVE' && (
                      <Button size="sm" variant="secondary" loading={exitMutation.isPending} onClick={() => exitMutation.mutate()}>
                        <LogOut size={14} /> Exit
                      </Button>
                    )}
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
  );
}

export function StaffAccessRequestsPage() {
  const { user } = useAuth();

  if (!canAnyPlatform(user?.platformRole, [PlatformCapability.ORG_IMPERSONATE])) {
    return (
      <div>
        <Header title="Access Requests" subtitle="Request temporary, read-only access to an organisation's data" />
        <div className="p-6">
          <Card>
            <EmptyState
              icon={<KeyRound size={22} />}
              title="Not available for your role"
              description="Your platform role does not include permission to request organisation access."
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Access Requests" subtitle="Request temporary, read-only access to an organisation's data" />
      <div className="space-y-6 p-6">
        <RequestAccessForm />
        <MyRequestsList />
      </div>
    </div>
  );
}
