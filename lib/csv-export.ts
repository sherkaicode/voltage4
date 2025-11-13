// CSV Export Utilities
import Papa from "papaparse";
import type { TransformerRealtimeMetrics } from "@/types/dashboard";
import type { Anomaly } from "@/lib/anomaly";
import type { ForecastPoint } from "@/lib/forecasting";

/**
 * Download data as CSV file
 */
function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Generate timestamp for filename
 */
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, -5);
}

/**
 * Export transformer summary data
 */
export function exportTransformerSummary(
  transformers: TransformerRealtimeMetrics[],
  city: string
) {
  const data = transformers.map((t) => ({
    "Transformer ID": t.transformer.ID,
    "Type": t.transformer.EntityType,
    "Latitude": t.transformer.Latitude,
    "Longitude": t.transformer.Longitude,
    "Current Load (kW)": t.currentLoadKw.toFixed(2),
    "Load Percentage": t.loadPercentage.toFixed(1),
    "BGHI Score": t.bghi.bghiScore.toFixed(1),
    "Status": t.bghi.status,
    "Households Served": t.transformer.NumDownstreamBuildings,
    "Outage Minutes (24h)": t.outageMinutes24h.toFixed(1),
    "Spike Events (24h)": t.spikeEvents24h,
    "Anomaly Count": t.anomalies.length,
    "Last Updated": new Date(t.lastUpdated).toLocaleString(),
  }));

  const csv = Papa.unparse(data);
  const filename = `transformers_${city.replace(/\s+/g, "_")}_${getTimestamp()}.csv`;
  
  downloadCSV(csv, filename);
}

/**
 * Export detailed transformer data with BGHI breakdown
 */
export function exportTransformerDetails(
  transformer: TransformerRealtimeMetrics
) {
  const data = [{
    "Transformer ID": transformer.transformer.ID,
    "Type": transformer.transformer.EntityType,
    "Location": `${transformer.transformer.Latitude}, ${transformer.transformer.Longitude}`,
    "Current Load (kW)": transformer.currentLoadKw.toFixed(2),
    "Load Percentage": transformer.loadPercentage.toFixed(1),
    "BGHI Score": transformer.bghi.bghiScore.toFixed(1),
    "Status": transformer.bghi.status,
    "Load Stress": transformer.bghi.components.loadStress.toFixed(1),
    "Outage Score": transformer.bghi.components.outageScore.toFixed(1),
    "Power Quality": transformer.bghi.components.powerQuality.toFixed(1),
    "Anomaly Frequency": transformer.bghi.components.anomalyFrequency.toFixed(1),
    "Environmental Stress": transformer.bghi.components.environmentalStress.toFixed(1),
    "Mismatch Score": transformer.bghi.components.mismatchScore.toFixed(1),
    "Rolling Mean (kW)": transformer.rollingStats.mean.toFixed(2),
    "Rolling Std Dev": transformer.rollingStats.std.toFixed(2),
    "Outage Minutes (24h)": transformer.outageMinutes24h.toFixed(1),
    "Spike Events (24h)": transformer.spikeEvents24h,
    "Mismatch Ratio": transformer.mismatchRatio.toFixed(3),
    "Households Served": transformer.transformer.NumDownstreamBuildings,
    "Last Updated": new Date(transformer.lastUpdated).toLocaleString(),
  }];

  const csv = Papa.unparse(data);
  const filename = `transformer_${transformer.transformer.ID}_details_${getTimestamp()}.csv`;
  
  downloadCSV(csv, filename);
}

/**
 * Export anomaly data
 */
export function exportAnomalies(
  anomalies: Anomaly[],
  city: string
) {
  if (anomalies.length === 0) {
    alert("No anomalies to export");
    return;
  }

  const data = anomalies.map((anomaly) => ({
    "Type": anomaly.anomalyType,
    "Zone/Transformer ID": anomaly.zoneId,
    "Timestamp": new Date(anomaly.timestamp).toLocaleString(),
    "Severity": anomaly.severity,
    "Confidence": (anomaly.confidence * 100).toFixed(0) + "%",
    "Mean Value": anomaly.evidence.mean.toFixed(2),
    "Std Dev": anomaly.evidence.std.toFixed(2),
    "Z-Score": anomaly.evidence.zScore.toFixed(2),
    "Duration (seconds)": anomaly.evidence.durationSeconds.toFixed(0),
    "Threshold": anomaly.evidence.threshold.toFixed(2),
    "Samples Analyzed": anomaly.evidence.samplesAnalyzed,
    "Recommended Action": anomaly.recommendedAction,
  }));

  const csv = Papa.unparse(data);
  const filename = `anomalies_${city.replace(/\s+/g, "_")}_${getTimestamp()}.csv`;
  
  downloadCSV(csv, filename);
}

