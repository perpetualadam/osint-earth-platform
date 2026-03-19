import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  Viewer,
  Cartesian3,
  createWorldTerrainAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  UrlTemplateImageryProvider,
  GeoJsonDataSource,
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

const WEBCAM_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="%2310b981" stroke="%23fff" stroke-width="1.2"/><circle cx="10" cy="9" r="3" fill="white"/><rect x="8" y="13" width="4" height="2" rx="0.5" fill="white"/></svg>`)}`;

const EVENT_ICONS = {
  conflict: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23ef4444" stroke="%23fff" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="14" font-weight="bold">!</text></svg>`)}`,
  protest: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23f97316" stroke="%23fff" stroke-width="1.5"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">P</text></svg>`)}`,
  disaster: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 22,20 2,20" fill="%23eab308" stroke="%23fff" stroke-width="1.5"/><text x="12" y="18" text-anchor="middle" fill="black" font-size="12" font-weight="bold">!</text></svg>`)}`,
  news: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="%233b82f6" stroke="%23fff" stroke-width="1.2"/><text x="10" y="14" text-anchor="middle" fill="white" font-size="10" font-weight="bold">N</text></svg>`)}`,
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

const GlobeViewer = forwardRef((_props, ref) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const imageryRef = useRef({ satellite: null, labels: null, street: null });
  const dataSources = useRef({});

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

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 20, 20000000),
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (!defined(picked) || !picked.id) return;

      const entity = picked.id;
      const props = {};

      if (entity._properties) {
        entity._properties.propertyNames.forEach((name) => {
          props[name] = entity._properties[name]?.getValue();
        });
      } else if (entity.properties) {
        const bag = entity.properties;
        if (bag.propertyNames) {
          bag.propertyNames.forEach((name) => {
            props[name] = bag[name]?.getValue?.() ?? bag[name];
          });
        } else if (typeof bag.getValue === "function") {
          Object.assign(props, bag.getValue(viewer.clock.currentTime));
        } else {
          Object.assign(props, bag);
        }
      }

      if (Object.keys(props).length > 0) {
        const parent = viewer.dataSources._dataSources?.find(
          (ds) => ds.entities.getById?.(entity.id) || ds.entities.values.includes(entity)
        );
        if (parent?.name) props._layerType = parent.name;
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
    if (!viewer) return;
    loadDataLayers(viewer, layers, dataSources);
  }, [layers]);

  useEffect(() => {
    socket.on("aircraft:live", (data) => {
      if (!viewerRef.current || !layers.aircraft) return;
      updateLiveEntities(viewerRef.current, "aircraft", data);
    });
    socket.on("ships:live", (data) => {
      if (!viewerRef.current || !layers.ships) return;
      updateLiveEntities(viewerRef.current, "ships", data);
    });
    return () => {
      socket.off("aircraft:live");
      socket.off("ships:live");
    };
  }, [layers.aircraft, layers.ships]);

  return <div ref={containerRef} style={{ flex: 1, width: "100%", height: "100%" }} />;
});

async function loadDataLayers(viewer, layers, dsRef) {
  if (layers.events) {
    try {
      const geojson = await offlineApi.getEvents({ limit: 1000 });
      if (dsRef.current.events) viewer.dataSources.remove(dsRef.current.events, true);

      const ds = new GeoJsonDataSource("events");
      for (const f of (geojson.features || [])) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        const props = f.properties || {};
        const evType = props.event_type || "news";
        const icon = EVENT_ICONS[evType] || EVENT_ICONS.news;

        ds.entities.add(new Entity({
          position: Cartesian3.fromDegrees(lng, lat, 0),
          billboard: {
            image: icon,
            width: 28,
            height: 28,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(5e3, 1.8, 2e7, 0.7),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { ...props, _layerType: "events" },
        }));
      }
      viewer.dataSources.add(ds);
      dsRef.current.events = ds;
    } catch (e) { console.warn("Events load failed", e); }
  } else if (dsRef.current.events) {
    viewer.dataSources.remove(dsRef.current.events, true);
    dsRef.current.events = null;
  }

  if (layers.webcams) {
    try {
      const geojson = await api.getWebcams({});
      if (dsRef.current.webcams) viewer.dataSources.remove(dsRef.current.webcams, true);

      const ds = new GeoJsonDataSource("webcams");
      for (const f of (geojson.features || [])) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lng, lat] = coords;
        const props = f.properties || {};

        ds.entities.add(new Entity({
          position: Cartesian3.fromDegrees(lng, lat, 0),
          billboard: {
            image: WEBCAM_SVG,
            width: 20,
            height: 20,
            verticalOrigin: VerticalOrigin.BOTTOM,
            horizontalOrigin: HorizontalOrigin.CENTER,
            heightReference: HeightReference.NONE,
            scaleByDistance: new NearFarScalar(5e3, 1.6, 2e7, 0.5),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { ...props, _layerType: "webcams" },
        }));
      }
      viewer.dataSources.add(ds);
      dsRef.current.webcams = ds;
    } catch (e) { console.warn("Webcams load failed", e); }
  } else if (dsRef.current.webcams) {
    viewer.dataSources.remove(dsRef.current.webcams, true);
    dsRef.current.webcams = null;
  }

  if (layers.ships && !dsRef.current.ships) {
    try {
      const geojson = await api.getShips({ live: "false" });
      if (geojson.features?.length) updateLiveEntities(viewer, "ships", geojson);
    } catch (e) { console.warn("Ships initial load failed", e); }
  }

  if (layers.aircraft && !dsRef.current.aircraft) {
    try {
      const geojson = await api.getAircraft({ live: "false" });
      if (geojson.features?.length) updateLiveEntities(viewer, "aircraft", geojson);
    } catch (e) { console.warn("Aircraft initial load failed", e); }
  }

  for (const layerKey of ["aircraft", "ships", "webcams"]) {
    if (!layers[layerKey] && dsRef.current[layerKey]) {
      viewer.dataSources.remove(dsRef.current[layerKey], true);
      dsRef.current[layerKey] = null;
    }
  }

  viewer.scene.requestRender();
}

function updateLiveEntities(viewer, type, geojson) {
  if (!geojson?.features?.length) return;

  const existing = viewer.dataSources._dataSources?.find((d) => d.name === type);
  if (existing) viewer.dataSources.remove(existing, true);

  const ds = new GeoJsonDataSource(type);
  const isAircraft = type === "aircraft";
  const icon = isAircraft ? PLANE_SVG : SHIP_SVG;
  const iconSize = isAircraft ? 24 : 18;

  for (const f of geojson.features) {
    const [lng, lat] = f.geometry.coordinates;
    const props = f.properties || {};
    const heading = props.heading ?? 0;

    const entity = new Entity({
      position: Cartesian3.fromDegrees(lng, lat, isAircraft ? (props.altitude || 0) : 0),
      billboard: {
        image: icon,
        width: iconSize,
        height: iconSize,
        rotation: CesiumMath.toRadians(-(heading || 0)),
        verticalOrigin: VerticalOrigin.CENTER,
        horizontalOrigin: HorizontalOrigin.CENTER,
        heightReference: HeightReference.NONE,
        scaleByDistance: new NearFarScalar(5e3, 1.4, 2e7, 0.5),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: props,
    });
    ds.entities.add(entity);
  }

  viewer.dataSources.add(ds);
}

GlobeViewer.displayName = "GlobeViewer";
export default GlobeViewer;
