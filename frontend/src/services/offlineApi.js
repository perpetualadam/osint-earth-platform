/**
 * Offline-aware API wrapper.
 * Tries the network first; if offline or the request fails with a 503,
 * falls back to IndexedDB cached data.
 */
import { api } from "./api";
import {
  getCachedEvents,
  getCachedEvent,
  getCachedTracks,
  getCachedWebcams,
  getCachedSnapshots,
  getCachedEnvironmental,
} from "./localDb";

export const offlineApi = {
  async getEvents(params) {
    try {
      return await api.getEvents(params);
    } catch {
      console.warn("Events fetch failed, using cached data");
      return getCachedEvents(params?.event_type ? { event_type: params.event_type } : {});
    }
  },

  async getEvent(id) {
    try {
      return await api.getEvent(id);
    } catch {
      return getCachedEvent(id);
    }
  },

  async getEventSnapshots(id) {
    try {
      return await api.getEventSnapshots(id);
    } catch {
      return getCachedSnapshots(id);
    }
  },

  async getEventTimeline(id) {
    try {
      return await api.getEventTimeline(id);
    } catch {
      return getCachedSnapshots(id);
    }
  },

  async getAircraft(params) {
    try {
      return await api.getAircraft(params);
    } catch {
      console.warn("Aircraft fetch failed, using cached tracks");
      return getCachedTracks("aircraft");
    }
  },

  async getShips(params) {
    try {
      return await api.getShips(params);
    } catch {
      console.warn("Ships fetch failed, using cached tracks");
      return getCachedTracks("ship");
    }
  },

  async getWebcams(params) {
    try {
      return await api.getWebcams(params);
    } catch {
      console.warn("Webcams fetch failed, using cached data");
      return getCachedWebcams();
    }
  },

  async getHeatmap(type) {
    try {
      return await api.getHeatmap(type);
    } catch {
      return { type, points: [] };
    }
  },

  async getEnvironmental(params) {
    try {
      return await api.getEnvironmental(params);
    } catch {
      console.warn("Environmental fetch failed, using cached data");
      return getCachedEnvironmental(params?.event_type ? { event_type: params.event_type.split(",") } : {});
    }
  },

  async getReplayFrames(params) {
    try {
      return await api.getReplayFrames(params);
    } catch {
      return { frames: [], frame_count: 0 };
    }
  },

  async getTelegramGeojson(params) {
    try {
      return await api.getTelegramGeojson(params);
    } catch {
      return { type: "FeatureCollection", features: [] };
    }
  },

  async getTelegramUnmappedPosts(params) {
    try {
      return await api.getTelegramUnmappedPosts(params);
    } catch {
      return { posts: [], total: 0, limit: 0, offset: 0 };
    }
  },
};
