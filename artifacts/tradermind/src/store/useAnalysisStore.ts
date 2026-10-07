import { create } from 'zustand';

interface AnalysisState {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  currentSessionId: null,
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}));
