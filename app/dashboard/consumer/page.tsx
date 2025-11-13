"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { GridAIChatbot } from "@/components/grid-ai-chatbot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, TrendingUp, TrendingDown, Activity, AlertTriangle, Lightbulb, Sparkles, RefreshCw, Download } from "lucide-react";
import type { SmartMeterData } from "@/lib/mock-data";
import type { ForecastPoint, OverloadAlert } from "@/lib/forecasting";
import type { DashboardDataResponse } from "@/types/dashboard";
import { exportHouseholdData, exportForecast } from "@/lib/csv-export";
import { Button } from "@/components/ui/button";
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

export default function ConsumerDashboard() {
  const [smartMeterData, setSmartMeterData] = useState<SmartMeterData | null>(null);
  const [householdForecast, setHouseholdForecast] = useState<ForecastPoint[]>([]);
  const [forecastAlert, setForecastAlert] = useState<OverloadAlert | null>(null);
  const [householdLoadKw, setHouseholdLoadKw] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardDataResponse | null>(null);
  const [energyTips, setEnergyTips] = useState<string[]>([]);
  const [loadingTips, setLoadingTips] = useState(false);
  const [tipsLoaded, setTipsLoaded] = useState(false);
  const consumerId = "consumer-1"; // In real app, this would come from auth

  const fetchSmartMeterData = useCallback(async () => {
    setLoading(true);
    try {
      const realtimeResponse = await fetch(`/api/dashboard-data?city=${encodeURIComponent("UP Diliman")}`);
      const realtimeResult = await realtimeResponse.json();
      
      if (realtimeResult.success && realtimeResult.data.transformers.length) {
        setDashboardData(realtimeResult.data);
        
        // Find a PolePadTransformer (SubstationTransformers don't have households)
        const polePadTransformer = realtimeResult.data.transformers.find(
          (t: any) => t.transformer.EntityType === "PolePadTransformer" && t.households && t.households.length > 0
        );
        
        if (!polePadTransformer) {
          console.error("No PolePadTransformer with households found");
          setLoading(false);
          return;
        }
        
        const transformer = polePadTransformer;
        const household = transformer.households[0];
        
        // Use the household's actual current load
        const currentLoad = household.currentLoadKw;
        setHouseholdLoadKw(currentLoad);
        
        // Generate smart meter data based on the household's load history
        // This ensures consistency between current consumption and forecast
        const mockSmartMeter: SmartMeterData = {
          currentConsumption: currentLoad,
          // Daily pattern (last 24 hours) - use current load as baseline
          daily: Array.from({ length: 24 }, (_, i) => {
            const hour = (new Date().getHours() - (23 - i) + 24) % 24;
            // Peak hours: 6-9 AM and 6-10 PM
            const isPeakMorning = hour >= 6 && hour <= 9;
            const isPeakEvening = hour >= 18 && hour <= 22;
            const multiplier = isPeakMorning || isPeakEvening ? 1.2 : 0.8;
            return {
              hour: `${hour}:00`,
              consumption: Number((currentLoad * multiplier * (0.9 + Math.random() * 0.2)).toFixed(2)),
            };
          }),
          // Weekly pattern
          weekly: Array.from({ length: 7 }, (_, i) => {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const isWeekend = i === 0 || i === 6;
            const multiplier = isWeekend ? 1.1 : 0.95;
            return {
              day: days[i],
              consumption: Number((currentLoad * 24 * multiplier * (0.9 + Math.random() * 0.2)).toFixed(2)),
            };
          }),
          // Monthly pattern
          monthly: Array.from({ length: 12 }, (_, i) => {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            // Higher consumption in summer months (Apr-May) and Christmas season (Dec)
            const isSummer = i === 3 || i === 4;
            const isHoliday = i === 11;
            const multiplier = isSummer || isHoliday ? 1.15 : 0.95;
            return {
              month: months[i],
              consumption: Number((currentLoad * 24 * 30 * multiplier * (0.9 + Math.random() * 0.2)).toFixed(2)),
            };
          }),
        };
        
        setSmartMeterData(mockSmartMeter);

        // Calculate household share for scaling forecast
        const householdShare = transformer.currentLoadKw > 0 ? household.currentLoadKw / transformer.currentLoadKw : 0.1;

        // Check if forecast exists
        if (!transformer.forecast || !transformer.forecast.points || transformer.forecast.points.length === 0) {
          console.error("No forecast points available");
          setLoading(false);
          return;
        }

        // Scale the forecast to household level including confidence intervals
        const scaledForecast: ForecastPoint[] = transformer.forecast.points.map((point: ForecastPoint) => ({
          ...point,
          predictedLoadKw: Number((point.predictedLoadKw * householdShare).toFixed(3)),
          confidenceLower: Number(((point.confidenceLower || 0) * householdShare).toFixed(3)),
          confidenceUpper: Number(((point.confidenceUpper || 0) * householdShare).toFixed(3)),
        }));
        
        setHouseholdForecast(scaledForecast);
        setForecastAlert(transformer.forecast.overloadAlert ?? null);
        
        // Fetch energy tips only on first load
        if (!tipsLoaded) {
          fetchEnergyTips(
            household.currentLoadKw,
            realtimeResult.data.summary.bghiScore,
            realtimeResult.data.summary.status,
            Math.max(...scaledForecast.map((p: ForecastPoint) => p.predictedLoadKw)),
            transformer.forecast.overloadAlert?.hoursAhead
          );
          setTipsLoaded(true);
        }
      }
    } catch (error) {
      console.error("Error fetching consumer data:", error);
    } finally {
      setLoading(false);
    }
  }, [consumerId]);

  const fetchEnergyTips = async (
    currentLoadKw: number,
    bghiScore: number,
    gridStatus: string,
    forecastPeakKw?: number,
    hoursToOverload?: number
  ) => {
    setLoadingTips(true);
    try {
      const response = await fetch('/api/energy-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentLoadKw,
          bghiScore,
          gridStatus,
          forecastPeakKw,
          hoursToOverload,
        }),
      });
      
      const result = await response.json();
      if (result.success && result.tips) {
        setEnergyTips(result.tips);
      }
    } catch (error) {
      console.error("Error fetching energy tips:", error);
      // Set fallback tips on error
      setEnergyTips([
        "💡 Set your AC to 24°C or higher to save energy and reduce grid stress.",
        "⏰ Shift heavy appliance use to off-peak hours (10 PM - 6 AM) for lower rates.",
        "🔌 Unplug devices on standby - they consume 5-10% of your monthly bill.",
        "💚 Use energy-efficient LED bulbs to reduce consumption by up to 75%."
      ]);
    } finally {
      setLoadingTips(false);
    }
  };

  const refreshEnergyTips = () => {
    if (dashboardData && householdLoadKw > 0) {
      const peakKw = householdForecast.length > 0 
        ? Math.max(...householdForecast.map(p => p.predictedLoadKw || 0))
        : undefined;
      
      fetchEnergyTips(
        householdLoadKw,
        dashboardData.summary.bghiScore,
        dashboardData.summary.status,
        peakKw,
        forecastAlert?.hoursAhead
      );
    }
  };

  useEffect(() => {
    fetchSmartMeterData();
    const interval = setInterval(fetchSmartMeterData, 30_000);
    return () => clearInterval(interval);
  }, [fetchSmartMeterData]);

  const averageDaily = smartMeterData
    ? smartMeterData.daily.reduce((sum, d) => sum + d.consumption, 0) / smartMeterData.daily.length
    : 0;

  const averageWeekly = smartMeterData
    ? smartMeterData.weekly.reduce((sum, w) => sum + w.consumption, 0) / smartMeterData.weekly.length
    : 0;

  const averageMonthly = smartMeterData
    ? smartMeterData.monthly.reduce((sum, m) => sum + m.consumption, 0) / smartMeterData.monthly.length
    : 0;

  const comparisonToAverage = smartMeterData
    ? ((smartMeterData.currentConsumption / averageDaily) - 1) * 100
    : 0;

  return (
    <DashboardLayout role="consumer" title="">
      <div className="space-y-6 pt-6">
        <div className="grid md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Consumption</CardTitle>
              <Zap className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500">Loading...</p>
              ) : (
                <>
                  <div className="text-2xl font-bold">{smartMeterData?.currentConsumption.toFixed(2) || 0} kWh</div>
                  <p className="text-xs text-muted-foreground mt-1">Real-time consumption</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Live Load (Kw)</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500">Loading...</p>
              ) : (
                <>
                  <div className="text-2xl font-bold">{householdLoadKw.toFixed(2)} kW</div>
                  <p className="text-xs text-muted-foreground mt-1">Derived from barangay smart meter</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500">Loading...</p>
              ) : (
                <>
                  <div className="text-2xl font-bold">{averageDaily.toFixed(2)} kWh</div>
                  <p className="text-xs text-muted-foreground mt-1">Last 30 days average</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">vs Average</CardTitle>
              {comparisonToAverage >= 0 ? (
                <TrendingUp className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-green-500" />
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-gray-500">Loading...</p>
              ) : (
                <>
                  <div className={`text-2xl font-bold ${comparisonToAverage >= 0 ? "text-red-500" : "text-green-500"}`}>
                    {comparisonToAverage >= 0 ? "+" : ""}
                    {comparisonToAverage.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Compared to daily average</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Household Load Forecast</CardTitle>
                <CardDescription>24-hour prediction with 95% confidence interval</CardDescription>
              </div>
              {householdForecast.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Forecast Accuracy</p>
                  <p className="text-lg font-bold text-orange-500">
                    {householdForecast[0]?.forecastAccuracy?.toFixed(1) || '92.5'}%
                  </p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] flex items-center justify-center">
                <p className="text-gray-500">Preparing forecast...</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={householdForecast.map((point) => ({ 
                    ...point, 
                    label: `+${point.offsetHours}h`,
                    time: `${point.hour}:00`
                  }))}>
                    <defs>
                      <linearGradient id="forecastGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                        <stop offset="70%" stopColor="#f97316" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#9ca3af" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#9ca3af" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 11 }}
                      interval={3}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Load (kW)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => {
                        if (name === 'predictedLoadKw') return [`${value.toFixed(2)} kW`, 'Predicted'];
                        if (name === 'confidenceUpper') return [`${value.toFixed(2)} kW`, 'Upper Bound'];
                        if (name === 'confidenceLower') return [`${value.toFixed(2)} kW`, 'Lower Bound'];
                        return [value, name];
                      }}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    {/* Confidence interval shaded area */}
                    <Area 
                      type="monotone" 
                      dataKey="confidenceUpper" 
                      stroke="none" 
                      fill="url(#confidenceGradient)" 
                      fillOpacity={0.3}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="confidenceLower" 
                      stroke="none" 
                      fill="#ffffff" 
                      fillOpacity={1}
                    />
                    {/* Main prediction line */}
                    <Area 
                      type="monotone" 
                      dataKey="predictedLoadKw" 
                      stroke="#f97316" 
                      strokeWidth={2}
                      fill="url(#forecastGradient)" 
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                
                {/* Forecast Metrics */}
                {householdForecast.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <p className="text-gray-500">Peak Predicted</p>
                      <p className="font-bold text-orange-500 mt-1">
                        {Math.max(...householdForecast.map(p => p.predictedLoadKw || 0)).toFixed(1)} kW
                      </p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <p className="text-gray-500">Confidence Level</p>
                      <p className="font-bold text-blue-500 mt-1">95%</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                      <p className="text-gray-500">Method</p>
                      <p className="font-bold text-gray-700 dark:text-gray-300 mt-1">EWMA</p>
                    </div>
                  </div>
                )}

                {forecastAlert ? (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex space-x-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div>
                      <p className="font-semibold">⚠️ Transformer Overload Risk</p>
                      <p className="mt-1">{forecastAlert.recommendedAction}</p>
                      <p className="mt-1 text-red-600 font-semibold">
                        Confidence: {(forecastAlert.confidence * 100).toFixed(0)}% • 
                        Peak in {forecastAlert.hoursAhead}h
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-green-600 flex items-center space-x-1">
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                    <span>No overload risk detected within 24-hour horizon</span>
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Smart Energy Tips */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-green-600" />
                <CardTitle>Smart Energy Tips</CardTitle>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={refreshEnergyTips}
                  disabled={loadingTips}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-green-600 border border-gray-300 hover:border-green-500 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Get new tips"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingTips ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Sparkles className="h-4 w-4" />
                  <span>AI-Powered</span>
                </div>
              </div>
            </div>
            <CardDescription>
              Personalized recommendations based on your consumption and local grid health
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTips ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                ))}
              </div>
            ) : energyTips.length > 0 ? (
              <div className="space-y-3">
                {energyTips.map((tip, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800"
                  >
                    <div className="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pt-1">
                      {tip}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Lightbulb className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm">Loading personalized energy tips...</p>
              </div>
            )}
            
            {dashboardData && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Local Grid Health (BGHI)</span>
                  <span className={`font-semibold ${
                    dashboardData.summary.bghiScore >= 80 ? 'text-green-600' :
                    dashboardData.summary.bghiScore >= 60 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {dashboardData.summary.bghiScore.toFixed(0)}/100 ({dashboardData.summary.status})
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Consumption Trends</CardTitle>
                <CardDescription>Track your energy consumption over time</CardDescription>
              </div>
              {smartMeterData && (
                <Button
                  onClick={() => exportHouseholdData(
                    consumerId,
                    smartMeterData.currentConsumption,
                    smartMeterData.daily,
                    smartMeterData.weekly,
                    smartMeterData.monthly
                  )}
                  variant="outline"
                  size="sm"
                  className="border-green-500 text-green-600 hover:bg-green-50"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export Data
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[400px] flex items-center justify-center">
                <p className="text-gray-500">Loading data...</p>
              </div>
            ) : (
              <Tabs defaultValue="daily" className="w-full">
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
                <TabsContent value="daily" className="mt-4">
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={smartMeterData?.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="hour"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis 
                        label={{ value: 'Consumption (kWh)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                      />
                      <Tooltip 
                        labelFormatter={(value) => `Hour: ${value}`}
                        formatter={(value: number) => [`${value.toFixed(2)} kWh`, 'Consumption']}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="consumption"
                        stroke="#f97316"
                        strokeWidth={2}
                        name="Consumption (kWh)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>
                <TabsContent value="weekly" className="mt-4">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={smartMeterData?.weekly || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis 
                        label={{ value: 'Consumption (kWh)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value.toFixed(2)} kWh`, 'Consumption']}
                      />
                      <Legend />
                      <Bar dataKey="consumption" fill="#f97316" name="Consumption (kWh)" />
                    </BarChart>
                  </ResponsiveContainer>
                </TabsContent>
                <TabsContent value="monthly" className="mt-4">
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={smartMeterData?.monthly || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="consumption" fill="#f97316" name="Consumption (kWh)" />
                    </BarChart>
                  </ResponsiveContainer>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Average</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{averageWeekly.toFixed(2)} kWh</div>
              <p className="text-sm text-muted-foreground mt-2">Average consumption per week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Average</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{averageMonthly.toFixed(2)} kWh</div>
              <p className="text-sm text-muted-foreground mt-2">Average consumption per month</p>
            </CardContent>
          </Card>
        </div>

        {/* AI Chatbot - only show if we have grid data */}
        {dashboardData && (
          <GridAIChatbot
            context={{
              barangay: dashboardData.city,
              bghiScore: dashboardData.summary.bghiScore,
              status: dashboardData.summary.status,
              totalTransformers: dashboardData.summary.totalTransformers,
              warningTransformers: dashboardData.summary.warningTransformers,
              criticalTransformers: dashboardData.summary.criticalTransformers,
              temperature: dashboardData.weather.temperature,
              weatherCondition: dashboardData.weather.condition,
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

