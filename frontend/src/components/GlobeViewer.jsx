import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  Viewer,
  Cartesian3,
  createWorldTerrainAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  UrlTemplateImageryProvider,
  IonImageryProvider,
  CustomDataSource,
  EntityCluster,
  Color,
  Credit,
  Entity,
  HeightReference,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  Math as CesiumMath,
  GeoJsonDataSource,
  Rectangle,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useStore } from "../hooks/useStore";
import { useDebounce } from "../hooks/useDebounce";
import { offlineApi } from "../services/offlineApi";
import { api } from "../services/api";
import { socket } from "../services/socket";
import { filterAircraftGeojson } from "../utils/aircraftFilters";
import { thinFeaturesByTimeField } from "../utils/mapThinning";

const MAX_EVENT_ENTITIES = 1_600;
const MAX_ENV_ENTITIES = 1_200;
const MAX_TELEGRAM_ENTITIES = 1_000;
const MAX_ANOMALY_ENTITIES = 450;
const MAX_TRACKING_ENTITIES = 1_800;

const CONTEXT_LAYER_MAP = {
  ctx_admin0: "admin0",
  ctx_airports: "airports",
  ctx_ports: "ports",
  ctx_military: "military",
  ctx_crossings: "crossings",
  ctx_energy: "energy",
};

const ESRI_CREDIT = new Credit("Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics");
const OSM_CREDIT = new Credit("&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>");

/* Cesium billboards require rgb() not hex in SVGs - hex causes black rendering */
const PLANE_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M16 2 L19 12 L28 14 L19 16 L19 26 L16 24 L13 26 L13 16 L4 14 L13 12 Z"
        fill="rgb(0,229,255)" stroke="rgb(0,77,94)" stroke-width="0.8"/>
</svg>`)}`;

const SHIP_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2 L16 10 L20 18 L12 15 L4 18 L8 10 Z"
        fill="rgb(255,214,0)" stroke="rgb(102,85,0)" stroke-width="0.8"/>
</svg>`)}`;

const WEBCAM_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="rgb(16,185,129)" stroke="rgb(255,255,255)" stroke-width="1.5"/><circle cx="10" cy="9" r="3" fill="rgb(255,255,255)"/><rect x="8" y="13" width="4" height="2" rx="0.5" fill="rgb(255,255,255)"/></svg>`)}`;

const EVENT_ICONS = {
  conflict: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="rgb(239,68,68)" stroke="rgb(255,255,255)" stroke-width="2"/><path d="M13 8 L15 8 L14.6 17 L13.4 17 Z" fill="rgb(255,255,255)"/><circle cx="14" cy="20" r="1.3" fill="rgb(255,255,255)"/></svg>`)}`,
  protest: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="rgb(249,115,22)" stroke="rgb(255,255,255)" stroke-width="2"/><path d="M10 20 L14 8 L18 20 Z" fill="none" stroke="rgb(255,255,255)" stroke-width="2"/></svg>`)}`,
  disaster: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 26,24 2,24" fill="rgb(234,179,8)" stroke="rgb(255,255,255)" stroke-width="2"/><path d="M13 10 L15 10 L14.6 18 L13.4 18 Z" fill="rgb(0,0,0)"/><circle cx="14" cy="21" r="1.2" fill="rgb(0,0,0)"/></svg>`)}`,
  news: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgb(59,130,246)" stroke="rgb(255,255,255)" stroke-width="1.5"/><rect x="8" y="7" width="8" height="10" rx="1" fill="none" stroke="rgb(255,255,255)" stroke-width="1.5"/><line x1="10" y1="10" x2="16" y2="10" stroke="rgb(255,255,255)" stroke-width="1"/><line x1="10" y1="13" x2="14" y2="13" stroke="rgb(255,255,255)" stroke-width="1"/></svg>`)}`,
  wildfire: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="rgb(239,68,68)" stroke="rgb(255,255,255)" stroke-width="2"/><path d="M10 18 Q13 12 16 18 Q13 14 10 18" fill="rgb(255,200,100)"/><path d="M11 16 Q13 13 15 16 Q13 14 11 16" fill="rgb(255,255,200)"/></svg>`)}`,
  earthquake: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="rgb(234,179,8)" stroke="rgb(255,255,255)" stroke-width="2"/><path d="M8 8 L10 13 L8 18 M13 6 L13 20 M18 8 L16 13 L18 18" stroke="rgb(255,255,255)" stroke-width="2" fill="none"/></svg>`)}`,
  anomaly: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgb(168,85,247)" stroke="rgb(255,255,255)" stroke-width="2"/><path d="M12 6 L12 10 M12 14 L12 18" stroke="rgb(255,255,255)" stroke-width="2"/><circle cx="12" cy="14" r="1.5" fill="rgb(255,255,255)"/></svg>`)}`,
};

