import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin } from 'lucide-react';
import { brand } from '@/config/brand.config';
import { useAuth } from '@/auth/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getApiError } from '@/api/client';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (data: FormData) => {
    try {
      setError('');

      // TODO SPRINT-SECURITY: wire mandatory 2FA here using existing
      // send-otp / verify-otp endpoints. Master Control accounts hold the
      // highest-privilege platform roles and must require a second factor
      // before this login is considered complete. Deferred to Sprint 7.5 /
      // security sprint — plain email+password only for now.
      await login(data.email, data.password);

      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getApiError(err));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg">
            <MapPin size={20} className="text-white" />
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold text-slate-900 block">{brand.name}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Master Control</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Platform staff sign in</h2>
          <p className="text-sm text-slate-500 mb-6">Restricted to authorised platform administration roles</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button type="submit" loading={isSubmitting} className="w-full mt-2" size="lg">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
