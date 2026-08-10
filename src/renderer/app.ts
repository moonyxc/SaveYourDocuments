import type {
  Category, Company, ConfirmItem, Doc, LogEntry, RendererConfig, Stats, ValidationSuggestion
} from '../shared/types';
import { CATEGORIES, CATEGORY_LABELS } from '../shared/types';

declare global {
  interface Window {
    api: import('../shared/types').Api;
  }
}

const api = window.api;

interface State {
  view: 'documents' | 'companies' | 'logs' | 'settings';
  docs: Doc[];
  companies: Company[];
  tags: string[];
  search: string;
  filterCategory: string;
  filterCompany: string;
  filterTag: string;
  filterPaid: string;
  selectedDocId: string | null;
  config: RendererConfig | null;
}

const state: State = {
  view: 'documents',
  docs: [],
  companies: [],
  tags: [],
  search: '',
  filterCategory: '',
  filterCompany: '',
  filterTag: '',
  filterPaid: '',
  selectedDocId: null,
  config: null
};

const root = document.getElementById('app') as HTMLElement;

function el(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('data-')) node.setAttribute(k, v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

function esc(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatAmount(doc: Doc): string {
  if (doc.amount === null || doc.amount === undefined) return '';
  return `${doc.amount.toFixed(2).replace('.', ',')} ${doc.currency ?? 'EUR'}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function toast(message: string, kind: 'ok' | 'error' | '' = ''): void {
  const t = el('div', { class: `toast ${kind}` }, message);
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function setLoading(text: string | null): void {
  document.querySelector('.loading-overlay')?.remove();
  if (!text) return;
  const overlay = el('div', { class: 'loading-overlay' },
    el('div', { class: 'spinner' }),
    el('div', {}, text)
  );
  document.body.append(overlay);
}

async function refresh(): Promise<void> {
  const [docs, companies, tags] = await Promise.all([
    api.listDocuments(),
    api.listCompanies(),
    api.listTags()
  ]);
  state.docs = docs;
  state.companies = companies;
  state.tags = tags;
}

function companyName(id: string | null): string {
  if (!id) return '';
  return state.companies.find((c) => c.id === id)?.name ?? '';
}

function filteredDocs(): Doc[] {
  const q = state.search.trim().toLowerCase();
  return state.docs.filter((doc) => {
    if (state.filterCategory && doc.category !== state.filterCategory) return false;
    if (state.filterCompany && doc.companyId !== state.filterCompany) return false;
    if (state.filterTag && !doc.tags.includes(state.filterTag)) return false;
    if (state.filterPaid === 'paid' && !doc.paid) return false;
    if (state.filterPaid === 'unpaid' && doc.paid) return false;
    if (q) {
      const haystack = [
        doc.title, doc.fileName, doc.ocrText, doc.notes,
        companyName(doc.companyId), ...doc.tags,
        doc.date ?? '', doc.amount !== null ? String(doc.amount) : ''
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function renderShell(content: HTMLElement): void {
  root.innerHTML = '';
  const navButtons: [State['view'], string][] = [
    ['documents', 'Dokumente'],
    ['companies', 'Firmen'],
    ['logs', 'Logs'],
    ['settings', 'Einstellungen']
  ];
  const nav = el('nav');
  for (const [view, label] of navButtons) {
    const btn = el('button', state.view === view ? { class: 'active' } : {}, label);
    btn.addEventListener('click', () => {
      state.view = view;
      state.selectedDocId = null;
      render();
    });
    nav.append(btn);
  }

  const importBtn = el('button', { class: 'btn' }, '+ Importieren');
  importBtn.addEventListener('click', startImport);

  const header = el('header', {},
    el('h1', {}, 'Save Your Documents'),
    nav,
    el('div', { class: 'header-right' }, importBtn)
  );

  const main = el('main');
  main.append(content);
  root.append(header, main);
}

function render(): void {
  switch (state.view) {
    case 'documents': renderDocuments(); break;
    case 'companies': renderCompanies(); break;
    case 'logs': renderLogs(); break;
    case 'settings': renderSettings(); break;
  }
}

function renderDocuments(): void {
  const container = el('div');

  const search = el('input', { class: 'search-input', type: 'text', placeholder: 'Suche (Titel, Text, Firma, Tag, Betrag)...', value: state.search }) as HTMLInputElement;
  search.addEventListener('input', () => {
    state.search = search.value;
    renderDocuments();
  });

  const catSelect = el('select') as HTMLSelectElement;
  catSelect.append(el('option', { value: '' }, 'Alle Kategorien'));
  for (const c of CATEGORIES) {
    catSelect.append(el('option', { value: c.value }, c.label));
  }
  catSelect.value = state.filterCategory;
  catSelect.addEventListener('change', () => { state.filterCategory = catSelect.value; renderDocuments(); });

  const compSelect = el('select') as HTMLSelectElement;
  compSelect.append(el('option', { value: '' }, 'Alle Firmen'));
  for (const c of state.companies) {
    compSelect.append(el('option', { value: c.id }, c.name));
  }
  compSelect.value = state.filterCompany;
  compSelect.addEventListener('change', () => { state.filterCompany = compSelect.value; renderDocuments(); });

  const tagSelect = el('select') as HTMLSelectElement;
  tagSelect.append(el('option', { value: '' }, 'Alle Tags'));
  for (const t of state.tags) {
    tagSelect.append(el('option', { value: t }, t));
  }
  tagSelect.value = state.filterTag;
  tagSelect.addEventListener('change', () => { state.filterTag = tagSelect.value; renderDocuments(); });

  const paidSelect = el('select') as HTMLSelectElement;
  paidSelect.append(
    el('option', { value: '' }, 'Bezahlt + offen'),
    el('option', { value: 'paid' }, 'Nur bezahlt'),
    el('option', { value: 'unpaid' }, 'Nur offen')
  );
  paidSelect.value = state.filterPaid;
  paidSelect.addEventListener('change', () => { state.filterPaid = paidSelect.value; renderDocuments(); });

  const toolbar = el('div', { class: 'toolbar' }, search, catSelect, compSelect, tagSelect, paidSelect);
  container.append(toolbar);

  const docs = filteredDocs();
  if (docs.length === 0) {
    container.append(el('div', { class: 'empty-state' },
      el('div', { class: 'icon' }, '📄'),
      el('p', {}, state.docs.length === 0
        ? 'Noch keine Dokumente. Klicke auf "Importieren", um Scans oder Fotos hinzuzufuegen.'
        : 'Keine Dokumente gefunden.')
    ));
  } else {
    const grid = el('div', { class: 'doc-grid' });
    for (const doc of docs) {
      grid.append(docCard(doc));
    }
    container.append(grid);
  }

  renderShell(container);
}

function docCard(doc: Doc): HTMLElement {
  const card = el('div', { class: 'card doc-card' });

  if (doc.mimeType.startsWith('image/')) {
    const img = el('img', { alt: doc.title }) as HTMLImageElement;
    img.src = '';
    card.append(img);
    api.getDocumentData(doc.id).then((data) => {
      if (data) img.src = data;
    });
  } else {
    card.append(el('div', { class: 'thumb-placeholder' }, '📄'));
  }

  const title = el('div', { class: 'doc-title' }, esc(doc.title));
  title.textContent = doc.title;

  const meta = el('div', { class: 'doc-meta' });
  meta.append(el('span', { class: `badge cat-${doc.category}` }, CATEGORY_LABELS[doc.category]));
  if (doc.companyId) meta.append(el('span', {}, companyName(doc.companyId)));
  if (doc.date) meta.append(el('span', {}, formatDate(doc.date)));
  if (doc.amount !== null) meta.append(el('span', {}, formatAmount(doc)));
  if (doc.amount !== null) {
    meta.append(el('span', { class: `badge ${doc.paid ? 'paid' : 'unpaid'}` }, doc.paid ? 'Bezahlt' : 'Offen'));
  }

  const tagRow = el('div');
  for (const tag of doc.tags) {
    tagRow.append(el('span', { class: 'tag' }, tag));
  }

  card.append(title, meta, tagRow);
  card.addEventListener('click', () => openDetail(doc.id));
  return card;
}

async function openDetail(id: string): Promise<void> {
  const doc = await api.getDocument(id);
  if (!doc) return;
  state.selectedDocId = id;

  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: 'modal' });
  backdrop.append(modal);
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) backdrop.remove();
  });

  modal.append(el('h2', {}, doc.title));

  const layout = el('div', { class: 'detail-layout' });
  const preview = el('div', { class: 'detail-preview' });
  if (doc.mimeType.startsWith('image/')) {
    const img = el('img', { alt: doc.title }) as HTMLImageElement;
    api.getDocumentData(doc.id).then((data) => {
      if (data) img.src = data;
      else preview.append(el('div', { class: 'pdf-hint' }, 'Vorschau nicht verfuegbar'));
    });
    preview.append(img);
  } else {
    preview.append(el('div', { class: 'pdf-hint' }, 'PDF-Datei, ueber "Oeffnen" anzeigen'));
  }

  const openBtn = el('button', { class: 'btn small' }, 'Oeffnen');
  openBtn.addEventListener('click', () => api.openDocument(doc.id));
  const revealBtn = el('button', { class: 'btn small secondary' }, 'Im Ordner zeigen');
  revealBtn.addEventListener('click', () => api.revealDocument(doc.id));
  preview.append(el('div', { style: 'display:flex; gap:8px; margin-top:10px;' }, openBtn, revealBtn));

  const form = el('div', { class: 'form-grid' });

  const titleInput = inputRow(form, 'Titel', 'text', doc.title);
  const catSel = selectRow(form, 'Kategorie', CATEGORIES.map((c) => [c.value, c.label]), doc.category);
  const compSel = el('select') as HTMLSelectElement;
  compSel.append(el('option', { value: '' }, '(keine Firma)'));
  for (const c of state.companies) compSel.append(el('option', { value: c.id }, c.name));
  compSel.value = doc.companyId ?? '';
  form.append(fieldRow('Firma', compSel));
  const dateInput = inputRow(form, 'Datum', 'date', doc.date ?? '');
  const amountInput = inputRow(form, 'Betrag', 'text', doc.amount !== null ? String(doc.amount).replace('.', ',') : '');

  const paidLabel = el('label', { class: 'form-row checkbox' });
  const paidCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
  paidCheck.checked = doc.paid;
  paidLabel.append(paidCheck, document.createTextNode('Bezahlt'));
  form.append(paidLabel);

  const showMetaLabel = el('label', { class: 'form-row checkbox' });
  const showMetaCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
  showMetaCheck.checked = doc.showMetaInName;
  showMetaLabel.append(showMetaCheck, document.createTextNode('Metadaten im Dateinamen anzeigen'));
  form.append(showMetaLabel);

  const tagsInput = inputRow(form, 'Tags (Komma-getrennt)', 'text', doc.tags.join(', '));

  const notesArea = el('textarea', { rows: '3' }) as HTMLTextAreaElement;
  notesArea.value = doc.notes;
  form.append(fieldRow('Notizen', notesArea, true));

  const saveBtn = el('button', { class: 'btn' }, 'Speichern');
  saveBtn.addEventListener('click', async () => {
    const amountRaw = amountInput.value.trim().replace(/\./g, '').replace(',', '.');
    const amount = amountRaw === '' ? null : Number(amountRaw);
    await api.updateDocument(doc.id, {
      title: titleInput.value.trim() || doc.title,
      category: catSel.value as Category,
      companyId: compSel.value || null,
      date: dateInput.value || null,
      amount: amount !== null && Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
      paid: paidCheck.checked,
      tags: tagsInput.value.split(',').map((t) => t.trim()).filter((t) => t.length > 0),
      notes: notesArea.value,
      showMetaInName: showMetaCheck.checked
    });
    toast('Gespeichert', 'ok');
    await refresh();
    backdrop.remove();
    render();
  });

  const deleteBtn = el('button', { class: 'btn danger' }, 'Loeschen');
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Dokument "${doc.title}" wirklich loeschen?`)) return;
    await api.deleteDocument(doc.id);
    toast('Geloescht', 'ok');
    await refresh();
    backdrop.remove();
    render();
  });

  const linksSection = el('div', { class: 'form-row full' });
  linksSection.append(el('label', {}, 'Verknuepfte Dokumente'));
  const linkedList = el('div', { class: 'linked-list' });
  const linked = await api.getLinks(doc.id);
  if (linked.length === 0) {
    linkedList.append(el('div', { style: 'color: var(--muted); font-size: 12px;' }, 'Keine Verknuepfungen'));
  }
  for (const other of linked) {
    const unlinkBtn = el('button', { class: 'btn small danger' }, 'Trennen');
    unlinkBtn.addEventListener('click', async () => {
      await api.unlinkDocuments(doc.id, other.id);
      backdrop.remove();
      openDetail(doc.id);
    });
    const item = el('div', { class: 'linked-item' }, el('span', {}, other.title), unlinkBtn);
    item.querySelector('span')?.addEventListener('click', () => {
      backdrop.remove();
      openDetail(other.id);
    });
    linkedList.append(item);
  }
  const linkSel = el('select') as HTMLSelectElement;
  linkSel.append(el('option', { value: '' }, 'Dokument verknuepfen...'));
  for (const other of state.docs) {
    if (other.id === doc.id || linked.some((l) => l.id === other.id)) continue;
    linkSel.append(el('option', { value: other.id }, other.title));
  }
  linkSel.addEventListener('change', async () => {
    if (!linkSel.value) return;
    await api.linkDocuments(doc.id, linkSel.value);
    backdrop.remove();
    openDetail(doc.id);
  });
  linksSection.append(linkedList, linkSel);
  form.append(linksSection);

  if (doc.ocrText) {
    const ocrBox = el('div', { class: 'ocr-box' }, doc.ocrText.slice(0, 2000));
    const ocrRow = el('div', { class: 'form-row full' }, el('label', {}, 'Erkannter Text (OCR)'), ocrBox);
    form.append(ocrRow);
  }

  layout.append(preview, form);
  modal.append(layout);

  modal.append(el('div', { class: 'modal-actions' }, deleteBtn, saveBtn));
  document.body.append(backdrop);
}

