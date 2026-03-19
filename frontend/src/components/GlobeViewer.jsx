import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  Viewer,
  Cartesian3,
  createWorldTerrainAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  UrlTemplateImageryProvider,
  CustomDataSource,
  Color,
  Credit,
  Entity,
  HeightReference,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  Math as CesiumMath,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useStore } from "../hooks/useStore";
import { offlineApi } from "../services/offlineApi";
import { api } from "../services/api";
import { socket } from "../services/socket";

const ESRI_CREDIT = new Credit("Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics");
const OSM_CREDIT = new Credit("&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>");

const PLANE_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M16 2 L19 12 L28 14 L19 16 L19 26 L16 24 L13 26 L13 16 L4 14 L13 12 Z"
        fill="%2300e5ff" stroke="%23004d5e" stroke-width="0.8"/>
</svg>`)}`;

const SHIP_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <path d="M12 2 L16 10 L20 18 L12 15 L4 18 L8 10 Z"
        fill="%23ffd600" stroke="%23665500" stroke-width="0.8"/>
</svg>`)}`;

const WEBCAM_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="%2310b981" stroke="%23fff" stroke-width="1.5"/><circle cx="10" cy="9" r="3" fill="white"/><rect x="8" y="13" width="4" height="2" rx="0.5" fill="white"/></svg>`)}`;

const EVENT_ICONS = {
  conflict: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="%23ef4444" stroke="%23fff" stroke-width="2"/><path d="M13 8 L15 8 L14.6 17 L13.4 17 Z" fill="white"/><circle cx="14" cy="20" r="1.3" fill="white"/></svg>`)}`,
  protest: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="%23f97316" stroke="%23fff" stroke-width="2"/><path d="M10 20 L14 8 L18 20 Z" fill="none" stroke="white" stroke-width="2"/></svg>`)}`,
  disaster: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 26,24 2,24" fill="%23eab308" stroke="%23fff" stroke-width="2"/><path d="M13 10 L15 10 L14.6 18 L13.4 18 Z" fill="%23000"/><circle cx="14" cy="21" r="1.2" fill="%23000"/></svg>`)}`,
  news: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%233b82f6" stroke="%23fff" stroke-width="1.5"/><rect x="8" y="7" width="8" height="10" rx="1" fill="none" stroke="white" stroke-width="1.5"/><line x1="10" y1="10" x2="16" y2="10" stroke="white" stroke-width="1"/><line x1="10" y1="13" x2="14" y2="13" stroke="white" stroke-width="1"/></svg>`)}`,
};

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

const GlobeViewer = forwardRef((_props, ref) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const imageryRef = useRef({ satellite: null, labels: null, street: null });
  const dsRef = useRef({});

  const layers = useStore((s) => s.layers);
  const selectEvent = useStore((s) => s.selectEvent);

  useImperativeHandle(ref, () => ({
    get viewer() { return viewerRef.current; },
    flyTo(lng, lat, alt = 500000) {
      viewerRef.current?.camera.flyTo({
        destination: Cartesian3.fromDegrees(lng, lat, alt),
        duration: 1.5,
      });
    },
  }));

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
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
      createWorldTerrainAsync().then((terrain) => {
        viewer.terrainProvider = terrain;
      }).catch(() => {});
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

      const entity = picked.id;
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

    return () => {
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
    if (!viewer || viewer.isDestroyed()) return;
    loadDataLayers(viewer, layers, dsRef);
  }, [layers]);

  useEffect(() => {
    const onAircraft = (data) => {
      if (!viewerRef.current || !layers.aircraft) return;
      loadTracking(viewerRef.current, dsRef, "aircraft", data);
    };
    const onShips = (data) => {
      if (!viewerRef.current || !layers.ships) return;
      loadTracking(viewerRef.current, dsRef, "ships", data);
    };
    socket.on("aircraft:live", onAircraft);
    socket.on("ships:live", onShips);
    return () => {
      socket.off("aircraft:live", onAircraft);
      socket.off("ships:live", onShips);
    };
  }, [layers.aircraft, layers.ships]);

  return <div ref={containerRef} style={{ flex: 1, width: "100%", height: "100%" }} />;
});

async function loadDataLayers(viewer, layers, dsRef) {
  if (layers.events) {
    try {
      const geojson = await offlineApi.getEvents({ limit: 2000 });
      removeDS(viewer, dsRef, "events");

      const ds = new CustomDataSource("events");
      const features = geojson.features || [];
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
          properties: { ...props, _layerType: "events" },
        });
      }
      await viewer.dataSources.add(ds);
      dsRef.current.events = ds;
    } catch (e) { console.warn("Events load failed", e); }
  } else {
    removeDS(viewer, dsRef, "events");
  }

  if (layers.webcams) {
    try {
      const geojson = await api.getWebcams({});
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
      await viewer.dataSources.add(ds);
      dsRef.current.webcams = ds;
    } catch (e) { console.warn("Webcams load failed", e); }
  } else {
    removeDS(viewer, dsRef, "webcams");
  }

  if (layers.ships && !dsRef.current.ships) {
    try {
      const geojson = await api.getShips({ live: "false" });
      if (geojson.features?.length) loadTracking(viewer, dsRef, "ships", geojson);
    } catch (e) { console.warn("Ships initial load failed", e); }
  }
  if (!layers.ships) removeDS(viewer, dsRef, "ships");

  if (layers.aircraft && !dsRef.current.aircraft) {
    try {
      const geojson = await api.getAircraft({ live: "false" });
      if (geojson.features?.length) loadTracking(viewer, dsRef, "aircraft", geojson);
    } catch (e) { console.warn("Aircraft initial load failed", e); }
  }
  if (!layers.aircraft) removeDS(viewer, dsRef, "aircraft");

  viewer.scene.requestRender();
}

function loadTracking(viewer, dsRef, type, geojson) {
  if (!geojson?.features?.length) return;

  removeDS(viewer, dsRef, type);

  const ds = new CustomDataSource(type);
  const isAircraft = type === "aircraft";
  const icon = isAircraft ? PLANE_SVG : SHIP_SVG;
  const iconSize = isAircraft ? 24 : 18;

  for (const f of geojson.features) {
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
