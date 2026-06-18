import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { leasesApi } from '@/api/leases';
import { formatDate, formatCurrency, monthName } from '@/utils/format';

export function MyPaymentsPage() {
  const { data: leases, isLoading: leasesLoading } = useQuery({
    queryKey: ['my-leases-payments'],
    queryFn: () => leasesApi.list({ limit: 1 }),
  });

  const lease = leases?.data[0];

  const { data: rentRecords, isLoading: rentLoading } = useQuery({
    queryKey: ['lease-rent-records', lease?.id],
    queryFn: () => leasesApi.getRentRecords(lease!.id),
    enabled: !!lease,
  });

  if (leasesLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  if (!lease) {
    return (
      <div>
        <Header title="My Payments" subtitle="Rent payment history" />
        <div className="p-6 text-slate-500">You don't have a lease on file yet.</div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="My Payments"
        subtitle={`Total paid: ${formatCurrency(lease.totalPaidGHS)}${lease.arrearsGHS > 0 ? ` · Arrears: ${formatCurrency(lease.arrearsGHS)}` : ''}`}
      />

      <div className="p-6 space-y-6">
        {rentLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !rentRecords?.length ? (
          <div className="text-slate-500">No rent records yet.</div>
        ) : (
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
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Paid On</th>
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
                      <td className="px-6 py-3 text-slate-500">{formatDate(r.paidAt)}</td>
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
    </div>
  );
}