/**
 * Export forecast data
 */
export function exportForecast(
  forecast: ForecastPoint[],
  transformerId: string
) {
  if (forecast.length === 0) {
    alert("No forecast data to export");
    return;
  }

  const data = forecast.map((point) => ({
    "Hour": point.hour,
    "Offset (hours)": point.offsetHours,
    "Timestamp": new Date(point.timestamp).toLocaleString(),
    "Predicted Load (kW)": point.predictedLoadKw.toFixed(2),
    "Confidence Lower (kW)": point.confidenceLower.toFixed(2),
    "Confidence Upper (kW)": point.confidenceUpper.toFixed(2),
    "Forecast Accuracy (%)": point.forecastAccuracy?.toFixed(1) || "N/A",
    "Baseline Load (kW)": point.baselineLoadKw.toFixed(2),
    "Adjustment (kW)": point.adjustmentKw.toFixed(2),
    "Risk Ratio": point.riskRatio.toFixed(3),
    "Risk Level": point.riskLevel,
  }));

  const csv = Papa.unparse(data);
  const filename = `forecast_${transformerId}_${getTimestamp()}.csv`;
  
  downloadCSV(csv, filename);
}

/**
 * Export household consumption data
 */
export function exportHouseholdData(
  householdId: string,
  currentLoad: number,
  daily: Array<{ hour: string; consumption: number }>,
  weekly: Array<{ day: string; consumption: number }>,
  monthly: Array<{ month: string; consumption: number }>
) {
  // Daily data
  const dailyData = daily.map((item) => ({
    "Period": item.hour,
    "Consumption (kWh)": item.consumption.toFixed(2),
  }));

  // Weekly data
  const weeklyData = weekly.map((item) => ({
    "Period": item.day,
    "Consumption (kWh)": item.consumption.toFixed(2),
  }));

  // Monthly data
  const monthlyData = monthly.map((item) => ({
    "Period": item.month,
    "Consumption (kWh)": item.consumption.toFixed(2),
  }));

  // Combine all data with separators
  const allData = [
    { "Period": "=== DAILY CONSUMPTION ===", "Consumption (kWh)": "" },
    ...dailyData,
    { "Period": "", "Consumption (kWh)": "" },
    { "Period": "=== WEEKLY CONSUMPTION ===", "Consumption (kWh)": "" },
    ...weeklyData,
    { "Period": "", "Consumption (kWh)": "" },
    { "Period": "=== MONTHLY CONSUMPTION ===", "Consumption (kWh)": "" },
    ...monthlyData,
    { "Period": "", "Consumption (kWh)": "" },
    { "Period": "=== SUMMARY ===", "Consumption (kWh)": "" },
    { "Period": "Current Load (kW)", "Consumption (kWh)": currentLoad.toFixed(2) },
  ];

  const csv = Papa.unparse(allData);
  const filename = `household_${householdId}_consumption_${getTimestamp()}.csv`;
  
  downloadCSV(csv, filename);
}

/**
 * Export complete dashboard snapshot
 */
export function exportDashboardSnapshot(
  city: string,
  transformers: TransformerRealtimeMetrics[],
  anomalies: Anomaly[],
  bghiScore: number,
  status: string
) {
  // Summary section
  const summary = [{
    "Metric": "City",
    "Value": city,
  }, {
    "Metric": "Export Date",
    "Value": new Date().toLocaleString(),
  }, {
    "Metric": "Barangay BGHI Score",
    "Value": bghiScore.toFixed(1),
  }, {
    "Metric": "Status",
    "Value": status,
  }, {
    "Metric": "Total Transformers",
    "Value": transformers.length.toString(),
  }, {
    "Metric": "Total Anomalies (24h)",
    "Value": anomalies.length.toString(),
  }];

  // Transformer summary
  const transformerData = transformers.map((t) => ({
    "ID": t.transformer.ID,
    "Load (kW)": t.currentLoadKw.toFixed(2),
    "Load %": t.loadPercentage.toFixed(1),
    "BGHI": t.bghi.bghiScore.toFixed(1),
    "Status": t.bghi.status,
    "Anomalies": t.anomalies.length,
  }));

  // Combine with separators
  const allData = [
    ...summary,
    { "Metric": "", "Value": "" },
    { "Metric": "=== TRANSFORMERS ===", "Value": "" },
    ...transformerData.map(t => ({ "Metric": t.ID, "Value": JSON.stringify(t) })),
  ];

  const csv = Papa.unparse(allData);
  const filename = `dashboard_${city.replace(/\s+/g, "_")}_${getTimestamp()}.csv`;
  
  downloadCSV(csv, filename);
}
