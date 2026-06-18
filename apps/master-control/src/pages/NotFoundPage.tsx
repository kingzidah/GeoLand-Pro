import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <MapPin size={28} className="text-brand-400" />
        </div>
        <h1 className="text-5xl font-bold text-slate-900 mb-2">404</h1>
        <p className="text-slate-500 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg font-medium text-sm hover:bg-brand-700 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
