"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Transformer, Household } from "@/lib/mock-data";
import { useEffect, useRef } from "react";

// Fix for default marker icons in Next.js
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

interface MapViewProps {
  transformers: Transformer[];
  households: Household[];
  selectedTransformer?: Transformer | null;
  onTransformerSelect?: (transformer: Transformer) => void;
}

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [map, center]);
  return null;
}

export function MapViewComponent({
  transformers,
  households,
  selectedTransformer,
  onTransformerSelect,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Calculate center point
  const center: [number, number] =
    transformers.length > 0
      ? [
          transformers.reduce((sum, t) => sum + t.latitude, 0) / transformers.length,
          transformers.reduce((sum, t) => sum + t.longitude, 0) / transformers.length,
        ]
      : [14.5995, 120.9842]; // Default to Manila

  // Create custom transformer icon based on load
  const getTransformerIcon = (transformer: Transformer) => {
    const loadPercentage = (transformer.currentLoad / transformer.capacity) * 100;
    const color =
      loadPercentage <= 0
        ? "#6B7280"
        : loadPercentage > 80
        ? "red"
        : loadPercentage > 60
        ? "orange"
        : loadPercentage > 40
        ? "yellow"
        : "green";

    return L.divIcon({
      className: "custom-transformer-icon",
      html: `<div style="
        width: 30px;
        height: 30px;
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">${Math.round(loadPercentage)}%</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  };

  return (
    <div className="w-full h-[600px] rounded-lg border border-[#fe5014]-200 overflow-hidden">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController center={center} />
        
        {/* Household markers */}
        {households.map((household) => (
          <Marker
            key={household.id}
            position={[household.latitude, household.longitude]}
            icon={L.icon({
              iconUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNiIgY3k9IjYiIHI9IjMiIGZpbGw9IiM2QjcyODAiLz4KPC9zdmc+",
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            })}
          />
        ))}

        {/* Transformer markers */}
        {transformers.map((transformer) => (
          <Marker
            key={transformer.id}
            position={[transformer.latitude, transformer.longitude]}
            icon={getTransformerIcon(transformer)}
            eventHandlers={{
              click: () => {
                onTransformerSelect?.(transformer);
              },
            }}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-sm">{transformer.name}</h3>
                <p className="text-xs text-gray-600">
                  Load: {transformer.currentLoad.toFixed(1)} kW / {transformer.capacity} kW
                </p>
                <p className="text-xs text-gray-600">
                  {transformer.city}, {transformer.barangay}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
