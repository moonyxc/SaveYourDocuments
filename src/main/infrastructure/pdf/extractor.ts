import * as pdfjsLib from 'pdfjs-dist';
import * as path from 'path';
import * as fs from 'fs';

let pdfInitialized = false;

export async function initPdfWorker(): Promise<void> {
  if (pdfInitialized) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = path.resolve(
    __dirname,
    '..',
    '..',
    'node_modules',
    'pdfjs-dist',
    'build',
    'pdf.worker.mjs'
  );
  pdfInitialized = true;
}

export async function extractPdfText(filePath: string): Promise<string> {
  await initPdfWorker();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const texts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    texts.push(pageText);
  }

  return texts.join('\n');
}

export async function getPdfPageCount(filePath: string): Promise<number> {
  await initPdfWorker();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  return doc.numPages;
}