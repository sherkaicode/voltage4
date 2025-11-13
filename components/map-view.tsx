"use client";

import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with Leaflet
export const MapView = dynamic(() => import("./map-view-client").then((mod) => mod.MapViewComponent), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
      <p className="text-gray-500">Loading map...</p>
    </div>
  ),
});

