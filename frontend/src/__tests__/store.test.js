/**
 * Zustand store unit tests.
 * Run: cd frontend && npx vitest run
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "../hooks/useStore";

describe("useStore", () => {
  beforeEach(() => {
    useStore.setState({
      layers: {
        satellite: true,
        viirs: false,
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
      selectedEvent: null,
      isPlaying: false,
      playbackSpeed: 1,
      showGallery: false,
      showOfflinePanel: false,
      isOnline: true,
    });
  });

  it("has correct default layer states", () => {
    const state = useStore.getState();
    expect(state.layers.satellite).toBe(true);
    expect(state.layers.webcams).toBe(false);
    expect(state.layers.aircraft).toBe(true);
  });

  it("toggleLayer flips a layer", () => {
    useStore.getState().toggleLayer("webcams");
    expect(useStore.getState().layers.webcams).toBe(true);

    useStore.getState().toggleLayer("webcams");
    expect(useStore.getState().layers.webcams).toBe(false);
  });

  it("selectEvent sets and clears selected event", () => {
    const event = { id: 1, event_type: "wildfire", title: "Test" };
    useStore.getState().selectEvent(event);
    expect(useStore.getState().selectedEvent).toEqual(event);

    useStore.getState().selectEvent(null);
    expect(useStore.getState().selectedEvent).toBeNull();
  });

  it("setTimeRange updates time range", () => {
    useStore.getState().setTimeRange("2020-01-01", "2020-12-31");
    expect(useStore.getState().timeStart).toBe("2020-01-01");
    expect(useStore.getState().timeEnd).toBe("2020-12-31");
  });

  it("setPlaying toggles playback", () => {
    useStore.getState().setPlaying(true);
    expect(useStore.getState().isPlaying).toBe(true);
  });

  it("setPlaybackSpeed changes speed", () => {
    useStore.getState().setPlaybackSpeed(20);
    expect(useStore.getState().playbackSpeed).toBe(20);
  });

  it("openGallery and closeGallery manage snapshot gallery", () => {
    const snaps = [{ id: 1 }, { id: 2 }];
    useStore.getState().openGallery(snaps);
    expect(useStore.getState().showGallery).toBe(true);
    expect(useStore.getState().gallerySnapshots).toEqual(snaps);

    useStore.getState().closeGallery();
    expect(useStore.getState().showGallery).toBe(false);
  });

  it("toggleOfflinePanel toggles visibility", () => {
    expect(useStore.getState().showOfflinePanel).toBe(false);
    useStore.getState().toggleOfflinePanel();
    expect(useStore.getState().showOfflinePanel).toBe(true);
    useStore.getState().toggleOfflinePanel();
    expect(useStore.getState().showOfflinePanel).toBe(false);
  });

  it("setOnline tracks connection state", () => {
    useStore.getState().setOnline(false);
    expect(useStore.getState().isOnline).toBe(false);
  });
});
