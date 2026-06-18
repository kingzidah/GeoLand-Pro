import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Percent, CheckCircle2, Clock, Search, FileText, Building2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, StatCard } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { platformApi } from '@/api/platform';
import { brand } from '@/config/brand.config';
import { formatCurrency } from '@/utils/format';

export function RevenuePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['platform-revenue-summary'],
    queryFn: () => platformApi.getRevenueSummary(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['platform-revenue-organisations', { page, search }],
    queryFn: () => platformApi.listOrganisationRevenue({ page, limit: 15, search: search || undefined }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div>
      <Header title="Revenue & Commission" subtitle={`${brand.name} — platform-wide commission tracking`} />

      <div className="p-6 space-y-4">
        {/* Stats */}
        {summaryLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : summary ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Revenue This Month" value={formatCurrency(summary.revenueThisMonthGHS)} icon={<DollarSign size={20} />} />
            <StatCard label="Commission This Month" value={formatCurrency(summary.commissionThisMonthGHS)} icon={<Percent size={20} />} />
            <StatCard label="Commission Paid" value={formatCurrency(summary.commissionPaidGHS)} icon={<CheckCircle2 size={20} />} />
            <StatCard label="Commission Outstanding" value={formatCurrency(summary.commissionOutstandingGHS)} icon={<Clock size={20} />} />
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
          <button type="submit" title="Search" className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700">
            <Search size={18} />
          </button>
        </form>

        <Card>
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : !data?.data.length ? (
            <div className="text-center py-16">
              <Building2 size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No organisations found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Organisation</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Plan</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Rate</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Revenue This Month</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Commission Paid</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Commission Outstanding</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
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
                      <td className="px-6 py-3 text-slate-600">{org.commissionRate}%</td>
                      <td className="px-6 py-3 text-slate-900 font-medium">{formatCurrency(org.revenueThisMonthGHS)}</td>
                      <td className="px-6 py-3 text-emerald-600">{formatCurrency(org.commissionPaidGHS)}</td>
                      <td className="px-6 py-3 text-amber-600">{formatCurrency(org.commissionOutstandingGHS)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          org.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {org.isActive ? 'Active' : 'Suspended'}
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

        {/* Invoice generation stub */}
        <Card className="p-10 text-center">
          <FileText size={28} className="mx-auto text-slate-300 mb-2" />
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">Coming soon</p>
          <p className="text-slate-500 max-w-md mx-auto">
            Invoice generation is deferred to Sprint 9. Commission figures above are calculated directly
            from completed transactions and the monthly commission job.
          </p>
        </Card>
      </div>
    </div>
  );
}
