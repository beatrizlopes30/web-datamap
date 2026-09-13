"use client";

import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents, Circle, Polygon, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { PatientData } from "../types";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Plus, Minus } from "lucide-react";
import L from "leaflet";
import { getMarkerColor, MARKER_COLOR_DIAGNOSIS, MARKER_COLOR_SYMPTOM } from "../lib/constants";

const DEFAULT_CENTER: [number, number] = [-5.5152, -47.4727]; // Imperatriz, MA
const DEFAULT_ZOOM = 14;

export interface FlyToTarget {
  lat: number;
  lng: number;
  zoom?: number;
}

interface MapProps {
  activeTool?: 'radius' | 'polygon' | null;
  patients?: PatientData[];
  displayPatients?: PatientData[];
  onFilterChange?: (filtered: PatientData[], isActive: boolean) => void;
  viewMode?: 'points' | 'heatmap';
  externalRegions?: { id: string, name: string, polygon: [number, number][], color: string }[] | null;
  onPolygonDrawn?: (points: [number, number][]) => void;
  initialPolygon?: [number, number][];
  activeColor?: string;
  activeName?: string;
  tileStyle?: 'light' | 'dark';
  flyTo?: FlyToTarget | null;
  onFlyToHandled?: () => void;
  resetViewToken?: number;
  showLegend?: boolean;
}

// Custom icon for drag handles
const handleIcon = L.divIcon({
  className: 'custom-handle-icon',
  html: '<div style="width: 6px; height: 6px; background: white; border: 1px solid #3b82f6; cursor: grab; box-sizing: content-box;"></div>',
  iconSize: [8, 8], // 6px width + 2px total border
  iconAnchor: [4, 4]
});

const getPolygonCenter = (points: [number, number][]) => {
  if (!points || points.length === 0) return [0, 0] as [number, number];
  let pts = [...points];
  let first = pts[0], last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push(first);
  
  let twiceArea = 0, x = 0, y = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    let p1 = pts[i], p2 = pts[j];
    let f = (p1[0] * p2[1] - p2[0] * p1[1]);
    twiceArea += f;
    x += (p1[0] + p2[0]) * f;
    y += (p1[1] + p2[1]) * f;
  }
  
  let area = twiceArea * 3;
  if (area === 0) return [pts[0][0], pts[0][1]] as [number, number];
  
  return [x / area, y / area] as [number, number];
};

const createTextIcon = (text: string) => L.divIcon({
  className: 'region-label-icon',
  html: `<span style="color: white; font-size: 14px; font-weight: 700; font-family: system-ui, sans-serif; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; white-space: nowrap; transform: translate(-50%, -50%); display: block; position: absolute; pointer-events: none;">${text}</span>`,
  iconSize: [0, 0]
});

