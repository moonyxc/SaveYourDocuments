import React, { useCallback, useState } from 'react';
import { Button } from '../ui/Button';

export interface UploadItem {
  name: string;
  file?: File;
  path?: string;
}

interface DocumentUploadProps {
  onUpload: (items: UploadItem[]) => void;
  isProcessing?: boolean;
}

export function DocumentUpload({ onUpload, isProcessing }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    onUpload(files.map((file) => ({ name: file.name, file })));
  }, [onUpload]);

  const handleFileSelect = useCallback(async () => {
    try {
      const paths = await window.api.openFileDialog();
      if (Array.isArray(paths) && paths.length > 0) {
        onUpload(paths.map((p) => ({ name: p.split(/[\\/]/).pop() || p, path: p })));
      }
    } catch (error) {
      console.error('Dateidialog fehlgeschlagen:', error);
    }
  }, [onUpload]);

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        isDragging
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-slate-600 hover:border-slate-500'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <svg
        className="w-12 h-12 text-slate-500 mx-auto mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p className="text-slate-300 mb-2">
        Dateien hierher ziehen oder
      </p>
      <Button type="button" onClick={handleFileSelect} disabled={isProcessing}>
        {isProcessing ? 'Verarbeitung...' : 'Dateien auswählen'}
      </Button>
      <p className="text-xs text-slate-500 mt-4">
        Unterstützte Formate: JPG, PNG, PDF, TIFF, BMP
      </p>
    </div>
  );
}