const TELEGRAM_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="rgb(56,189,248)" stroke="rgb(255,255,255)" stroke-width="2"/><path d="M6 13 L18 8 L14 18 L12 13 Z" fill="rgb(255,255,255)"/></svg>`)}`;

function createSatelliteProvider() {
  return new UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: ESRI_CREDIT,
  });
}

function createLabelsProvider() {
  return new UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: ESRI_CREDIT,
  });
}

function createStreetProvider() {
  return new UrlTemplateImageryProvider({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    maximumLevel: 19,
    credit: OSM_CREDIT,
  });
}

function removeDS(viewer, dsRef, key) {
  const ds = dsRef.current[key];
  if (ds) {
    viewer.dataSources.remove(ds, true);
    dsRef.current[key] = null;
  }
}

function clusterOptsFromCamera(viewer) {
  let pixelRange = 72;
  let minimumClusterSize = 2;
  try {
    if (viewer?.camera) {
      const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(viewer.camera.positionWC);
      const h = carto?.height ?? 0;
      if (h > 12_000_000) {
        pixelRange = 128;
        minimumClusterSize = 4;
      } else if (h > 8_000_000) {
        pixelRange = 104;
        minimumClusterSize = 3;
      } else if (h > 5_000_000) {
        pixelRange = 88;
        minimumClusterSize = 3;
      } else if (h < 1_200_000) {
        pixelRange = 40;
        minimumClusterSize = 2;
      } else if (h < 2_500_000) {
        pixelRange = 48;
        minimumClusterSize = 2;
      }
    }
  } catch (_) {}
  return { pixelRange, minimumClusterSize };
}

function enableClustering(ds, viewer) {
  const { pixelRange, minimumClusterSize } = clusterOptsFromCamera(viewer);
  ds.clustering = new EntityCluster({ enabled: true, pixelRange, minimumClusterSize });
  ds.clustering.clusterEvent.addEventListener((entities, cluster) => {
    cluster.label.show = true;
    cluster.label.text = entities.length.toLocaleString();
    if (cluster.billboard) cluster.billboard.id = entities;
  });
}

function updateAllDataSourceClustering(viewer) {
  if (!viewer?.dataSources || viewer.isDestroyed()) return;
  const { pixelRange, minimumClusterSize } = clusterOptsFromCamera(viewer);
  const n = viewer.dataSources.length;
  let changed = false;
  for (let i = 0; i < n; i++) {
    const ds = viewer.dataSources.get(i);
    if (ds.clustering?.enabled) {
      ds.clustering.pixelRange = pixelRange;
      ds.clustering.minimumClusterSize = minimumClusterSize;
      changed = true;
    }
  }
  if (changed) viewer.scene.requestRender();
}

const M_TO_FT = 3.28084;
const M_TO_YD = 1.09361;

function formatHeight(meters) {
  const ft = meters * M_TO_FT;
  const yd = meters * M_TO_YD;
  const fmt = (n, unit) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : Math.round(n).toLocaleString()) + ` ${unit}`;
  let primary;
  if (meters >= 1000000) primary = `${(meters / 1000).toFixed(0)} km`;
  else if (meters >= 1000) primary = `${(meters / 1000).toFixed(1)} km`;
  else primary = `${Math.round(meters)} m`;
  return `${primary} (${fmt(ft, "ft")}, ${fmt(yd, "yd")})`;
}

