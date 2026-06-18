import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, Search, MapPin, ChevronRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardGridSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { propertiesApi, type CreatePropertyBody } from '@/api/properties';
import { getApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { hasMinRole } from '@geolandpro/rbac';
import { formatArea } from '@/utils/format';

const EMPTY_FORM: CreatePropertyBody = {
  name: '',
  address: '',
  region: '',
  district: '',
  totalAreaSqm: 0,
  description: '',
};

function AddPropertyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<CreatePropertyBody>(EMPTY_FORM);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => propertiesApi.create({ ...form, description: form.description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      setForm(EMPTY_FORM);
      onClose();
    },
  });

  const handleClose = () => {
    createMutation.reset();
    setForm(EMPTY_FORM);
    onClose();
  };

  const isValid = form.name.trim() && form.address.trim() && form.region.trim() && form.district.trim() && form.totalAreaSqm > 0;

  return (
    <Modal open={open} onClose={handleClose} title="Add Property" size="md">
      <div className="space-y-4">
        {createMutation.error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {getApiError(createMutation.error)}
          </div>
        )}
        <Input
          label="Property name"
          placeholder="e.g. Karlsruhe Estate"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          label="Address"
          placeholder="e.g. Plot 12, East Legon, Accra"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Region"
            placeholder="e.g. Greater Accra"
            value={form.region}
            onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
          />
          <Input
            label="District"
            placeholder="e.g. Adenta"
            value={form.district}
            onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
          />
        </div>
        <Input
          label="Total area (sqm)"
          type="number"
          min={0}
          placeholder="e.g. 5000"
          value={form.totalAreaSqm || ''}
          onChange={(e) => setForm((f) => ({ ...f, totalAreaSqm: Number(e.target.value) }))}
        />
        <Input
          label="Description (optional)"
          placeholder="Short description of this property"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button loading={createMutation.isPending} disabled={!isValid} onClick={() => createMutation.mutate()}>
            Add Property
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function PropertiesPage() {
  const { user, impersonation } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['properties', { page, search }],
    queryFn: () => propertiesApi.list({ page, limit: 12, search: search || undefined }),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const canCreate = hasMinRole(user?.role, 'ADMIN') && !impersonation;

  return (
    <div>
      <Header
        title="Properties"
        subtitle={`${data?.meta.total ?? 0} properties total`}
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              + Add Property
            </Button>
          )
        }
      />

      <div className="p-6 space-y-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 max-w-sm">
          <Input
            placeholder="Search by name or address…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button
            type="submit"
            aria-label="Search"
            className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            <Search size={18} />
          </button>
        </form>

        {isLoading ? (
          <CardGridSkeleton count={6} />
        ) : !data?.data.length ? (
          <Card>
            <EmptyState
              icon={<Building2 size={22} />}
              title="No properties yet"
              description="Add your first property to start managing your land portfolio"
              actionLabel={canCreate ? '+ Add Property' : undefined}
              onAction={canCreate ? () => setAddOpen(true) : undefined}
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.data.map((property) => (
                <Link key={property.id} to={`/properties/${property.id}`}>
                  <Card className="hover:border-brand-300 hover:shadow-md transition-all cursor-pointer">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2.5 bg-brand-50 rounded-lg">
                          <Building2 size={20} className="text-brand-600" />
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          property.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {property.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 text-sm mb-1 truncate">
                        {property.name}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
                        <MapPin size={12} />
                        <span className="truncate">{property.address}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
                        <span>{property._count.plots} plots</span>
                        <span>{formatArea(property.totalAreaSqm)}</span>
                        <span>{property.region}</span>
                      </div>
                    </div>
                    <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-brand-600 font-medium">
                      View details <ChevronRight size={14} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="flex justify-center pt-4">
              <Pagination
                page={page}
                totalPages={data.meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      <AddPropertyModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
