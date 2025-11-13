// Barangay Grid Health Index (BGHI) helpers

export interface BGHIWeights {
  loadStress: number;
  outageScore: number;
  powerQuality: number;
  anomalyFrequency: number;
  environmentalStress: number;
  mismatchScore: number;
}

export interface BGHIResult {
  bghiScore: number;
  deterioration: number;
  status: "Good" | "Warning" | "Critical";
  color: "green" | "amber" | "red";
  components: {
    loadStress: number;
    outageScore: number;
    powerQuality: number;
    anomalyFrequency: number;
    environmentalStress: number;
    mismatchScore: number;
  };
}

const DEFAULT_WEIGHTS: BGHIWeights = {
  loadStress: 0.35,
  outageScore: 0.25,
  powerQuality: 0.15,
  anomalyFrequency: 0.1,
  environmentalStress: 0.1,
  mismatchScore: 0.05,
};

function clamp(value: number, minVal = 0, maxVal = 100): number {
  return Math.max(minVal, Math.min(maxVal, value));
}

export function computeLoadStress(
  transformerLoadPct: number,
  safeThreshold = 70,
  criticalThreshold = 100
): number {
  if (transformerLoadPct <= safeThreshold) {
    return 0;
  }
  const stressRange = criticalThreshold - safeThreshold;
  const loadStress = ((transformerLoadPct - safeThreshold) / stressRange) * 100;
  return clamp(loadStress);
}

export function computeOutageScore(outageMinutes24h: number, maxOutageMinutes = 60): number {
  const score = (outageMinutes24h / maxOutageMinutes) * 100;
  return clamp(score);
}

export function computePowerQualityScore(options: { voltageDeviationPct?: number; spikeEventsLast24h?: number }): number {
  const { voltageDeviationPct, spikeEventsLast24h = 0 } = options;
  if (typeof voltageDeviationPct === "number") {
    return clamp(voltageDeviationPct * 100);
  }
  return clamp(Math.min(100, spikeEventsLast24h * 5));
}

export function computeAnomalyFrequencyScore(eventsLast24h: number, maxEvents = 10): number {
  const score = (eventsLast24h / maxEvents) * 100;
  return clamp(score);
}

export function computeEnvironmentalStressScore(
  ambientTempC: number,
  humidityPct?: number,
  tempSafeThreshold = 30,
  tempCriticalThreshold = 45
): number {
  let tempScore = 0;
  if (ambientTempC > tempSafeThreshold) {
    const tempRange = tempCriticalThreshold - tempSafeThreshold;
    tempScore = ((ambientTempC - tempSafeThreshold) / tempRange) * 100;
  }
  if (typeof humidityPct === "number" && humidityPct > 70) {
    const humidityFactor = 1 + (humidityPct - 70) / 100;
    tempScore *= humidityFactor;
  }
  return clamp(tempScore);
}

export function computeMismatchScore(mismatchRatio: number, maxMismatch = 0.3): number {
  const score = (Math.abs(mismatchRatio) / maxMismatch) * 100;
  return clamp(score);
}

export function calculateBGHI(
  components: {
    loadStress: number;
    outageScore: number;
    powerQuality: number;
    anomalyFrequency: number;
    environmentalStress: number;
    mismatchScore: number;
  },
  weights: BGHIWeights = DEFAULT_WEIGHTS
): BGHIResult {
  const deterioration =
    weights.loadStress * components.loadStress +
    weights.outageScore * components.outageScore +
    weights.powerQuality * components.powerQuality +
    weights.anomalyFrequency * components.anomalyFrequency +
    weights.environmentalStress * components.environmentalStress +
    weights.mismatchScore * components.mismatchScore;

  const bghiScore = clamp(100 - deterioration);

  let status: BGHIResult["status"] = "Good";
  let color: BGHIResult["color"] = "green";

  if (bghiScore < 60) {
    status = "Critical";
    color = "red";
  } else if (bghiScore < 80) {
    status = "Warning";
    color = "amber";
  }

  return {
    bghiScore: Number(bghiScore.toFixed(2)),
    deterioration: Number(deterioration.toFixed(2)),
    status,
    color,
    components,
  };
}
