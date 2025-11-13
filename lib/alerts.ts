import type { Anomaly, AnomalySeverity } from "@/lib/anomaly";
import type { TransformerRealtimeMetrics } from "@/types/dashboard";

export type TransformerOperationalStatus = "Critical" | "High" | "Elevated" | "Normal";

function createEvidence(metric: TransformerRealtimeMetrics, threshold: number) {
  return {
    mean: metric.rollingStats.mean,
    std: metric.rollingStats.std,
    zScore: 0,
    durationSeconds: 0,
    threshold,
    samplesAnalyzed: metric.households.length,
  };
}

export function getTransformerStatus(
  loadPercentage: number,
  isOutage = false
): TransformerOperationalStatus {
  if (isOutage || loadPercentage >= 95) return "Critical";
  if (loadPercentage >= 80) return "High";
  if (loadPercentage >= 65) return "Elevated";
  return "Normal";
}

function createSyntheticAlert(
  metric: TransformerRealtimeMetrics,
  anomalyType: string,
  severity: AnomalySeverity,
  recommendedAction: string,
  threshold: number
): Anomaly {
  return {
    anomalyType,
    zoneId: metric.transformer.ID,
    timestamp: new Date(metric.lastUpdated).toISOString(),
    severity,
    confidence: severity === "HIGH" ? 0.9 : severity === "MEDIUM" ? 0.75 : 0.6,
    evidence: createEvidence(metric, threshold),
    recommendedAction,
  };
}

export function generateTransformerAlerts(metric: TransformerRealtimeMetrics): Anomaly[] {
  // Exclude SubstationTransformer from alerts
  if (metric.transformer.EntityType === "SubstationTransformer") {
    return [];
  }

  const alerts: Anomaly[] = [...metric.recentAnomalies];
  const hasType = (type: string) => alerts.some((alert) => alert.anomalyType === type);

  const status = getTransformerStatus(metric.loadPercentage, metric.artificialOutageActive);

  if (metric.spikeEvents24h > 0 && !hasType("SPIKE")) {
    alerts.push(
      createSyntheticAlert(
        metric,
        "SPIKE",
        metric.spikeEvents24h >= 3 ? "HIGH" : "MEDIUM",
        "Multiple load spikes detected in the last 24h. Inspect transformer connections for sudden demand fluctuations.",
        metric.rollingStats.mean + metric.rollingStats.std * 3
      )
    );
  }

  if (status === "Critical" && !hasType("CRITICAL_STATUS")) {
    alerts.push(
      createSyntheticAlert(
        metric,
        "CRITICAL_STATUS",
        "HIGH",
        metric.artificialOutageActive
          ? "Transformer is offline due to an outage. Dispatch maintenance crew immediately."
          : "Transformer load is critically high. Redistribute load or provision backup capacity.",
        95
      )
    );
  } else if (status === "High" && !hasType("OVERLOAD_WARNING")) {
    alerts.push(
      createSyntheticAlert(
        metric,
        "OVERLOAD_WARNING",
        "MEDIUM",
        "Transformer is operating near capacity. Consider load balancing or scheduling maintenance.",
        80
      )
    );
  }

  return alerts;
}

