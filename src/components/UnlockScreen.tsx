import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface UnlockScreenProps {
  onUnlock: (password: string) => Promise<boolean>;
}

export function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) {
      return;
    }
    if (!password.trim()) {
      setError('Bitte Passwort eingeben');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await onUnlock(password);
      if (!success) {
        setError('Falsches Passwort');
        setPassword('');
      }
    } catch {
      setError('Ein Fehler ist aufgetreten');
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">SaveYourDocuments</h1>
          <p className="text-slate-500 mt-2 text-sm">Bitte entsperre die App mit deinem Master-Passwort</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Master-Passwort"
            aria-label="Master-Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            autoFocus
          />

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Entsperren...' : 'Entsperren'}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm text-amber-400 font-medium">Wichtig</p>
              <p className="text-sm text-amber-400/70 mt-1">
                Es gibt keinen Passwort-Reset. Bei Verlust des Passworts sind alle Daten unwiderruflich verloren.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