const GlobeViewer = forwardRef((_props, ref) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const heightLabelRef = useRef(null);
  const imageryRef = useRef({ satellite: null, labels: null, street: null, sentinel2: null });
  const dsRef = useRef({});

  const layers = useStore((s) => s.layers);
  const timeStart = useStore((s) => s.timeStart);
  const timeEnd = useStore((s) => s.timeEnd);
  const debouncedTimeStart = useDebounce(timeStart, 400);
  const debouncedTimeEnd = useDebounce(timeEnd, 400);
  const anomaliesRefreshTrigger = useStore((s) => s.anomaliesRefreshTrigger);
  const telegramRefreshTrigger = useStore((s) => s.telegramRefreshTrigger);
  const eventFilters = useStore((s) => s.eventFilters);
  const mapBbox = useStore((s) => s.mapBbox);
  const debouncedMapBbox = useDebounce(mapBbox, 500);
  const aircraftPreset = useStore((s) => s.aircraftPreset);
  const aircraftCallsignPrefix = useStore((s) => s.aircraftCallsignPrefix);
  const aircraftMinAltitude = useStore((s) => s.aircraftMinAltitude);
  const aircraftMaxAltitude = useStore((s) => s.aircraftMaxAltitude);
  const aircraftMinVelocity = useStore((s) => s.aircraftMinVelocity);
  const selectEvent = useStore((s) => s.selectEvent);

  useImperativeHandle(ref, () => ({
    get viewer() { return viewerRef.current; },
    flyTo(lng, lat, alt = 500000) {
      viewerRef.current?.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, alt),
        duration: 1.5,
      });
    },
    getViewBounds() {
      const v = viewerRef.current;
      if (!v?.camera) return null;
      const rect = v.camera.computeViewRectangle();
      if (!rect) return null;
      const toDeg = (r) => (r * 180) / Math.PI;
      return [toDeg(rect.west), toDeg(rect.south), toDeg(rect.east), toDeg(rect.north)].join(",");
    },
    flyToBounds(west, south, east, north) {
      const v = viewerRef.current;
      if (!v?.camera) return;
      v.camera.flyTo({
        destination: Rectangle.fromDegrees(west, south, east, north),
        duration: 1.5,
      });
    },
  }));

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: true,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      selectionIndicator: true,
      infoBox: false,
      baseLayer: false,
    });

    imageryRef.current.satellite = viewer.imageryLayers.addImageryProvider(createSatelliteProvider());
    imageryRef.current.labels = viewer.imageryLayers.addImageryProvider(createLabelsProvider());
    imageryRef.current.street = viewer.imageryLayers.addImageryProvider(createStreetProvider());
    imageryRef.current.street.show = false;

    if (import.meta.env.VITE_CESIUM_ION_TOKEN) {
      createWorldTerrainAsync()
        .then((terrain) => {
          viewer.terrainProvider = terrain;
        })
        .catch(() => {
          console.warn(
            "Cesium World Terrain failed (check VITE_CESIUM_ION_TOKEN at ion.cesium.com). Using flat terrain."
          );
        });
    }

    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.depthTestAgainstTerrain = false;

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 20, 20000000),
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (!defined(picked) || !picked.id) return;

      const id = picked.id;

      if (Array.isArray(id)) {
        const entities = id;
        const items = [];
        for (const entity of entities) {
          const props = {};
          const bag = entity.properties;
          if (bag && bag.propertyNames) {
            bag.propertyNames.forEach((name) => {
              const val = bag[name];
              props[name] = typeof val?.getValue === "function" ? val.getValue() : val;
            });
          }
          if (Object.keys(props).length > 0) {
            for (let i = 0; i < viewer.dataSources.length; i++) {
              const ds = viewer.dataSources.get(i);
              if (ds.entities.contains(entity)) {
                props._layerType = ds.name;
                break;
              }
            }
            items.push(props);
          }
        }
        if (items.length > 0) selectEvent({ _cluster: true, entities: items });
        return;
      }

      const entity = id;
      const props = {};
      const bag = entity.properties;
      if (bag && bag.propertyNames) {
        bag.propertyNames.forEach((name) => {
          const val = bag[name];
          props[name] = typeof val?.getValue === "function" ? val.getValue() : val;
        });
      }

      if (Object.keys(props).length > 0) {
        for (let i = 0; i < viewer.dataSources.length; i++) {
          const ds = viewer.dataSources.get(i);
          if (ds.entities.contains(entity)) {
            props._layerType = ds.name;
            break;
          }
        }
        selectEvent(props);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    let bboxT;
    const pushBbox = () => {
      clearTimeout(bboxT);
      bboxT = setTimeout(() => {
        if (viewer.isDestroyed()) return;
        const rect = viewer.camera.computeViewRectangle();
        if (!rect) return;
        const toDeg = (r) => (r * 180) / Math.PI;
        useStore.getState().setMapBbox([
          toDeg(rect.west),
          toDeg(rect.south),
          toDeg(rect.east),
          toDeg(rect.north),
        ]);
      }, 650);
    };
    viewer.camera.changed.addEventListener(pushBbox);
    pushBbox();

    const updateHeight = () => {
      const el = heightLabelRef.current;
      if (!el || !viewer.camera) return;
      try {
        const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(viewer.camera.positionWC);
        if (carto) el.textContent = `Altitude: ${formatHeight(carto.height)}`;
      } catch (_) {}
    };
    viewer.camera.changed.addEventListener(updateHeight);
    updateHeight();

    let clusterT;
    const onClusterCamera = () => {
      clearTimeout(clusterT);
      clusterT = setTimeout(() => updateAllDataSourceClustering(viewer), 200);
    };
    viewer.camera.changed.addEventListener(onClusterCamera);

    return () => {
      clearTimeout(bboxT);
      clearTimeout(clusterT);
      viewer.camera.changed.removeEventListener(pushBbox);
      viewer.camera.changed.removeEventListener(updateHeight);
      viewer.camera.changed.removeEventListener(onClusterCamera);
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const img = imageryRef.current;
    if (!img.satellite) return;
    const isSatellite = layers.satellite;
    img.satellite.show = isSatellite;
    img.labels.show = isSatellite;
    img.street.show = !isSatellite;
  }, [layers.satellite]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const img = imageryRef.current;
    if (!viewer || viewer.isDestroyed() || !img.satellite) return;
    const hasIon = !!import.meta.env.VITE_CESIUM_ION_TOKEN;

    if (layers.sentinel2 && hasIon) {
      if (!img.sentinel2) {
        IonImageryProvider.fromAssetId(3954)
          .then((provider) => {
            if (!useStore.getState().layers.sentinel2) return;
            const v = viewerRef.current;
            if (v && !v.isDestroyed()) {
              img.sentinel2 = v.imageryLayers.addImageryProvider(provider);
              img.sentinel2.show = true;
            }
          })
          .catch((e) => {
            console.warn(
              "Sentinel-2 layer failed. Add the asset to your Cesium Ion account: https://cesium.com/ion/assetdepot/3954",
              e
            );
          });
      } else {
        img.sentinel2.show = true;
      }
    } else {
      if (img.sentinel2) {
        viewer.imageryLayers.remove(img.sentinel2, true);
        img.sentinel2 = null;
      }
    }
  }, [layers.sentinel2]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    let cancelled = false;
    loadDataLayers(viewer, layers, dsRef, () => cancelled, {
      timeStart: debouncedTimeStart,
      timeEnd: debouncedTimeEnd,
      eventFilters,
      mapBbox: debouncedMapBbox,
      aircraftPreset,
      aircraftCallsignPrefix,
      aircraftMinAltitude,
      aircraftMaxAltitude,
      aircraftMinVelocity,
    });
    return () => { cancelled = true; };
  }, [
    layers,
    debouncedTimeStart,
    debouncedTimeEnd,
    debouncedMapBbox,
    anomaliesRefreshTrigger,
    telegramRefreshTrigger,
    eventFilters,
    aircraftPreset,
    aircraftCallsignPrefix,
    aircraftMinAltitude,
    aircraftMaxAltitude,
    aircraftMinVelocity,
  ]);

  useEffect(() => {
    const onAircraft = (data) => {
      if (!viewerRef.current || !layers.aircraft) return;
      const st = useStore.getState();
      const filtered = filterAircraftGeojson(data, {
        preset: st.aircraftPreset,
        callsignPrefix: st.aircraftCallsignPrefix,
        minAltitude: st.aircraftMinAltitude,
        maxAltitude: st.aircraftMaxAltitude,
        minVelocity: st.aircraftMinVelocity,
      });
      loadTracking(viewerRef.current, dsRef, "aircraft", filtered);
    };
    const onShips = (data) => {
      if (!viewerRef.current || !layers.ships) return;
      loadTracking(viewerRef.current, dsRef, "ships", data);
    };
    const onTelegramNew = () => {
      if (useStore.getState().layers.telegram) {
        useStore.getState().triggerTelegramRefresh();
      }
    };
    socket.on("aircraft:live", onAircraft);
    socket.on("ships:live", onShips);
    socket.on("telegram:new", onTelegramNew);
    return () => {
      socket.off("aircraft:live", onAircraft);
      socket.off("ships:live", onShips);
      socket.off("telegram:new", onTelegramNew);
    };
  }, [
    layers.aircraft,
    layers.ships,
    aircraftPreset,
    aircraftCallsignPrefix,
    aircraftMinAltitude,
    aircraftMaxAltitude,
    aircraftMinVelocity,
  ]);

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        width: "100%",
        height: "100%",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        ref={heightLabelRef}
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "4px 8px",
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontSize: "12px",
          fontFamily: "monospace",
          borderRadius: 4,
          pointerEvents: "none",
        }}
      >
        Altitude: —
      </div>
    </div>
  );
});

