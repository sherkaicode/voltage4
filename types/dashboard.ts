import type { TransformerWithLoad } from "@/lib/csv-data";
import type { Anomaly } from "@/lib/anomaly";
import type { BGHIResult } from "@/lib/bghi";
import type { ForecastPoint, OverloadAlert, PeakRiskInfo } from "@/lib/forecasting";
import type { WeatherData } from "@/lib/mock-data";

export type ArtificialDisasterKind = "heatwave" | "typhoon" | "earthquake" | "brownout" | "cyberattack" | "custom";

export interface ArtificialDisasterInfo {
  type: ArtificialDisasterKind;
  startedAt: string;
  expiresAt?: string;
  parameters?: Record<string, number>;
  notes?: string;
}

export interface HouseholdRealtime {
  id: string;
  transformerId: string;
  latitude: number;
  longitude: number;
  currentLoadKw: number;
  loadHistory: Array<{ timestamp: string; loadKw: number }>;
}

export interface TransformerRealtimeMetrics {
  transformer: TransformerWithLoad;
  currentLoadKw: number;
  loadPercentage: number;
  households: HouseholdRealtime[];
  anomalies: Anomaly[];
  recentAnomalies: Anomaly[];
  bghi: BGHIResult;
  forecast: {
    points: ForecastPoint[];
    peakRisk: PeakRiskInfo | null;
    overloadAlert: OverloadAlert | null;
  };
  rollingStats: {
    mean: number;
    std: number;
  };
  outageMinutes24h: number;
  spikeEvents24h: number;
  mismatchRatio: number;
  lastUpdated: string;
  artificialOutageActive?: boolean;
  artificialDisaster?: ArtificialDisasterInfo | null;
}

export interface DashboardSummary {
  bghiScore: number;
  status: BGHIResult["status"];
  color: BGHIResult["color"];
  totalTransformers: number;
  warningTransformers: number;
  criticalTransformers: number;
  anomalyCount24h: number;
  alertsCount: number;
  averageLoadPct: number;
}

export interface DashboardDataResponse {
  city: string;
  transformers: TransformerRealtimeMetrics[];
  summary: DashboardSummary;
  alerts: Array<{
    transformerId: string;
    transformerName: string;
    alert: OverloadAlert;
  }>;
  anomalies: Anomaly[];
  weather: WeatherData;
  refreshIntervalSeconds: number;
  updatedAt: string;
}
