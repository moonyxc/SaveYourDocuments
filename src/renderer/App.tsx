import React, { useState, useCallback, useEffect } from 'react';

type View = 'welcome' | 'dashboard' | 'inbox' | 'review' | 'archive' | 'search' | 'companies' | 'log' | 'settings' | 'devtools';

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('welcome');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveName, setArchiveName] = useState('');
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Record<string, unknown> | null>(null);
  const [reviewDoc, setReviewDoc] = useState<Record<string, unknown> | null>(null);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [companies, setCompanies] = useState<Record<string, unknown>[]>([]);
  const [auditEntries, setAuditEntries] = useState<Record<string, unknown>[]>([]);
  const [darkMode, setDarkMode] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (archiveOpen) {
      loadDocuments();
      loadCompanies();
    }
  }, [archiveOpen]);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await window.electronAPI.documents.list();
      setDocuments(docs);
    } catch {
      setDocuments([]);
    }
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      const comps = await window.electronAPI.companies.list();
      setCompanies(comps);
    } catch {
      setCompanies([]);
    }
  }, []);

  const handleCreateArchive = useCallback(async () => {
    try {
      const filePath = await window.electronAPI.dialog.createArchive();
      if (!filePath) return;
      const meta = await window.electronAPI.archive.create(filePath, 'Mein Archiv');
      setArchiveName(meta.displayName);
      setArchiveOpen(true);
      setView('dashboard');
    } catch (error) {
      console.error('Fehler beim Erstellen des Archivs:', error);
    }
  }, []);

  const handleOpenArchive = useCallback(async () => {
    try {
      const filePath = await window.electronAPI.dialog.openArchive();
      if (!filePath) return;
      const meta = await window.electronAPI.archive.open(filePath);
      setArchiveName(meta.displayName);
      setArchiveOpen(true);
      setView('dashboard');
    } catch (error) {
      console.error('Fehler beim Öffnen des Archivs:', error);
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const filePaths = await window.electronAPI.dialog.importFiles();
      if (!filePaths.length) return;
      const results = await window.electronAPI.documents.import(filePaths);
      const successCount = results.filter((r) => r.success).length;
      if (successCount > 0) {
        loadDocuments();
        setView('inbox');
      }
    } catch (error) {
      console.error('Fehler beim Import:', error);
    }
  }, [loadDocuments]);

  const handleDragDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!archiveOpen) return;
    const files = Array.from(e.dataTransfer.files);
    const filePaths = files.map((f) => (f as { path?: string }).path || '');
    const validPaths = filePaths.filter(Boolean);
    if (validPaths.length > 0) {
      const results = await window.electronAPI.documents.import(validPaths);
      if (results.some((r) => r.success)) {
        loadDocuments();
        setView('inbox');
      }
    }
  }, [archiveOpen, loadDocuments]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setView('search');
    if (!query.trim()) {
      loadDocuments();
      return;
    }
    try {
      const results = await window.electronAPI.search(query);
      setDocuments(results);
    } catch {
      /* ignore */
    }
  }, [loadDocuments]);

  const handleDelete = useCallback(async (docId: string) => {
    try {
      await window.electronAPI.documents.delete(docId);
      loadDocuments();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  }, [loadDocuments]);

  const handleRestore = useCallback(async (docId: string) => {
    try {
      await window.electronAPI.documents.restore(docId);
      loadDocuments();
    } catch (error) {
      console.error('Fehler beim Wiederherstellen:', error);
    }
  }, [loadDocuments]);

  const handleReview = useCallback(async (docId: string, approved: boolean) => {
    try {
      await window.electronAPI.documents.review(docId, approved);
      loadDocuments();
      setReviewDoc(null);
    } catch (error) {
      console.error('Fehler bei der Prüfung:', error);
    }
  }, [loadDocuments]);

  const handleExport = useCallback(async (docId: string) => {
    try {
      const exportPath = await window.electronAPI.dialog.exportDocument();
      if (!exportPath) return;
      await window.electronAPI.documents.export(docId, exportPath);
    } catch (error) {
      console.error('Fehler beim Export:', error);
    }
  }, []);

  const handleBackup = useCallback(async () => {
    try {
      const backupPath = await window.electronAPI.dialog.createBackup();
      if (!backupPath) return;
      await window.electronAPI.backup.create(backupPath);
    } catch (error) {
      console.error('Fehler beim Backup:', error);
    }
  }, []);

  const loadAudit = useCallback(async (date?: string) => {
    try {
      const entries = await window.electronAPI.audit.get(date);
      setAuditEntries(entries);
    } catch {
      setAuditEntries([]);
    }
  }, []);

  const handleDevAuth = useCallback(async (password: string) => {
    try {
      const result = await window.electronAPI.devtools.auth(password);
      if (result.success) {
        setDevUnlocked(true);
      }
      return result;
    } catch {
      return { success: false, error: 'Fehler bei der Authentifizierung' };
    }
  }, []);

  if (!archiveOpen) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen ${darkMode ? 'bg-slate-950' : 'bg-white'}`}>
        <div className="text-center">
          <h1 className={`text-4xl font-bold mb-2 ${darkMode ? 'text-primary-400' : 'text-primary-700'}`}>SaveYourData</h1>
          <p className={`mb-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sicher archivieren, erkennen, ordnen und wiederfinden.</p>
          <div className="flex gap-4">
            <button onClick={handleCreateArchive} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors">
              Neues Archiv
            </button>
            <button onClick={handleOpenArchive} className={`px-6 py-3 rounded-lg font-medium transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
              Archiv öffnen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const bg = darkMode ? 'bg-slate-950' : 'bg-white';
  const text = darkMode ? 'text-slate-100' : 'text-slate-900';
  const sidebarBg = darkMode ? 'bg-slate-900' : 'bg-slate-100';
  const border = darkMode ? 'border-slate-800' : 'border-slate-200';

  return (
    <div className={`flex flex-col h-screen ${bg} ${text}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={handleDragDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-primary-600/20 border-4 border-dashed border-primary-400 flex items-center justify-center">
          <div className="text-4xl text-primary-400 font-bold">Dokumente ablegen</div>
        </div>
      )}

      <div className={`flex items-center justify-between h-10 px-4 border-b ${border} ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className={`font-semibold ${darkMode ? 'text-primary-400' : 'text-primary-700'}`}>SaveYourData</span>
          <span className="text-slate-500">|</span>
          <span>{archiveName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setDarkMode(!darkMode)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded text-slate-400 text-xs" title="Dark/Light Mode">
            {darkMode ? '☀' : '🌙'}
          </button>
          <button onClick={() => window.electronAPI.window.minimize()} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded text-slate-400">─</button>
          <button onClick={() => window.electronAPI.window.maximize()} className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded text-slate-400">□</button>
          <button onClick={() => window.electronAPI.window.close()} className="w-8 h-8 flex items-center justify-center hover:bg-red-700 rounded text-slate-400">✕</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <nav className={`w-56 border-r ${border} ${sidebarBg} flex flex-col shrink-0`}>
          <div className="p-4 space-y-1">
            <SidebarItem icon="📊" label="Dashboard" active={view === 'dashboard'} darkMode={darkMode} onClick={() => setView('dashboard')} />
            <SidebarItem icon="📥" label="Posteingang" active={view === 'inbox'} darkMode={darkMode} onClick={() => { setView('inbox'); loadDocuments(); }} />
            <SidebarItem icon="✅" label="Prüfen" active={view === 'review'} darkMode={darkMode} onClick={() => setView('review')} />
            <SidebarItem icon="📁" label="Archiv" active={view === 'archive'} darkMode={darkMode} onClick={() => { setView('archive'); loadDocuments(); }} />
            <SidebarItem icon="🔍" label="Suche" active={view === 'search'} darkMode={darkMode} onClick={() => setView('search')} />
            <SidebarItem icon="🏢" label="Firmen" active={view === 'companies'} darkMode={darkMode} onClick={() => { setView('companies'); loadCompanies(); }} />
            <SidebarItem icon="📋" label="Protokoll" active={view === 'log'} darkMode={darkMode} onClick={() => { setView('log'); loadAudit(); }} />
            <SidebarItem icon="⚙️" label="Einstellungen" active={view === 'settings'} darkMode={darkMode} onClick={() => setView('settings')} />
            <SidebarItem icon="🔧" label="Entwickler" active={view === 'devtools'} darkMode={darkMode} onClick={() => setView('devtools')} />
          </div>
          <div className="mt-auto p-4 border-t border-slate-800">
            <button onClick={handleImport} className="w-full py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm transition-colors">
              Dokumente importieren
            </button>
          </div>
        </nav>

        <main className={`flex-1 overflow-auto p-6 ${darkMode ? '' : 'bg-white'}`}>
          {view === 'dashboard' && <DashboardView documents={documents} darkMode={darkMode} />}
          {view === 'inbox' && <InboxView documents={documents} onReview={setReviewDoc} onSelect={setSelectedDoc} darkMode={darkMode} />}
          {view === 'review' && <ReviewView documents={documents} selectedDoc={reviewDoc} onSelect={setReviewDoc} onApprove={handleReview} darkMode={darkMode} />}
          {view === 'archive' && <ArchiveView documents={documents} onSelect={setSelectedDoc} onDelete={handleDelete} onRestore={handleRestore} onExport={handleExport} darkMode={darkMode} />}
          {view === 'search' && <SearchView searchQuery={searchQuery} onSearch={handleSearch} documents={documents} onSelect={setSelectedDoc} darkMode={darkMode} />}
          {view === 'companies' && <CompaniesView companies={companies} darkMode={darkMode} />}
          {view === 'log' && <LogView auditEntries={auditEntries} onRefresh={loadAudit} darkMode={darkMode} />}
          {view === 'settings' && <SettingsView darkMode={darkMode} onBackup={handleBackup} />}
          {view === 'devtools' && <DevToolsView unlocked={devUnlocked} onAuth={handleDevAuth} darkMode={darkMode} />}
          {selectedDoc && view !== 'review' && (
            <DocumentDetailView document={selectedDoc} onClose={() => setSelectedDoc(null)} darkMode={darkMode} />
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, darkMode, onClick }: { icon: string; label: string; active: boolean; darkMode: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-primary-600/20 text-primary-300'
          : darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}

// ── Dashboard ──
function DashboardView({ documents, darkMode }: { documents: Record<string, unknown>[]; darkMode: boolean }): JSX.Element {
  const inboxCount = documents.filter((d) => d.status === 'imported' || d.status === 'processing').length;
  const reviewCount = documents.filter((d) => d.status === 'review_required').length;
  const archivedCount = documents.filter((d) => d.status === 'archived').length;

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Dashboard</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Dokumente gesamt" value={documents.length} darkMode={darkMode} />
        <StatCard label="Posteingang" value={inboxCount} darkMode={darkMode} />
        <StatCard label="Zu prüfen" value={reviewCount} darkMode={darkMode} />
        <StatCard label="Archiviert" value={archivedCount} darkMode={darkMode} />
      </div>
      <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Zuletzt importiert</h3>
      {documents.length === 0 ? (
        <EmptyState message="Keine Dokumente vorhanden" hint="Importieren Sie Dokumente über die Schaltfläche links unten." darkMode={darkMode} />
      ) : (
        <DocumentTable documents={documents.slice(0, 10)} darkMode={darkMode} />
      )}
    </div>
  );
}

// ── Inbox ──
function InboxView({
  documents, onReview, onSelect, darkMode,
}: { documents: Record<string, unknown>[]; onReview: (d: Record<string, unknown>) => void; onSelect: (d: Record<string, unknown>) => void; darkMode: boolean }): JSX.Element {
  const inboxDocs = documents.filter((d) => d.status === 'imported' || d.status === 'processing' || d.status === 'review_required');
  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Posteingang</h2>
      {inboxDocs.length === 0 ? (
        <EmptyState message="Posteingang ist leer" hint="Alle Dokumente wurden verarbeitet." darkMode={darkMode} />
      ) : (
        <DocumentTable documents={inboxDocs} onSelect={onSelect} onReview={onReview} showActions darkMode={darkMode} />
      )}
    </div>
  );
}

// ── Review ──
function ReviewView({
  documents, selectedDoc, onSelect, onApprove, darkMode,
}: { documents: Record<string, unknown>[]; selectedDoc: Record<string, unknown> | null; onSelect: (d: Record<string, unknown> | null) => void; onApprove: (docId: string, approved: boolean) => void; darkMode: boolean }): JSX.Element {
  const reviewDocs = documents.filter((d) => d.status === 'review_required' || d.status === 'imported');

  if (selectedDoc) {
    const bg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
    const border = darkMode ? 'border-slate-800' : 'border-slate-200';
    const textColor = darkMode ? 'text-white' : 'text-slate-900';
    const labelColor = darkMode ? 'text-slate-400' : 'text-slate-600';

    return (
      <div>
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => onSelect(null)} className="text-slate-400 hover:text-white">← Zurück</button>
          <h2 className={`text-2xl font-bold ${textColor}`}>Prüfen: {selectedDoc.display_name as string}</h2>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className={`${bg} border ${border} rounded-lg p-4`}>
            <h3 className={`text-sm font-semibold mb-3 ${labelColor}`}>Dokumentvorschau</h3>
            <div className={`aspect-[3/4] rounded flex items-center justify-center ${darkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-400'}`}>
              Vorschau nicht verfügbar
            </div>
          </div>
          <div className="space-y-4">
            <div className={`${bg} border ${border} rounded-lg p-4`}>
              <h3 className={`text-sm font-semibold mb-3 ${labelColor}`}>Erkannte Metadaten</h3>
              <dl className="space-y-2">
                <MetadataField label="Titel" value={selectedDoc.display_name as string} confidence={0.95} darkMode={darkMode} />
                <MetadataField label="Status" value={selectedDoc.status as string} confidence={0.95} darkMode={darkMode} />
                <MetadataField label="MIME-Typ" value={selectedDoc.mime_type as string} confidence={0.95} darkMode={darkMode} />
                <MetadataField label="Datum" value={selectedDoc.document_date as string} confidence={selectedDoc.document_date ? 0.85 : 0} darkMode={darkMode} />
                <MetadataField label="Betrag" value={selectedDoc.amount ? `${selectedDoc.amount} ${selectedDoc.currency || ''}` : null} confidence={selectedDoc.amount ? 0.80 : 0} darkMode={darkMode} />
                <MetadataField label="Kategorie" value={selectedDoc.category as string} confidence={selectedDoc.category ? 0.75 : 0} darkMode={darkMode} />
              </dl>
            </div>
            <div className="flex gap-3">
              <button onClick={() => onApprove(selectedDoc.id as string, true)} className="flex-1 py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition-colors">
                Bestätigen
              </button>
              <button onClick={() => onApprove(selectedDoc.id as string, false)} className="flex-1 py-2 px-4 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium text-sm transition-colors">
                Später prüfen
              </button>
              <button onClick={() => onSelect(null)} className={`py-2 px-4 rounded-lg font-medium text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
                Verwerfen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Prüfen</h2>
      {reviewDocs.length === 0 ? (
        <EmptyState message="Keine zu prüfenden Dokumente" hint="Importierte Dokumente erscheinen hier zur Prüfung." darkMode={darkMode} />
      ) : (
        <DocumentTable documents={reviewDocs} onSelect={onSelect} onReview={onSelect} showActions darkMode={darkMode} />
      )}
    </div>
  );
}

function MetadataField({ label, value, confidence, darkMode }: { label: string; value: string | null; confidence: number; darkMode: boolean }): JSX.Element {
  const isLow = confidence > 0 && confidence < 0.65;
  const isMedium = confidence >= 0.65 && confidence < 0.90;
  const color = isLow ? 'text-red-400' : isMedium ? 'text-yellow-400' : darkMode ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="flex justify-between items-center">
      <dt className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}</dt>
      <dd className={`text-sm ${color}`}>
        {value || '—'}
        {confidence > 0 && confidence < 0.90 && (
          <span className="ml-1 text-xs opacity-60">({Math.round(confidence * 100)}%)</span>
        )}
      </dd>
    </div>
  );
}

// ── Archive ──
function ArchiveView({
  documents, onSelect, onDelete, onRestore, onExport, darkMode,
}: { documents: Record<string, unknown>[]; onSelect: (d: Record<string, unknown>) => void; onDelete: (id: string) => void; onRestore: (id: string) => void; onExport: (id: string) => void; darkMode: boolean }): JSX.Element {
  const archivedDocs = documents.filter((d) => d.status === 'archived' || d.status === 'trash');
  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Archiv</h2>
      {archivedDocs.length === 0 ? (
        <EmptyState message="Archiv ist leer" hint="Bestätigte Dokumente erscheinen hier." darkMode={darkMode} />
      ) : (
        <DocumentTable documents={archivedDocs} onSelect={onSelect} onDelete={onDelete} onRestore={onRestore} onExport={onExport} showActions darkMode={darkMode} />
      )}
    </div>
  );
}

// ── Search ──
function SearchView({
  searchQuery, onSearch, documents, onSelect, darkMode,
}: { searchQuery: string; onSearch: (q: string) => void; documents: Record<string, unknown>[]; onSelect: (d: Record<string, unknown>) => void; darkMode: boolean }): JSX.Element {
  const border = darkMode ? 'border-slate-700' : 'border-slate-300';
  const bg = darkMode ? 'bg-slate-800' : 'bg-white';
  const textColor = darkMode ? 'text-white' : 'text-slate-900';
  const placeholder = darkMode ? 'placeholder-slate-500' : 'placeholder-slate-400';

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Suche</h2>
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          autoFocus
          placeholder="Volltext, Firma, Nummer, Tags..."
          className={`w-full px-4 py-3 border ${border} rounded-lg ${bg} ${textColor} ${placeholder} focus:outline-none focus:border-primary-500`}
        />
      </div>
      <DocumentTable documents={documents} onSelect={onSelect} darkMode={darkMode} />
    </div>
  );
}

// ── Companies ──
function CompaniesView({ companies, darkMode }: { companies: Record<string, unknown>[]; darkMode: boolean }): JSX.Element {
  const border = darkMode ? 'border-slate-800' : 'border-slate-200';
  const bg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const hover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100';
  const textColor = darkMode ? 'text-white' : 'text-slate-900';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${textColor}`}>Firmen</h2>
      {companies.length === 0 ? (
        <EmptyState message="Noch keine Firmen erkannt" hint="Firmen werden beim Import automatisch erkannt und hier angelegt." darkMode={darkMode} />
      ) : (
        <div className={`${bg} border ${border} rounded-lg overflow-hidden`}>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${border} text-left`}>
                <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Name</th>
                <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Normalisiert</th>
                <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Erstellt</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((co) => (
                <tr key={co.id as string} className={`border-b ${border} ${hover}`}>
                  <td className={`px-4 py-3 text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{co.name as string}</td>
                  <td className={`px-4 py-3 text-sm ${textMuted}`}>{co.normalized_name as string}</td>
                  <td className={`px-4 py-3 text-sm ${textMuted}`}>{co.created_at as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Audit Log ──
function LogView({
  auditEntries, onRefresh, darkMode,
}: { auditEntries: Record<string, unknown>[]; onRefresh: (date?: string) => void; darkMode: boolean }): JSX.Element {
  const today = new Date().toISOString().slice(0, 10);
  const bg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const border = darkMode ? 'border-slate-800' : 'border-slate-200';
  const textColor = darkMode ? 'text-white' : 'text-slate-900';
  const textMuted = darkMode ? 'text-slate-500' : 'text-slate-400';
  const textLabel = darkMode ? 'text-slate-200' : 'text-slate-800';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-2xl font-bold ${textColor}`}>Protokoll</h2>
        <div className="flex gap-2">
          <button onClick={() => onRefresh(today)} className={`px-3 py-1.5 rounded text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>Heute</button>
          <button onClick={() => onRefresh()} className={`px-3 py-1.5 rounded text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>Alle</button>
        </div>
      </div>
      {auditEntries.length === 0 ? (
        <EmptyState message="Keine Protokolleinträge" hint="Aktionen werden automatisch protokolliert." darkMode={darkMode} />
      ) : (
        <div className="space-y-2">
          {auditEntries.map((entry) => (
            <div key={entry.id as string} className={`${bg} border ${border} rounded-lg p-3`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${textLabel}`}>{entry.action as string}</span>
                <span className={`text-xs ${textMuted}`}>{entry.timestamp as string}</span>
              </div>
              <div className="flex gap-3 mt-1 text-xs text-slate-400">
                <span>{entry.object_type as string}: {entry.object_id as string}</span>
                <span className={entry.result === 'success' ? 'text-green-400' : 'text-red-400'}>{entry.result as string}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings ──
function SettingsView({ darkMode, onBackup }: { darkMode: boolean; onBackup: () => void }): JSX.Element {
  const bg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const border = darkMode ? 'border-slate-800' : 'border-slate-200';
  const textColor = darkMode ? 'text-white' : 'text-slate-900';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';
  const textLabel = darkMode ? 'text-slate-300' : 'text-slate-700';

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${textColor}`}>Einstellungen</h2>
      <div className="space-y-6 max-w-xl">
        <div className={`${bg} border ${border} rounded-lg p-4`}>
          <h3 className={`text-sm font-semibold mb-3 ${textLabel}`}>Anzeigename</h3>
          <p className={`text-sm ${textMuted} mb-2`}>Muster für Dokumentnamen:</p>
          <code className={`px-3 py-1 rounded text-sm ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>{'{datum} - {firma} - {typ}'}</code>
        </div>
        <div className={`${bg} border ${border} rounded-lg p-4`}>
          <h3 className={`text-sm font-semibold mb-3 ${textLabel}`}>Sicherheit</h3>
          <label className={`flex items-center gap-3 ${textMuted}`}>
            <input type="checkbox" defaultChecked className="rounded" />
            Archiv nach Inaktivität automatisch sperren
          </label>
        </div>
        <div className={`${bg} border ${border} rounded-lg p-4`}>
          <h3 className={`text-sm font-semibold mb-3 ${textLabel}`}>Backup</h3>
          <button onClick={onBackup} className={`px-4 py-2 rounded-lg text-sm transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}>
            Backup jetzt erstellen
          </button>
        </div>
        <div className={`${bg} border ${border} rounded-lg p-4`}>
          <h3 className={`text-sm font-semibold mb-3 ${textLabel}`}>OCR</h3>
          <label className={`flex items-center gap-3 ${textMuted}`}>
            <input type="checkbox" defaultChecked className="rounded" /> Deutsch
          </label>
          <label className={`flex items-center gap-3 ${textMuted} mt-2`}>
            <input type="checkbox" defaultChecked className="rounded" /> Englisch
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Developer Tools ──
function DevToolsView({ unlocked, onAuth, darkMode }: { unlocked: boolean; onAuth: (password: string) => Promise<{ success: boolean; error?: string }>; darkMode: boolean }): JSX.Element {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [devData, setDevData] = useState<Record<string, unknown> | null>(null);
  const [integrity, setIntegrity] = useState<{ integrity_check: string }[] | null>(null);
  const bg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const border = darkMode ? 'border-slate-800' : 'border-slate-200';
  const textColor = darkMode ? 'text-white' : 'text-slate-900';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';

  const handleAuth = useCallback(async () => {
    const result = await onAuth(password);
    if (result.success) {
      setError('');
      const data = await window.electronAPI.devtools.data();
      if (data.success) setDevData(data);
    } else {
      setError(result.error || 'Authentifizierung fehlgeschlagen');
    }
  }, [password, onAuth]);

  const handleCheckIntegrity = useCallback(async () => {
    const result = await window.electronAPI.devtools.checkIntegrity();
    if (result.success && result.result) {
      setIntegrity(result.result);
    }
  }, []);

  if (!unlocked) {
    return (
      <div>
        <h2 className={`text-2xl font-bold mb-6 ${textColor}`}>Entwicklerwerkzeuge</h2>
        <div className="max-w-md">
          <p className={`text-sm mb-4 ${textMuted}`}>Entwicklerwerkzeuge sind passwortgeschützt.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Entwicklerpasswort"
            className={`w-full px-4 py-3 border ${border} ${darkMode ? 'bg-slate-800 text-white placeholder-slate-500' : 'bg-white text-slate-900 placeholder-slate-400'} rounded-lg focus:outline-none focus:border-primary-500 mb-3`}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
          />
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          <button onClick={handleAuth} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors">
            Entsperren
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={`text-2xl font-bold mb-6 ${textColor}`}>Entwicklerwerkzeuge</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard label="Schema-Version" value={devData?.schemaVersion as number ?? 0} darkMode={darkMode} />
        <StatCard label="Dokumente" value={devData?.documentCount as number ?? 0} darkMode={darkMode} />
        <StatCard label="Jobs" value={devData?.jobCount as number ?? 0} darkMode={darkMode} />
        <StatCard label="Verschlüsselt" value={devData?.archiveEncrypted ? 'Ja' : 'Nein'} darkMode={darkMode} />
      </div>
      <div className={`${bg} border ${border} rounded-lg p-4 mb-4`}>
        <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Integritätsprüfung</h3>
        <button onClick={handleCheckIntegrity} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors mb-3">
          Prüfen
        </button>
        {integrity && (
          <div className="space-y-1">
            {integrity.map((r, i) => (
              <p key={i} className={`text-sm ${r.integrity_check === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {r.integrity_check}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Document Detail ──
function DocumentDetailView({
  document: doc, onClose, darkMode,
}: { document: Record<string, unknown>; onClose: () => void; darkMode: boolean }): JSX.Element {
  const bg = darkMode ? 'bg-slate-900' : 'bg-white';
  const border = darkMode ? 'border-slate-700' : 'border-slate-300';
  const textColor = darkMode ? 'text-white' : 'text-slate-900';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className={`${bg} border ${border} rounded-lg w-[600px] max-h-[80vh] overflow-auto`}>
        <div className={`flex items-center justify-between p-4 border-b ${border}`}>
          <h3 className={`text-lg font-semibold ${textColor}`}>{doc.display_name as string}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <DetailRow label="Originalname" value={doc.original_name as string} darkMode={darkMode} />
          <DetailRow label="Status" value={<StatusBadge status={doc.status as string} />} darkMode={darkMode} />
          <DetailRow label="MIME-Typ" value={doc.mime_type as string} darkMode={darkMode} />
          <DetailRow label="SHA-256" value={`${(doc.sha256_hash as string).slice(0, 16)}...`} darkMode={darkMode} />
          <DetailRow label="Datum" value={doc.document_date as string} darkMode={darkMode} />
          <DetailRow label="Betrag" value={doc.amount ? `${doc.amount} ${doc.currency || ''}` : '—'} darkMode={darkMode} />
          <DetailRow label="Zahlungsstatus" value={doc.payment_status as string} darkMode={darkMode} />
          <DetailRow label="Fälligkeitsdatum" value={doc.due_date as string || '—'} darkMode={darkMode} />
          <DetailRow label="Kategorie" value={doc.category as string || '—'} darkMode={darkMode} />
          <DetailRow label="Sprache" value={doc.language as string || '—'} darkMode={darkMode} />
          <DetailRow label="Erstellt" value={doc.created_at as string} darkMode={darkMode} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, darkMode }: { label: string; value: React.ReactNode; darkMode: boolean }): JSX.Element {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
      <span className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{value || '—'}</span>
    </div>
  );
}

// ── Shared components ──
function StatCard({ label, value, darkMode }: { label: string; value: string | number; darkMode: boolean }): JSX.Element {
  const bg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const border = darkMode ? 'border-slate-800' : 'border-slate-200';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';
  const textColor = darkMode ? 'text-white' : 'text-slate-900';

  return (
    <div className={`${bg} border ${border} rounded-lg p-4`}>
      <p className={`text-sm mb-1 ${textMuted}`}>{label}</p>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
    </div>
  );
}

function EmptyState({ message, hint, darkMode }: { message: string; hint: string; darkMode: boolean }): JSX.Element {
  return (
    <div className="text-center py-12">
      <p className={`text-lg mb-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{message}</p>
      <p className={`text-sm ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{hint}</p>
    </div>
  );
}

function DocumentTable({
  documents, onSelect, onReview, onDelete, onRestore, onExport, showActions, darkMode,
}: {
  documents: Record<string, unknown>[];
  onSelect?: (doc: Record<string, unknown>) => void;
  onReview?: (doc: Record<string, unknown>) => void;
  onDelete?: (docId: string) => void;
  onRestore?: (docId: string) => void;
  onExport?: (docId: string) => void;
  showActions?: boolean;
  darkMode: boolean;
}): JSX.Element {
  const bg = darkMode ? 'bg-slate-900' : 'bg-slate-50';
  const border = darkMode ? 'border-slate-800' : 'border-slate-200';
  const hover = darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`${bg} border ${border} rounded-lg overflow-hidden`}>
      <table className="w-full">
        <thead>
          <tr className={`border-b ${border} text-left`}>
            <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Name</th>
            <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Status</th>
            <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Typ</th>
            <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Datum</th>
            {showActions && <th className={`px-4 py-3 text-sm font-medium ${textMuted}`}>Aktion</th>}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id as string} className={`border-b ${border} ${hover} cursor-pointer`} onClick={() => onSelect?.(doc)}>
              <td className={`px-4 py-3 text-sm ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{doc.display_name as string}</td>
              <td className="px-4 py-3"><StatusBadge status={doc.status as string} /></td>
              <td className={`px-4 py-3 text-sm ${textMuted}`}>{doc.mime_type as string}</td>
              <td className={`px-4 py-3 text-sm ${textMuted}`}>{doc.created_at as string}</td>
              {showActions && (
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {onReview && (doc.status === 'review_required' || doc.status === 'imported') && (
                      <button onClick={(e) => { e.stopPropagation(); onReview(doc); }} className="px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs transition-colors">Prüfen</button>
                    )}
                    {onExport && (doc.status === 'archived') && (
                      <button onClick={(e) => { e.stopPropagation(); onExport(doc.id as string); }} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors">Export</button>
                    )}
                    {(doc.status === 'archived' || doc.status === 'review_required') && onDelete && (
                      <button onClick={(e) => { e.stopPropagation(); onDelete(doc.id as string); }} className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors">Löschen</button>
                    )}
                    {doc.status === 'trash' && onRestore && (
                      <button onClick={(e) => { e.stopPropagation(); onRestore(doc.id as string); }} className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors">Wiederherstellen</button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const colors: Record<string, string> = {
    imported: 'bg-yellow-500/20 text-yellow-400',
    processing: 'bg-blue-500/20 text-blue-400',
    review_required: 'bg-orange-500/20 text-orange-400',
    archived: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    trash: 'bg-slate-500/20 text-slate-400',
  };
  const labels: Record<string, string> = {
    imported: 'Importiert',
    processing: 'In Verarbeitung',
    review_required: 'Prüfung nötig',
    archived: 'Archiviert',
    failed: 'Fehlgeschlagen',
    trash: 'Papierkorb',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-slate-500/20 text-slate-400'}`}>
      {labels[status] || status}
    </span>
  );
}