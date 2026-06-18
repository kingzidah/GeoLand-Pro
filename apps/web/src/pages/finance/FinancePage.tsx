import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, AlertTriangle, TrendingUp, Users, BarChart3 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatCard, Card, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { TxStatusBadge } from '@/components/ui/Badge';
import { financeApi } from '@/api/finance';
import { formatCurrency, formatDate } from '@/utils/format';
import { getApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  RENT_PAYMENT: 'Rent Payment',
  ARREARS_PAYMENT: 'Arrears Payment',
  DEPOSIT: 'Deposit',
  REFUND: 'Refund',
};

const PAYMENT_TYPES = [
  { value: 'RENT_PAYMENT', label: 'Rent Payment' },
  { value: 'ARREARS_PAYMENT', label: 'Arrears Payment' },
  { value: 'DEPOSIT', label: 'Deposit' },
];

const PAYMENT_METHODS = ['Mobile Money', 'Bank Transfer', 'Cash'];

export function FinancePage() {
  const queryClient = useQueryClient();
  const { impersonation } = useAuth();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    leaseId: '',
    type: 'RENT_PAYMENT',
    amountGHS: '',
    paymentMethod: 'Mobile Money',
    paymentReference: '',
    notes: '',
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['finance-summary'],
    queryFn: () => financeApi.getSummary(),
  });

  const { data: arrears, isLoading: arrearsLoading } = useQuery({
    queryKey: ['finance-arrears'],
    queryFn: () => financeApi.getArrears(),
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', { page: 1 }],
    queryFn: () => financeApi.listTransactions({ page: 1, limit: 10 }),
  });

  const paymentMutation = useMutation({
    mutationFn: () => financeApi.recordPayment({
      leaseId: form.leaseId,
      type: form.type,
      amountGHS: parseFloat(form.amountGHS),
      paymentMethod: form.paymentMethod || undefined,
      paymentReference: form.paymentReference || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      setPaymentOpen(false);
      setForm({ leaseId: '', type: 'RENT_PAYMENT', amountGHS: '', paymentMethod: 'Mobile Money', paymentReference: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['finance-arrears'] });
    },
    onError: (err) => setFormError(getApiError(err)),
  });

  const isLoading = summaryLoading || arrearsLoading;

  return (
    <div>
      <Header
        title="Finance"
        subtitle="Revenue tracking and arrears management"
        actions={
          !impersonation && (
            <Button size="sm" onClick={() => setPaymentOpen(true)}>
              Record Payment
            </Button>
          )
        }
      />

      <div className="p-6 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Total Collected"
                value={formatCurrency(summary?.totalCollectedGHS ?? 0)}
                icon={<TrendingUp size={20} />}
              />
              <StatCard
                label="Total Arrears"
                value={formatCurrency(summary?.totalArrearsGHS ?? 0)}
                icon={<AlertTriangle size={20} />}
                trend={
                  (summary?.totalArrearsGHS ?? 0) > 0
                    ? { value: `${arrears?.length ?? 0} leases affected`, positive: false }
                    : { value: 'All clear', positive: true }
                }
              />
              <StatCard
                label="Total Deposits"
                value={formatCurrency(summary?.totalDepositsGHS ?? 0)}
                icon={<DollarSign size={20} />}
              />
              <StatCard
                label="Active Leases"
                value={summary?.activeLeases ?? 0}
                icon={<Users size={20} />}
              />
            </div>

            {/* Arrears table */}
            {arrears && arrears.length > 0 && (
              <Card>
                <CardHeader
                  title="Arrears Report"
                  subtitle={`${arrears.length} lease(s) with outstanding payments`}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Tenant</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Property / Plot</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Monthly Rent</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Arrears</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Overdue Months</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {arrears.map((item) => (
                        <tr key={item.id} className="hover:bg-red-50/50 transition-colors">
                          <td className="px-6 py-3">
                            <p className="font-medium text-slate-900">
                              {item.tenant.user.firstName} {item.tenant.user.lastName}
                            </p>
                            <p className="text-xs text-slate-500">{item.tenant.user.phone ?? '—'}</p>
                          </td>
                          <td className="px-6 py-3 text-slate-600 text-xs">
                            {item.plot.property.name} / {item.plot.plotNumber}
                          </td>
                          <td className="px-6 py-3">{formatCurrency(item.monthlyRentGHS)}</td>
                          <td className="px-6 py-3">
                            <span className="text-red-600 font-semibold">{formatCurrency(item.arrearsGHS)}</span>
                          </td>
                          <td className="px-6 py-3 text-slate-500">{item.overdueRecords.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Recent transactions */}
            <Card>
              <CardHeader
                title="Recent Transactions"
                subtitle={transactions?.meta.total ? `${transactions.meta.total} recorded` : undefined}
              />
              {transactionsLoading ? (
                <TableSkeleton rows={5} columns={5} />
              ) : !transactions?.data.length ? (
                <EmptyState
                  icon={<BarChart3 size={22} />}
                  title="No transactions recorded"
                  description="Transactions appear here once rent payments are logged against active leases"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Type</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Amount</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Method</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {transactions.data.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 text-slate-500">{formatDate(tx.paidAt ?? tx.createdAt)}</td>
                          <td className="px-6 py-3 text-slate-700">{TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}</td>
                          <td className="px-6 py-3 font-medium">{formatCurrency(tx.amountGHS)}</td>
                          <td className="px-6 py-3 text-slate-600">{tx.paymentMethod ?? '—'}</td>
                          <td className="px-6 py-3"><TxStatusBadge status={tx.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Record payment modal */}
      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)} title="Record Payment" size="md">
        <div className="space-y-4">
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}
          <Input
            label="Lease ID"
            placeholder="Lease CUID…"
            value={form.leaseId}
            onChange={(e) => setForm({ ...form, leaseId: e.target.value })}
          />
          <div>
            <label className="form-label">Payment Type</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {PAYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Amount (GHS)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={form.amountGHS}
            onChange={(e) => setForm({ ...form, amountGHS: e.target.value })}
          />
          <div>
            <label className="form-label">Payment Method</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <Input
            label="Payment Reference (optional)"
            placeholder="MoMo transaction ID…"
            value={form.paymentReference}
            onChange={(e) => setForm({ ...form, paymentReference: e.target.value })}
          />
          <Input
            label="Notes (optional)"
            placeholder="Any additional notes…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={paymentMutation.isPending}
              disabled={!form.leaseId || !form.amountGHS}
              onClick={() => paymentMutation.mutate()}
            >
              Record Payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
