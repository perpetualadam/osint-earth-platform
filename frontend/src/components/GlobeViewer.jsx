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

    return () => {
      viewer.camera.changed.removeEventListener(updateHeight);
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
    loadDataLayers(viewer, layers, dsRef, () => cancelled);
    return () => { cancelled = true; };
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

  return (
    <div style={{ position: "relative", flex: 1, width: "100%", height: "100%" }}>
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

async function loadDataLayers(viewer, layers, dsRef, isCancelled = () => false) {
  const guard = () => viewer && !viewer.isDestroyed() && !isCancelled();

  if (layers.events) {
    try {
      const geojson = await offlineApi.getEvents({ limit: 2000 });
      if (!guard()) return;
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
      if (!guard()) return;
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
      await viewer.dataSources.add(ds);
      dsRef.current.webcams = ds;
    } catch (e) { console.warn("Webcams load failed", e); }
  } else {
    if (guard()) removeDS(viewer, dsRef, "webcams");
  }

  if (layers.ships && !dsRef.current.ships) {
    try {
      const geojson = await api.getShips({ live: "false" });
      if (guard() && geojson.features?.length) loadTracking(viewer, dsRef, "ships", geojson);
    } catch (e) { console.warn("Ships initial load failed", e); }
  }
  if (!layers.ships && guard()) removeDS(viewer, dsRef, "ships");

  if (layers.aircraft && !dsRef.current.aircraft) {
    try {
      const geojson = await api.getAircraft({ live: "false" });
      if (guard() && geojson.features?.length) loadTracking(viewer, dsRef, "aircraft", geojson);
    } catch (e) { console.warn("Aircraft initial load failed", e); }
  }
  if (!layers.aircraft && guard()) removeDS(viewer, dsRef, "aircraft");

  if (guard()) viewer.scene.requestRender();
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
