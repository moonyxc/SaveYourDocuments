import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import type { AuditService } from '../../app/audit-service';
import type { JobQueue } from '../jobs/queue';
import { ocrEngine } from '../ocr/engine';
import { preprocessImage, createThumbnail } from './image-processor';
import { extractMetadata } from './metadata-extractor';
import { classifyDocument } from './classifier';

const SUPPORTED_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
};

export interface ImportResult {
  filePath: string;
  success: boolean;
  documentId?: string;
  hash?: string;
  error?: string;
}

export class ImportPipeline {
  private db: Database.Database | null = null;
  private audit: AuditService | null = null;
  private jobQueue: JobQueue | null = null;

  setDatabase(db: Database.Database): void {
    this.db = db;
  }

  setAuditService(audit: AuditService): void {
    this.audit = audit;
  }

  setJobQueue(queue: JobQueue): void {
    this.jobQueue = queue;
  }

  async importFiles(filePaths: string[]): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    for (const filePath of filePaths) {
      try {
        const result = await this.importSingle(filePath);
        results.push(result);
      } catch (error) {
        results.push({
          filePath,
          success: false,
          error: error instanceof Error ? error.message : 'Unbekannter Fehler',
        });
      }
    }
    return results;
  }

  private async importSingle(filePath: string): Promise<ImportResult> {
    if (!this.db) throw new Error('No database connection');

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = SUPPORTED_MIME[ext];
    if (!mimeType) {
      return { filePath, success: false, error: 'Nicht unterstütztes Dateiformat' };
    }

    const buffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check for duplicates
    const existing = this.db
      .prepare('SELECT id FROM documents WHERE sha256_hash = ? AND status != ?')
      .get(hash, 'trash') as { id: string } | undefined;
    if (existing) {
      return { filePath, success: false, error: 'Dokument mit identischem Hash existiert bereits' };
    }

    const id = uuidv4();
    const originalName = path.basename(filePath);

    this.db
      .prepare(
        `INSERT INTO documents (id, original_name, display_name, mime_type, sha256_hash, status)
         VALUES (?, ?, ?, ?, ?, 'imported')`,
      )
      .run(id, originalName, originalName, mimeType, hash);

    this.db
      .prepare('INSERT INTO document_blobs (document_id, data, size, checksum) VALUES (?, ?, ?, ?)')
      .run(id, buffer, buffer.length, hash);

    this.audit?.log('document_import', 'document', id, 'success');

    // Enqueue processing job
    this.jobQueue?.enqueue({ documentId: id, type: 'process_document' });

    return { filePath, success: true, documentId: id, hash };
  }

  async processDocument(documentId: string): Promise<void> {
    if (!this.db) throw new Error('No database connection');

    const doc = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as Record<string, unknown> | undefined;
    if (!doc) throw new Error('Document not found');

    const blob = this.db.prepare('SELECT * FROM document_blobs WHERE document_id = ?').get(documentId) as { data: Buffer } | undefined;
    if (!blob) throw new Error('Document blob not found');

    this.db.prepare("UPDATE documents SET status = 'processing', updated_at = datetime('now') WHERE id = ?").run(documentId);

    const mimeType = doc.mime_type as string;

    // Step 1: OCR / Text Extraction
    let ocrText = '';
    let ocrConfidence = 0;
    let language = 'de';

    if (mimeType === 'application/pdf') {
      try {
        ocrText = await extractPdfTextFromBuffer(blob.data);
        language = 'de';
      } catch {
        // PDF text extraction failed, will try OCR below
      }
    }

    if (!ocrText) {
      try {
        const processed = await preprocessImage(blob.data, { grayscale: true, resize: 2000 });
        const result = await ocrEngine.recognize(processed.buffer);
        ocrText = result.text;
        ocrConfidence = result.confidence;
        language = result.language;
      } catch {
        ocrText = '';
      }
    }

    // Store OCR result
    if (ocrText) {
      this.db
        .prepare(
          `INSERT INTO document_pages (id, document_id, page_number, ocr_text, confidence, language, engine_version)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(uuidv4(), documentId, 1, ocrText, ocrConfidence, language, 'tesseract.js@5');
    }

    // Step 2: Create thumbnail
    try {
      const thumbnail = await createThumbnail(blob.data);
      this.db
        .prepare('UPDATE document_pages SET preview_blob = ? WHERE document_id = ?')
        .run(thumbnail, documentId);
    } catch {
      /* thumbnail generation is optional */
    }

    // Step 3: Extract metadata
    const metadata = extractMetadata(ocrText, doc.original_name as string);

    // Store metadata candidates
    for (const m of metadata) {
      this.db
        .prepare(
          `INSERT INTO metadata_candidates (id, document_id, field, value, confidence, location, rule)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(uuidv4(), documentId, m.field, m.value, m.confidence, m.location, m.rule);
    }

    // Step 4: Classify document
    const classification = classifyDocument(ocrText, metadata);

    // Step 5: Update document with metadata suggestions
    const dateCandidate = metadata.find((m) => m.field === 'document_date');
    const amountCandidate = metadata.find((m) => m.field === 'amount');
    const currencyCandidate = metadata.find((m) => m.field === 'currency');
    const dueDateCandidate = metadata.find((m) => m.field === 'due_date');

    this.db
      .prepare(
        `UPDATE documents SET
         category = ?, sub_category = ?,
         document_date = ?, document_date_precision = 'exact',
         amount = ?, currency = ?,
         due_date = ?,
         language = ?,
         status = 'review_required',
         updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        classification.category,
        classification.subCategory,
        dateCandidate?.value ?? null,
        amountCandidate ? parseInt(amountCandidate.value) || null : null,
        currencyCandidate?.value ?? null,
        dueDateCandidate?.value ?? null,
        language,
        documentId,
      );

    // Update FTS index
    this.db
      .prepare(
        `INSERT INTO documents_fts (rowid, display_name, ocr_text, company_name, tags)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        documentId,
        doc.display_name,
        ocrText,
        '',
        '',
      );

    this.audit?.log('document_processed', 'document', documentId, 'success');
  }
}

async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  // Use pdf.js to extract text from buffer
  const pdfjsLib = await import('pdfjs-dist');
  const data = new Uint8Array(buffer);
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return texts.join('\n');
}

export const importPipeline = new ImportPipeline();