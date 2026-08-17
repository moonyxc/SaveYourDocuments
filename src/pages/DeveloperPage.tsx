import React, { useState } from 'react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export function DeveloperPage() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Der Entwickler-Zugang nutzt das Master-Passwort der App:
      // Ein erneuter Unlock-Versuch mit dem eingegebenen Passwort prüft den Hash im Main-Prozess.
      const unlockResult = await window.api.unlock(password);
      if (unlockResult.success) {
        setIsAuthenticated(true);
      } else {
        setError('Falsches Passwort');
      }
      setPassword('');
    } catch {
      setError('Ein Fehler ist aufgetreten');
      setPassword('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
          <h3 className="text-base font-semibold text-slate-100 mb-4">Entwickler-Zugang</h3>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="password"
              label="Master-Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error}
            />
            <Button type="submit" className="w-full">
              Anmelden
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <h3 className="text-base font-semibold text-slate-100 mb-4">Entwickler-Tools</h3>
        <div className="space-y-3">
          <Button type="button" variant="secondary" size="sm">
            Logs anzeigen
          </Button>
          <Button type="button" variant="secondary" size="sm">
            Datenbank-Status
          </Button>
          <Button type="button" variant="secondary" size="sm">
            Cache leeren
          </Button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
        <h3 className="text-base font-semibold text-slate-100 mb-4">Audit-Log</h3>
        <div className="text-sm text-slate-500">
          Keine Einträge vorhanden
        </div>
      </div>
    </div>
  );
}
