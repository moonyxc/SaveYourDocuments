import React, { useState } from 'react';
import { useSearch } from '../hooks/useSearch';
import { useDocuments } from '../hooks/useDocuments';
import { SearchBar } from '../components/search/SearchBar';
import { FilterPanel } from '../components/search/FilterPanel';
import { DocumentGrid } from '../components/documents/DocumentGrid';
import { DocumentDetail } from '../components/documents/DocumentDetail';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function SearchPage() {
  const { results, isSearching, search } = useSearch();
  const { categories, companies, selectedDocument, setSelectedDocument } = useDocuments();
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [lastQuery, setLastQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (query: string) => {
    setLastQuery(query);
    setHasSearched(true);
    await search(query, filters);
  };

  const handleFilterChange = (newFilters: Record<string, unknown>) => {
    setFilters(newFilters);
    if (lastQuery.trim()) {
      search(lastQuery, newFilters);
    }
  };

  const handleClearFilters = () => {
    setFilters({});
    if (lastQuery.trim()) {
      search(lastQuery, {});
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <FilterPanel
            categories={categories}
            companies={companies}
            filters={filters}
            onFilterChange={handleFilterChange}
            onClear={handleClearFilters}
          />
        </div>

        <div className="lg:col-span-3 space-y-4">
          <SearchBar onSearch={handleSearch} placeholder="Volltextsuche in Dokumenten..." />

          {isSearching && (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner text="Suche läuft..." />
            </div>
          )}

          {!isSearching && hasSearched && (
            <>
              <p className="text-sm text-slate-400">
                {results.length} Ergebnis{results.length !== 1 ? 'se' : ''} gefunden
              </p>
              <DocumentGrid
                documents={results}
                onDocumentClick={(doc) => setSelectedDocument(doc)}
              />
            </>
          )}

          {!hasSearched && (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-slate-400">Gib einen Suchbegriff ein, um Dokumente zu finden</p>
            </div>
          )}
        </div>
      </div>

      {selectedDocument && (
        <DocumentDetail
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
}
