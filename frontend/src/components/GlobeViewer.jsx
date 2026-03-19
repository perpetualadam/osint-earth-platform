import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  Viewer,
  Cartesian3,
  createWorldTerrainAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  OpenStreetMapImageryProvider,
  UrlTemplateImageryProvider,
  GeoJsonDataSource,
  Color,
  HeightReference,
  NearFarScalar,
  JulianDate,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useStore } from "../hooks/useStore";
import { offlineApi } from "../services/offlineApi";
import { socket } from "../services/socket";

const GlobeViewer = forwardRef((_props, ref) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
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
      imageryProvider: new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      }),
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });

    createWorldTerrainAsync().then((terrain) => {
      viewer.terrainProvider = terrain;
    }).catch(() => {});

    viewer.scene.globe.enableLighting = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.globe.showGroundAtmosphere = true;

    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 20, 20000000),
    });

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (defined(picked) && picked.id?._properties) {
        const props = {};
        picked.id._properties.propertyNames.forEach((name) => {
          props[name] = picked.id._properties[name]?.getValue();
        });
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

  return <div ref={containerRef} style={{ flex: 1, width: "100%" }} />;
});

async function loadDataLayers(viewer, layers, dsRef) {
  if (layers.events) {
    try {
      const geojson = await offlineApi.getEvents({ limit: 500 });
      if (dsRef.current.events) viewer.dataSources.remove(dsRef.current.events, true);
      const ds = await GeoJsonDataSource.load(geojson, {
        markerColor: Color.fromCssColorString("#ef4444"),
        clampToGround: true,
      });
      ds.name = "events";
      viewer.dataSources.add(ds);
      dsRef.current.events = ds;
    } catch (e) { console.warn("Events load failed", e); }
  } else if (dsRef.current.events) {
    viewer.dataSources.remove(dsRef.current.events, true);
    dsRef.current.events = null;
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
  if (!geojson?.features) return;
  GeoJsonDataSource.load(geojson, {
    markerColor: type === "aircraft" ? Color.CYAN : Color.YELLOW,
    clampToGround: type !== "aircraft",
  }).then((ds) => {
    const existing = viewer.dataSources._dataSources?.find((d) => d.name === type);
    if (existing) viewer.dataSources.remove(existing, true);
    ds.name = type;
    viewer.dataSources.add(ds);
    viewer.scene.requestRender();
  });
}

GlobeViewer.displayName = "GlobeViewer";
export default GlobeViewer;
