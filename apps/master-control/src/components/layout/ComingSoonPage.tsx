import { Header } from './Header';
import { Card } from '@/components/ui/Card';

interface Props {
  title: string;
  subtitle: string;
  description: string;
  status?: string;
}

/** Placeholder shell for a Master Control module pending its build-out phase. */
export function ComingSoonPage({ title, subtitle, description, status = 'Coming soon' }: Props) {
  return (
    <div>
      <Header title={title} subtitle={subtitle} />
      <div className="p-6">
        <Card className="p-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-2">{status}</p>
          <p className="text-slate-500 max-w-md mx-auto">{description}</p>
        </Card>
      </div>
    </div>
  );
}