function fieldRow(label: string, field: HTMLElement, full = false): HTMLElement {
  return el('div', { class: `form-row${full ? ' full' : ''}` }, el('label', {}, label), field);
}

function inputRow(parent: HTMLElement, label: string, type: string, value: string): HTMLInputElement {
  const input = el('input', { type, value }) as HTMLInputElement;
  parent.append(fieldRow(label, input));
  return input;
}

function selectRow(parent: HTMLElement, label: string, options: [string, string][], value: string): HTMLSelectElement {
  const sel = el('select') as HTMLSelectElement;
  for (const [v, text] of options) sel.append(el('option', { value: v }, text));
  sel.value = value;
  parent.append(fieldRow(label, sel));
  return sel;
}

async function startImport(): Promise<void> {
  setLoading('Dokumente werden gescannt (OCR)...');
  try {
    const suggestions = await api.importDocuments();
    setLoading(null);
    if (suggestions.length === 0) return;
    showValidation(suggestions);
  } catch (err) {
    setLoading(null);
    toast('Import fehlgeschlagen: ' + String(err), 'error');
  }
}

function showValidation(suggestions: ValidationSuggestion[]): void {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: 'modal' });
  backdrop.append(modal);
  modal.append(el('h2', {}, `Import pruefen (${suggestions.length} Dokument${suggestions.length > 1 ? 'e' : ''})`));
  modal.append(el('p', { style: 'color: var(--muted); margin-bottom: 14px;' },
    'Bitte pruefe die erkannten Daten und korrigiere sie bei Bedarf.'));

  const items: ConfirmItem[] = suggestions.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    companyId: s.suggestedCompanyId,
    newCompanyName: s.isNewCompany ? s.suggestedCompanyName : null,
    date: s.date,
    amount: s.amount,
    currency: s.currency,
    paid: s.paid,
    tags: [...s.tags],
    notes: s.notes,
    showMetaInName: s.showMetaInName
  }));

  const list = el('div');
  suggestions.forEach((s, idx) => {
    const item = items[idx];
    const box = el('div', { class: `validation-item${s.isNewCompany ? ' new-company' : ''}` });

    const head = el('div', { class: 'validation-head' });
    if (s.thumbnailDataUrl) {
      head.append(el('img', { src: s.thumbnailDataUrl, alt: s.fileName }));
    }
    const headInfo = el('div');
    headInfo.append(el('div', { style: 'font-weight:600;' }, s.fileName));
    if (s.isNewCompany && s.suggestedCompanyName) {
      headInfo.append(el('div', { class: 'new-company-hint' },
        `Neue Firma erkannt: "${s.suggestedCompanyName}". Ordner wird angelegt.`));
    }
    if (s.ocrSnippet) {
      headInfo.append(el('div', { class: 'ocr-box', style: 'margin-top:6px; max-height:80px;' }, s.ocrSnippet));
    }
    head.append(headInfo);
    box.append(head);

    const grid = el('div', { class: 'form-grid' });

    const titleInput = el('input', { type: 'text', value: s.title }) as HTMLInputElement;
    titleInput.addEventListener('input', () => { item.title = titleInput.value; });
    grid.append(fieldRow('Titel', titleInput));

    const catSel = el('select') as HTMLSelectElement;
    for (const c of CATEGORIES) catSel.append(el('option', { value: c.value }, c.label));
    catSel.value = s.category;
    catSel.addEventListener('change', () => { item.category = catSel.value as Category; });
    grid.append(fieldRow('Kategorie', catSel));

    const compSel = el('select') as HTMLSelectElement;
    compSel.append(el('option', { value: '' }, '(keine Firma)'));
    for (const c of state.companies) compSel.append(el('option', { value: c.id }, c.name));
    if (s.suggestedCompanyId) compSel.value = s.suggestedCompanyId;
    compSel.addEventListener('change', () => {
      item.companyId = compSel.value || null;
      if (compSel.value) item.newCompanyName = null;
    });
    grid.append(fieldRow('Firma (bestehend)', compSel));

    const newCompInput = el('input', { type: 'text', value: s.isNewCompany ? (s.suggestedCompanyName ?? '') : '', placeholder: 'Neue Firma (optional)' }) as HTMLInputElement;
    newCompInput.addEventListener('input', () => {
      item.newCompanyName = newCompInput.value.trim() || null;
      if (item.newCompanyName) {
        item.companyId = null;
        compSel.value = '';
      }
    });
    grid.append(fieldRow('Neue Firma anlegen', newCompInput));

    const dateInput = el('input', { type: 'date', value: s.date ?? '' }) as HTMLInputElement;
    dateInput.addEventListener('change', () => { item.date = dateInput.value || null; });
    grid.append(fieldRow('Datum', dateInput));

    const amountInput = el('input', { type: 'text', value: s.amount !== null ? String(s.amount).replace('.', ',') : '', placeholder: '0,00' }) as HTMLInputElement;
    amountInput.addEventListener('input', () => {
      const raw = amountInput.value.trim().replace(/\./g, '').replace(',', '.');
      const num = raw === '' ? null : Number(raw);
      item.amount = num !== null && Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
      item.currency = item.amount !== null ? 'EUR' : null;
    });
    grid.append(fieldRow('Betrag', amountInput));

    const tagsInput = el('input', { type: 'text', value: s.tags.join(', '), placeholder: 'Tag1, Tag2' }) as HTMLInputElement;
    tagsInput.addEventListener('input', () => {
      item.tags = tagsInput.value.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    });
    grid.append(fieldRow('Tags', tagsInput));

    const paidLabel = el('label', { class: 'form-row checkbox' });
    const paidCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
    paidCheck.checked = s.paid;
    paidCheck.addEventListener('change', () => { item.paid = paidCheck.checked; });
    paidLabel.append(paidCheck, document.createTextNode('Bereits bezahlt'));
    grid.append(paidLabel);

    const metaLabel = el('label', { class: 'form-row checkbox' });
    const metaCheck = el('input', { type: 'checkbox' }) as HTMLInputElement;
    metaCheck.checked = s.showMetaInName;
    metaCheck.addEventListener('change', () => { item.showMetaInName = metaCheck.checked; });
    metaLabel.append(metaCheck, document.createTextNode('Metadaten im Dateinamen'));
    grid.append(metaLabel);

    box.append(grid);
    list.append(box);
  });
  modal.append(list);

  const cancelBtn = el('button', { class: 'btn secondary' }, 'Abbrechen');
  cancelBtn.addEventListener('click', async () => {
    await api.confirmImport([]);
    backdrop.remove();
  });

  const confirmBtn = el('button', { class: 'btn' }, 'Alle speichern');
  confirmBtn.addEventListener('click', async () => {
    setLoading('Speichere Dokumente...');
    const result = await api.confirmImport(items);
    setLoading(null);
    backdrop.remove();
    toast(`${result.imported} Dokument(e) importiert`, 'ok');
    await refresh();
    render();
  });

  modal.append(el('div', { class: 'modal-actions' }, cancelBtn, confirmBtn));
  document.body.append(backdrop);
}

