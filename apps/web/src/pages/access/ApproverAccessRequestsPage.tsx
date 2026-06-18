import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { AccessRequestStatusBadge } from '@/components/ui/Badge';
import { accessRequestsApi } from '@/api/accessRequests';
import { getApiError } from '@/api/client';
import { accessScopeLabel, accessRequestStatusLabel, formatDateTime, fullName } from '@/utils/format';
import { ALL_ACCESS_SCOPES, type AccessScope } from '@geolandpro/rbac';
import type { AccessRequestStatus, OrgAccessRequest } from '@/types';

const STATUS_OPTIONS: AccessRequestStatus[] = [
  'PENDING',
  'APPROVED',
  'ACTIVE',
  'DENIED',
  'EXPIRED',
  'REVOKED',
  'ENDED',
];

function requesterName(request: OrgAccessRequest): string {
  return request.requestedBy ? fullName(request.requestedBy.firstName, request.requestedBy.lastName) : 'Unknown user';
}

function ApproveModal({
  request,
  open,
  onClose,
}: {
  request: OrgAccessRequest | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [grantedScopes, setGrantedScopes] = useState<AccessScope[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(60);

  useEffect(() => {
    if (request) {
      setGrantedScopes(request.requestedScopes);
      setDurationMinutes(60);
    }
  }, [request]);

  const approveMutation = useMutation({
    mutationFn: () => accessRequestsApi.approve(request!.id, { grantedScopes, durationMinutes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-access-requests'] });
      onClose();
    },
  });

  const handleClose = () => {
    approveMutation.reset();
    onClose();
  };

  function toggleScope(scope: AccessScope) {
    setGrantedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  if (!request) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Approve Access Request" size="md">
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-900">{requesterName(request)}</span> requested access to your
            organisation.
          </p>
          {request.reason && <p className="mt-1 italic text-slate-500">&ldquo;{request.reason}&rdquo;</p>}
        </div>

        {approveMutation.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {getApiError(approveMutation.error)}
          </div>
        )}

        <div>
          <span className="form-label">Grant access to</span>
          <div className="grid grid-cols-2 gap-2">
            {ALL_ACCESS_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={grantedScopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {accessScopeLabel(scope)}
                {request.requestedScopes.includes(scope) && (
                  <span className="text-xs text-slate-400">requested</span>
                )}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label" htmlFor="durationMinutes">
            Session duration (minutes)
          </label>
          <input
            id="durationMinutes"
            type="number"
            min={1}
            max={60}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          <p className="mt-1 text-xs text-slate-500">Up to 60 minutes.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={approveMutation.isPending}>
            Cancel
          </Button>
          <Button
            loading={approveMutation.isPending}
            disabled={grantedScopes.length === 0 || durationMinutes < 1 || durationMinutes > 60}
            onClick={() => approveMutation.mutate()}
          >
            Approve
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmActionModal({
  open,
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {getApiError(error)}
          </div>
        ) : null}
        <p className="text-sm text-slate-600">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ApproverAccessRequestsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AccessRequestStatus | ''>('PENDING');
  const [approveTarget, setApproveTarget] = useState<OrgAccessRequest | null>(null);
  const [denyTarget, setDenyTarget] = useState<OrgAccessRequest | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<OrgAccessRequest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['org-access-requests', { page, status }],
    queryFn: () => accessRequestsApi.listForOrg({ page, limit: 15, status: status || undefined }),
  });

  const denyMutation = useMutation({
    mutationFn: (id: string) => accessRequestsApi.deny(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-access-requests'] });
      setDenyTarget(null);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => accessRequestsApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-access-requests'] });
      setRevokeTarget(null);
    },
  });

  return (
    <div>
      <Header
        title="Access Requests"
        subtitle="Review and manage platform staff requests to access your organisation's data"
      />

      <div className="space-y-4 p-6">
        <div className="max-w-xs">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AccessRequestStatus | '');
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {accessRequestStatusLabel(s)}
              </option>
            ))}
            <option value="">All statuses</option>
          </select>
        </div>

        <Card>
          {isLoading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : !data?.data.length ? (
            <EmptyState
              icon={<KeyRound size={22} />}
              title="No access requests"
              description="Requests from platform staff to access this organisation's data will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-slate-500">Requested by</th>
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
                      <td className="px-6 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{requesterName(req)}</p>
                          <p className="truncate text-xs text-slate-500">{req.requestedBy?.email}</p>
                        </div>
                        {req.reason && (
                          <p className="mt-1 max-w-xs truncate text-xs italic text-slate-500" title={req.reason}>
                            &ldquo;{req.reason}&rdquo;
                          </p>
                        )}
                      </td>
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
                        {req.status === 'PENDING' && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setDenyTarget(req)}>
                              Deny
                            </Button>
                            <Button size="sm" onClick={() => setApproveTarget(req)}>
                              Approve
                            </Button>
                          </div>
                        )}
                        {(req.status === 'APPROVED' || req.status === 'ACTIVE') && (
                          <Button size="sm" variant="danger" onClick={() => setRevokeTarget(req)}>
                            Revoke
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
      </div>

      <ApproveModal request={approveTarget} open={!!approveTarget} onClose={() => setApproveTarget(null)} />

      <ConfirmActionModal
        open={!!denyTarget}
        title="Deny Access Request"
        message={`Deny ${denyTarget ? requesterName(denyTarget) : 'this user'}'s access request?`}
        confirmLabel="Deny"
        pending={denyMutation.isPending}
        error={denyMutation.error}
        onConfirm={() => denyTarget && denyMutation.mutate(denyTarget.id)}
        onClose={() => {
          denyMutation.reset();
          setDenyTarget(null);
        }}
      />

      <ConfirmActionModal
        open={!!revokeTarget}
        title="Revoke Access"
        message={`Revoke ${revokeTarget ? requesterName(revokeTarget) : 'this user'}'s access? They will no longer be able to enter or continue this session.`}
        confirmLabel="Revoke"
        pending={revokeMutation.isPending}
        error={revokeMutation.error}
        onConfirm={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
        onClose={() => {
          revokeMutation.reset();
          setRevokeTarget(null);
        }}
      />
    </div>
  );
}
