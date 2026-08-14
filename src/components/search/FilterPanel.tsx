import React from 'react';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Category, Company } from '../../types/document';

interface FilterPanelProps {
  categories: Category[];
  companies: Company[];
  filters: Record<string, unknown>;
  onFilterChange: (filters: Record<string, unknown>) => void;
  onClear: () => void;
}

export function FilterPanel({ categories, companies, filters, onFilterChange, onClear }: FilterPanelProps) {
  const updateFilter = (key: string, value: unknown) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const isPaidValue =
    typeof filters.isPaid === 'boolean' ? String(filters.isPaid) : '';

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">Filter</h3>
        <Button type="button" onClick={onClear} variant="ghost" size="sm">
          Zurücksetzen
        </Button>
      </div>

      <Select
        label="Kategorie"
        value={typeof filters.categoryId === 'number' ? String(filters.categoryId) : ''}
        onChange={(e) => updateFilter('categoryId', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
        options={[
          { value: '', label: 'Alle Kategorien' },
          ...categories.map((c) => ({ value: String(c.id), label: c.name })),
        ]}
      />

      <Select
        label="Firma"
        value={typeof filters.companyId === 'number' ? String(filters.companyId) : ''}
        onChange={(e) => updateFilter('companyId', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
        options={[
          { value: '', label: 'Alle Firmen' },
          ...companies.map((c) => ({ value: String(c.id), label: c.name })),
        ]}
      />

      <Select
        label="Status"
        value={isPaidValue}
        onChange={(e) => updateFilter('isPaid', e.target.value === '' ? undefined : e.target.value === 'true')}
        options={[
          { value: '', label: 'Alle' },
          { value: 'true', label: 'Bezahlt' },
          { value: 'false', label: 'Unbezahlt' },
        ]}
      />

      <Input
        label="Datum von"
        type="date"
        value={typeof filters.dateFrom === 'string' ? filters.dateFrom : ''}
        onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
      />

      <Input
        label="Datum bis"
        type="date"
        value={typeof filters.dateTo === 'string' ? filters.dateTo : ''}
        onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
      />
    </div>
  );
}
