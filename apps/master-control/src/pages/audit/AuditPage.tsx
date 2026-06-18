import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Search, ShieldCheck, X } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { platformApi, type ListAuditLogsParams } from '@/api/platform';
import { PlatformCapabilityGate } from '@/auth/PlatformCapabilityGate';
import { PlatformCapability } from '@geolandpro/rbac';
import { brand } from '@/config/brand.config';
import { formatDateTime } from '@/utils/format';
import { getApiError } from '@/api/client';

const EMPTY_FILTERS: ListAuditLogsParams = {
  organisationId: '',
  actor: '',
  action: '',
  entityType: '',
  from: '',
  to: '',
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ListAuditLogsParams>(EMPTY_FILTERS);
  const [filterInputs, setFilterInputs] = useState<ListAuditLogsParams>(EMPTY_FILTERS);
  const [exportError, setExportError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data: orgsData } = useQuery({
    queryKey: ['platform-organisations-all'],
    queryFn: () => platformApi.listOrganisations({ limit: 100 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['platform-audit-logs', { page, filters }],
    queryFn: () =>
      platformApi.listAuditLogs({
        page,
        limit: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters(filterInputs);
    setPage(1);
  };

  const handleClear = () => {
    setFilterInputs(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handleExport = async () => {
    setExportError('');
    setIsExporting(true);
    try {
      const blob = await platformApi.exportAuditLogsPdf(
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'audit-log-report.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(getApiError(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <Header
        title="Audit & Security"
        subtitle={`${brand.name} — platform-wide activity log`}
        actions={
          <PlatformCapabilityGate capabilities={[PlatformCapability.AUDIT_EXPORT]}>
            <Button size="sm" onClick={handleExport} disabled={isExporting}>
              <Download size={16} /> {isExporting ? 'Exporting…' : 'Export PDF'}
            </Button>
          </PlatformCapabilityGate>
        }
      />

      <div className="p-6 space-y-4">
        {exportError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {exportError}
          </div>
        )}

        {/* Filters */}
        <Card className="p-4">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <div>
              <label className="form-label" htmlFor="audit-organisation-filter">Organisation</label>
              <select
                id="audit-organisation-filter"
                value={filterInputs.organisationId}
                onChange={(e) => setFilterInputs((f) => ({ ...f, organisationId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">All organisations</option>
                {orgsData?.data.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <Input
              label="Actor"
              placeholder="Name or email…"
              value={filterInputs.actor}
              onChange={(e) => setFilterInputs((f) => ({ ...f, actor: e.target.value }))}
            />
            <Input
              label="Action"
              placeholder="e.g. LOGIN_FAILED_THRESHOLD"
              value={filterInputs.action}
              onChange={(e) => setFilterInputs((f) => ({ ...f, action: e.target.value }))}
            />
            <Input
              label="Entity Type"
              placeholder="e.g. Organisation"
              value={filterInputs.entityType}
              onChange={(e) => setFilterInputs((f) => ({ ...f, entityType: e.target.value }))}
            />
            <Input
              label="From"
              type="date"
              value={filterInputs.from}
              onChange={(e) => setFilterInputs((f) => ({ ...f, from: e.target.value }))}
            />
            <Input
              label="To"
              type="date"
              value={filterInputs.to}
              onChange={(e) => setFilterInputs((f) => ({ ...f, to: e.target.value }))}
            />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6">
              <Button type="submit" size="sm">
                <Search size={16} /> Search
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={handleClear}>
                <X size={16} /> Clear filters
              </Button>
            </div>
          </form>
        </Card>

        {/* Log table */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : !data?.data.length ? (
            <div className="text-center py-16">
              <ShieldCheck size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No audit log entries found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Action</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Entity</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actor</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Organisation</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.data.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          log.action.includes('FAILED') || log.action.includes('DELETE')
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600">{log.entityType}<span className="text-slate-400"> / {log.entityId.slice(0, 8)}…</span></td>
                      <td className="px-6 py-3">
                        <p className="font-medium text-slate-900">{log.user.firstName} {log.user.lastName}</p>
                        <p className="text-xs text-slate-500">{log.user.email}</p>
                      </td>
                      <td className="px-6 py-3 text-slate-600">{log.user.organisation?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-slate-500">{log.ipAddress ?? '—'}</td>
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
