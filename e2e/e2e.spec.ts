import { test, expect } from '@playwright/test';

const apiMock = `
window.api = {
  unlock: async () => ({ success: true }),
  lock: async () => ({ success: true }),
  isUnlocked: async () => false,
  openFileDialog: async () => [],
  readFile: async () => ({ success: false, error: 'not implemented' }),
  saveFile: async () => ({ success: true, storedFilename: 'test.pdf', fileHash: 'hash', fileSize: 0, mimeType: 'application/pdf' }),
  documents: {
    list: async () => [],
    get: async () => null,
    create: async () => ({ success: true, id: 1, uuid: 'test-uuid' }),
    update: async () => ({ success: true }),
    delete: async () => ({ success: true }),
  },
  search: async () => [],
  ocr: {
    process: async () => ({ success: true, text: '', confidence: 0, source: 'tesseract' }),
    onProgress: () => () => {},
    visionStatus: async () => ({ available: false, downloaded: false }),
  },
  model: {
    download: async () => ({ success: false, error: 'not available' }),
    onDownloadProgress: () => () => {},
    checkExists: async () => false,
  },
  settings: {
    get: async () => null,
    set: async () => ({ success: true }),
  },
  log: async () => ({ success: true }),
};
`;

async function unlockApp(page: import('@playwright/test').Page) {
  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill('testpassword');
  await page.click('button[type="submit"]');
  await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
}

test.describe('SaveYourDocuments E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(apiMock);
    await page.goto('/');
  });

  test('should show unlock screen', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('SaveYourDocuments');
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should unlock with password', async ({ page }) => {
    await page.fill('input[type="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to documents page', async ({ page }) => {
    await unlockApp(page);
    await page.click('text=Dokumente');
    await expect(page.locator('h2')).toContainText('Dokumente');
  });

  test('should navigate to scan page', async ({ page }) => {
    await unlockApp(page);
    await page.click('text=Scannen');
    await expect(page.locator('h2')).toContainText('Dokument scannen');
  });

  test('should navigate to search page', async ({ page }) => {
    await unlockApp(page);
    await page.click('text=Suche');
    await expect(page.locator('h2')).toContainText('Suche');
  });

  test('should navigate to settings page', async ({ page }) => {
    await unlockApp(page);
    await page.click('text=Einstellungen');
    await expect(page.locator('h2')).toContainText('Einstellungen');
  });
});
