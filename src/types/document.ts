export interface Document {
  id: number;
  uuid: string;
  originalFilename: string;
  storedFilename: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  ocrText?: string;
  ocrConfidence?: number;
  ocrSource?: 'tesseract' | 'vision_fallback';
  detectedDate?: string;
  detectedAmount?: number;
  detectedCurrency?: string;
  categoryId?: number;
  companyId?: number;
  tags: string[];
  customMetadata: Record<string, unknown>;
  isPaid: boolean;
  isValidated: boolean;
  validationNotes?: string;
  documentDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentLink {
  id: number;
  sourceDocumentId: number;
  targetDocumentId: number;
  linkType: 'response' | 'attachment' | 'related' | 'reminder';
  notes?: string;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  parentId?: number;
  color: string;
  icon?: string;
  createdAt: string;
}

export interface Company {
  id: number;
  name: string;
  folderPath?: string;
  createdAt: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}