function DrawingLayer({ activeTool, patients = [], onFilterChange, externalRegions, onPolygonDrawn, initialPolygon, activeColor, activeName }: MapProps) {
  const [radiusCenter, setRadiusCenter] = useState<L.LatLng | null>(null);
  const [radiusSize, setRadiusSize] = useState<number>(0);
  const [polygonPoints, setPolygonPoints] = useState<L.LatLng[]>(() => {
    return initialPolygon ? initialPolygon.map(p => L.latLng(p[0], p[1])) : [];
  });

  // Function to check if point is in polygon (Ray-Casting)
  const isPointInPolygon = useCallback((lat: number, lng: number, vs: L.LatLng[]) => {
    let x = lat, y = lng;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i].lat, yi = vs[i].lng;
      let xj = vs[j].lat, yj = vs[j].lng;
      let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }, []);

  const triggerFilterRadius = useCallback((center: L.LatLng, size: number) => {
    const filtered = patients.filter(p => {
      const point = L.latLng(p.lat, p.lng);
      return center.distanceTo(point) <= size;
    });
    onFilterChange?.(filtered, true);
  }, [patients, onFilterChange]);

  const triggerSpatialFilter = useCallback((pts: L.LatLng[], regions?: { polygon: [number, number][] }[]) => {
    if (pts.length < 3 && (!regions || regions.length === 0)) {
      onFilterChange?.(patients, false);
      return;
    }

    const regionLatLngs = (regions || []).map(r => r.polygon.map(p => L.latLng(p[0], p[1])));
    
    const filtered = patients.filter(p => {
      let insideCustom = false;
      if (pts.length >= 3) {
        insideCustom = isPointInPolygon(p.lat, p.lng, pts);
      }
      
      let insideRegion = false;
      for (const rPts of regionLatLngs) {
        if (isPointInPolygon(p.lat, p.lng, rPts)) {
          insideRegion = true;
          break;
        }
      }
      
      return insideCustom || insideRegion;
    });
    onFilterChange?.(filtered, true);
  }, [isPointInPolygon, patients, onFilterChange]);

  useMapEvents({
    click(e) {
      if (!activeTool) return;
      
      if (activeTool === 'radius') {
        if (!radiusCenter) {
          setRadiusCenter(e.latlng);
          setRadiusSize(500); // default 500m radius
          triggerFilterRadius(e.latlng, 500);
        }
      }
      
      if (activeTool === 'polygon') {
        let newPoints = [...polygonPoints];
        
        if (newPoints.length < 3) {
          newPoints.push(e.latlng);
        } else {
          const map = e.target;
          const clickPt = map.latLngToLayerPoint(e.latlng);
          let minDist = Infinity;
          let insertIndex = newPoints.length;

          for (let i = 0; i < newPoints.length; i++) {
            const pt1 = map.latLngToLayerPoint(newPoints[i]);
            const pt2 = map.latLngToLayerPoint(newPoints[(i + 1) % newPoints.length]);
            
            const dist = L.LineUtil.pointToSegmentDistance(clickPt, pt1, pt2);
            if (dist < minDist) {
              minDist = dist;
              insertIndex = i + 1;
            }
          }
          
          // If inserting after the last point (between last and first), it's the same as pushing
          if (insertIndex === newPoints.length) {
            newPoints.push(e.latlng);
          } else {
            newPoints.splice(insertIndex, 0, e.latlng);
          }
        }
        
        setPolygonPoints(newPoints);
        triggerSpatialFilter(newPoints, externalRegions || []);
        onPolygonDrawn?.(newPoints.map(p => [p.lat, p.lng] as [number, number]));
      }
    },
    contextmenu(e) { // Right click to clear current drawing
      if (activeTool === 'polygon') {
        setPolygonPoints([]);
        onFilterChange?.(patients, false);
        onPolygonDrawn?.([]);
      }
      if (activeTool === 'radius') {
        setRadiusCenter(null);
        setRadiusSize(0);
        onFilterChange?.(patients, false);
      }
    }
  });

  // Clear drawings when tool changes completely
  useEffect(() => {
    // If activeTool is polygon, it might be due to free drawing, keep points
    if (activeTool === 'polygon') return;
    
    setRadiusCenter(null);
    setRadiusSize(0);
    setPolygonPoints([]);
    
    // If we're not drawing, but we have regions, filter by them
    if (externalRegions && externalRegions.length > 0) {
      triggerSpatialFilter([], externalRegions);
    } else {
      onFilterChange?.(patients, false);
    }
    onPolygonDrawn?.([]);
  }, [activeTool, patients, onFilterChange, externalRegions, triggerSpatialFilter, onPolygonDrawn]);

  // Inject external polygon when it changes
  useEffect(() => {
    triggerSpatialFilter(polygonPoints, externalRegions || []);
  }, [externalRegions, polygonPoints, triggerSpatialFilter]);

  // Calculate a fake point on the edge of the radius for the resize handle
  const radiusEdgePoint = radiusCenter ? L.latLng(radiusCenter.lat, radiusCenter.lng + (radiusSize / 111000)) : null;

  return (
    <>
      {/* Radius Drawing */}
      {radiusCenter && activeTool === 'radius' && (
        <>
          <Circle 
            center={radiusCenter} 
            radius={radiusSize} 
            pathOptions={{ color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.2 }} 
          />
          {/* Center drag handle */}
          <Marker 
            position={radiusCenter} 
            draggable={true} 
            icon={handleIcon}
            eventHandlers={{
              drag: (e) => {
                setRadiusCenter(e.target.getLatLng());
              },
              dragend: (e) => {
                const newCenter = e.target.getLatLng();
                setRadiusCenter(newCenter);
                triggerFilterRadius(newCenter, radiusSize);
              }
            }}
          />
          {/* Edge resize handle */}
          {radiusEdgePoint && (
            <Marker 
              position={radiusEdgePoint} 
              draggable={true} 
              icon={handleIcon}
              eventHandlers={{
                drag: (e) => {
                  const newEdge = e.target.getLatLng();
                  const newSize = radiusCenter.distanceTo(newEdge);
                  setRadiusSize(newSize);
                },
                dragend: (e) => {
                  const newEdge = e.target.getLatLng();
                  const newSize = radiusCenter.distanceTo(newEdge);
                  setRadiusSize(newSize);
                  triggerFilterRadius(radiusCenter, newSize);
                }
              }}
            />
          )}
        </>
      )}

      {/* Polygon Drawing */}
      {polygonPoints.length > 0 && activeTool === 'polygon' && (
        <>
          <Polygon positions={polygonPoints} pathOptions={{ color: activeColor || '#3b82f6', weight: 2, fillColor: activeColor || '#3b82f6', fillOpacity: 0.3 }} />
          {activeName && (
            <Marker position={getPolygonCenter(polygonPoints.map(p => [p.lat, p.lng]))} icon={createTextIcon(activeName)} interactive={false} />
          )}
          {/* Handles for each vertex */}
          {polygonPoints.map((pt, idx) => (
            <Marker
              key={idx}
              position={pt}
              draggable={true}
              icon={handleIcon}
              eventHandlers={{
                drag: (e) => {
                  const newPts = [...polygonPoints];
                  newPts[idx] = e.target.getLatLng();
                  setPolygonPoints(newPts);
                  onPolygonDrawn?.(newPts.map(p => [p.lat, p.lng] as [number, number]));
                },
                dragend: (e) => {
                  const newPts = [...polygonPoints];
                  newPts[idx] = e.target.getLatLng();
                  setPolygonPoints(newPts);
                  triggerSpatialFilter(newPts, externalRegions || []);
                  onPolygonDrawn?.(newPts.map(p => [p.lat, p.lng] as [number, number]));
                },
                click: (e) => {
                  if (e.originalEvent) {
                    e.originalEvent.stopPropagation();
                  }
                  const newPts = [...polygonPoints];
                  newPts.splice(idx, 1);
                  setPolygonPoints(newPts);
                  triggerSpatialFilter(newPts, externalRegions || []);
                  onPolygonDrawn?.(newPts.map(p => [p.lat, p.lng] as [number, number]));
                }
              }}
            />
          ))}
        </>
      )}

      {/* External Regions */}
      {externalRegions && externalRegions.map(region => {
        const center = getPolygonCenter(region.polygon);
        return (
          <Fragment key={region.id}>
            <Polygon 
              positions={region.polygon.map(p => L.latLng(p[0], p[1]))} 
              pathOptions={{ color: region.color, weight: 2, fillColor: region.color, fillOpacity: 0.3 }} 
            />
            <Marker position={center} icon={createTextIcon(region.name)} interactive={false} />
          </Fragment>
        );
      })}
    </>
  );
}

