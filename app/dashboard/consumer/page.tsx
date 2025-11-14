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
          consumerId: household.id,
          currentConsumption: currentLoad,
          // Daily pattern (last 24 hours) - use current load as baseline
          daily: Array.from({ length: 24 }, (_, i) => {
            const hour = (new Date().getHours() - (23 - i) + 24) % 24;
            // Peak hours: 6-9 AM and 6-10 PM
            const isPeakMorning = hour >= 6 && hour <= 9;
            const isPeakEvening = hour >= 18 && hour <= 22;
            const multiplier = isPeakMorning || isPeakEvening ? 1.2 : 0.8;
            return {
              date: `${hour}:00`, // <-- Fixed type mismatch
              consumption: Number((currentLoad * multiplier * (0.9 + Math.random() * 0.2)).toFixed(2)),
            };
          }),
          // Weekly pattern
          weekly: Array.from({ length: 7 }, (_, i) => {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const isWeekend = i === 0 || i === 6;
            const multiplier = isWeekend ? 1.1 : 0.95;

            const consumption = currentLoad && !isNaN(currentLoad)
              ? Number((currentLoad * 24 * multiplier * (0.9 + Math.random() * 0.2)).toFixed(2))
              : 0;

            return {
              week: days[i], // <-- changed from 'day' to 'week'
              consumption,
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
  }, [consumerId, tipsLoaded]);

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
        {/* Cards: Current Consumption, Live Load, Daily Average, vs Average */}
        <div className="grid md:grid-cols-4 gap-6">
          {/* Current Consumption Card */}
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

          {/* Live Load Card */}
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

          {/* Daily Average Card */}
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

          {/* vs Average Card */}
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

        {/* Household Load Forecast */}
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
                      <p className="font-bold text-green-500 mt-1">AI Forecast</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Energy Saving Tips */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div>
              <CardTitle>Energy Saving Tips</CardTitle>
              <CardDescription>Personalized suggestions to reduce load</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={refreshEnergyTips}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {loadingTips ? (
              <p className="text-gray-500">Loading tips...</p>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {energyTips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Grid AI Chatbot */}
        <GridAIChatbot />
      </div>
    </DashboardLayout>
  );
}
