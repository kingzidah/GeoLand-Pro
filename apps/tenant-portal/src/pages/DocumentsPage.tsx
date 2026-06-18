import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Download, FileText } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { DocumentTypeBadge } from '@/components/ui/Badge';
import { documentsApi } from '@/api/documents';
import { formatDate, formatBytes } from '@/utils/format';

export function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-documents', page],
    queryFn: () => documentsApi.list({ page, limit: 15 }),
  });

  const handleDownload = async (id: string) => {
    try {
      setDownloadError('');
      const { downloadUrl } = await documentsApi.getDownloadUrl(id);
      window.open(downloadUrl, '_blank');
    } catch {
      setDownloadError('Failed to generate download link. Please try again.');
    }
  };

  return (
    <div>
      <Header title="Documents" subtitle={`${data?.meta.total ?? 0} files`} />

      <div className="p-6 space-y-4">
        {downloadError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {downloadError}
          </div>
        )}

        <Card>
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : !data?.data.length ? (
            <div className="text-center py-16">
              <FolderOpen size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No documents available yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Title</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Linked To</th>
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
                      <td className="px-6 py-3"><DocumentTypeBadge type={doc.type} /></td>
                      <td className="px-6 py-3 text-slate-500 text-xs">
                        {doc.lease ? `Lease: ${doc.lease.leaseNumber}` :
                         doc.plot ? `Plot: ${doc.plot.plotNumber}` : '—'}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(doc.createdAt)}</td>
                      <td className="px-6 py-3 text-slate-500 text-xs">{formatBytes(doc.sizeBytes)}</td>
                      <td className="px-6 py-3">
                        <button
                          onClick={() => handleDownload(doc.id)}
                          className="p-1.5 rounded text-brand-600 hover:bg-brand-50"
                          title="Download"
                        >
                          <Download size={15} />
                        </button>
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