function HeatmapLayerComponent({ points }: { points: PatientData[] }) {
  const map = useMapEvents({});
  
  useEffect(() => {
    // Require leaflet.heat only on the client side
    require("leaflet.heat");
    
    const heatPoints = points.map(p => [p.lat, p.lng, 1]);
    const heatLayer = (L as any).heatLayer(heatPoints, { 
      radius: 25, 
      blur: 15, 
      maxZoom: 17,
      gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    });
    
    heatLayer.addTo(map);
    
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, points]);
  
  return null;
}

function MapController({ flyTo, onFlyToHandled, resetViewToken }: { flyTo?: FlyToTarget | null; onFlyToHandled?: () => void; resetViewToken?: number }) {
  const map = useMap();
  const isFirstReset = useRef(true);

  useEffect(() => {
    if (!flyTo) return;
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom || 16, { duration: 1.2 });
    onFlyToHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  useEffect(() => {
    if (isFirstReset.current) {
      isFirstReset.current = false;
      return;
    }
    map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetViewToken]);

  return null;
}

function MapLegend() {
  return (
    <div className="absolute bottom-6 right-4 z-[400] bg-white rounded shadow-md border border-gray-200 px-3 py-2 text-[11px] text-gray-700 flex flex-col gap-1.5" style={{ pointerEvents: 'none' }}>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MARKER_COLOR_DIAGNOSIS }} />
        <span>Diagnóstico confirmado</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MARKER_COLOR_SYMPTOM }} />
        <span>Sem diagnóstico confirmado</span>
      </div>
    </div>
  );
}

