// Anomaly detection module (TypeScript adaptation)

export interface AnomalyEvidence {
  mean: number;
  std: number;
  zScore: number;
  durationSeconds: number;
  threshold: number;
  samplesAnalyzed: number;
}

export type AnomalySeverity = "HIGH" | "MEDIUM" | "LOW";

export interface Anomaly {
  anomalyType: string;
  zoneId: string;
  timestamp: string;
  severity: AnomalySeverity;
  confidence: number;
  evidence: AnomalyEvidence;
  recommendedAction: string;
}

function secondsBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 1000);
}

export class RollingWindowStats {
  private values: number[] = [];
  private timestamps: Date[] = [];

  constructor(private windowSize = 60) {}

  add(value: number, timestamp: Date) {
    this.values.push(value);
    this.timestamps.push(timestamp);

    if (this.values.length > this.windowSize) {
      this.values.shift();
      this.timestamps.shift();
    }
  }

  mean(): number {
    if (!this.values.length) return 0;
    const sum = this.values.reduce((acc, v) => acc + v, 0);
    return sum / this.values.length;
  }

  std(): number {
    if (this.values.length <= 1) return 0;
    const mean = this.mean();
    const variance =
      this.values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) /
      (this.values.length - 1);
    return Math.sqrt(variance);
  }

  min(): number {
    if (!this.values.length) return 0;
    return Math.min(...this.values);
  }

  max(): number {
    if (!this.values.length) return 0;
    return Math.max(...this.values);
  }

  latest(): number | undefined {
    return this.values[this.values.length - 1];
  }

  getValues(): number[] {
    return [...this.values];
  }

  getTimestamps(): Date[] {
    return [...this.timestamps];
  }
}

export class SpikeDetector {
  private spikeCounter = 0;

  constructor(
    private zThreshold = 3.0,
    private persistenceSamples = 2,
    private absoluteMinKw = 10.0
  ) {}

  detect(currentValue: number, rollingStats: RollingWindowStats, zoneId: string): Anomaly | null {
    const mean = rollingStats.mean();
    const std = rollingStats.std();

    const threshold = Math.max(this.absoluteMinKw, mean + this.zThreshold * std);

    if (currentValue > threshold) {
      this.spikeCounter += 1;
    } else {
      this.spikeCounter = 0;
    }

    if (this.spikeCounter >= this.persistenceSamples) {
      const zScore = std > 0 ? (currentValue - mean) / std : 0;

      const evidence: AnomalyEvidence = {
        mean,
        std,
        zScore,
        durationSeconds: this.spikeCounter * 30,
        threshold,
        samplesAnalyzed: rollingStats.getValues().length,
      };

      let severity: AnomalySeverity = "LOW";
      if (zScore >= 5.0) severity = "HIGH";
      else if (zScore >= 3.5) severity = "MEDIUM";

      const confidence = Math.min(0.95, 0.5 + zScore / 10);

      this.spikeCounter = 0;

      return {
        anomalyType: "SPIKE",
        zoneId,
        timestamp: new Date().toISOString(),
        severity,
        confidence,
        evidence,
        recommendedAction:
          "Investigate sudden load increase. Check for equipment malfunction or unauthorized connection.",
      };
    }

    return null;
  }
}

export class SustainedOverdrawDetector {
  private overdrawStart: Date | null = null;
  private baselineMean: number | null = null;

  constructor(private overdrawThreshold = 1.2, private minDurationSeconds = 600) {}

