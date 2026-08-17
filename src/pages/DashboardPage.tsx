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
    { label: 'Gesamt', value: documents.length, color: 'blue' as const, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Unbezahlt', value: unpaidCount, color: 'red' as const, icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Letzte 30 Tage', value: last30Days, color: 'green' as const, icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { label: 'Gesamtbetrag', value: formatCurrency(totalAmount), color: 'purple' as const, icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  const colorStyles = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    purple: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  };

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
            className="bg-slate-900 rounded-lg border border-slate-800 p-5 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${colorStyles[stat.color]}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-100 font-mono">{stat.value}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-100">Letzte Dokumente</h3>
          <span className="text-xs text-slate-500 font-mono">{recentDocuments.length} von {documents.length}</span>
        </div>
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
