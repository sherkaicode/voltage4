"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { Home } from "lucide-react";

import type { TransformerRealtimeMetrics } from "@/types/dashboard";

const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface CSVMapViewProps {
  transformers: TransformerRealtimeMetrics[];
  selectedTransformerId?: string | null;
  onTransformerSelect?: (transformerId: string) => void;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

function getLoadColor(loadPercentage: number): string {
  if (loadPercentage <= 0) return "#6B7280";
  if (loadPercentage >= 95) return "#dc2626";
  if (loadPercentage >= 80) return "#f97316";
  if (loadPercentage >= 65) return "#facc15";
  return "#22c55e";
}

function getCircleRadius(loadPercentage: number): number {
  const baseRadius = 10; // meters
  const additional = Math.min(10, loadPercentage / 10);
  return baseRadius + additional;
}

function createTransformerIcon(loadPercentage: number, isSelected: boolean): L.DivIcon {
  const color = getLoadColor(loadPercentage);
  const size = isSelected ? 44 : 36;
  const borderColor = isSelected ? "#111827" : "#ffffff";

  return L.divIcon({
    className: "custom-transformer-icon",
    html: `<div style="
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: 3px solid ${borderColor};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: ${isSelected ? "14px" : "12px"};
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
      ">${Math.round(loadPercentage)}%</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function CSVMapViewComponent({
  transformers,
  selectedTransformerId,
  onTransformerSelect,
}: CSVMapViewProps) {
  const mapRef = useRef<L.Map | null>(null);

  const center: [number, number] = transformers.length
    ? [
        transformers.reduce((sum, t) => sum + t.transformer.Latitude, 0) / transformers.length,
        transformers.reduce((sum, t) => sum + t.transformer.Longitude, 0) / transformers.length,
      ]
    : [14.676, 121.0437];

  const handleRecenter = () => {
    if (mapRef.current) {
      mapRef.current.setView(center, 16);
    }
  };

  return (
    <div className="w-full h-[600px] rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden relative">
      <button
        onClick={handleRecenter}
        className="absolute top-4 right-4 z-[999] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-md"
        title="Recenter map"
      >
        <Home className="h-5 w-5 text-gray-700 dark:text-gray-300" />
      </button>
      <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%" }} ref={mapRef}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController center={center} zoom={16} />

        {transformers.map((metric) => {
          const transformer = metric.transformer;
          const isSelected = transformer.ID === selectedTransformerId;

          if (transformer.EntityType === "SubstationTransformer") {
            return (
              <div key={transformer.ID}>
                <Circle
                  center={[transformer.Latitude, transformer.Longitude]}
                  radius={20}
                  pathOptions={{
                    color: "#111827",
                    weight: isSelected ? 4 : 2,
                    fillColor: "#152dfa",
                    fillOpacity: 0.5,
                  }}
                />
              </div>
            );
          }

          const circleRadius = getCircleRadius(metric.loadPercentage);
          const color = getLoadColor(metric.loadPercentage);
          const recentAnomalies = metric.recentAnomalies.slice(-3);
          const forecastRisk = metric.forecast.overloadAlert?.riskRatio ?? metric.forecast.peakRisk?.riskRatio ?? 0;

          return (
            <div key={transformer.ID}>
              <Circle
                center={[transformer.Latitude, transformer.Longitude]}
                radius={circleRadius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.05,
                  weight: isSelected ? 3 : 1.5,
                }}
              />

              {metric.households.map((household) => (
                <Polyline
                  key={`line-${transformer.ID}-${household.id}`}
                  positions={[
                    [transformer.Latitude, transformer.Longitude],
                    [household.latitude, household.longitude],
                  ]}
                  pathOptions={{ color: "#6B7280", weight: 1, opacity: 0.45, dashArray: "6, 6" }}
                />
              ))}

              <Marker
                position={[transformer.Latitude, transformer.Longitude]}
                icon={createTransformerIcon(metric.loadPercentage, isSelected)}
                // ensure transformer marker always appears above household markers
                zIndexOffset={isSelected ? 2000 : 1500}
                 eventHandlers={{
                   click: () => onTransformerSelect?.(transformer.ID),
                 }}
               >
                <Popup minWidth={280} maxWidth={320} className="text-xs">
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{transformer.ID}</p>
                      <p className="text-xs text-gray-500">
                        Load: {metric.currentLoadKw.toFixed(2)} kW ({metric.loadPercentage.toFixed(1)}%)
                      </p>
                    </div>
                    <div className="text-[11px] text-gray-500 flex items-center space-x-1">
                      <span className="font-medium text-gray-600">Status:</span>
                      <span className={`font-semibold ${metric.loadPercentage >= 95 ? "text-red-500" : metric.loadPercentage >= 80 ? "text-orange-500" : metric.loadPercentage >= 65 ? "text-amber-500" : "text-green-500"}`}>
                        {metric.loadPercentage >= 95
                          ? "Critical"
                          : metric.loadPercentage >= 80
                          ? "High"
                          : metric.loadPercentage >= 65
                          ? "Elevated"
                          : "Normal"}
                      </span>
                    </div>
                    {recentAnomalies.length ? (
                      <div>
                        <p className="font-medium text-xs text-gray-600">Recent anomalies</p>
                        <ul className="mt-1 space-y-1">
                          {recentAnomalies.map((anomaly, index) => (
                            <li key={`${anomaly.anomalyType}-${index}`} className="text-[11px] text-gray-500">
                              <span className="font-semibold text-gray-700 dark:text-gray-200">{anomaly.anomalyType}</span> · {anomaly.severity}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-400">No anomalies detected in the last 24 hours.</p>
                    )}
                    <div className="text-[11px] text-gray-500">
                      <span className="font-semibold text-gray-600">Forecast risk:</span> {(forecastRisk * 100).toFixed(0)}%
                      {metric.forecast.overloadAlert ? (
                        <span className="ml-1 text-red-500 font-medium">({metric.forecast.overloadAlert.riskRatio.toFixed(2)} risk)</span>
                      ) : (
                        <span className="ml-1 text-green-500 font-medium">(Stable)</span>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>

              {metric.households.map((household) => (
                <Marker
                  key={household.id}
                  position={[household.latitude, household.longitude]}
                  icon={L.icon({
                     iconUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNiIgY3k9IjYiIHI9IjMiIGZpbGw9IiM2QjcyODAiLz4KPC9zdmc+",
                     iconSize: [10, 10],
                     iconAnchor: [5, 5],
                   })}
                  // keep household markers below transformers
                  zIndexOffset={200}
                 >
                  <Popup>
                    <div className="p-1 text-[11px]">
                      <p className="font-semibold">{household.id}</p>
                      <p>Load: {household.currentLoadKw.toFixed(2)} kW</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}

