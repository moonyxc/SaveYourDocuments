import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface AppPaths {
  userData: string;
  dataDir: string;
  storageDir: string;
  thumbnailsDir: string;
  logsDir: string;
  backupsDir: string;
  modelsDir: string;
  configDir: string;
}

export function getAppPaths(): AppPaths {
  const userData = app.getPath('userData');

  const paths: AppPaths = {
    userData,
    dataDir: path.join(userData, 'data'),
    storageDir: path.join(userData, 'storage'),
    thumbnailsDir: path.join(userData, 'thumbnails'),
    logsDir: path.join(userData, 'logs'),
    backupsDir: path.join(userData, 'backups'),
    modelsDir: path.join(userData, 'models'),
    configDir: path.join(userData, 'config'),
  };

  for (const dir of Object.values(paths)) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      throw new Error(`Verzeichnis konnte nicht erstellt werden: ${dir} (${error instanceof Error ? error.message : 'Unbekannter Fehler'})`);
    }
  }

  return paths;
}

export function getSaltPath(configDir: string): string {
  return path.join(configDir, 'salt.bin');
}

export function getPasswordHashPath(configDir: string): string {
  return path.join(configDir, 'password.hash');
}

export function getDatabasePath(dataDir: string): string {
  return path.join(dataDir, 'documents.db');
}

export function getModelPath(modelsDir: string, modelName: string): string {
  return path.join(modelsDir, modelName);
}
