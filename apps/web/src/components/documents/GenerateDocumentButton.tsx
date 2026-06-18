import { useMutation } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { documentsApi } from '@/api/documents';
import { getApiError } from '@/api/client';
import type { Document } from '@/types';

interface Props {
  label: string;
  generate: () => Promise<Document>;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function GenerateDocumentButton({ label, generate, variant = 'secondary', size = 'sm' }: Props) {
  const mutation = useMutation({
    mutationFn: async () => {
      const doc = await generate();
      const { downloadUrl } = await documentsApi.getDownloadUrl(doc.id);
      return downloadUrl;
    },
  });

  if (mutation.data) {
    return (
      <a
        href={mutation.data}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-lg font-medium transition-colors bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 text-sm"
      >
        <Download size={15} />
        Download PDF
      </a>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant={variant} size={size} loading={mutation.isPending} onClick={() => mutation.mutate()}>
        <FileText size={15} />
        {label}
      </Button>
      {mutation.error && <p className="text-xs text-red-600">{getApiError(mutation.error)}</p>}
    </div>
  );
}