async function loadDataLayers(viewer, layers, dsRef, isCancelled = () => false, timeRange = {}) {
  const guard = () => viewer && !viewer.isDestroyed() && !isCancelled();
  const mb = timeRange.mapBbox;
  const bboxStr =
    Array.isArray(mb) && mb.length === 4 && !mb.some((x) => typeof x !== "number" || Number.isNaN(x))
      ? mb.join(",")
      : null;
  const params = { compact: "1", limit: bboxStr ? 4000 : 450 };
  if (timeRange.timeStart) params.time_start = timeRange.timeStart;
  if (timeRange.timeEnd) params.time_end = timeRange.timeEnd;
  if (bboxStr) params.bbox = bboxStr;
  const filters = timeRange.eventFilters || {};
  if (filters.dedupe) params.dedupe = "1";
  if (filters.event_type) params.event_type = filters.event_type;
  if (filters.source) params.source = filters.source;
  if (filters.severity_min != null && filters.severity_min !== "") params.severity_min = filters.severity_min;

  const aircraftParams = { live: "false" };
  if (timeRange.aircraftPreset && timeRange.aircraftPreset !== "all") {
    aircraftParams.preset = timeRange.aircraftPreset;
  }
  if (timeRange.aircraftCallsignPrefix) {
    aircraftParams.callsign_prefix = timeRange.aircraftCallsignPrefix;
  }
  if (timeRange.aircraftMinAltitude !== "" && timeRange.aircraftMinAltitude != null) {
    aircraftParams.min_altitude = timeRange.aircraftMinAltitude;
  }
  if (timeRange.aircraftMaxAltitude !== "" && timeRange.aircraftMaxAltitude != null) {
    aircraftParams.max_altitude = timeRange.aircraftMaxAltitude;
  }
  if (timeRange.aircraftMinVelocity !== "" && timeRange.aircraftMinVelocity != null) {
    aircraftParams.min_velocity = timeRange.aircraftMinVelocity;
  }
  if (bboxStr) aircraftParams.bbox = bboxStr;

  if (layers.events) {
    try {
      const geojson = await offlineApi.getEvents(params);
      if (!guard()) return;
      removeDS(viewer, dsRef, "events");

      const ds = new CustomDataSource("events");
      const features = thinFeaturesByTimeField(geojson.features || [], MAX_EVENT_ENTITIES, "occurred_at");
      for (const f of features) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        if (lng === 0 && lat === 0) continue;
        const props = f.properties || {};
        const evType = props.event_type || "news";
        const icon = EVENT_ICONS[evType] || EVENT_ICONS.news;

        ds.entities.add({
          position: Cartesian3.fromDegrees(lng, lat, 5000),
          billboard: {
            image: icon,
            width: 28,
            height: 28,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(1e4, 1.6, 1.5e7, 0.55),
          },
          properties: { ...props, _layerType: "events", lat, lon: lng },
        });
      }
      if (!guard()) return;
      enableClustering(ds, viewer);
      await viewer.dataSources.add(ds);
      dsRef.current.events = ds;
    } catch (e) { console.warn("Events load failed", e); }
  } else {
    if (guard()) removeDS(viewer, dsRef, "events");
  }

  if (layers.webcams) {
    try {
      const geojson = await api.getWebcams({});
      if (!guard()) return;
      removeDS(viewer, dsRef, "webcams");

      const ds = new CustomDataSource("webcams");
      for (const f of (geojson.features || [])) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        const props = f.properties || {};

        ds.entities.add({
          position: Cartesian3.fromDegrees(lng, lat, 3000),
          billboard: {
            image: WEBCAM_SVG,
            width: 20,
            height: 20,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(1e4, 1.4, 1.5e7, 0.4),
          },
          properties: { ...props, _layerType: "webcams" },
        });
      }
      if (!guard()) return;
      enableClustering(ds, viewer);
      await viewer.dataSources.add(ds);
      dsRef.current.webcams = ds;
    } catch (e) { console.warn("Webcams load failed", e); }
  } else {
    if (guard()) removeDS(viewer, dsRef, "webcams");
  }

  const envTypes = [];
  if (layers.wildfires) envTypes.push("wildfire");
  if (layers.earthquakes) envTypes.push("earthquake");
  if (envTypes.length > 0) {
    try {
      const envParams = { event_type: envTypes.join(","), limit: 2000 };
      if (params.time_start) envParams.time_start = params.time_start;
      if (params.time_end) envParams.time_end = params.time_end;
      if (bboxStr) envParams.bbox = bboxStr;
      const geojson = await offlineApi.getEnvironmental(envParams);
      if (!guard()) return;
      removeDS(viewer, dsRef, "environmental");

      const ds = new CustomDataSource("environmental");
      const envFeats = thinFeaturesByTimeField(geojson.features || [], MAX_ENV_ENTITIES, "started_at");
      for (const f of envFeats) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        const props = f.properties || {};
        const evType = props.event_type || "wildfire";
        const icon = EVENT_ICONS[evType] || EVENT_ICONS.wildfire;

        ds.entities.add({
          position: Cartesian3.fromDegrees(lng, lat, 5000),
          billboard: {
            image: icon,
            width: 26,
            height: 26,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(1e4, 1.5, 1.5e7, 0.5),
          },
          properties: { ...props, _layerType: "environmental" },
        });
      }
      if (!guard()) return;
      enableClustering(ds, viewer);
      await viewer.dataSources.add(ds);
      dsRef.current.environmental = ds;
    } catch (e) { console.warn("Environmental load failed", e); }
  } else {
    if (guard()) removeDS(viewer, dsRef, "environmental");
  }

  if (layers.anomalies) {
    try {
      const anomParams = { limit: 800 };
      if (params.time_start) anomParams.time_start = params.time_start;
      if (params.time_end) anomParams.time_end = params.time_end;
      if (bboxStr) anomParams.bbox = bboxStr;
      const geojson = await api.getAnomalies(anomParams);
      if (!guard()) return;
      removeDS(viewer, dsRef, "anomalies");

      const ds = new CustomDataSource("anomalies");
      const icon = EVENT_ICONS.anomaly;
      const anomFeats = thinFeaturesByTimeField(geojson.features || [], MAX_ANOMALY_ENTITIES, "detected_at");
      for (const f of anomFeats) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        const props = f.properties || {};

        ds.entities.add({
          position: Cartesian3.fromDegrees(lng, lat, 5000),
          billboard: {
            image: icon,
            width: 24,
            height: 24,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(1e4, 1.4, 1.5e7, 0.45),
          },
          properties: { ...props, _layerType: "anomalies", lon: lng, lat },
        });
      }
      if (!guard()) return;
      enableClustering(ds, viewer);
      await viewer.dataSources.add(ds);
      dsRef.current.anomalies = ds;
    } catch (e) { console.warn("Anomalies load failed", e); }
  } else {
    if (guard()) removeDS(viewer, dsRef, "anomalies");
  }

  if (layers.telegram) {
    try {
      const tgParams = { limit: 2000 };
      if (params.time_start) tgParams.time_start = params.time_start;
      if (params.time_end) tgParams.time_end = params.time_end;
      if (bboxStr) tgParams.bbox = bboxStr;
      const geojson = await offlineApi.getTelegramGeojson(tgParams);
      if (!guard()) return;
      removeDS(viewer, dsRef, "telegram");

      const ds = new CustomDataSource("telegram");
      const tgFeats = thinFeaturesByTimeField(geojson.features || [], MAX_TELEGRAM_ENTITIES, "posted_at");
      for (const f of tgFeats) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        const props = f.properties || {};

        ds.entities.add({
          position: Cartesian3.fromDegrees(lng, lat, 5200),
          billboard: {
            image: TELEGRAM_SVG,
            width: 26,
            height: 26,
            verticalOrigin: VerticalOrigin.CENTER,
            horizontalOrigin: HorizontalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(1e4, 1.45, 1.5e7, 0.5),
          },
          properties: { ...props, _layerType: "telegram", lat, lon: lng },
        });
      }
      if (!guard()) return;
      enableClustering(ds, viewer);
      await viewer.dataSources.add(ds);
      dsRef.current.telegram = ds;
    } catch (e) {
      console.warn("Telegram layer load failed", e);
    }
  } else {
    if (guard()) removeDS(viewer, dsRef, "telegram");
  }

  for (const [layerKey, apiId] of Object.entries(CONTEXT_LAYER_MAP)) {
    if (layers[layerKey]) {
      try {
        const q = bboxStr ? { bbox: bboxStr } : {};
        const fc = await api.getContextGeojson(apiId, q);
        if (!guard()) return;
        removeDS(viewer, dsRef, layerKey);
        const isPointLayer = apiId === "airports" || apiId === "ports";
        const ds = await GeoJsonDataSource.load(fc, {
          stroke: Color.fromCssColorString("#e2e8f0").withAlpha(0.92),
          fill: Color.fromCssColorString("#3b82f6").withAlpha(isPointLayer ? 0.55 : 0.12),
          strokeWidth: isPointLayer ? 1 : 2,
          clampToGround: !isPointLayer,
        });
        ds.name = layerKey;
        if (!guard()) return;
        await viewer.dataSources.add(ds);
        dsRef.current[layerKey] = ds;
      } catch (e) {
        console.warn(`Context layer ${layerKey} failed`, e);
      }
    } else if (guard()) {
      removeDS(viewer, dsRef, layerKey);
    }
  }

  if (layers.territorial) {
    try {
      const tq = { at: timeRange.timeEnd || new Date().toISOString() };
      if (bboxStr) tq.bbox = bboxStr;
      const fc = await api.getTerritorialActive(tq);
      if (!guard()) return;
      removeDS(viewer, dsRef, "territorial");
      const ds = await GeoJsonDataSource.load(fc, {
        stroke: Color.fromCssColorString("#f97316").withAlpha(0.95),
        fill: Color.fromCssColorString("#f97316").withAlpha(0.22),
        strokeWidth: 3,
        clampToGround: true,
      });
      ds.name = "territorial";
      if (!guard()) return;
      await viewer.dataSources.add(ds);
      dsRef.current.territorial = ds;
    } catch (e) {
      console.warn("Territorial layer failed", e);
    }
  } else if (guard()) {
    removeDS(viewer, dsRef, "territorial");
  }

  if (layers.ships && !dsRef.current.ships) {
    try {
      const geojson = await api.getShips({ live: "false" });
      if (guard() && geojson.features?.length) loadTracking(viewer, dsRef, "ships", geojson);
    } catch (e) { console.warn("Ships initial load failed", e); }
  }
  if (!layers.ships && guard()) removeDS(viewer, dsRef, "ships");

  if (layers.aircraft) {
    try {
      const geojson = await api.getAircraft(aircraftParams);
      if (!guard()) return;
      const filtered = filterAircraftGeojson(geojson, {
        preset: timeRange.aircraftPreset,
        callsignPrefix: timeRange.aircraftCallsignPrefix,
        minAltitude: timeRange.aircraftMinAltitude,
        maxAltitude: timeRange.aircraftMaxAltitude,
        minVelocity: timeRange.aircraftMinVelocity,
      });
      if (filtered.features?.length) loadTracking(viewer, dsRef, "aircraft", filtered);
      else if (guard()) removeDS(viewer, dsRef, "aircraft");
    } catch (e) { console.warn("Aircraft load failed", e); }
  } else if (guard()) {
    removeDS(viewer, dsRef, "aircraft");
  }

  const HEATMAP_CONFIG = {
    heatmap_fires: { apiType: "wildfires", color: [239, 68, 68, 89], radius: 80000 },
    heatmap_quakes: { apiType: "earthquakes", color: [234, 179, 8, 89], radius: 60000 },
    heatmap_shipping: { apiType: "shipping", color: [59, 130, 246, 64], radius: 50000 },
    heatmap_air: { apiType: "air_traffic", color: [0, 229, 255, 51], radius: 40000 },
  };
  for (const [key, config] of Object.entries(HEATMAP_CONFIG)) {
    if (layers[key]) {
      try {
        const data = await offlineApi.getHeatmap(config.apiType);
        if (!guard()) return;
        removeDS(viewer, dsRef, key);

        const ds = new CustomDataSource(key);
        const points = (data.points || []).slice(0, 2000);
        const color = Color.fromBytes(...config.color);
        const labels = { heatmap_fires: "Fire hotspot", heatmap_quakes: "Seismic event", heatmap_shipping: "Ship position", heatmap_air: "Aircraft position" };
        for (const p of points) {
          const lng = p.lng ?? p.lon;
          const lat = p.lat;
          if (typeof lng !== "number" || typeof lat !== "number") continue;
          ds.entities.add({
            position: Cartesian3.fromDegrees(lng, lat, 0),
            ellipse: {
              semiMajorAxis: config.radius,
              semiMinorAxis: config.radius,
              material: color,
              outline: false,
              height: 0,
              heightReference: HeightReference.CLAMP_TO_GROUND,
            },
            properties: {
              _layerType: key,
              heatmap_type: config.apiType,
              weight: p.weight,
              label: labels[key] || key,
            },
          });
        }
        if (!guard()) return;
        await viewer.dataSources.add(ds);
        dsRef.current[key] = ds;
      } catch (e) { console.warn(`Heatmap ${key} load failed`, e); }
    } else {
      if (guard()) removeDS(viewer, dsRef, key);
    }
  }

  if (guard()) viewer.scene.requestRender();
}

