import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Search, UserCheck, UserX, Settings } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { RoleBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { adminApi } from '@/api/admin';
import { formatDate, fullName } from '@/utils/format';
import { getApiError } from '@/api/client';
import type { Role } from '@/types';

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FIELD_SURVEYOR', 'TENANT'];

export function AdminPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [roleModalId, setRoleModalId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Role>('MANAGER');
  const [actionError, setActionError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', { page, search, role: roleFilter }],
    queryFn: () => adminApi.listUsers({
      page,
      limit: 15,
      search: search || undefined,
      role: roleFilter || undefined,
    }),
  });

  const suspendMutation = useMutation({
    mutationFn: adminApi.suspendUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (err) => setActionError(getApiError(err)),
  });

  const activateMutation = useMutation({
    mutationFn: adminApi.activateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (err) => setActionError(getApiError(err)),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => adminApi.changeRole(id, role),
    onSuccess: () => {
      setRoleModalId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => setActionError(getApiError(err)),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div>
      <Header
        title="Admin Panel"
        subtitle="User management and platform oversight"
        actions={<ShieldCheck size={20} className="text-slate-400" />}
      />

      <div className="p-6 space-y-4">
        {actionError && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search by name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64"
            />
            <button type="submit" className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700">
              <Search size={18} />
            </button>
          </form>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value as Role | ''); setPage(1); }}
          >
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>

        <Card>
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : !data?.data.length ? (
            <div className="text-center py-16">
              <ShieldCheck size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">User</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Role</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Properties</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Joined</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Last Login</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.data.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                            {user.firstName[0]}{user.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {fullName(user.firstName, user.lastName)}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3"><RoleBadge role={user.role} /></td>
                      <td className="px-6 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                        }`}>
                          {user.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {(user as typeof user & { _count: { managedProperties: number } })._count?.managedProperties ?? 0}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(user.createdAt)}</td>
                      <td className="px-6 py-3 text-slate-500">{formatDate(user.lastLoginAt)}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1.5">
                          {user.isActive ? (
                            <button
                              onClick={() => suspendMutation.mutate(user.id)}
                              disabled={user.role === 'SUPER_ADMIN'}
                              className="p-1.5 rounded text-red-400 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Suspend"
                            >
                              <UserX size={15} />
                            </button>
                          ) : (
                            <button
                              onClick={() => activateMutation.mutate(user.id)}
                              className="p-1.5 rounded text-emerald-500 hover:bg-emerald-50"
                              title="Activate"
                            >
                              <UserCheck size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => { setRoleModalId(user.id); setNewRole(user.role); }}
                            disabled={user.role === 'SUPER_ADMIN'}
                            className="p-1.5 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Change role"
                          >
                            <Settings size={15} />
                          </button>
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

      {/* Change role modal */}
      <Modal
        open={!!roleModalId}
        onClose={() => setRoleModalId(null)}
        title="Change User Role"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Changing this user's role will immediately invalidate their active session.
            They will need to log in again to get a new JWT with the updated role.
          </p>
          <div>
            <label className="form-label">New Role</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              {ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => (
                <option key={r} value={r}>{r.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setRoleModalId(null)}>Cancel</Button>
            <Button
              size="sm"
              loading={changeRoleMutation.isPending}
              onClick={() => roleModalId && changeRoleMutation.mutate({ id: roleModalId, role: newRole })}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
