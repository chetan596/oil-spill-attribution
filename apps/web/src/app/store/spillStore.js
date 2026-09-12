import { create } from 'zustand';
import { spillsApi } from '../../api/spills.api';

export const useSpillStore = create((set, get) => ({
  spills: [],
  totalSpills: 0,
  selectedSpill: null,
  driftData: null,
  candidateVessels: [],
  selectedVessel: null,
  activeJob: null,
  isLoading: false,
  error: null,

  /**
   * Load all spills
   */
  fetchSpills: async (params = {}) => {
    set({ isLoading: true, error: null });
    try {
      const response = await spillsApi.list(params);
      set({
        spills: response.data.spills || [],
        totalSpills: response.data.total || 0,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err.message || 'Failed to load spills',
      });
    }
  },

  /**
   * Load specific spill details, including drift and candidate vessels
   */
  fetchSpillDetails: async (spillId) => {
    set({ isLoading: true, error: null });
    try {
      const [spillRes, driftRes, vesselsRes] = await Promise.allSettled([
        spillsApi.getById(spillId),
        spillsApi.getDrift(spillId),
        spillsApi.getVessels(spillId),
      ]);

      const selectedSpill = spillRes.status === 'fulfilled' ? spillRes.value.data : null;
      const driftData = driftRes.status === 'fulfilled' ? driftRes.value.data : null;
      const candidateVessels = vesselsRes.status === 'fulfilled' ? vesselsRes.value.data : [];

      set({
        selectedSpill,
        driftData,
        candidateVessels,
        selectedVessel: candidateVessels[0] || null,
        isLoading: false,
      });

      return { selectedSpill, driftData, candidateVessels };
    } catch (err) {
      set({
        isLoading: false,
        error: err.message || 'Failed to load spill details',
      });
      throw err;
    }
  },

  setSelectedVessel: (vessel) => set({ selectedVessel: vessel }),
  setActiveJob: (job) => set({ activeJob: job }),
  clearSelectedSpill: () => set({
    selectedSpill: null,
    driftData: null,
    candidateVessels: [],
    selectedVessel: null,
  }),
}));
