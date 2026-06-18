import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, MessageSquare, ArrowUpCircle, CheckCircle2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { platformApi } from '@/api/platform';
import { PlatformCapabilityGate } from '@/auth/PlatformCapabilityGate';
import { PlatformCapability } from '@geolandpro/rbac';
import { formatDateTime } from '@/utils/format';
import { getApiError } from '@/api/client';
import type { TicketStatus } from '@/types';

const STATUS_BADGE: Record<TicketStatus, { label: string; variant: 'blue' | 'yellow' | 'green' | 'slate' }> = {
  OPEN: { label: 'Open', variant: 'blue' },
  IN_PROGRESS: { label: 'In Progress', variant: 'yellow' },
  RESOLVED: { label: 'Resolved', variant: 'green' },
  CLOSED: { label: 'Closed', variant: 'slate' },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const { label, variant } = STATUS_BADGE[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function SupportPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-support-tickets', { page, statusFilter }],
    queryFn: () => platformApi.listSupportTickets({ page, limit: 20, ...(statusFilter && { status: statusFilter }) }),
  });

  const { data: ticket, isLoading: isTicketLoading } = useQuery({
    queryKey: ['platform-support-ticket', selectedId],
    queryFn: () => platformApi.getSupportTicket(selectedId as string),
    enabled: !!selectedId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['platform-support-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['platform-support-ticket', selectedId] });
  };

  const replyMutation = useMutation({
    mutationFn: () => platformApi.replySupportTicket(selectedId as string, reply),
    onSuccess: () => {
      setReply('');
      setActionError('');
      invalidate();
    },
    onError: (err) => setActionError(getApiError(err)),
  });

  const escalateMutation = useMutation({
    mutationFn: () => platformApi.escalateSupportTicket(selectedId as string),
    onSuccess: () => {
      setActionError('');
      invalidate();
    },
    onError: (err) => setActionError(getApiError(err)),
  });

  const closeMutation = useMutation({
    mutationFn: () => platformApi.closeSupportTicket(selectedId as string),
    onSuccess: () => {
      setActionError('');
      invalidate();
    },
    onError: (err) => setActionError(getApiError(err)),
  });

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setReply('');
    setActionError('');
  };

  return (
    <div>
      <Header title="Support Centre" subtitle="Organisation support tickets" />

      <div className="p-6 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <label className="form-label" htmlFor="support-status-filter">Status</label>
            <select
              id="support-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as TicketStatus | '');
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </Card>

        <Card>
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : !data?.data.length ? (
            <div className="text-center py-16">
              <LifeBuoy size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No support tickets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Organisation</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Subject</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.data.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => handleSelect(t.id)}
                      className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedId === t.id ? 'bg-brand-50' : ''}`}
                    >
                      <td className="px-6 py-3 text-slate-900 font-medium">{t.organisation.name}</td>
                      <td className="px-6 py-3 text-slate-600 truncate max-w-xs">{t.subject}</td>
                      <td className="px-6 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(t.updatedAt)}</td>
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

        {selectedId && (
          <Card>
            {isTicketLoading || !ticket ? (
              <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : (
              <>
                <CardHeader
                  title={ticket.subject}
                  subtitle={`${ticket.organisation.name} — opened ${formatDateTime(ticket.createdAt)}`}
                  action={<StatusBadge status={ticket.status} />}
                />
                <CardBody className="space-y-4">
                  {actionError && (
                    <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {actionError}
                    </div>
                  )}

                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.body}</p>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Activity</h4>
                    {ticket.activity.length === 0 ? (
                      <p className="text-sm text-slate-400 italic">No activity yet</p>
                    ) : (
                      <ul className="space-y-2">
                        {ticket.activity.map((entry) => (
                          <li key={entry.id} className="text-sm border-l-2 border-slate-200 pl-3">
                            <p className="text-slate-700">
                              <span className="font-medium">{entry.user.firstName} {entry.user.lastName}</span>{' '}
                              <span className="text-slate-500">{entry.action.replace('SUPPORT_TICKET_', '').toLowerCase()}</span>
                              <span className="text-slate-400"> — {formatDateTime(entry.createdAt)}</span>
                            </p>
                            {!!entry.metadata && typeof entry.metadata === 'object' && 'message' in entry.metadata && (
                              <p className="text-slate-600 mt-1">{String((entry.metadata as { message: string }).message)}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <PlatformCapabilityGate capabilities={[PlatformCapability.SUPPORT_MANAGE]}>
                    {ticket.status !== 'CLOSED' && (
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        <textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          rows={3}
                          placeholder="Reply to this ticket…"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => replyMutation.mutate()}
                            disabled={!reply.trim() || replyMutation.isPending}
                            loading={replyMutation.isPending}
                          >
                            <MessageSquare size={16} /> Send reply
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => escalateMutation.mutate()}
                            disabled={escalateMutation.isPending}
                            loading={escalateMutation.isPending}
                          >
                            <ArrowUpCircle size={16} /> Escalate
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => closeMutation.mutate()}
                            disabled={closeMutation.isPending}
                            loading={closeMutation.isPending}
                          >
                            <CheckCircle2 size={16} /> Close ticket
                          </Button>
                        </div>
                      </div>
                    )}
                  </PlatformCapabilityGate>
                </CardBody>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
