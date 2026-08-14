import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  currentView: 'grid' | 'list';
  sortBy: 'date' | 'name' | 'amount';
  sortOrder: 'asc' | 'desc';
  filterOpen: boolean;
  searchQuery: string;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: 'grid' | 'list') => void;
  setSortBy: (sortBy: 'date' | 'name' | 'amount') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  toggleFilter: () => void;
  setFilterOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  currentView: 'grid',
  sortBy: 'date',
  sortOrder: 'desc',
  filterOpen: false,
  searchQuery: '',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setCurrentView: (currentView) => set({ currentView }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  toggleFilter: () => set((state) => ({ filterOpen: !state.filterOpen })),
  setFilterOpen: (filterOpen) => set({ filterOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
