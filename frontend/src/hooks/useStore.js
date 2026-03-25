import { create } from "zustand";

export const useStore = create((set) => ({
  // Layer visibility
  layers: {
    satellite: true,
    sentinel2: false,
    nasa_modis: false,
    nasa_blue_marble: false,
    aircraft: true,
    ships: true,
    wildfires: true,
    earthquakes: true,
    webcams: true,
    events: true,
    anomalies: true,
    heatmap_fires: false,
    heatmap_quakes: false,
    heatmap_shipping: false,
    heatmap_air: false,
    telegram: true,
    ctx_admin0: false,
    ctx_airports: false,
    ctx_ports: false,
    ctx_military: false,
    ctx_crossings: false,
    ctx_energy: false,
    territorial: false,
  },
  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

  // Default window: wide enough for GDELT calendar-day occurred_at + recent ingests (see API time filter)
  timeStart: new Date(Date.now() - 14 * 86400000).toISOString(),
  timeEnd: new Date().toISOString(),
  setTimeRange: (start, end) => set({ timeStart: start, timeEnd: end }),
  timePreset: null,
  setTimePreset: (preset) => set({ timePreset: preset }),

  // Event filters (event_type, source, severity_min)
  eventFilters: { dedupe: true, event_type: "", source: "", severity_min: "" },
  setEventFilters: (f) => set((s) => ({ eventFilters: { ...s.eventFilters, ...f } })),

  /** [west, south, east, north] in degrees — updated from globe camera (debounced) */
  mapBbox: null,
  setMapBbox: (bbox) => set({ mapBbox: bbox }),

  /** all | military | interesting — passed to /api/aircraft and client filter for live socket */
  aircraftPreset: "all",
  setAircraftPreset: (preset) => set({ aircraftPreset: preset || "all" }),
  aircraftCallsignPrefix: "",
  setAircraftCallsignPrefix: (s) => set({ aircraftCallsignPrefix: s || "" }),
  aircraftMinAltitude: "",
  setAircraftMinAltitude: (s) => set({ aircraftMinAltitude: s }),
  aircraftMaxAltitude: "",
  setAircraftMaxAltitude: (s) => set({ aircraftMaxAltitude: s }),
  aircraftMinVelocity: "",
  setAircraftMinVelocity: (s) => set({ aircraftMinVelocity: s }),

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

  // Theme (dark by default)
  darkTheme: true,
  toggleTheme: () => set((s) => {
    const next = !s.darkTheme;
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light-theme", !next);
      try { localStorage.setItem("osint-theme", next ? "dark" : "light"); } catch (_) {}
    }
    return { darkTheme: next };
  }),

  // Mobile: layer panel collapsed
  layerPanelOpen: true,
  toggleLayerPanel: () => set((s) => ({ layerPanelOpen: !s.layerPanelOpen })),

  // Trigger anomalies refetch after AI scan
  anomaliesRefreshTrigger: 0,
  triggerAnomaliesRefresh: () => set((s) => ({ anomaliesRefreshTrigger: s.anomaliesRefreshTrigger + 1 })),

  telegramRefreshTrigger: 0,
  triggerTelegramRefresh: () => set((s) => ({ telegramRefreshTrigger: s.telegramRefreshTrigger + 1 })),

  // Browser notifications for new events/anomalies
  notificationsEnabled: false,
  setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
}));