function loadTracking(viewer, dsRef, type, geojson) {
  if (!geojson?.features?.length) return;

  removeDS(viewer, dsRef, type);

  const ds = new CustomDataSource(type);
  const isAircraft = type === "aircraft";
  const icon = isAircraft ? PLANE_SVG : SHIP_SVG;
  const iconSize = isAircraft ? 24 : 18;

  let feats = geojson.features;
  if (feats.length > MAX_TRACKING_ENTITIES) {
    feats = thinFeaturesByTimeField(feats, MAX_TRACKING_ENTITIES, "recorded_at");
  }

  for (const f of feats) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lng, lat] = coords;
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    const props = f.properties || {};
    const heading = props.heading ?? 0;
    const alt = isAircraft ? (props.altitude || 0) : 0;

    ds.entities.add({
      position: Cartesian3.fromDegrees(lng, lat, alt),
      billboard: {
        image: icon,
        width: iconSize,
        height: iconSize,
        rotation: CesiumMath.toRadians(-(heading || 0)),
        verticalOrigin: VerticalOrigin.CENTER,
        horizontalOrigin: HorizontalOrigin.CENTER,
        heightReference: HeightReference.NONE,
        scaleByDistance: new NearFarScalar(1e4, 1.4, 1.5e7, 0.4),
      },
      properties: props,
    });
  }

  viewer.dataSources.add(ds);
  dsRef.current[type] = ds;
}

GlobeViewer.displayName = "GlobeViewer";
export default GlobeViewer;
