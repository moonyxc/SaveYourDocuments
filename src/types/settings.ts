export interface AppSettings {
  theme: 'dark';
  language: 'de' | 'en';
  ocrConfidenceThreshold: number;
  autoValidate: boolean;
  showMetadataInFilename: boolean;
  backupEnabled: boolean;
  backupInterval: 'daily' | 'weekly' | 'monthly';
  storagePath: string;
  developerMode: boolean;
}
