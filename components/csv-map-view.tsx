"use client";

import dynamic from "next/dynamic";
import type { TransformerRealtimeMetrics } from "@/types/dashboard";

interface CSVMapViewProps {
  transformers: TransformerRealtimeMetrics[];
  selectedTransformerId?: string | null;
  onTransformerSelect?: (transformerId: string) => void;
}

export const CSVMapView = dynamic<CSVMapViewProps>(
  () => import("./csv-map-view-client").then((mod) => mod.CSVMapViewComponent),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[600px] rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
        <p className="text-gray-500">Loading map...</p>
      </div>
    ),
  }
);

