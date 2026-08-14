import React, { useEffect, useState } from 'react';
import { DocumentGrid } from '../components/documents/DocumentGrid';
import { DocumentDetail } from '../components/documents/DocumentDetail';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { Document } from '../types/document';
import { formatCurrency } from '../utils/formatters';

function isDocumentArray(value: unknown): value is Document[] {
  return Array.isArray(value);
}

export function DashboardPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await window.api.documents.list();
        if (!cancelled && isDocumentArray(result)) {
          setDocuments(result);
        }
      } catch {
        // Fehler beim Laden, Dashboard zeigt leere Statistiken
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recentDocuments = documents.slice(0, 6);
  const unpaidCount = documents.filter((d) => !d.isPaid).length;
  const totalAmount = documents.reduce((sum, d) => sum + (d.detectedAmount || 0), 0);
  const last30Days = documents.filter((d) => {
    const date = new Date(d.createdAt);
    if (isNaN(date.getTime())) return false;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return date >= thirtyDaysAgo;
  }).length;

  const stats = [
    { label: 'Gesamt', value: documents.length, color: 'blue' },
    { label: 'Unbezahlt', value: unpaidCount, color: 'red' },
    { label: 'Letzte 30 Tage', value: last30Days, color: 'green' },
    { label: 'Gesamtbetrag', value: formatCurrency(totalAmount), color: 'purple' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Lade Dashboard..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-800 rounded-xl border border-slate-700 p-4"
          >
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-100 mb-4">Letzte Dokumente</h3>
        <DocumentGrid
          documents={recentDocuments}
          onDocumentClick={(doc) => setSelectedDocument(doc)}
        />
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