  detect(
    rollingMeanKw: number,
    baselineHourlyMean: number,
    zoneId: string
  ): Anomaly | null {
    const threshold = baselineHourlyMean * this.overdrawThreshold;

    if (rollingMeanKw > threshold) {
      if (!this.overdrawStart) {
        this.overdrawStart = new Date();
        this.baselineMean = baselineHourlyMean;
      }

      const duration = this.overdrawStart ? secondsBetween(this.overdrawStart, new Date()) : 0;

      if (duration >= this.minDurationSeconds) {
        const overdrawRatio = rollingMeanKw / baselineHourlyMean;
        const evidence: AnomalyEvidence = {
          mean: rollingMeanKw,
          std: 0,
          zScore: 0,
          durationSeconds: duration,
          threshold,
          samplesAnalyzed: 0,
        };

        let severity: AnomalySeverity = "LOW";
        if (overdrawRatio >= 1.5) severity = "HIGH";
        else if (overdrawRatio >= 1.3) severity = "MEDIUM";

        const confidence = Math.min(0.9, 0.6 + duration / 3600);

        return {
          anomalyType: "SUSTAINED_OVERDRAW",
          zoneId,
          timestamp: new Date().toISOString(),
          severity,
          confidence,
          evidence,
          recommendedAction:
            "Sustained high load detected. Consider load management or capacity upgrade.",
        };
      }
    } else {
      this.overdrawStart = null;
      this.baselineMean = null;
    }

    return null;
  }
}

export class OutageDetector {
  private outageStart: Date | null = null;

  constructor(private outageThresholdKw = 0.1, private minDurationSeconds = 60) {}

  detect(currentValue: number, zoneId: string): Anomaly | null {
    if (currentValue < this.outageThresholdKw) {
      if (!this.outageStart) {
        this.outageStart = new Date();
      }

      const duration = this.outageStart ? secondsBetween(this.outageStart, new Date()) : 0;

      if (duration >= this.minDurationSeconds) {
        const evidence: AnomalyEvidence = {
          mean: currentValue,
          std: 0,
          zScore: 0,
          durationSeconds: duration,
          threshold: this.outageThresholdKw,
          samplesAnalyzed: 0,
        };

        return {
          anomalyType: "OUTAGE",
          zoneId,
          timestamp: new Date().toISOString(),
          severity: "HIGH",
          confidence: 0.95,
          evidence,
          recommendedAction:
            "Power outage detected. Dispatch crew immediately. Notify affected residents.",
        };
      }
    } else {
      this.outageStart = null;
    }

    return null;
  }
}

export class MismatchDetector {
  private mismatchStart: Date | null = null;

  constructor(private mismatchThreshold = 0.12, private minDurationSeconds = 1800) {}

  detect(feederPower: number, sumNodePower: number, zoneId: string): Anomaly | null {
    if (feederPower < 0.5) {
      return null;
    }

    const mismatchRatio = Math.abs(feederPower - sumNodePower) / feederPower;

    if (mismatchRatio >= this.mismatchThreshold) {
      if (!this.mismatchStart) {
        this.mismatchStart = new Date();
      }

      const duration = this.mismatchStart ? secondsBetween(this.mismatchStart, new Date()) : 0;

      if (duration >= this.minDurationSeconds) {
        const evidence: AnomalyEvidence = {
          mean: mismatchRatio,
          std: 0,
          zScore: 0,
          durationSeconds: duration,
          threshold: this.mismatchThreshold,
          samplesAnalyzed: 0,
        };

        let severity: AnomalySeverity = "LOW";
        if (mismatchRatio >= 0.25) severity = "HIGH";
        else if (mismatchRatio >= 0.18) severity = "MEDIUM";

        const confidence = Math.min(0.85, 0.5 + duration / 7200);

        return {
          anomalyType: "METER_MISMATCH",
          zoneId,
          timestamp: new Date().toISOString(),
          severity,
          confidence,
          evidence,
          recommendedAction:
            "Significant mismatch detected. Possible NTL or meter calibration issue. Schedule investigation.",
        };
      }
    } else {
      this.mismatchStart = null;
    }

    return null;
  }
}

export function pruneOldAnomalies(anomalies: Anomaly[], maxAgeHours = 24): Anomaly[] {
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  return anomalies.filter((anomaly) => new Date(anomaly.timestamp).getTime() >= cutoff);
}
