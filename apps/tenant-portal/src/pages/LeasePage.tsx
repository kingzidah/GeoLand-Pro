import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, PenLine } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { LeaseStatusBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { leasesApi } from '@/api/leases';
import { formatDate, formatCurrency, monthName } from '@/utils/format';
import { getApiError } from '@/api/client';

export function LeasePage() {
  const queryClient = useQueryClient();
  const [signing, setSigning] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [actionError, setActionError] = useState('');

  const { data: leases, isLoading: leasesLoading } = useQuery({
    queryKey: ['my-leases-full'],
    queryFn: () => leasesApi.list({ limit: 1 }),
  });

  const lease = leases?.data[0];

  const { data: rentRecords, isLoading: rentLoading } = useQuery({
    queryKey: ['lease-rent-records', lease?.id],
    queryFn: () => leasesApi.getRentRecords(lease!.id),
    enabled: !!lease,
  });

  const signMutation = useMutation({
    mutationFn: () => leasesApi.sign(lease!.id, signatureUrl),
    onSuccess: () => {
      setSigning(false);
      setSignatureUrl('');
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['my-leases-full'] });
    },
    onError: (err) => setActionError(getApiError(err)),
  });

  if (leasesLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  if (!lease) {
    return (
      <div>
        <Header title="My Lease" subtitle="Lease agreement details" />
        <div className="p-6 text-slate-500">You don't have a lease on file yet.</div>
      </div>
    );
  }

  const canSign = lease.status === 'PENDING_SIGNATURE' && !lease.tenantSignatureUrl;

  return (
    <div>
      <Header title={lease.leaseNumber} subtitle="My lease agreement" />

      <div className="p-6 space-y-6">
        {actionError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {actionError}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <LeaseStatusBadge status={lease.status} />
          {canSign && !signing && (
            <Button size="sm" onClick={() => setSigning(true)}>
              <PenLine size={15} /> Sign Lease
            </Button>
          )}
        </div>

        {signing && (
          <Card>
            <CardHeader title="Sign your lease" subtitle="Provide a link to your signature image to confirm acceptance" />
            <CardBody>
              <div className="space-y-4 max-w-md">
                <Input
                  label="Signature image URL"
                  placeholder="https://example.com/my-signature.png"
                  value={signatureUrl}
                  onChange={(e) => setSignatureUrl(e.target.value)}
                />
                <div className="flex gap-3">
                  <Button
                    size="sm"
                    loading={signMutation.isPending}
                    disabled={!signatureUrl}
                    onClick={() => signMutation.mutate()}
                  >
                    Confirm Signature
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setSigning(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Lease Terms" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                {[
                  ['Property', lease.plot?.property.name ?? '—'],
                  ['Plot', lease.plot?.plotNumber ?? '—'],
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

          <Card>
            <CardHeader title="Signatures" />
            <CardBody>
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-600">Your signature</span>
                  {lease.tenantSignatureUrl
                    ? <CheckCircle size={18} className="text-emerald-500" />
                    : <XCircle size={18} className="text-slate-300" />}
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-slate-600">Landlord signature</span>
                  {lease.adminSignatureUrl
                    ? <CheckCircle size={18} className="text-emerald-500" />
                    : <XCircle size={18} className="text-slate-300" />}
                </div>
                {lease.signedAt && (
                  <p className="text-xs text-slate-400 mt-2">Fully signed {formatDate(lease.signedAt)}</p>
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        {rentLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : rentRecords && rentRecords.length > 0 ? (
          <Card>
            <CardHeader
              title="Rent Schedule"
              subtitle={`${rentRecords.filter((r) => r.isPaid).length} / ${rentRecords.length} paid`}
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
                  {rentRecords.map((r) => (
                    <tr key={r.id} className={r.isArrears ? 'bg-red-50/50' : 'hover:bg-slate-50'}>
                      <td className="px-6 py-3 text-slate-700">{monthName(r.periodMonth)} {r.periodYear}</td>
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
        ) : null}
      </div>
    </div>
  );
}
