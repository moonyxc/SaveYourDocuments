import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { UnlockScreen } from './components/UnlockScreen';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ScanPage } from './pages/ScanPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { DeveloperPage } from './pages/DeveloperPage';

declare global {
  interface Window {
    api: {
      unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
      lock: () => Promise<{ success: boolean }>;
      isUnlocked: () => Promise<boolean>;
      openFileDialog: () => Promise<string[]>;
      readFile: (filePath: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>;
      saveFile: (data: { buffer: ArrayBuffer; filename: string; metadata?: Record<string, unknown> }) => Promise<{ success: boolean; storedFilename?: string; fileHash?: string; fileSize?: number; mimeType?: string; error?: string }>;
      documents: {
        list: (filters?: Record<string, unknown>) => Promise<unknown[]>;
        get: (id: number) => Promise<unknown>;
        create: (doc: Record<string, unknown>) => Promise<{ success: boolean; id?: number; uuid?: string; error?: string }>;
        update: (id: number, updates: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
        delete: (id: number) => Promise<{ success: boolean; error?: string }>;
      };
      search: (query: string, filters?: Record<string, unknown>) => Promise<unknown[]>;
      ocr: {
        process: (path: string) => Promise<{ success: boolean; text?: string; confidence?: number; source?: string; date?: string; amount?: number; currency?: string; error?: string }>;
        onProgress: (callback: (data: { jobId: string; progress: number }) => void) => () => void;
        visionStatus: () => Promise<{ available: boolean; downloaded: boolean }>;
      };
      model: {
        download: () => Promise<{ success: boolean; error?: string }>;
        onDownloadProgress: (callback: (data: { percent: number; eta: string }) => void) => () => void;
        checkExists: () => Promise<boolean>;
      };
      settings: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>;
      };
      log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => Promise<{ success: boolean }>;
    };
  }
}

function App() {
  const [isUnlocked, setIsUnlocked] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkUnlockStatus();
  }, []);

  const checkUnlockStatus = async () => {
    try {
      const unlocked = await window.api.isUnlocked();
      setIsUnlocked(unlocked);
    } catch {
      setIsUnlocked(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlock = async (password: string): Promise<boolean> => {
    try {
      const result = await window.api.unlock(password);
      if (result.success) {
        setIsUnlocked(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Unlock fehlgeschlagen:', error);
      return false;
    }
  };

  const handleLock = async () => {
    try {
      await window.api.lock();
    } catch (error) {
      console.error('Lock fehlgeschlagen:', error);
    }
    setIsUnlocked(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Laden...</div>
      </div>
    );
  }

  if (!isUnlocked) {
    return <UnlockScreen onUnlock={handleUnlock} />;
  }

  return (
    <Router>
      <MainLayout onLock={handleLock}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/developer" element={<DeveloperPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}

export default App;
