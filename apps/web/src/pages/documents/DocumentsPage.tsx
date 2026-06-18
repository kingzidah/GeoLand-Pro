import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Download, Trash2, FileText } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { CapabilityGate } from '@/auth/CapabilityGate';
import { Capability } from '@geolandpro/rbac';
import { documentsApi } from '@/api/documents';
import { formatDate } from '@/utils/format';
import { getApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import type { DocumentType } from '@/types';

const TYPE_VARIANTS: Record<DocumentType, 'blue' | 'green' | 'slate' | 'orange' | 'purple' | 'yellow' | 'red'> = {
  TENANCY_AGREEMENT: 'blue',
  RENT_RECEIPT: 'green',
  BOUNDARY_CERTIFICATE: 'orange',
  ARREARS_NOTICE: 'slate',
  PLOT_CERTIFICATE: 'orange',
  LC_SUBMISSION_PACKAGE: 'purple',
  ANNUAL_REPORT: 'yellow',
};

export function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [deleteError, setDeleteError] = useState('');
  const queryClient = useQueryClient();
  const { impersonation } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['documents', page],
    queryFn: () => documentsApi.list({ page, limit: 15 }),
  });

  const deleteMutation = useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
    onError: (err) => setDeleteError(getApiError(err)),
  });

  const handleDownload = async (id: string) => {
    try {
      const { downloadUrl } = await documentsApi.getDownloadUrl(id);
      window.open(downloadUrl, '_blank');
    } catch {
      alert('Failed to generate download link');
    }
  };

  return (
    <div>
      <Header title="Documents" subtitle={`${data?.meta.total ?? 0} files`} />

      <div className="p-6 space-y-4">
        {deleteError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {deleteError}
          </div>
        )}

        <Card>
          {isLoading ? (
            <TableSkeleton rows={6} columns={7} />
          ) : !data?.data.length ? (
            <EmptyState
              icon={<FolderOpen size={22} />}
              title="No documents generated yet"
              description="Generate boundary certificates, tenancy agreements, and property reports from the relevant property or plot pages"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Title</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Linked To</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Uploaded By</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Size</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.data.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <FileText size={15} className="text-slate-400 flex-shrink-0" />
                          <span className="font-medium text-slate-800 truncate max-w-xs">{doc.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={TYPE_VARIANTS[doc.type] ?? 'slate'}>
                          {doc.type.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-slate-500 text-xs">
                        {doc.lease ? `Lease: ${doc.lease.leaseNumber}` :
                         doc.plot ? `Plot: ${doc.plot.plotNumber}` : '—'}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {doc.createdBy.firstName} {doc.createdBy.lastName}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(doc.createdAt)}</td>
                      <td className="px-6 py-3 text-slate-500 text-xs">
                        {doc.sizeBytes ? `${(doc.sizeBytes / 1024).toFixed(0)} KB` : '—'}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(doc.id)}
                            className="p-1.5 rounded text-brand-600 hover:bg-brand-50"
                            title="Download"
                          >
                            <Download size={15} />
                          </button>
                          {!impersonation && (
                            <CapabilityGate capabilities={[Capability.DOCUMENT_GENERATE_ALL]}>
                              <button
                                onClick={() => deleteMutation.mutate(doc.id)}
                                className="p-1.5 rounded text-red-400 hover:bg-red-50"
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            </CapabilityGate>
                          )}
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
