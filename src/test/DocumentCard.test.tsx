import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentCard } from '../components/documents/DocumentCard';
import { Document } from '../types/document';

const mockDocument: Document = {
  id: 1,
  uuid: 'test-uuid',
  originalFilename: 'test.pdf',
  storedFilename: 'stored.pdf',
  fileHash: 'hash123',
  fileSize: 1024,
  mimeType: 'application/pdf',
  ocrText: 'Test OCR text',
  ocrConfidence: 85.5,
  ocrSource: 'tesseract',
  detectedDate: '2024-01-15',
  documentDate: '2024-01-15',
  detectedAmount: 123.45,
  detectedCurrency: 'EUR',
  categoryId: 1,
  companyId: 1,
  tags: ['test'],
  customMetadata: {},
  isPaid: true,
  isValidated: true,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
};

describe('DocumentCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render document filename', () => {
    render(<DocumentCard document={mockDocument} />);
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
  });

  it('should render formatted date', () => {
    render(<DocumentCard document={mockDocument} />);
    expect(screen.getByText('15.01.2024')).toBeInTheDocument();
  });

  it('should render amount', () => {
    render(<DocumentCard document={mockDocument} />);
    expect(screen.getByText('123,45 €')).toBeInTheDocument();
  });

  it('should show validated status', () => {
    render(<DocumentCard document={{ ...mockDocument, isValidated: true, isPaid: false }} />);
    expect(screen.getByText('Offen')).toBeInTheDocument();
  });

  it('should show paid status', () => {
    render(<DocumentCard document={mockDocument} />);
    expect(screen.getByText('Bezahlt')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const onClick = vi.fn();
    render(<DocumentCard document={mockDocument} onClick={onClick} />);
    fireEvent.click(screen.getByText('test.pdf').closest('div')!);
    expect(onClick).toHaveBeenCalled();
  });
});
