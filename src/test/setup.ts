import '@testing-library/jest-dom';

const apiMock = {
  unlock: async () => ({ success: true }),
  lock: async () => ({ success: true }),
  isUnlocked: async () => true,
  openFileDialog: async () => [] as string[],
  readFile: async () => ({ success: false, error: 'not implemented' }),
  saveFile: async () => ({ success: true, storedFilename: 'test.pdf', fileHash: 'hash', fileSize: 0, mimeType: 'application/pdf' }),
  documents: {
    list: async () => [] as unknown[],
    get: async () => null,
    create: async () => ({ success: true, id: 1, uuid: 'test-uuid' }),
    update: async () => ({ success: true }),
    delete: async () => ({ success: true }),
  },
  search: async () => [] as unknown[],
  ocr: {
    process: async () => ({ success: true, text: '', confidence: 0, source: 'tesseract' }),
    onProgress: () => () => {},
    visionStatus: async () => ({ available: false, downloaded: false }),
  },
  model: {
    download: async () => ({ success: true }),
    onDownloadProgress: () => () => {},
    checkExists: async () => false,
  },
  settings: {
    get: async () => null,
    set: async () => ({ success: true }),
  },
  log: async () => ({ success: true }),
};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'api', {
    value: apiMock,
    writable: true,
    configurable: true,
  });
} else {
  (globalThis as Record<string, unknown>).window = { api: apiMock };
}