function renderCompanies(): void {
  const container = el('div');

  const newName = el('input', { type: 'text', placeholder: 'Neue Firma...' }) as HTMLInputElement;
  const addBtn = el('button', { class: 'btn' }, 'Anlegen');
  addBtn.addEventListener('click', async () => {
    const name = newName.value.trim();
    if (!name) return;
    await api.createCompany(name);
    await refresh();
    renderCompanies();
  });
  container.append(el('div', { class: 'toolbar' }, newName, addBtn));

  if (state.companies.length === 0) {
    container.append(el('div', { class: 'empty-state' },
      el('div', { class: 'icon' }, '🏢'),
      el('p', {}, 'Noch keine Firmen. Sie werden beim Import automatisch erkannt und angelegt.')
    ));
  } else {
    const card = el('div', { class: 'card' });
    const table = el('table');
    table.append(el('thead', {}, el('tr', {},
      el('th', {}, 'Name'), el('th', {}, 'Ordner'), el('th', {}, 'Dokumente'), el('th', {}, 'Aktionen')
    )));
    const tbody = el('tbody');
    for (const company of state.companies) {
      const count = state.docs.filter((d) => d.companyId === company.id).length;
      const renameBtn = el('button', { class: 'btn small secondary' }, 'Umbenennen');
      renameBtn.addEventListener('click', async () => {
        const name = prompt('Neuer Name:', company.name);
        if (name && name.trim()) {
          await api.renameCompany(company.id, name.trim());
          await refresh();
          renderCompanies();
        }
      });
      const delBtn = el('button', { class: 'btn small danger' }, 'Loeschen');
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Firma "${company.name}" loeschen? Dokumente bleiben erhalten.`)) return;
        await api.deleteCompany(company.id);
        await refresh();
        renderCompanies();
      });
      tbody.append(el('tr', {},
        el('td', {}, company.name),
        el('td', { style: 'color: var(--muted); font-size: 12px;' }, company.folderPath),
        el('td', {}, String(count)),
        el('td', {}, el('div', { style: 'display:flex; gap:6px;' }, renameBtn, delBtn))
      ));
    }
    table.append(tbody);
    card.append(table);
    container.append(card);
  }

  renderShell(container);
}

async function renderLogs(): Promise<void> {
  const container = el('div');
  const dates = await api.listLogDates();

  const dateSel = el('select') as HTMLSelectElement;
  for (const d of dates) dateSel.append(el('option', { value: d }, d));
  if (dates.length === 0) {
    container.append(el('div', { class: 'empty-state' },
      el('div', { class: 'icon' }, '📋'),
      el('p', {}, 'Noch keine Logs vorhanden.')
    ));
    renderShell(container);
    return;
  }

  const logBox = el('div', { class: 'card' });

  async function loadLogs(date: string): Promise<void> {
    const entries: LogEntry[] = await api.getLogs(date);
    logBox.innerHTML = '';
    if (entries.length === 0) {
      logBox.append(el('div', { style: 'color: var(--muted);' }, 'Keine Eintraege.'));
      return;
    }
    for (const entry of entries) {
      const details = entry.details !== undefined ? ' ' + JSON.stringify(entry.details) : '';
      logBox.append(el('div', { class: `log-entry ${entry.level}` },
        `[${entry.ts}] [${entry.level.toUpperCase()}] ${entry.event}${details}`));
    }
  }

  dateSel.addEventListener('change', () => loadLogs(dateSel.value));
  container.append(el('div', { class: 'toolbar' }, el('span', {}, 'Tag:'), dateSel));
  container.append(logBox);
  renderShell(container);
  await loadLogs(dateSel.value);
}

async function renderSettings(): Promise<void> {
  const container = el('div');
  const stats: Stats = await api.getStats();
  const status = await api.devToolsStatus();

  const statsGrid = el('div', { class: 'stats-grid' });
  const statDefs: [number, string][] = [
    [stats.documents, 'Dokumente'],
    [stats.companies, 'Firmen'],
    [stats.unpaid, 'Offene Betraege'],
    [stats.links, 'Verknuepfungen']
  ];
  for (const [value, label] of statDefs) {
    statsGrid.append(el('div', { class: 'card stat-card' },
      el('div', { class: 'value' }, String(value)),
      el('div', { class: 'label' }, label)
    ));
  }
  container.append(statsGrid);

  const storageCard = el('div', { class: 'card', style: 'margin-bottom:16px;' });
  storageCard.append(
    el('h2', { style: 'margin-bottom:8px;' }, 'Speicher'),
    el('p', { style: 'color: var(--muted); font-size: 12px;' }, `Datenbank (komprimiert): ${stats.dbFile}`),
    el('p', { style: 'color: var(--muted); font-size: 12px;' }, `Dokumente: ${stats.dataDir}`)
  );
  container.append(storageCard);

  const devCard = el('div', { class: 'card' });
  devCard.append(el('h2', { style: 'margin-bottom:12px;' }, 'Developer Tools'));

  const statusLine = el('p', { style: 'margin-bottom:12px;' },
    `Status: ${status.enabled ? 'freigeschaltet' : 'gesperrt'} | Passwort: ${status.passwordSet ? 'gesetzt' : 'nicht gesetzt'}`);
  devCard.append(statusLine);

  if (!status.passwordSet) {
    const pw1 = el('input', { type: 'password', placeholder: 'Neues Passwort (min. 4 Zeichen)' }) as HTMLInputElement;
    const setBtn = el('button', { class: 'btn' }, 'Passwort setzen');
    setBtn.addEventListener('click', async () => {
      if (pw1.value.length < 4) {
        toast('Passwort zu kurz', 'error');
        return;
      }
      const ok = await api.devToolsSetPassword('', pw1.value);
      toast(ok ? 'Passwort gesetzt' : 'Fehler', ok ? 'ok' : 'error');
      renderSettings();
    });
    devCard.append(el('div', { class: 'toolbar' }, pw1, setBtn));
  } else {
    const pw = el('input', { type: 'password', placeholder: 'Passwort' }) as HTMLInputElement;
    const enableBtn = el('button', { class: 'btn' }, status.enabled ? 'DevTools sperren' : 'Freischalten');
    enableBtn.addEventListener('click', async () => {
      if (status.enabled) {
        await api.devToolsDisable();
      } else {
        const ok = await api.devToolsEnable(pw.value);
        if (!ok) {
          toast('Falsches Passwort', 'error');
          return;
        }
      }
      renderSettings();
    });

    const toggleBtn = el('button', { class: 'btn secondary' }, 'DevTools umschalten') as HTMLButtonElement;
    toggleBtn.disabled = !status.enabled;
    toggleBtn.addEventListener('click', () => api.devToolsToggle());

    const changeBtn = el('button', { class: 'btn secondary' }, 'Passwort aendern');
    changeBtn.addEventListener('click', async () => {
      const current = prompt('Aktuelles Passwort:');
      if (current === null) return;
      const next = prompt('Neues Passwort (min. 4 Zeichen):');
      if (!next || next.length < 4) {
        toast('Passwort zu kurz', 'error');
        return;
      }
      const ok = await api.devToolsSetPassword(current, next);
      toast(ok ? 'Passwort geaendert' : 'Falsches aktuelles Passwort', ok ? 'ok' : 'error');
    });

    devCard.append(el('div', { class: 'toolbar' }, pw, enableBtn, toggleBtn, changeBtn));
  }

  container.append(devCard);
  renderShell(container);
}

async function main(): Promise<void> {
  state.config = await api.getConfig();
  await refresh();
  render();
}

main();
