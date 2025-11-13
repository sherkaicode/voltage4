"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { CSVMapView } from "@/components/csv-map-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Zap, Activity, FileDown } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, AreaChart, Area, LineChart, Line, Legend, ReferenceLine } from "recharts";
import type { DashboardDataResponse, TransformerRealtimeMetrics } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { generateBarangayReport } from "@/lib/pdf-export";
import { generatePredictiveInsights } from "@/lib/mock-data";
import { generateTransformerAlerts } from "@/lib/alerts";
import type { AnomalySeverity } from "@/lib/anomaly";
import { getBGHITrends, type HistoricalBGHI } from "@/lib/historical-data";

const BARANGAY = "UP Diliman";

export default function BarangayDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardDataResponse | null>(null);
  const [selectedTransformerId, setSelectedTransformerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState<number>(15);
  const [insights, setInsights] = useState<string[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [historicalData, setHistoricalData] = useState<HistoricalBGHI[]>([]);
  const [historicalPeriod, setHistoricalPeriod] = useState<7 | 30>(30);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const fetchData = async () => {
      try {
        const response = await fetch(`/api/dashboard-data?city=${encodeURIComponent(BARANGAY)}`);
        const result = await response.json();
        if (result.success) {
          setDashboardData(result.data);
          setRefreshIntervalSeconds(result.data.refreshIntervalSeconds ?? 15);
          if (!selectedTransformerId && result.data.transformers.length) {
            // Select the first PolePadTransformer instead of SubTransmission
            const polePadTransformer = result.data.transformers.find(
              (t: TransformerRealtimeMetrics) => t.transformer.EntityType === "PolePadTransformer"
            );
            setSelectedTransformerId(
              polePadTransformer?.transformer.ID || result.data.transformers[0].transformer.ID
            );
          }
        }
      } catch (error) {
        console.error("Error fetching barangay data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    intervalId = setInterval(fetchData, refreshIntervalSeconds * 1000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedTransformerId, refreshIntervalSeconds]);

  const selectedTransformer: TransformerRealtimeMetrics | undefined = useMemo(() => {
    if (!dashboardData || !selectedTransformerId) return undefined;
    return dashboardData.transformers.find((item) => item.transformer.ID === selectedTransformerId);
  }, [dashboardData, selectedTransformerId]);

  // Load historical BGHI trends
  useEffect(() => {
    if (dashboardData) {
      const avgLoad = dashboardData.transformers.reduce((sum, t) => sum + t.currentLoadKw, 0) / dashboardData.transformers.length;
      const history = getBGHITrends(
        dashboardData.city,
        dashboardData.summary.bghiScore,
        avgLoad,
        dashboardData.anomalies.length,
        dashboardData.summary.criticalTransformers,
        historicalPeriod
      );
      setHistoricalData(history);
    }
  }, [dashboardData, historicalPeriod]);

  // Load AI insights asynchronously
  useEffect(() => {
    async function loadInsights() {
      if (!selectedTransformer || !dashboardData) {
        setInsights([]);
        return;
      }

      const capacityEstimate = selectedTransformer.loadPercentage > 0
        ? (selectedTransformer.currentLoadKw * 100) / selectedTransformer.loadPercentage
        : (selectedTransformer.transformer.totalLoad ?? selectedTransformer.currentLoadKw * 2);

      const transformerLike = {
        name: selectedTransformer.transformer.ID,
        currentLoad: selectedTransformer.currentLoadKw,
        capacity: capacityEstimate,
      } as any;

      setIsLoadingInsights(true);
      try {
        const result = await generatePredictiveInsights(transformerLike, dashboardData.weather);
        setInsights(result);
      } catch (error) {
        console.error('Failed to load insights:', error);
        setInsights(['Failed to load recommendations']);
      } finally {
        setIsLoadingInsights(false);
      }
    }
    
    loadInsights();
  }, [selectedTransformer, dashboardData]);

  const loadData = useMemo(() => {
    if (!dashboardData) return [];
    return dashboardData.transformers
      .filter((t) => t.transformer.EntityType === "PolePadTransformer")
      .map((metric) => ({
        name: metric.transformer.ID,
        load: metric.currentLoadKw,
        buildings: metric.transformer.NumDownstreamBuildings,
      }));
  }, [dashboardData]);

  const summary = dashboardData?.summary;

  // console.log("Selected Transformer:", summary);

  const forecastChartData = selectedTransformer?.forecast.points.map((point) => ({
    ...point,
    label: `+${point.offsetHours}h`,
  })) ?? [];

  // ✅ Merged alert logic (keeps the logging + renaming)
  console.log("🔍 Summary data:", summary);

  const allWarnings = useMemo(() => {
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


  return (
    <DashboardLayout 
  role="barangay"
  title="Barangay Dashboard"
  warnings={allWarnings}
>
      <div className="space-y-6 pt-6">
        <Card className="bg-gradient-to-br from-[#ff7a1a] to-orange-500 text-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">Barangay Grid Health Index</CardTitle>
                <CardDescription className="text-white">Barangay {BARANGAY}</CardDescription>
              </div>
              {dashboardData && (
                <Button
                  onClick={async () => {
                    try {
                      await generateBarangayReport(dashboardData, BARANGAY);
                    } catch (error) {
                      console.error('Failed to generate report:', error);
                    }
                  }}
                  variant="secondary"
                  size="sm"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export Report
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <div>
              <p className="text-4xl font-semibold">{summary ? summary.bghiScore.toFixed(1) : "--"}</p>
              <p className="text-xs uppercase tracking-wide mt-1">
                {summary ? summary.status : "Loading"}
              </p>
            </div>

            <div className="flex items-center space-x-6">
              <div className="text-center">
                <p className="text-xs text-white/80">Warnings</p>
                <p className="text-lg font-semibold text-yellow-100">{summary ? summary.warningTransformers : "--"}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-white/80">Critical</p>
                <p className="text-lg font-semibold text-red-100">{summary ? summary.criticalTransformers : "--"}</p>
              </div>
              <Activity className="h-10 w-10 text-white/80" />
            </div>
          </CardContent>
        </Card>

        {/* Historical BGHI Trends */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>BGHI Trends</CardTitle>
                <CardDescription>Grid health history for {BARANGAY}</CardDescription>
              </div>
              <Tabs value={historicalPeriod.toString()} onValueChange={(v) => setHistoricalPeriod(parseInt(v) as 7 | 30)}>
                <TabsList>
                  <TabsTrigger value="7">Last 7 Days</TabsTrigger>
                  <TabsTrigger value="30">Last 30 Days</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {historicalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => {
                      const d = new Date(date);
                      return historicalPeriod === 7 
                        ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fontSize: 11 }}
                    label={{ value: 'BGHI Score', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                  />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    formatter={(value: number, name: string) => {
                      if (name === 'bghiScore') return [value.toFixed(1), 'BGHI Score'];
                      return [value, name];
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend />
                  
                  {/* Reference lines for thresholds */}
                  <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Good', position: 'right', fontSize: 10, fill: '#22c55e' }} />
                  <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Warning', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                  
                  {/* Main BGHI line */}
                  <Line 
                    type="monotone" 
                    dataKey="bghiScore" 
                    stroke="#f97316" 
                    strokeWidth={3}
                    dot={{ fill: '#f97316', r: 3 }}
                    activeDot={{ r: 6 }}
                    name="BGHI Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center">
                <p className="text-gray-500">Loading historical data...</p>
              </div>
            )}
            
            {/* Summary stats */}
            {historicalData.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs border-t pt-4">
                <div>
                  <p className="text-gray-500">Average BGHI</p>
                  <p className="font-bold text-lg mt-1">
                    {(historicalData.reduce((sum, d) => sum + d.bghiScore, 0) / historicalData.length).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Best Day</p>
                  <p className="font-bold text-lg mt-1 text-green-600">
                    {Math.max(...historicalData.map(d => d.bghiScore)).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Worst Day</p>
                  <p className="font-bold text-lg mt-1 text-red-600">
                    {Math.min(...historicalData.map(d => d.bghiScore)).toFixed(1)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Barangay Grid Map</CardTitle>
            <CardDescription>Transformers and connected households within {BARANGAY}</CardDescription>
          </CardHeader>
          <CardContent className="relative z-0">
            {isLoading || !dashboardData ? (
              <div className="h-[600px] flex items-center justify-center">
                <p className="text-gray-500">Loading barangay data...</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Predictive Insights</CardTitle>
            <CardDescription>Realtime predictions and recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            {(!dashboardData || !selectedTransformer) ? (
              <p className="text-gray-500 text-center py-8">Select a transformer to see predictive insights</p>
            ) : (
              insights.length > 0 ? (
                <div className="space-y-3">
                  {insights.map((insight, idx) => (
                    <div key={idx} className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                      <p className="text-sm text-gray-700 dark:text-gray-300">{insight}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No predictive insights available for the selected transformer</p>
              )
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Transformer Details</CardTitle>
              <CardDescription>
                {selectedTransformer ? selectedTransformer.transformer.ID : "Select a transformer for details"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedTransformer ? (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Current Load</p>
                      <p className="text-xl font-semibold">
                        {selectedTransformer.currentLoadKw.toFixed(2)} kW ({selectedTransformer.loadPercentage.toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Status</p>
                      <p className={`text-xl font-semibold ${selectedTransformer.loadPercentage >= 95
                        ? "text-red-500"
                        : selectedTransformer.loadPercentage >= 80
                        ? "text-orange-500"
                        : selectedTransformer.loadPercentage >= 65
                        ? "text-amber-500"
                        : "text-green-600"}`}>
                        {selectedTransformer.loadPercentage >= 95
                          ? "Critical"
                          : selectedTransformer.loadPercentage >= 80
                          ? "High"
                          : selectedTransformer.loadPercentage >= 65
                          ? "Elevated"
                          : "Normal"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Outage (24h)</p>
                      <p className="text-xl font-semibold">{selectedTransformer.outageMinutes24h.toFixed(1)} min</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Spike Events</p>
                      <p className="text-xl font-semibold">{selectedTransformer.spikeEvents24h}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-2">Forecast (24h)</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={forecastChartData}>
                        <defs>
                          <linearGradient id="barangayRiskGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.6} />
                            <stop offset="70%" stopColor="#f97316" stopOpacity={0.6} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.7} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" hide />
                        <YAxis hide />
                        <Tooltip contentStyle={{ fontSize: "0.75rem" }} />
                        <Area type="monotone" dataKey="predictedLoadKw" stroke="#f97316" strokeWidth={2} fill="url(#barangayRiskGradient)" />
                      </AreaChart>
                    </ResponsiveContainer>
                    {selectedTransformer.forecast.overloadAlert ? (
                      <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                        <p className="font-semibold flex items-center space-x-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Predictive Overload Risk</span>
                        </p>
                        <p className="mt-1">{selectedTransformer.forecast.overloadAlert.recommendedAction}</p>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-2">Recent anomalies</p>
                    {selectedTransformer.recentAnomalies.length ? (
                      <ul className="space-y-2 text-xs text-gray-600">
                        {selectedTransformer.recentAnomalies.map((anomaly, index) => (
                          <li key={`${anomaly.anomalyType}-${anomaly.timestamp}-${index}`} className="rounded-md border border-gray-100 dark:border-gray-800 p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-gray-700 dark:text-gray-200">{anomaly.anomalyType}</span>
                              <span className="text-[10px] uppercase tracking-wide text-gray-400">{new Date(anomaly.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1">Severity: {anomaly.severity} · Confidence: {(anomaly.confidence * 100).toFixed(0)}%</p>
                            <p className="text-[11px] text-gray-500">{anomaly.recommendedAction}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-400">No anomalies in the last 24 hours.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">Select a transformer on the map to view metrics.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Barangay Summary</CardTitle>
              <CardDescription>Overall performance metrics</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Total Transformers</p>
                <p className="text-xl font-semibold">{summary?.totalTransformers ?? "--"}</p>
              </div>
              <div>
                <p className="text-gray-500">Critical</p>
                <p className="text-xl font-semibold text-red-500">{summary?.criticalTransformers ?? "--"}</p>
              </div>
              <div>
                <p className="text-gray-500">Warnings</p>
                <p className="text-xl font-semibold text-amber-500">{summary?.warningTransformers ?? "--"}</p>
              </div>
              <div>
                <p className="text-gray-500">Avg Load</p>
                <p className="text-xl font-semibold">{summary ? `${summary.averageLoadPct.toFixed(1)}%` : "--"}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Barangay Analytics</CardTitle>
            <CardDescription>Transformer load versus connected households</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="load" className="w-full">
              <TabsList>
                <TabsTrigger value="load">Transformer Load</TabsTrigger>
                <TabsTrigger value="households">Forecast</TabsTrigger>
              </TabsList>
              <TabsContent value="load" className="mt-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={loadData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="load" fill="#f97316" name="Current Load (kW)" />
                    <Bar dataKey="buildings" fill="#93c5fd" name="Downstream Buildings" />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>
              <TabsContent value="households" className="mt-4">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={forecastChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="predictedLoadKw" stroke="#f97316" fill="#f97316" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

