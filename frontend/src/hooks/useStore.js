import { create } from "zustand";

export const useStore = create((set) => ({
  // Layer visibility
  layers: {
    satellite: true,
    aircraft: true,
    ships: true,
    wildfires: true,
    earthquakes: true,
    webcams: false,
    events: true,
    anomalies: true,
    heatmap_fires: false,
    heatmap_quakes: false,
    heatmap_shipping: false,
    heatmap_air: false,
  },
  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

  // Time range
  timeStart: new Date(Date.now() - 86400000).toISOString(),
  timeEnd: new Date().toISOString(),
  setTimeRange: (start, end) => set({ timeStart: start, timeEnd: end }),

  // Selected event for detail panel
  selectedEvent: null,
  selectEvent: (event) => set({ selectedEvent: event }),

  // Snapshot gallery
  gallerySnapshots: [],
  showGallery: false,
  openGallery: (snapshots) => set({ gallerySnapshots: snapshots, showGallery: true }),
  closeGallery: () => set({ showGallery: false }),

  // Replay state
  isPlaying: false,
  playbackSpeed: 1,
  setPlaying: (v) => set({ isPlaying: v }),
  setPlaybackSpeed: (v) => set({ playbackSpeed: v }),

  // Offline panel
  showOfflinePanel: false,
  toggleOfflinePanel: () => set((s) => ({ showOfflinePanel: !s.showOfflinePanel })),

  // Connection status
  isOnline: navigator.onLine,
  setOnline: (v) => set({ isOnline: v }),
}));
