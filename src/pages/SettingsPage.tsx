import React from 'react';
import { useSettings } from '../hooks/useSettings';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function SettingsPage() {
  const { settings, isLoading, error, updateSettings } = useSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner text="Lade Einstellungen..." />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-100">Allgemein</h3>

        <Select
          label="Sprache"
          value={settings.language}
          onChange={(e) => updateSettings({ language: e.target.value as 'de' | 'en' })}
          options={[
            { value: 'de', label: 'Deutsch' },
            { value: 'en', label: 'English' },
          ]}
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="autoValidate"
            checked={settings.autoValidate}
            onChange={(e) => updateSettings({ autoValidate: e.target.checked })}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="autoValidate" className="text-sm text-slate-300">
            Dokumente automatisch validieren
          </label>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-100">OCR</h3>

        <Input
          label="Konfidenz-Schwellenwert (%)"
          type="number"
          min="0"
          max="100"
          value={settings.ocrConfidenceThreshold}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = parseInt(raw, 10);
            if (raw !== '' && !isNaN(parsed) && parsed >= 0 && parsed <= 100) {
              updateSettings({ ocrConfidenceThreshold: parsed });
            }
          }}
        />
        <p className="text-xs text-slate-500">
          Bei Konfidenz unter diesem Wert wird das Vision-Modell als Fallback verwendet.
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-100">Backup</h3>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="backupEnabled"
            checked={settings.backupEnabled}
            onChange={(e) => updateSettings({ backupEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="backupEnabled" className="text-sm text-slate-300">
            Automatische Backups aktivieren
          </label>
        </div>

        <Select
          label="Backup-Intervall"
          value={settings.backupInterval}
          onChange={(e) => updateSettings({ backupInterval: e.target.value as 'daily' | 'weekly' | 'monthly' })}
          options={[
            { value: 'daily', label: 'Täglich' },
            { value: 'weekly', label: 'Wöchentlich' },
            { value: 'monthly', label: 'Monatlich' },
          ]}
        />
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-100">Entwickler</h3>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="developerMode"
            checked={settings.developerMode}
            onChange={(e) => updateSettings({ developerMode: e.target.checked })}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="developerMode" className="text-sm text-slate-300">
            Entwicklermodus aktivieren
          </label>
        </div>
      </div>
    </div>
  );
}
