import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS, SUPPORTED_MIME_TYPES, CONFIDENCE_THRESHOLD_HIGH, CONFIDENCE_THRESHOLD_MEDIUM, MAX_FILE_SIZE_MB, ARCHIVE_EXTENSION, MAX_PAGES_PER_DOC, DEFAULT_DISPLAY_NAME_PATTERN } from '../../src/shared/domain/types';

describe('Shared domain types', () => {
  it('IPC_CHANNELS contains all required channels', () => {
    expect(IPC_CHANNELS.ARCHIVE_CREATE).toBe('archive:create');
    expect(IPC_CHANNELS.ARCHIVE_OPEN).toBe('archive:open');
    expect(IPC_CHANNELS.DOCUMENT_IMPORT).toBe('document:import');
    expect(IPC_CHANNELS.DOCUMENT_REVIEW).toBe('document:review');
    expect(IPC_CHANNELS.DOCUMENT_RESTORE).toBe('document:restore');
    expect(IPC_CHANNELS.DOCUMENT_RELATION_CREATE).toBe('document:relation:create');
    expect(IPC_CHANNELS.SEARCH).toBe('search:query');
    expect(IPC_CHANNELS.COMPANY_MERGE).toBe('company:merge');
    expect(IPC_CHANNELS.TAG_ASSIGN).toBe('tag:assign');
    expect(IPC_CHANNELS.TAG_REMOVE).toBe('tag:remove');
    expect(IPC_CHANNELS.AUDIT_GET).toBe('audit:get');
    expect(IPC_CHANNELS.AUDIT_EXPORT).toBe('audit:export');
    expect(IPC_CHANNELS.BACKUP_CREATE).toBe('backup:create');
    expect(IPC_CHANNELS.BACKUP_RESTORE).toBe('backup:restore');
    expect(IPC_CHANNELS.JOB_STATUS).toBe('job:status');
    expect(IPC_CHANNELS.JOB_CANCEL).toBe('job:cancel');
    expect(IPC_CHANNELS.DEV_TOOLS_INIT).toBe('devtools:init');
    expect(IPC_CHANNELS.DEV_TOOLS_AUTH).toBe('devtools:auth');
    expect(IPC_CHANNELS.DEV_TOOLS_DATA).toBe('devtools:data');
    expect(IPC_CHANNELS.DEV_TOOLS_CHECK_INTEGRITY).toBe('devtools:checkIntegrity');
  });

  it('SUPPORTED_MIME_TYPES includes PDF and image formats', () => {
    expect(SUPPORTED_MIME_TYPES).toContain('application/pdf');
    expect(SUPPORTED_MIME_TYPES).toContain('image/png');
    expect(SUPPORTED_MIME_TYPES).toContain('image/jpeg');
    expect(SUPPORTED_MIME_TYPES).toContain('image/tiff');
  });

  it('confidence thresholds are between 0 and 1', () => {
    expect(CONFIDENCE_THRESHOLD_HIGH).toBeGreaterThan(CONFIDENCE_THRESHOLD_MEDIUM);
    expect(CONFIDENCE_THRESHOLD_HIGH).toBeLessThanOrEqual(1);
    expect(CONFIDENCE_THRESHOLD_MEDIUM).toBeGreaterThan(0);
  });

  it('archive extension is .syd', () => {
    expect(ARCHIVE_EXTENSION).toBe('.syd');
  });

  it('MAX_FILE_SIZE_MB is positive', () => {
    expect(MAX_FILE_SIZE_MB).toBeGreaterThan(0);
  });

  it('MAX_PAGES_PER_DOC is reasonable', () => {
    expect(MAX_PAGES_PER_DOC).toBeGreaterThan(0);
    expect(MAX_PAGES_PER_DOC).toBeLessThanOrEqual(10000);
  });

  it('DEFAULT_DISPLAY_NAME_PATTERN contains placeholders', () => {
    expect(DEFAULT_DISPLAY_NAME_PATTERN).toContain('{datum}');
    expect(DEFAULT_DISPLAY_NAME_PATTERN).toContain('{firma}');
    expect(DEFAULT_DISPLAY_NAME_PATTERN).toContain('{typ}');
  });
});