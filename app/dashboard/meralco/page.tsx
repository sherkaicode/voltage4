"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { MapView } from "@/components/map-view";
import { CSVMapView } from "@/components/csv-map-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Zap, Cloud, Activity, TrendingUp, Waves, Wind, FileDown, Download, Power, AlertCircle } from "lucide-react";
import type { Transformer, Household, WeatherData } from "@/lib/mock-data";
import { cities } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { generateGridHealthReport } from "@/lib/pdf-export";
import { exportTransformerSummary, exportAnomalies, exportForecast, exportDashboardSnapshot } from "@/lib/csv-export";
import { calculateGridHealth, generatePredictiveInsights } from "@/lib/mock-data";
import type { LoadSheddingPlan, SheddingCandidate } from "@/lib/load-shedding";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";
import type { DashboardDataResponse, TransformerRealtimeMetrics } from "@/types/dashboard";
import { generateTransformerAlerts } from "@/lib/alerts";
import type { AnomalySeverity } from "@/lib/anomaly";

const allCities = [...cities];

const getLoadStatus = (loadPercentage: number) => {
  if (loadPercentage >= 95) {
    return { label: "Critical", className: "text-red-500" };
  }
  if (loadPercentage >= 80) {
    return { label: "High", className: "text-orange-500" };
  }
  if (loadPercentage >= 65) {
    return { label: "Elevated", className: "text-amber-500" };
  }
  return { label: "Normal", className: "text-green-600" };
};

interface LegacyTransformerData {
  transformers: Transformer[];
  households: Household[];
  selectedTransformer: Transformer | null;
  weather: WeatherData | null;
  loading: boolean;
}