function CustomZoomControl() {
  const map = useMap();
  
  return (
    <div className="absolute bottom-6 left-4 z-[400] flex flex-col gap-2" style={{ pointerEvents: 'auto' }}>
      <div className="flex flex-col bg-white rounded shadow-md border border-gray-200 overflow-hidden">
        <button 
          onClick={(e) => { e.stopPropagation(); map.zoomIn(); }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-b border-gray-100 transition-colors bg-white cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); map.zoomOut(); }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors bg-white cursor-pointer"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const TILE_LAYERS = {
  light: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }
};

export default function Map({ activeTool = null, patients = [], displayPatients, onFilterChange, viewMode = 'points', externalRegions = null, onPolygonDrawn, initialPolygon, activeColor, activeName, tileStyle = 'light', flyTo = null, onFlyToHandled, resetViewToken, showLegend = true }: MapProps) {
  const ptsToRender = displayPatients || patients;
  const tile = TILE_LAYERS[tileStyle] || TILE_LAYERS.light;
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ width: '100%', height: '100%', zIndex: 0 }}
      zoomControl={false}
      attributionControl={false}
    >
      <CustomZoomControl />
      <MapController flyTo={flyTo} onFlyToHandled={onFlyToHandled} resetViewToken={resetViewToken} />
      <TileLayer
        attribution={tile.attribution}
        url={tile.url}
      />

      <DrawingLayer activeTool={activeTool} patients={patients} onFilterChange={onFilterChange} externalRegions={externalRegions} onPolygonDrawn={onPolygonDrawn} initialPolygon={initialPolygon} activeColor={activeColor} activeName={activeName} />

      {viewMode === 'heatmap' ? (
        <HeatmapLayerComponent points={ptsToRender} />
      ) : (
        ptsToRender.map((patient) => (
          <CircleMarker
            key={patient.id}
            center={[patient.lat, patient.lng]}
            radius={12}
            pathOptions={{
              stroke: false,
              fillColor: getMarkerColor(patient),
              fillOpacity: 0.7
            }}
          >
            <Popup>
              <div className="font-sans text-sm p-1 min-w-[200px]">
                <h3 className="font-bold text-gray-800 text-base mb-1 border-b pb-1">Paciente {patient.id}</h3>
                <div className="mb-2 text-gray-600 text-xs">
                  <strong>Faixa Etária:</strong> {patient.faixa_etaria}
                </div>
                <div className="mb-2 text-gray-600 text-xs">
                  <strong>Sintomas:</strong> {patient.symptoms.length > 0 ? patient.symptoms.join(", ") : "Nenhum registrado"}
                </div>
                <div className="mb-2 text-gray-600 text-xs">
                  <strong>Doenças:</strong> <span className="text-red-500 font-semibold">{patient.diseases.length > 0 ? patient.diseases.join(", ") : "Sem diagnóstico"}</span>
                </div>
                <div className="text-gray-400 text-[10px] mt-2 italic leading-tight">
                  {patient.address}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))
      )}

      {showLegend && viewMode === 'points' && <MapLegend />}
    </MapContainer>
  );
}
