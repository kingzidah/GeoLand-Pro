import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { LeaseStatusBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { GenerateDocumentButton } from '@/components/documents/GenerateDocumentButton';
import { leasesApi } from '@/api/leases';
import { documentsApi } from '@/api/documents';
import { formatDate, formatCurrency, monthName } from '@/utils/format';
import { getApiError } from '@/api/client';

export function LeaseDetailPage() {
  const { leaseId } = useParams<{ leaseId: string }>();
  const queryClient = useQueryClient();
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminationReason, setTerminationReason] = useState('');
  const [actionError, setActionError] = useState('');

  const { data: lease, isLoading } = useQuery({
    queryKey: ['lease', leaseId],
    queryFn: () => leasesApi.getById(leaseId!),
    enabled: !!leaseId,
  });

  const activateMutation = useMutation({
    mutationFn: () => leasesApi.activate(leaseId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lease', leaseId] }),
    onError: (err) => setActionError(getApiError(err)),
  });

  const terminateMutation = useMutation({
    mutationFn: () => leasesApi.terminate(leaseId!, terminationReason),
    onSuccess: () => {
      setTerminateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['lease', leaseId] });
    },
    onError: (err) => setActionError(getApiError(err)),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!lease) return <div className="p-6 text-slate-500">Lease not found.</div>;

  const canActivate =
    lease.status === 'PENDING_SIGNATURE' &&
    !!lease.tenantSignatureUrl &&
    !!lease.adminSignatureUrl;

  return (
    <div>
      <Header
        title={lease.leaseNumber}
        subtitle="Lease agreement details"
        actions={
          <Link to="/leases" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft size={16} /> Back
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {actionError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Status + actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <LeaseStatusBadge status={lease.status} />
          {canActivate && (
            <Button
              size="sm"
              onClick={() => activateMutation.mutate()}
              loading={activateMutation.isPending}
            >
              <CheckCircle size={15} /> Activate Lease
            </Button>
          )}
          {lease.status === 'ACTIVE' && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setTerminateOpen(true)}
            >
              <XCircle size={15} /> Terminate
            </Button>
          )}
          {lease.arrearsGHS > 0 && (
            <GenerateDocumentButton
              label="Generate Demand Letter"
              generate={() => documentsApi.generateDemandLetter(lease.id)}
            />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lease terms */}
          <Card>
            <CardHeader title="Lease Terms" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {[
                  ['Property', lease.plot?.property.name ?? '—'],
                  ['Plot', lease.plot?.plotNumber ?? '—'],
                  ['Tenant', lease.tenant ? `${lease.tenant.user.firstName} ${lease.tenant.user.lastName}` : '—'],
                  ['Start Date', formatDate(lease.startDate)],
                  ['End Date', formatDate(lease.endDate)],
                  ['Monthly Rent', formatCurrency(lease.monthlyRentGHS)],
                  ['Deposit', formatCurrency(lease.depositAmountGHS)],
                  ['Total Paid', formatCurrency(lease.totalPaidGHS)],
                  ['Arrears', lease.arrearsGHS > 0 ? formatCurrency(lease.arrearsGHS) : 'None'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className={`font-medium ${label === 'Arrears' && lease.arrearsGHS > 0 ? 'text-red-600' : 'text-slate-900'} text-right`}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          {/* Signatures */}
          <Card>
            <CardHeader title="Signatures" />
            <CardBody>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-600">Tenant signature</span>
                  {lease.tenantSignatureUrl
                    ? <CheckCircle size={18} className="text-emerald-500" />
                    : <XCircle size={18} className="text-slate-300" />}
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-600">Admin signature</span>
                  {lease.adminSignatureUrl
                    ? <CheckCircle size={18} className="text-emerald-500" />
                    : <XCircle size={18} className="text-slate-300" />}
                </div>
                {lease.signedAt && (
                  <p className="text-xs text-slate-400 mt-2">
                    Fully signed {formatDate(lease.signedAt)}
                  </p>
                )}
                {lease.terminationReason && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-xs font-medium text-red-700 mb-1">Termination reason</p>
                    <p className="text-xs text-red-600">{lease.terminationReason}</p>
                    {lease.terminatedAt && (
                      <p className="text-xs text-red-400 mt-1">{formatDate(lease.terminatedAt)}</p>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Rent records */}
        {lease.rentRecords && lease.rentRecords.length > 0 && (
          <Card>
            <CardHeader
              title="Rent Schedule"
              subtitle={`${lease.rentRecords.filter((r) => r.isPaid).length} / ${lease.rentRecords.length} paid`}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Period</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Due Date</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Amount Due</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Paid</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lease.rentRecords.map((r) => (
                    <tr key={r.id} className={r.isArrears ? 'bg-red-50/50' : 'hover:bg-slate-50'}>
                      <td className="px-6 py-3 text-slate-700">
                        {monthName(r.periodMonth)} {r.periodYear}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(r.dueDate)}</td>
                      <td className="px-6 py-3">{formatCurrency(r.amountDueGHS)}</td>
                      <td className="px-6 py-3">
                        {r.amountPaidGHS > 0 ? formatCurrency(r.amountPaidGHS) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        {r.isPaid ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Paid</span>
                        ) : r.isArrears ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Arrears</span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Unpaid</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Terminate modal */}
      <Modal open={terminateOpen} onClose={() => setTerminateOpen(false)} title="Terminate Lease" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This will immediately mark the lease as <strong>Terminated</strong> and release the plot.
            This action cannot be undone.
          </p>
          <Input
            label="Reason for termination"
            placeholder="Provide a reason (min 10 characters)…"
            value={terminationReason}
            onChange={(e) => setTerminationReason(e.target.value)}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setTerminateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={terminateMutation.isPending}
              disabled={terminationReason.length < 10}
              onClick={() => terminateMutation.mutate()}
            >
              Confirm Termination
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