export default function MeralcoDashboard() {
  const [selectedCity, setSelectedCity] = useState<string>("Quezon City");
  const [legacyData, setLegacyData] = useState<LegacyTransformerData>({
    transformers: [],
    households: [],
    selectedTransformer: null,
    weather: null,
    loading: true,
  });
  const [dashboardData, setDashboardData] = useState<DashboardDataResponse | null>(null);
  const [selectedTransformerId, setSelectedTransformerId] = useState<string | null>(null);
  const [isLoadingRealtime, setIsLoadingRealtime] = useState<boolean>(true);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState<number>(15);
  const [legacyInsights, setLegacyInsights] = useState<string[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [realtimeInsights, setRealtimeInsights] = useState<string[]>([]);
  const [isLoadingRealtimeInsights, setIsLoadingRealtimeInsights] = useState(false);
  const [sheddingPlan, setSheddingPlan] = useState<LoadSheddingPlan | null>(null);
  const [targetReduction, setTargetReduction] = useState<number>(5);
  const [protectCritical, setProtectCritical] = useState<boolean>(true);
  const [respectEquity, setRespectEquity] = useState<boolean>(true);
  const [minimizeImpact, setMinimizeImpact] = useState<boolean>(true);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [showLoadShedding, setShowLoadShedding] = useState(false);

  const isCSVMode = selectedCity === "Quezon City";

  const notificationAlerts = useMemo(() => {
    if (!dashboardData) return [];
    const severityRank: Record<AnomalySeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return dashboardData.transformers
      .flatMap((metric) => generateTransformerAlerts(metric))
      .sort((a, b) => {
        const severityDelta = severityRank[a.severity] - severityRank[b.severity];
        if (severityDelta !== 0) return severityDelta;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, 20);
  }, [dashboardData]);

  const fetchLegacyData = useCallback(async (city: string) => {
    setLegacyData((prev) => ({ ...prev, loading: true }));
    try {
      const gridResponse = await fetch(`/api/grid?city=${city}`);
      const gridResult = await gridResponse.json();
      let transformers: Transformer[] = [];
      let households: Household[] = [];
      if (gridResult.success) {
        transformers = gridResult.data.transformers;
        households = gridResult.data.households;
      }

      const weatherResponse = await fetch(`/api/weather?city=${city}`);
      const weatherResult = await weatherResponse.json();

      setLegacyData({
        transformers,
        households,
        selectedTransformer: transformers[0] ?? null,
        weather: weatherResult.success ? weatherResult.data : null,
        loading: false,
      });
    } catch (error) {
      console.error("Error fetching legacy data:", error);
      setLegacyData((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const fetchRealtimeData = useCallback(async (city: string) => {
    try {
      const response = await fetch(`/api/dashboard-data?city=${encodeURIComponent(city)}`);
      const result = await response.json();
      if (result.success) {
        setDashboardData(result.data);
        setRefreshIntervalSeconds(result.data.refreshIntervalSeconds ?? 15);
      }
    } catch (error) {
      console.error("Error fetching realtime data:", error);
    } finally {
      setIsLoadingRealtime(false);
    }
  }, [selectedTransformerId]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isCSVMode) {
      setIsLoadingRealtime(true);
      fetchRealtimeData(selectedCity);
      intervalId = setInterval(() => {
        fetchRealtimeData(selectedCity);
      }, refreshIntervalSeconds * 1000);
    } else {
      fetchLegacyData(selectedCity);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchLegacyData, fetchRealtimeData, isCSVMode, selectedCity, refreshIntervalSeconds]);

  const selectedRealtimeTransformer: TransformerRealtimeMetrics | undefined = useMemo(() => {
    if (!dashboardData || !selectedTransformerId) return undefined;
    return dashboardData.transformers.find((item) => item.transformer.ID === selectedTransformerId);
  }, [dashboardData, selectedTransformerId]);

  const legacyGridHealth = useMemo(() => {
    if (!legacyData.selectedTransformer || !legacyData.weather) return null;
    return calculateGridHealth(
      legacyData.selectedTransformer.currentLoad,
      legacyData.selectedTransformer.capacity,
      legacyData.weather.temperature,
      legacyData.weather.humidity,
      legacyData.weather.pressure
    );
  }, [legacyData.selectedTransformer, legacyData.weather]);

  useEffect(() => {
    async function loadInsights() {
      if (!legacyData.selectedTransformer || !legacyData.weather) {
        setLegacyInsights([]);
        return;
      }
      
      setIsLoadingInsights(true);
      try {
        const insights = await generatePredictiveInsights(legacyData.selectedTransformer, legacyData.weather);
        setLegacyInsights(insights);
      } catch (error) {
        console.error('Failed to load insights:', error);
        setLegacyInsights(['Failed to load recommendations']);
      } finally {
        setIsLoadingInsights(false);
      }
    }
    
    loadInsights();
  }, [legacyData.selectedTransformer, legacyData.weather]);

  // Load AI insights for realtime transformer
  useEffect(() => {
    async function loadRealtimeInsights() {
      if (!dashboardData || !selectedRealtimeTransformer) {
        setRealtimeInsights([]);
        return;
      }

      const capacityEstimate = selectedRealtimeTransformer.loadPercentage > 0
        ? (selectedRealtimeTransformer.currentLoadKw * 100) / selectedRealtimeTransformer.loadPercentage
        : (selectedRealtimeTransformer.transformer.totalLoad ?? selectedRealtimeTransformer.currentLoadKw * 2);

      const transformerLike = {
        name: selectedRealtimeTransformer.transformer.ID,
        currentLoad: selectedRealtimeTransformer.currentLoadKw,
        capacity: capacityEstimate,
      } as any;

      setIsLoadingRealtimeInsights(true);
      try {
        const insights = await generatePredictiveInsights(transformerLike, dashboardData.weather);
        setRealtimeInsights(insights);
      } catch (error) {
        console.error('Failed to load realtime insights:', error);
        setRealtimeInsights(['Failed to load recommendations']);
      } finally {
        setIsLoadingRealtimeInsights(false);
      }
    }
    
    loadRealtimeInsights();
  }, [selectedRealtimeTransformer, dashboardData]);

  // Generate load shedding plan
  const generateSheddingPlan = async () => {
    if (!dashboardData) return;
    
    setIsGeneratingPlan(true);
    try {
      const response = await fetch('/api/load-shedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transformers: dashboardData.transformers,
          targetReductionMW: targetReduction,
          constraints: {
            protectCriticalInfrastructure: protectCritical,
            respectEquityThresholds: respectEquity,
            minimizeAffectedHouseholds: minimizeImpact,
          },
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        setSheddingPlan(result.data);
      }
    } catch (error) {
      console.error('Failed to generate shedding plan:', error);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const legacyLoadData = useMemo(() =>
    legacyData.transformers.map((t) => ({
      name: t.name.split(" - ")[1] || t.name,
      load: t.currentLoad,
      capacity: t.capacity,
      percentage: (t.currentLoad / t.capacity) * 100,
    })),
  [legacyData.transformers]);

  const legacyTimeSeriesData = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}:00`,
      load: Math.random() * 100 + 200,
    })),
  []);

  const renderRealtimeSummaryCards = () => {
    if (!dashboardData) return null;
    const { summary, weather } = dashboardData;

    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">BGHI Score</CardTitle>
            <CardDescription className="text-orange-100">Meralco - {dashboardData.city}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-semibold">{summary.bghiScore.toFixed(1)}</span>
              <p className="text-xs uppercase tracking-wide mt-1">{summary.status}</p>
            </div>
            <Activity className="h-10 w-10 text-white/80" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transformer Health</CardTitle>
            <CardDescription>Load distribution snapshot</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-semibold">{summary.totalTransformers}</p>
              <p className="text-xs text-gray-500">Total transformers</p>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-1">
              <p className="text-amber-500 font-semibold">{summary.warningTransformers} warning</p>
              <p className="text-red-500 font-semibold">{summary.criticalTransformers} critical</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Alerts & Anomalies</CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-semibold">{summary.alertsCount}</p>
              <p className="text-xs text-gray-500">Predictive alerts</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-orange-500">{summary.anomalyCount24h}</p>
              <p className="text-xs text-gray-500">Anomalies</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Weather Impact</CardTitle>
            <CardDescription>Environmental stress</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-semibold">{weather.temperature.toFixed(1)}°C</p>
              <p className="text-xs text-gray-500">Humidity {weather.humidity.toFixed(0)}%</p>
            </div>
            <div className="flex space-x-3 text-gray-400">
              <Cloud className="h-6 w-6" />
              <Wind className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTransformerStatusTable = () => {
    if (!dashboardData || !dashboardData.transformers.length) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Transformer Status</CardTitle>
          <CardDescription>Live load and status for Quezon City transformers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-gray-100 dark:border-gray-800">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Transformer</th>
                  <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Load (kW)</th>
                  <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Load %</th>
                  <th className="px-4 py-2 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.transformers.map((metric) => {
                  const { label, className } = getLoadStatus(metric.loadPercentage);
                  return (
                    <tr
                      key={metric.transformer.ID}
                      className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-900/30"
                    >
                      <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-100">
                        {metric.transformer.ID}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                        {metric.currentLoadKw.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                        {metric.loadPercentage.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2">
                        <span className={`font-semibold ${className}`}>{label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderRealtimeTransformerDetails = () => {
    if (!selectedRealtimeTransformer || !dashboardData) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Transformer Details</CardTitle>
            <CardDescription>Select a transformer to view metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500 text-center py-8">Pick a transformer on the map to analyse its health.</p>
          </CardContent>
        </Card>
      );
    }

    const forecastPoints = selectedRealtimeTransformer.forecast.points.map((point) => ({
      ...point,
      label: `+${point.offsetHours}h`,
    }));

    const statusInfo = getLoadStatus(selectedRealtimeTransformer.loadPercentage);

    return (
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{selectedRealtimeTransformer.transformer.ID}</CardTitle>
            <CardDescription>
              Current load {selectedRealtimeTransformer.currentLoadKw.toFixed(2)} kW · {selectedRealtimeTransformer.loadPercentage.toFixed(1)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Status</p>
                <p className={`text-lg font-semibold ${statusInfo.className}`}>{statusInfo.label}</p>
              </div>
              <div>
                <p className="text-gray-500">Outage (24h)</p>
                <p className="text-lg font-semibold">{selectedRealtimeTransformer.outageMinutes24h.toFixed(1)} min</p>
              </div>
              <div>
                <p className="text-gray-500">Spike Events</p>
                <p className="text-lg font-semibold">{selectedRealtimeTransformer.spikeEvents24h}</p>
              </div>
              <div>
                <p className="text-gray-500">Mismatch</p>
                <p className="text-lg font-semibold">{(selectedRealtimeTransformer.mismatchRatio * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2 text-gray-600">Rolling Load (last hour)</p>
              <div className="flex items-baseline space-x-4 text-sm">
                <div>
                  <p className="text-gray-500">Mean</p>
                  <p className="font-semibold">{selectedRealtimeTransformer.rollingStats.mean.toFixed(2)} kW</p>
                </div>
                <div>
                  <p className="text-gray-500">Std Dev</p>
                  <p className="font-semibold">{selectedRealtimeTransformer.rollingStats.std.toFixed(2)} kW</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2 text-gray-600">Forecast (24h)</p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={forecastPoints}>
                  <defs>
                    <linearGradient id="riskGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.6} />
                      <stop offset="70%" stopColor="#f97316" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" hide tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ fontSize: "0.75rem" }}
                    formatter={(value: number, name) => {
                      if (name === "predictedLoadKw") {
                        return [`${value.toFixed(2)} kW`, "Predicted"];
                      }
                      return [value, name];
                    }}
                  />
                  <Area type="monotone" dataKey="predictedLoadKw" stroke="#f97316" strokeWidth={2} fill="url(#riskGradient)" />
                </AreaChart>
              </ResponsiveContainer>
              {selectedRealtimeTransformer.forecast.overloadAlert ? (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="font-semibold flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Predictive Overload Detected</span>
                  </p>
                  <p className="mt-1">
                    {selectedRealtimeTransformer.forecast.overloadAlert.recommendedAction}
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-semibold mb-1 text-gray-600">Recent anomalies</p>
              {selectedRealtimeTransformer.recentAnomalies.length ? (
                <ul className="space-y-2 text-xs text-gray-600">
                  {selectedRealtimeTransformer.recentAnomalies.map((anomaly, index) => (
                    <li key={`${anomaly.anomalyType}-${anomaly.timestamp}-${index}`} className="rounded-md border border-gray-100 dark:border-gray-800 p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{anomaly.anomalyType}</span>
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">{new Date(anomaly.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">Severity: {anomaly.severity} · Confidence: {(anomaly.confidence * 100).toFixed(0)}%</p>
                      <p className="text-[11px] text-gray-500">{anomaly.recommendedAction}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No anomalies in the past 24 hours.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transformer Alerts</CardTitle>
            <CardDescription>Real-time recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardData.alerts.length ? (
              <div className="space-y-3">
                {dashboardData.alerts.map((alertItem) => (
                  <div
                    key={`${alertItem.transformerId}-${alertItem.alert.firstCriticalHour}`}
                    className={`rounded-md border p-3 text-xs ${
                      alertItem.transformerId === selectedRealtimeTransformer.transformer.ID
                        ? "border-red-300 bg-red-50"
                        : "border-gray-200"
                    }`}
                  >
                    <p className="font-semibold text-gray-700">{alertItem.transformerId}</p>
                    <p className="mt-1 text-gray-500">
                      Overload risk in {alertItem.alert.hoursAhead} hours · Confidence {(
                        alertItem.alert.confidence * 100
                      ).toFixed(0)}%
                    </p>
                    <p className="mt-2 text-gray-500">{alertItem.alert.recommendedAction}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No predictive alerts at this time.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderLegacyLayout = () => (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Grid Map</CardTitle>
          <CardDescription>Interactive map showing transformers and households in {selectedCity}</CardDescription>
        </CardHeader>
        <CardContent>
          {legacyData.loading ? (
            <div className="h-[600px] flex items-center justify-center">
              <p className="text-gray-500">Loading map data...</p>
            </div>
          ) : (
            <MapView
              transformers={legacyData.transformers}
              households={legacyData.households}
              selectedTransformer={legacyData.selectedTransformer}
              onTransformerSelect={(transformer) =>
                setLegacyData((prev) => ({ ...prev, selectedTransformer: transformer }))
              }
            />
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Transformer Details</CardTitle>
            <CardDescription>
              {legacyData.selectedTransformer
                ? `Information for ${legacyData.selectedTransformer.name}`
                : "Select a transformer on the map to view details"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {legacyData.selectedTransformer ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Current Load</p>
                  <p className="text-2xl font-bold">
                    {legacyData.selectedTransformer.currentLoad.toFixed(1)} kW
                  </p>
                  <p className="text-sm text-gray-500">
                    Capacity: {legacyData.selectedTransformer.capacity} kW
                  </p>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-orange-500 h-2.5 rounded-full"
                      style={{
                        width: `${(
                          legacyData.selectedTransformer.currentLoad / legacyData.selectedTransformer.capacity
                        ) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                {legacyData.weather && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Weather Parameters</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <Cloud className="h-4 w-4 inline mr-1" />
                        <span className="text-gray-500">Temperature: </span>
                        <span className="font-semibold">{legacyData.weather.temperature.toFixed(1)}°C</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Humidity: </span>
                        <span className="font-semibold">{legacyData.weather.humidity.toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Pressure: </span>
                        <span className="font-semibold">{legacyData.weather.pressure.toFixed(1)} hPa</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Wind: </span>
                        <span className="font-semibold">{legacyData.weather.windSpeed.toFixed(1)} m/s</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500">Condition: </span>
                        <span className="font-semibold">{legacyData.weather.condition}</span>
                      </div>
                    </div>
                  </div>
                )}

                {legacyGridHealth !== null && (
                  <div>
                    <p className="text-sm text-gray-500">Grid Health</p>
                    <p className="text-2xl font-bold">{legacyGridHealth.toFixed(1)}%</p>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full ${
                          legacyGridHealth > 70
                            ? "bg-green-500"
                            : legacyGridHealth > 40
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${legacyGridHealth}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                Click on a transformer marker to view details
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Predictive Insights</CardTitle>
            <CardDescription>AI-powered predictions and recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            {legacyInsights.length > 0 ? (
              <div className="space-y-3">
                {legacyInsights.map((insight, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                  >
                    <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">{insight}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                Select a transformer to see predictive insights
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
          <CardDescription>Grid load and consumption trends</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="load" className="w-full">
            <TabsList>
              <TabsTrigger value="load">Transformer Load</TabsTrigger>
              <TabsTrigger value="trends">24-Hour Trends</TabsTrigger>
            </TabsList>
            <TabsContent value="load" className="mt-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={legacyLoadData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="load" fill="#f97316" name="Current Load (kW)" />
                  <Bar dataKey="capacity" fill="#e5e7eb" name="Capacity (kW)" />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="trends" className="mt-4">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={legacyTimeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="load" stroke="#f97316" strokeWidth={2} name="Load (kW)" />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );

  const renderRealtimeLayout = () => (
    <>
      {renderRealtimeSummaryCards()}

      {renderTransformerStatusTable()}

      <Card>
        <CardHeader>
          <CardTitle>Grid Map</CardTitle>
          <CardDescription>Real-time visibility of Quezon City transformers and households</CardDescription>
        </CardHeader>
        <CardContent className="relative z-0">
          {isLoadingRealtime || !dashboardData ? (
            <div className="h-[600px] flex items-center justify-center">
              <p className="text-gray-500">Loading live metrics...</p>
            </div>
          ) : (
            <CSVMapView
              transformers={dashboardData.transformers}
              selectedTransformerId={selectedTransformerId}
              onTransformerSelect={setSelectedTransformerId}
            />
          )}
        </CardContent>
      </Card>

      {/* Predictive insights for realtime selected transformer */}
      <Card>
        <CardHeader>
          <CardTitle>Predictive Insights</CardTitle>
          <CardDescription>Realtime predictions and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          {!dashboardData || !selectedRealtimeTransformer ? (
            <p className="text-gray-500 text-center py-8">Select a transformer to see predictive insights</p>
          ) : isLoadingRealtimeInsights ? (
            <p className="text-gray-500 text-center py-8">Loading AI recommendations...</p>
          ) : realtimeInsights.length > 0 ? (
            <div className="space-y-3">
              {realtimeInsights.map((insight, idx) => (
                <div key={idx} className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">{insight}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No predictive insights available for the selected transformer</p>
          )}
        </CardContent>
      </Card>

      {renderRealtimeTransformerDetails()}

      {/* Load Shedding Planner - Emergency Tool (LAST CARD) */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <Power className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-red-700 dark:text-red-400">Load Shedding Planner</CardTitle>
                <CardDescription>Emergency grid relief planning tool</CardDescription>
              </div>
            </div>
            <Button
              variant={showLoadShedding ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowLoadShedding(!showLoadShedding)}
            >
              {showLoadShedding ? 'Hide' : 'Open Planner'}
            </Button>
          </div>
        </CardHeader>
        
        {showLoadShedding && (
          <CardContent className="space-y-6">
            {/* Controls */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="targetReduction">Target Load Reduction (MW)</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      id="targetReduction"
                      type="range"
                      min="1"
                      max="50"
                      step="0.5"
                      value={targetReduction}
                      onChange={(e) => setTargetReduction(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-2xl font-bold text-red-600 min-w-[80px]">{targetReduction} MW</span>
                  </div>
                </div>
                
                <Button
                  onClick={generateSheddingPlan}
                  disabled={isGeneratingPlan}
                  className="w-full bg-red-600 hover:bg-red-700"
                  size="lg"
                >
                  {isGeneratingPlan ? 'Generating Plan...' : 'Generate Shedding Plan'}
                </Button>
              </div>
              
              <div className="space-y-3">
                <Label>Constraints</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={protectCritical}
                      onChange={(e) => setProtectCritical(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Protect Critical Infrastructure</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={respectEquity}
                      onChange={(e) => setRespectEquity(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Respect Equity Thresholds</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={minimizeImpact}
                      onChange={(e) => setMinimizeImpact(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Minimize Affected Households</span>
                  </label>
                </div>
              </div>
            </div>
            
            {/* Results */}
            {sheddingPlan && (
              <div className="space-y-4 border-t pt-6">
                {/* Impact Summary */}
                <div className="grid grid-cols-4 gap-4">
                  <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                    <CardContent className="pt-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Transformers to Shed</p>
                      <p className="text-2xl font-bold text-blue-600">{sheddingPlan.impactSummary.transformersToShed}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200">
                    <CardContent className="pt-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Buildings Affected</p>
                      <p className="text-2xl font-bold text-orange-600">{sheddingPlan.impactSummary.totalBuildingsAffected}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
                    <CardContent className="pt-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Estimated Relief</p>
                      <p className="text-2xl font-bold text-green-600">{sheddingPlan.actualReductionMW.toFixed(1)} MW</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200">
                    <CardContent className="pt-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Target Achievement</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {((sheddingPlan.actualReductionMW / sheddingPlan.targetReductionMW) * 100).toFixed(0)}%
                      </p>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Warnings */}
                {sheddingPlan.impactSummary.criticalInfrastructureWarnings.length > 0 && (
                  <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-300">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold text-amber-800 dark:text-amber-400">Warnings</p>
                          <ul className="text-sm text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                            {sheddingPlan.impactSummary.criticalInfrastructureWarnings.map((warning, idx) => (
                              <li key={idx}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Recommended Transformers Table */}
                <div>
                  <h3 className="font-semibold text-lg mb-3">Recommended Shedding Order</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-800">
                          <tr>
                            <th className="px-4 py-3 text-left">Order</th>
                            <th className="px-4 py-3 text-left">Transformer ID</th>
                            <th className="px-4 py-3 text-right">Current Load</th>
                            <th className="px-4 py-3 text-right">Buildings</th>
                            <th className="px-4 py-3 text-right">Priority Score</th>
                            <th className="px-4 py-3 text-left">Reasoning</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sheddingPlan.recommendedTransformers.map((candidate) => (
                            <tr 
                              key={candidate.transformerId}
                              className={`border-t ${
                                candidate.priorityScore >= 70 ? 'bg-green-50 dark:bg-green-900/10' :
                                candidate.priorityScore >= 40 ? 'bg-yellow-50 dark:bg-yellow-900/10' :
                                'bg-red-50 dark:bg-red-900/10'
                              }`}
                            >
                              <td className="px-4 py-3 font-bold">{candidate.sheddingOrder}</td>
                              <td className="px-4 py-3 font-mono text-xs">{candidate.transformerId}</td>
                              <td className="px-4 py-3 text-right">{candidate.currentLoadKw.toFixed(1)} kW</td>
                              <td className="px-4 py-3 text-right">{candidate.downstreamBuildings}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-bold ${
                                  candidate.priorityScore >= 70 ? 'text-green-600' :
                                  candidate.priorityScore >= 40 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {candidate.priorityScore.toFixed(0)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <ul className="space-y-1">
                                  {candidate.reasoning.slice(0, 2).map((reason, ridx) => (
                                    <li key={ridx}>{reason}</li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                
                {/* Alternative Scenarios */}
                <div>
                  <h3 className="font-semibold text-lg mb-3">Alternative Scenarios</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    {sheddingPlan.alternatives.map((alt, idx) => (
                      <Card key={idx} className="hover:shadow-lg transition-shadow cursor-pointer">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{alt.scenario}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Transformers:</span>
                            <span className="font-bold">{alt.transformers}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Buildings:</span>
                            <span className="font-bold">{alt.buildingsAffected}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Relief:</span>
                            <span className="font-bold text-green-600">{alt.reliefMW.toFixed(1)} MW</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </>
  );

  return (
    // <DashboardLayout 
    //   title="Meralco Dashboard"
    //   warnings={notificationAlerts}
    <DashboardLayout
      role="meralco" 
      title=""
      warnings={notificationAlerts}
    >
      {/* <div className="flex items-center justify-center py-5 bg-[#ff7a1a]">
            <img
              src="/icons/citywatch.svg"
              alt="Gridpulse Logo"
              className="w-full max-w-[600px] h-auto object-contain py-10"
            />
          </div> */}
      <div className="space-y-6 pt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between pt-1">
              <div>
                <CardTitle>Select City</CardTitle>
                <CardDescription>Choose a city to view grid data</CardDescription>
              </div>
              {dashboardData && isCSVMode && (
                <div className="flex gap-2">
                  {/* CSV Export Dropdown */}
                  <div className="relative group">
                    <Button
                      variant="outline"
                      className="border-green-500 text-green-600 hover:bg-green-50"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </Button>
                    <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                      <div className="py-1">
                        <button
                          onClick={() => exportTransformerSummary(dashboardData.transformers, dashboardData.city)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <Zap className="h-4 w-4" />
                          Transformer Summary
                        </button>
                        <button
                          onClick={() => exportAnomalies(dashboardData.anomalies, dashboardData.city)}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <AlertTriangle className="h-4 w-4" />
                          Anomalies ({dashboardData.anomalies.length})
                        </button>
                        {selectedRealtimeTransformer && (
                          <button
                            onClick={() => exportForecast(
                              selectedRealtimeTransformer.forecast.points,
                              selectedRealtimeTransformer.transformer.ID
                            )}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                          >
                            <TrendingUp className="h-4 w-4" />
                            Forecast Data
                          </button>
                        )}
                        <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                        <button
                          onClick={() => exportDashboardSnapshot(
                            dashboardData.city,
                            dashboardData.transformers,
                            dashboardData.anomalies,
                            dashboardData.summary.bghiScore,
                            dashboardData.summary.status
                          )}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 font-semibold"
                        >
                          <Download className="h-4 w-4" />
                          Complete Snapshot
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* PDF Export */}
                  <Button
                    onClick={async () => {
                      try {
                        await generateGridHealthReport(dashboardData);
                      } catch (error) {
                        console.error('Failed to generate report:', error);
                      }
                    }}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Export PDF
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedCity}
              onValueChange={(value) => {
                setSelectedCity(value);
                setSelectedTransformerId(null);
                setDashboardData(null);
                if (value !== "Quezon City") {
                  fetchLegacyData(value);
                }
              }}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a city" />
              </SelectTrigger>
              <SelectContent>
                {allCities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {isCSVMode ? renderRealtimeLayout() : renderLegacyLayout()}
      </div>
    </DashboardLayout>
  );
}
