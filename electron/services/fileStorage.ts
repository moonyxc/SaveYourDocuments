import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { getEncryptionKey } from '../ipc';

export interface FileStorageService {
  saveFile: (buffer: Buffer, originalFilename: string, companyName?: string) => Promise<{ storedFilename: string; fileHash: string; fileSize: number; mimeType: string }>;
  loadFile: (storedFilename: string) => Promise<Buffer>;
  deleteFile: (storedFilename: string) => Promise<void>;
  generateThumbnail: (storedFilename: string) => Promise<string>;
  getFilePath: (storedFilename: string) => string;
}

export function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/, '_$1')
    .substring(0, 50);
}

function encryptData(data: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptData(encryptedData: Buffer): Buffer {
  const key = getEncryptionKey();
  if (encryptedData.length < 48) {
    throw new Error('Datei beschädigt oder zu kurz für Entschlüsselung');
  }
  const iv = encryptedData.subarray(0, 16);
  const authTag = encryptedData.subarray(16, 32);
  const encrypted = encryptedData.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch {
    throw new Error('Entschlüsselung fehlgeschlagen - Datei beschädigt oder falsches Passwort');
  }
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.tiff': 'image/tiff',
    '.bmp': 'image/bmp',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function resolveSafePath(baseDir: string, relativePath: string): string {
  const resolved = path.resolve(baseDir, relativePath);
  const baseResolved = path.resolve(baseDir);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error('Ungültiger Dateipfad');
  }
  return resolved;
}

export function setupFileStorage(storageDir: string, thumbnailsDir: string): FileStorageService {
  return {
    saveFile: async (buffer: Buffer, originalFilename: string, companyName?: string) => {
      const uuid = crypto.randomUUID();
      const ext = path.extname(originalFilename).toLowerCase();
      const filename = `${uuid}${ext}`;
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const fileSize = buffer.length;
      const mimeType = getMimeType(originalFilename);

      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');

      let relativeDir: string;
      if (companyName) {
        const sanitized = sanitizeFolderName(companyName);
        relativeDir = path.join(sanitized, year, month);
      } else {
        relativeDir = path.join('_unsortiert', year, month);
      }

      const folderPath = resolveSafePath(storageDir, relativeDir);
      await fs.promises.mkdir(folderPath, { recursive: true });

      const encryptedData = encryptData(buffer);
      const storedFilename = path.join(relativeDir, filename);
      const filePath = resolveSafePath(storageDir, storedFilename);
      await fs.promises.writeFile(filePath, encryptedData);

      return { storedFilename, fileHash, fileSize, mimeType };
    },

    loadFile: async (storedFilename: string) => {
      const filePath = resolveSafePath(storageDir, storedFilename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${storedFilename}`);
      }
      const encryptedData = await fs.promises.readFile(filePath);
      return decryptData(encryptedData);
    },

    deleteFile: async (storedFilename: string) => {
      const filePath = resolveSafePath(storageDir, storedFilename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }

      const thumbFilename = `${path.basename(storedFilename)}_thumb.jpg`;
      const thumbPath = resolveSafePath(thumbnailsDir, thumbFilename);
      if (fs.existsSync(thumbPath)) {
        await fs.promises.unlink(thumbPath);
      }
    },

    generateThumbnail: async (storedFilename: string) => {
      const filePath = resolveSafePath(storageDir, storedFilename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${storedFilename}`);
      }

      const encryptedData = await fs.promises.readFile(filePath);
      const data = decryptData(encryptedData);

      const thumbnailFilename = `${path.basename(storedFilename)}_thumb.jpg`;
      const thumbnailPath = resolveSafePath(thumbnailsDir, thumbnailFilename);

      const thumbnailBuffer = await sharp(data)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const encryptedThumbnail = encryptData(thumbnailBuffer);
      await fs.promises.writeFile(thumbnailPath, encryptedThumbnail);

      return thumbnailFilename;
    },

    getFilePath: (storedFilename: string) => {
      return resolveSafePath(storageDir, storedFilename);
    },
  };
}
