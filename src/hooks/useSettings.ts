import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { AppSettings } from '../types/settings';

export function useSettings() {
  const {
    settings,
    isLoading,
    error,
    loadSettings,
    saveSettings,
  } = useSettingsStore();

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadSettings();
    }
  }, [loadSettings]);

  const updateSettings = async (newSettings: Partial<AppSettings>): Promise<boolean> => {
    return saveSettings(newSettings);
  };

  return {
    settings,
    isLoading,
    error,
    updateSettings,
  };
}
