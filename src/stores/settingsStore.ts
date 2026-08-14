import { create } from 'zustand';
import { AppSettings } from '../types/settings';

interface SettingsStoreState {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;

  setSettings: (settings: Partial<AppSettings>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<boolean>;
}

const defaultSettings: AppSettings = {
  theme: 'dark',
  language: 'de',
  ocrConfidenceThreshold: 70,
  autoValidate: false,
  showMetadataInFilename: false,
  backupEnabled: true,
  backupInterval: 'daily',
  storagePath: '',
  developerMode: false,
};

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: defaultSettings,
  isLoading: false,
  error: null,

  setSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings },
  })),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await window.api.settings.get('app');
      if (settings && typeof settings === 'object') {
        set({ settings: { ...defaultSettings, ...(settings as Partial<AppSettings>) } });
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Fehler beim Laden der Einstellungen' });
    } finally {
      set({ isLoading: false });
    }
  },

  saveSettings: async (newSettings) => {
    const previousSettings = get().settings;
    const updatedSettings = { ...previousSettings, ...newSettings };
    set({ settings: updatedSettings, error: null });
    try {
      const result = await window.api.settings.set('app', updatedSettings);
      if (!result.success) {
        set({
          settings: previousSettings,
          error: result.error || 'Fehler beim Speichern der Einstellungen',
        });
        return false;
      }
      return true;
    } catch (error) {
      set({
        settings: previousSettings,
        error: error instanceof Error ? error.message : 'Fehler beim Speichern der Einstellungen',
      });
      return false;
    }
  },
}));
