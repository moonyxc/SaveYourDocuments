import { create } from 'zustand';
import { Document, Category, Company, Tag } from '../types/document';

interface DocumentState {
  documents: Document[];
  categories: Category[];
  companies: Company[];
  tags: Tag[];
  selectedDocument: Document | null;
  isLoading: boolean;
  error: string | null;

  setDocuments: (documents: Document[]) => void;
  setCategories: (categories: Category[]) => void;
  setCompanies: (companies: Company[]) => void;
  setTags: (tags: Tag[]) => void;
  setSelectedDocument: (document: Document | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  addDocument: (document: Document) => void;
  updateDocument: (id: number, updates: Partial<Document>) => void;
  removeDocument: (id: number) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  categories: [],
  companies: [],
  tags: [],
  selectedDocument: null,
  isLoading: false,
  error: null,

  setDocuments: (documents) => set({ documents }),
  setCategories: (categories) => set({ categories }),
  setCompanies: (companies) => set({ companies }),
  setTags: (tags) => set({ tags }),
  setSelectedDocument: (selectedDocument) => set({ selectedDocument }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  addDocument: (document) => set((state) => ({
    documents: state.documents.some((d) => d.id === document.id)
      ? state.documents
      : [document, ...state.documents],
  })),

  updateDocument: (id, updates) => set((state) => {
    const { id: _ignoredId, uuid: _ignoredUuid, ...safeUpdates } = updates;
    return {
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, ...safeUpdates } : doc
      ),
      selectedDocument: state.selectedDocument?.id === id
        ? { ...state.selectedDocument, ...safeUpdates }
        : state.selectedDocument,
    };
  }),

  removeDocument: (id) => set((state) => ({
    documents: state.documents.filter((doc) => doc.id !== id),
    selectedDocument: state.selectedDocument?.id === id ? null : state.selectedDocument,
  })),
}));
