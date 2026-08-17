import React from 'react';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/documents': 'Dokumente',
  '/scan': 'Dokument scannen',
  '/search': 'Suche',
  '/settings': 'Einstellungen',
  '/developer': 'Entwickler',
};

function resolveTitle(pathname: string): string {
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }
  const base = '/' + pathname.split('/')[1];
  return pageTitles[base] || 'SaveYourDocuments';
}

interface HeaderProps {
  onLock: () => void;
}

export function Header({ onLock }: HeaderProps) {
  const location = useLocation();
  const title = resolveTitle(location.pathname);

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onLock}
          aria-label="App sperren"
          title="App sperren"
          className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
