import { readFileSync } from "fs";
import { join } from "path";
import Papa from "papaparse";

import {
  type CSVTransformer,
  type TransformerWithLoad,
  processCSVData,
} from "@/lib/csv-data";
import {
  RollingWindowStats,
  SpikeDetector,
  SustainedOverdrawDetector,
  OutageDetector,
  MismatchDetector,
  pruneOldAnomalies,
  type Anomaly,
} from "@/lib/anomaly";
import {
  computeLoadStress,
  computeOutageScore,
  computePowerQualityScore,
  computeAnomalyFrequencyScore,
  computeEnvironmentalStressScore,
  computeMismatchScore,
  calculateBGHI,
} from "@/lib/bghi";
import { EWMAForecaster } from "@/lib/forecasting";
import { generateMockWeather, type WeatherData } from "@/lib/mock-data";
import { fetchRealWeather } from "@/lib/weather-api";
import { getSmartMeterReading } from "@/lib/smart-meter";
import type {
  ArtificialDisasterInfo,
  ArtificialDisasterKind,
  DashboardDataResponse,
  DashboardSummary,
  HouseholdRealtime,
  TransformerRealtimeMetrics,
} from "@/types/dashboard";
import type { OverloadAlert } from "@/lib/forecasting";

interface HouseholdState {
  id: string;
  transformerId: string;
  latitude: number;
  longitude: number;
  loadHistory: Array<{ timestamp: number; loadKw: number }>;
  latestLoadKw: number;
}

interface TransformerDetectors {
  spike: SpikeDetector;
  overdraw: SustainedOverdrawDetector;
  outage: OutageDetector;
  mismatch: MismatchDetector;
}

interface TransformerState {
  transformer: TransformerWithLoad;
  householdIds: string[];
  rollingStats: RollingWindowStats;
  detectors: TransformerDetectors;
  history: Array<{ timestamp: number; loadKw: number }>;
  anomalies: Anomaly[];
  spikeEvents: number[];
  outageFlags: Array<{ timestamp: number; isOutage: boolean }>;
  mismatchRatios: Array<{ timestamp: number; ratio: number }>;
  forecaster: EWMAForecaster;
  capacityKw: number;
  lastUpdated: number;
  artificialOutage?: { startTime: number; duration?: number };
  artificialDisaster?: ArtificialDisasterState;
}

interface CityState {
  transformers: Map<string, TransformerState>;
  households: Map<string, HouseholdState>;
  lastUpdated: number;
}

interface RealtimeStore {
  cities: Map<string, CityState>;
}

interface ArtificialDisasterState {
  kind: ArtificialDisasterKind;
  startTime: number;
  duration?: number;
  parameters?: Record<string, number>;
  notes?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __REALTIME_STORE__: RealtimeStore | undefined;
  // eslint-disable-next-line no-var
  var __CITY_CSV_CACHE__: Map<string, CSVTransformer[]> | undefined;
}

const REFRESH_INTERVAL_SECONDS = 15;
const MAX_HISTORY_MS = 24 * 60 * 60 * 1000; // 24h
const CITY_FILE_MAP: Record<string, string> = {
  "Quezon City": "mock_meralco_transformers_QC.csv",
  QC: "mock_meralco_transformers_QC.csv",
  "UP Diliman": "mock_meralco_transformers_UPDiliman.csv",
  UPD: "mock_meralco_transformers_UPDiliman.csv",
};

function getRealtimeStore(): RealtimeStore {
  if (!globalThis.__REALTIME_STORE__) {
    globalThis.__REALTIME_STORE__ = {
      cities: new Map(),
    };
  }
  return globalThis.__REALTIME_STORE__;
}

function getCsvCache(): Map<string, CSVTransformer[]> {
  if (!globalThis.__CITY_CSV_CACHE__) {
    globalThis.__CITY_CSV_CACHE__ = new Map();
  }
  return globalThis.__CITY_CSV_CACHE__;
}

function loadCsvTransformers(city: string): CSVTransformer[] {
  const cache = getCsvCache();
  if (cache.has(city)) {
    return cache.get(city)!;
  }

  const fileName = CITY_FILE_MAP[city];
  if (!fileName) {
    throw new Error(`Unsupported city: ${city}`);
  }

  const csvPath = join(process.cwd(), "public", fileName);
  const csvText = readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse<CSVTransformer>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => {
      const headerMap: Record<string, string> = {
        entitytype: "EntityType",
        id: "ID",
        parentid: "ParentID",
        latitude: "Latitude",
        longitude: "Longitude",
        numdownstreambuildings: "NumDownstreamBuildings",
      };
      return headerMap[header.toLowerCase()] || header;
    },
    transform: (value, field) => {
      if (field === "Latitude" || field === "Longitude") {
        return parseFloat(value) || 0;
      }
      if (field === "NumDownstreamBuildings") {
        return parseInt(value, 10) || 0;
      }
      return value;
    },
  });

  if (parsed.errors.length) {
    throw new Error(`Failed to parse CSV for ${city}: ${parsed.errors[0].message}`);
  }

  cache.set(city, parsed.data);
  return parsed.data;
}

function initializeCityState(city: string): CityState {
  const store = getRealtimeStore();
  if (store.cities.has(city)) {
    return store.cities.get(city)!;
  }

  const csvTransformers = loadCsvTransformers(city);
  const { transformers, households } = processCSVData(csvTransformers);

  const householdMap = new Map<string, HouseholdState>();
  const transformerMap = new Map<string, TransformerState>();

  const timestamp = Date.now();

  transformers.forEach((transformer) => {
    const householdStates = transformer.households.map((household) => {
      const state: HouseholdState = {
        id: household.id,
        transformerId: household.transformerId,
        latitude: household.latitude,
        longitude: household.longitude,
        latestLoadKw: household.load,
        loadHistory: [{ timestamp, loadKw: household.load }],
      };
      householdMap.set(household.id, state);
      return state.id;
    });

    const capacityKw = Math.max(100, transformer.NumDownstreamBuildings * 5);

    const transformerState: TransformerState = {
      transformer,
      householdIds: householdStates,
      rollingStats: new RollingWindowStats(120),
      detectors: {
        spike: new SpikeDetector(),
        overdraw: new SustainedOverdrawDetector(),
        outage: new OutageDetector(),
        mismatch: new MismatchDetector(),
      },
      history: [{ timestamp, loadKw: transformer.totalLoad }],
      anomalies: [],
      spikeEvents: [],
      outageFlags: [{ timestamp, isOutage: transformer.totalLoad < 0.1 }],
      mismatchRatios: [],
      forecaster: (() => {
        const forecaster = new EWMAForecaster(0.5);
        const baseLoad = capacityKw * 0.4;
        const peakLoad = capacityKw * 0.85;
        forecaster.generateBaselineFromPattern({ baseLoad, peakLoad });
        return forecaster;
      })(),
      capacityKw,
      lastUpdated: timestamp,
    };

    transformerState.rollingStats.add(transformer.totalLoad, new Date(timestamp));
    transformerMap.set(transformer.ID, transformerState);
  });

  const cityState: CityState = {
    transformers: transformerMap,
    households: householdMap,
    lastUpdated: timestamp,
  };

  store.cities.set(city, cityState);
  return cityState;
}

function pruneHistory<T extends { timestamp: number }>(items: T[]): T[] {
  const cutoff = Date.now() - MAX_HISTORY_MS;
  return items.filter((item) => item.timestamp >= cutoff);
}

function computeRollingMean(history: Array<{ timestamp: number; loadKw: number }>, durationMinutes: number): number {
  if (!history.length) return 0;
  const cutoff = Date.now() - durationMinutes * 60 * 1000;
  const samples = history.filter((item) => item.timestamp >= cutoff);
  if (!samples.length) return history[history.length - 1].loadKw;
  const sum = samples.reduce((acc, item) => acc + item.loadKw, 0);
  return sum / samples.length;
}

function computeHourlyBaseline(history: Array<{ timestamp: number; loadKw: number }>): number {
  if (!history.length) return 0;
  const currentHour = new Date().getHours();
  const sameHourSamples = history.filter((item) => new Date(item.timestamp).getHours() === currentHour);
  if (!sameHourSamples.length) {
    return history[history.length - 1].loadKw;
  }
  const sum = sameHourSamples.reduce((acc, item) => acc + item.loadKw, 0);
  return sum / sameHourSamples.length;
}

function computeOutageMinutes(outageFlags: Array<{ timestamp: number; isOutage: boolean }>): number {
  const cutoff = Date.now() - MAX_HISTORY_MS;
  return outageFlags
    .filter((flag) => flag.timestamp >= cutoff && flag.isOutage)
    .length * (REFRESH_INTERVAL_SECONDS / 60);
}

function computeSpikeEvents(spikeEvents: number[]): number {
  const cutoff = Date.now() - MAX_HISTORY_MS;
  return spikeEvents.filter((timestamp) => timestamp >= cutoff).length;
}

function computeMismatch(mismatchRatios: Array<{ timestamp: number; ratio: number }>): number {
  if (!mismatchRatios.length) return 0;
  return mismatchRatios[mismatchRatios.length - 1].ratio;
}

function convertHouseholdStateToRealtime(state: HouseholdState): HouseholdRealtime {
  return {
    id: state.id,
    transformerId: state.transformerId,
    latitude: state.latitude,
    longitude: state.longitude,
    currentLoadKw: Number(state.latestLoadKw.toFixed(3)),
    loadHistory: state.loadHistory
      .slice(-96) // last 48 minutes (96 samples)
      .map((entry) => ({ timestamp: new Date(entry.timestamp).toISOString(), loadKw: Number(entry.loadKw.toFixed(3)) })),
  };
}

function aggregateSummary(
  city: string,
  metrics: TransformerRealtimeMetrics[],
  alerts: Array<{ transformerId: string; transformerName: string; alert: OverloadAlert }>,
  anomalies: Anomaly[]
): DashboardSummary {
  if (!metrics.length) {
    return {
      bghiScore: 100,
      status: "Good",
      color: "green",
      totalTransformers: 0,
      warningTransformers: 0,
      criticalTransformers: 0,
      anomalyCount24h: 0,
      alertsCount: 0,
      averageLoadPct: 0,
    };
  }

  // Calculate weighted BGHI based on transformer importance and urgency
  let weightedSum = 0;
  let totalWeight = 0;

  for (const metric of metrics) {
    // Weight by number of households served (more households = higher impact)
    const householdWeight = metric.transformer.NumDownstreamBuildings || 1;
    
    // Apply urgency multiplier based on transformer health status
    // Critical transformers get 3x weight, Warning get 1.5x, Good get 1x
    const urgencyMultiplier = 
      metric.bghi.status === "Critical" ? 3.0 : 
      metric.bghi.status === "Warning" ? 1.5 : 
      1.0;
    
    const effectiveWeight = householdWeight * urgencyMultiplier;
    
    weightedSum += metric.bghi.bghiScore * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  const weightedBGHI = totalWeight > 0 ? weightedSum / totalWeight : 100;
  const avgLoadPct = metrics.reduce((acc, metric) => acc + metric.loadPercentage, 0) / metrics.length;

  const criticalTransformers = metrics.filter(
    (metric) => metric.loadPercentage >= 95
  ).length;
  const warningTransformers = metrics.filter(
    (metric) =>
      metric.loadPercentage >= 65 &&
      metric.loadPercentage < 95
  ).length;

  // Determine barangay-level status based on weighted BGHI and transformer distribution
  let barangayStatus: "Good" | "Warning" | "Critical";
  let barangayColor: "green" | "amber" | "red";

  // Escalate to warning if 30%+ of transformers are in warning state
  if (warningTransformers >= metrics.length * 0.3) {
    barangayStatus = "Warning";
    barangayColor = "amber";
  } else if (weightedBGHI >= 80) {
    barangayStatus = "Good";
    barangayColor = "green";
  } else if (weightedBGHI >= 60) {
    barangayStatus = "Warning";
    barangayColor = "amber";
  } else {
    barangayStatus = "Critical";
    barangayColor = "red";
  }

  return {
    bghiScore: Number(Math.max(0, weightedBGHI).toFixed(2)),
    status: barangayStatus,
    color: barangayColor,
    totalTransformers: metrics.length,
    warningTransformers,
    criticalTransformers,
    anomalyCount24h: anomalies.length,
    alertsCount: alerts.length,
    averageLoadPct: Number(avgLoadPct.toFixed(1)),
  };
}

function updateTransformerState(
  transformerState: TransformerState,
  cityState: CityState,
  weather: WeatherData,
  timestamp: Date
): { metrics: TransformerRealtimeMetrics; alerts: OverloadAlert | null } {
  const households = transformerState.householdIds.map((id) => cityState.households.get(id)!);

  let transformerLoadKw = 0;
  
  // Check if transformer is in artificial outage
  const isInOutage = isTransformerInArtificialOutage(transformerState);
  const activeDisaster = getActiveArtificialDisaster(transformerState);
  let forcedDisasterOutage = false;
  let disasterMismatchBias = 0;

  households.forEach((household) => {
    const reading = getSmartMeterReading(household.id, timestamp, REFRESH_INTERVAL_SECONDS);
    // Set load to 0 if in artificial outage
    let householdLoad = isInOutage ? 0 : reading.loadKw;

    if (!isInOutage && activeDisaster) {
      const effect = applyArtificialDisasterEffects(activeDisaster, householdLoad, transformerState.capacityKw);
      householdLoad = effect.loadKw;
      if (effect.forceOutage) {
        forcedDisasterOutage = true;
      }
      if (typeof effect.mismatchBias === "number") {
        disasterMismatchBias = Math.max(disasterMismatchBias, effect.mismatchBias);
      }
    }

    household.latestLoadKw = householdLoad;
    household.loadHistory.push({ timestamp: reading.timestamp.getTime(), loadKw: householdLoad });
    household.loadHistory = pruneHistory(household.loadHistory);
    transformerLoadKw += householdLoad;
  });

  if (forcedDisasterOutage) {
    transformerLoadKw = 0;
  }

  const timestampMs = timestamp.getTime();
  transformerState.history.push({ timestamp: timestampMs, loadKw: transformerLoadKw });
  transformerState.history = pruneHistory(transformerState.history);

  transformerState.rollingStats.add(transformerLoadKw, timestamp);

  const rollingMean10Min = computeRollingMean(transformerState.history, 10);
  const baselineHourlyMean = computeHourlyBaseline(transformerState.history);

  const anomalies: Anomaly[] = [];
  const { detectors } = transformerState;
  let mismatchRatio = 0;

  // Only detect anomalies for Pole/Pad Transformers
  if (transformerState.transformer.EntityType === "PolePadTransformer") {
    const spikeAnomaly = detectors.spike.detect(transformerLoadKw, transformerState.rollingStats, transformerState.transformer.ID);
    if (spikeAnomaly) {
      transformerState.spikeEvents.push(timestampMs);
      anomalies.push(spikeAnomaly);
    }

    const overdrawAnomaly = detectors.overdraw.detect(
      rollingMean10Min,
      baselineHourlyMean,
      transformerState.transformer.ID
    );
    if (overdrawAnomaly) anomalies.push(overdrawAnomaly);

    const outageAnomaly = detectors.outage.detect(transformerLoadKw, transformerState.transformer.ID);
    if (outageAnomaly) anomalies.push(outageAnomaly);

    const feederPowerKw = transformerLoadKw * (1 + (Math.random() - 0.5) * 0.1);
    const mismatchAnomaly = detectors.mismatch.detect(feederPowerKw, transformerLoadKw, transformerState.transformer.ID);
    mismatchRatio = Math.abs(feederPowerKw - transformerLoadKw) / Math.max(0.5, feederPowerKw);
    transformerState.mismatchRatios.push({ timestamp: timestampMs, ratio: mismatchRatio });
    transformerState.mismatchRatios = pruneHistory(transformerState.mismatchRatios);
    if (mismatchAnomaly) anomalies.push(mismatchAnomaly);
  } else {
    // For Substation Transformers, only track mismatch ratio without anomaly detection
    const feederPowerKw = transformerLoadKw * (1 + (Math.random() - 0.5) * 0.1);
    mismatchRatio = Math.abs(feederPowerKw - transformerLoadKw) / Math.max(0.5, feederPowerKw);
    transformerState.mismatchRatios.push({ timestamp: timestampMs, ratio: mismatchRatio });
    transformerState.mismatchRatios = pruneHistory(transformerState.mismatchRatios);
  }

  if (disasterMismatchBias && transformerState.mismatchRatios.length) {
    const lastEntry = transformerState.mismatchRatios[transformerState.mismatchRatios.length - 1];
    lastEntry.ratio = Math.min(1, lastEntry.ratio + disasterMismatchBias);
    mismatchRatio = lastEntry.ratio;
  }

  const effectiveOutage = isInOutage || forcedDisasterOutage || transformerLoadKw < 0.1;

  if (effectiveOutage) {
    transformerState.outageFlags.push({ timestamp: timestampMs, isOutage: true });
  } else {
    transformerState.outageFlags.push({ timestamp: timestampMs, isOutage: false });
  }
  transformerState.outageFlags = pruneHistory(transformerState.outageFlags);

  if (anomalies.length) {
    transformerState.anomalies.push(...anomalies);
    transformerState.anomalies = pruneOldAnomalies(transformerState.anomalies);
  }

  transformerState.spikeEvents = transformerState.spikeEvents.filter((eventTs) => eventTs >= Date.now() - MAX_HISTORY_MS);

  const loadPercentage = (transformerLoadKw / transformerState.capacityKw) * 100;
  const outageMinutes = computeOutageMinutes(transformerState.outageFlags);
  const spikeEvents24h = computeSpikeEvents(transformerState.spikeEvents);
  const mismatchScore = computeMismatch(transformerState.mismatchRatios);

  const anomalyFrequencyScore = computeAnomalyFrequencyScore(transformerState.anomalies.length);
  const bghiComponents = {
    loadStress: computeLoadStress(loadPercentage),
    outageScore: computeOutageScore(outageMinutes),
    powerQuality: computePowerQualityScore({ spikeEventsLast24h: spikeEvents24h }),
    anomalyFrequency: anomalyFrequencyScore,
    environmentalStress: computeEnvironmentalStressScore(weather.temperature, weather.humidity),
    mismatchScore: computeMismatchScore(mismatchRatio),
  };

  const bghi = calculateBGHI(bghiComponents);

  const currentHour = timestamp.getHours();
  const recentMeanKw = rollingMean10Min || transformerState.rollingStats.mean();
  const forecastPoints = transformerState.forecaster.forecast24h(
    currentHour,
    recentMeanKw,
    transformerState.capacityKw
  );
  const peakRisk = transformerState.forecaster.findPeakRisk(forecastPoints);
  const overloadAlert = transformerState.forecaster.assessOverloadRisk(forecastPoints);

  transformerState.lastUpdated = timestampMs;

  const realtimeMetrics: TransformerRealtimeMetrics = {
    transformer: {
      ...transformerState.transformer,
      totalLoad: transformerLoadKw,
      households: transformerState.householdIds.map((id) => {
        const state = cityState.households.get(id)!;
        return {
          id: state.id,
          transformerId: state.transformerId,
          latitude: state.latitude,
          longitude: state.longitude,
          load: state.latestLoadKw,
        };
      }),
    },
    currentLoadKw: Number(transformerLoadKw.toFixed(3)),
    loadPercentage: Number(loadPercentage.toFixed(1)),
    households: transformerState.householdIds.map((id) => convertHouseholdStateToRealtime(cityState.households.get(id)!)),
    anomalies: [...transformerState.anomalies],
    recentAnomalies: [...transformerState.anomalies.slice(-5)],
    bghi,
    forecast: {
      points: forecastPoints,
      peakRisk,
      overloadAlert,
    },
    rollingStats: {
      mean: Number(transformerState.rollingStats.mean().toFixed(2)),
      std: Number(transformerState.rollingStats.std().toFixed(2)),
    },
    outageMinutes24h: Number(outageMinutes.toFixed(1)),
    spikeEvents24h,
    mismatchRatio: Number(mismatchRatio.toFixed(3)),
    lastUpdated: new Date(transformerState.lastUpdated).toISOString(),
    artificialOutageActive: effectiveOutage,
    artificialDisaster: activeDisaster ? mapDisasterStateToInfo(activeDisaster) : null,
  };

  return { metrics: realtimeMetrics, alerts: overloadAlert ?? null };
}

export async function getDashboardData(city: string): Promise<DashboardDataResponse> {
  const cityState = initializeCityState(city);
  const timestamp = new Date();
  
  // Fetch real weather data
  let weather: WeatherData;
  try {
    const realWeather = await fetchRealWeather(city);
    weather = {
      temperature: realWeather.temperature,
      humidity: realWeather.humidity,
      pressure: realWeather.pressure,
      windSpeed: realWeather.windSpeed,
      condition: realWeather.condition,
    };
  } catch (error) {
    console.error('Failed to fetch real weather, using mock:', error);
    weather = generateMockWeather(city);
  }

  const transformerMetrics: TransformerRealtimeMetrics[] = [];
  const alerts: Array<{ transformerId: string; transformerName: string; alert: OverloadAlert }> = [];
  const anomalies: Anomaly[] = [];

  cityState.transformers.forEach((transformerState) => {
    const { metrics, alerts: overloadAlert } = updateTransformerState(transformerState, cityState, weather, timestamp);
    transformerMetrics.push(metrics);
    anomalies.push(...metrics.anomalies);
    if (overloadAlert) {
      alerts.push({
        transformerId: transformerState.transformer.ID,
        transformerName: transformerState.transformer.ID,
        alert: overloadAlert,
      });
    }
  });

  const summary = aggregateSummary(city, transformerMetrics, alerts, anomalies);

  cityState.lastUpdated = timestamp.getTime();

  return {
    city,
    transformers: transformerMetrics,
    summary,
    alerts,
    anomalies,
    weather,
    refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
    updatedAt: timestamp.toISOString(),
  };
}

// Artificial outage management
export function triggerArtificialOutage(
  city: string,
  transformerId: string,
  durationMinutes?: number
): { success: boolean; message: string } {
  try {
    const store = getRealtimeStore();
    const cityState = store.cities.get(city);

    if (!cityState) {
      return { success: false, message: `City ${city} not found` };
    }

    // Find transformer by ID
    let transformerState: TransformerState | null = null;
    for (const ts of cityState.transformers.values()) {
      if (ts.transformer.ID === transformerId) {
        transformerState = ts;
        break;
      }
    }

    if (!transformerState) {
      return { success: false, message: `Transformer ${transformerId} not found` };
    }

    transformerState.artificialOutage = {
      startTime: Date.now(),
      duration: durationMinutes ? durationMinutes * 60 * 1000 : undefined,
    };

    return {
      success: true,
      message: `Artificial outage triggered for transformer ${transformerId}${durationMinutes ? ` for ${durationMinutes} minutes` : " (indefinite)"}`,
    };
  } catch (error) {
    console.error("Error triggering artificial outage:", error);
    return { success: false, message: "Failed to trigger artificial outage" };
  }
}

export function clearArtificialOutage(city: string, transformerId: string): { success: boolean; message: string } {
  try {
    const store = getRealtimeStore();
    const cityState = store.cities.get(city);

    if (!cityState) {
      return { success: false, message: `City ${city} not found` };
    }

    // Find transformer by ID
    let transformerState: TransformerState | null = null;
    for (const ts of cityState.transformers.values()) {
      if (ts.transformer.ID === transformerId) {
        transformerState = ts;
        break;
      }
    }

    if (!transformerState) {
      return { success: false, message: `Transformer ${transformerId} not found` };
    }

    if (!transformerState.artificialOutage) {
      return { success: true, message: `No active artificial outage for transformer ${transformerId}` };
    }

    delete transformerState.artificialOutage;

    return { success: true, message: `Artificial outage cleared for transformer ${transformerId}` };
  } catch (error) {
    console.error("Error clearing artificial outage:", error);
    return { success: false, message: "Failed to clear artificial outage" };
  }
}

export function isTransformerInArtificialOutage(transformerState: TransformerState): boolean {
  if (!transformerState.artificialOutage) return false;

  const { startTime, duration } = transformerState.artificialOutage;
  const elapsedTime = Date.now() - startTime;

  // If duration is set and has expired, clear the outage
  if (duration && elapsedTime > duration) {
    delete transformerState.artificialOutage;
    return false;
  }

  return true;
}

export function triggerArtificialDisaster(
  city: string,
  kind: ArtificialDisasterKind,
  options: {
    transformerId?: string;
    durationMinutes?: number;
    parameters?: Record<string, number>;
    notes?: string;
  } = {}
): {
  success: boolean;
  message: string;
  transformersAffected: string[];
  disaster?: ArtificialDisasterInfo;
  disasters?: ArtificialDisasterInfo[];
} {
  try {
    const store = getRealtimeStore();
    const cityState = store.cities.get(city);

    if (!cityState) {
      return { success: false, message: `City ${city} not found`, transformersAffected: [] };
    }

    const duration = options.durationMinutes ? options.durationMinutes * 60 * 1000 : undefined;
    const startTime = Date.now();
    const targets: TransformerState[] = [];

    if (options.transformerId) {
      const transformerState = findTransformerState(cityState, options.transformerId);
      if (!transformerState) {
        return { success: false, message: `Transformer ${options.transformerId} not found`, transformersAffected: [] };
      }
      targets.push(transformerState);
    } else {
      cityState.transformers.forEach((ts) => targets.push(ts));
    }

    if (!targets.length) {
      return { success: false, message: `No transformers available in ${city}`, transformersAffected: [] };
    }

    const disastersApplied: ArtificialDisasterInfo[] = [];
    targets.forEach((transformerState) => {
      transformerState.artificialDisaster = {
        kind,
        startTime,
        duration,
        parameters: options.parameters,
        notes: options.notes,
      };
      disastersApplied.push(mapDisasterStateToInfo(transformerState.artificialDisaster));
    });

    const transformersAffected = targets.map((ts) => ts.transformer.ID);
    const durationText = options.durationMinutes ? ` for ${options.durationMinutes} minutes` : " (indefinite)";
    const message = options.transformerId
      ? `Artificial disaster (${kind}) activated for transformer ${options.transformerId}${durationText}`
      : `Artificial disaster (${kind}) activated for ${targets.length} transformers in ${city}${durationText}`;

    return {
      success: true,
      message,
      transformersAffected,
      disaster: options.transformerId ? disastersApplied[0] : undefined,
      disasters: options.transformerId ? undefined : disastersApplied,
    };
  } catch (error) {
    console.error("Error triggering artificial disaster:", error);
    return { success: false, message: "Failed to trigger artificial disaster", transformersAffected: [] };
  }
}

export function clearArtificialDisaster(
  city: string,
  transformerId?: string
): { success: boolean; message: string; transformersAffected: string[] } {
  try {
    const store = getRealtimeStore();
    const cityState = store.cities.get(city);

    if (!cityState) {
      return { success: false, message: `City ${city} not found`, transformersAffected: [] };
    }

    const targets: TransformerState[] = [];
    if (transformerId) {
      const transformerState = findTransformerState(cityState, transformerId);
      if (!transformerState) {
        return { success: false, message: `Transformer ${transformerId} not found`, transformersAffected: [] };
      }
      targets.push(transformerState);
    } else {
      cityState.transformers.forEach((ts) => targets.push(ts));
    }

    const cleared: string[] = [];
    targets.forEach((transformerState) => {
      if (transformerState.artificialDisaster) {
        cleared.push(transformerState.transformer.ID);
        delete transformerState.artificialDisaster;
      }
    });

    if (transformerId) {
      if (!cleared.length) {
        return {
          success: true,
          message: `No active artificial disaster for transformer ${transformerId}`,
          transformersAffected: [],
        };
      }
      return {
        success: true,
        message: `Artificial disaster cleared for transformer ${transformerId}`,
        transformersAffected: cleared,
      };
    }

    if (!cleared.length) {
      return { success: true, message: `No active artificial disasters in ${city}`, transformersAffected: [] };
    }

    return {
      success: true,
      message: `Artificial disaster cleared for ${cleared.length} transformers in ${city}`,
      transformersAffected: cleared,
    };
  } catch (error) {
    console.error("Error clearing artificial disaster:", error);
    return { success: false, message: "Failed to clear artificial disaster", transformersAffected: [] };
  }
}

function getActiveArtificialDisaster(transformerState: TransformerState): ArtificialDisasterState | null {
  const disaster = transformerState.artificialDisaster;
  if (!disaster) return null;

  if (disaster.duration) {
    const elapsed = Date.now() - disaster.startTime;
    if (elapsed > disaster.duration) {
      delete transformerState.artificialDisaster;
      return null;
    }
  }

  return disaster;
}

function applyArtificialDisasterEffects(
  disaster: ArtificialDisasterState,
  baseLoadKw: number,
  transformerCapacityKw: number
): { loadKw: number; forceOutage: boolean; mismatchBias?: number } {
  const params = disaster.parameters ?? {};

  switch (disaster.kind) {
    case "heatwave": {
      const multiplier = params.loadMultiplier ?? 1.35;
      const variability = params.variability ?? 0.08;
      const variationFactor = 1 + (Math.random() - 0.5) * variability * 2;
      const adjusted = Math.min(transformerCapacityKw * 1.3, baseLoadKw * multiplier * variationFactor);
      return {
        loadKw: Math.max(0, adjusted),
        forceOutage: false,
        mismatchBias: params.mismatchBias ?? 0.05,
      };
    }
    case "typhoon": {
      const outageChance = params.householdOutageChance ?? 0.25;
      const fluctuation = params.loadFluctuation ?? 0.5;
      if (Math.random() < outageChance) {
        return { loadKw: 0, forceOutage: false, mismatchBias: params.mismatchBias ?? 0.15 };
      }
      const adjusted = baseLoadKw * (0.5 + Math.random() * fluctuation);
      return {
        loadKw: Math.max(0, adjusted),
        forceOutage: false,
        mismatchBias: params.mismatchBias ?? 0.15,
      };
    }
    case "earthquake": {
      const damageSeverity = Math.min(1, params.damageSeverity ?? 0.8);
      const forceOutage = Math.random() < damageSeverity;
      const capacityFraction = Math.max(0, 1 - damageSeverity * 0.85);
      const adjusted = forceOutage ? 0 : baseLoadKw * capacityFraction;
      return {
        loadKw: Math.max(0, adjusted),
        forceOutage,
        mismatchBias: params.mismatchBias ?? (forceOutage ? 0.25 : 0.1),
      };
    }
    case "brownout": {
      const reduction = Math.min(1, params.loadReduction ?? 0.5);
      const variability = params.variability ?? 0.2;
      const adjusted = baseLoadKw * Math.max(0, 1 - reduction) * (0.9 + Math.random() * variability);
      return {
        loadKw: Math.max(0, adjusted),
        forceOutage: false,
        mismatchBias: params.mismatchBias ?? 0.05,
      };
    }
    case "cyberattack": {
      const spikeMultiplier = params.spikeMultiplier ?? 1.6;
      const jitter = params.jitter ?? 0.7;
      const adjusted = baseLoadKw * spikeMultiplier * (0.8 + Math.random() * jitter);
      return {
        loadKw: Math.max(0, adjusted),
        forceOutage: false,
        mismatchBias: params.mismatchBias ?? 0.25,
      };
    }
    case "custom":
    default: {
      const multiplier = params.loadMultiplier ?? 1;
      const adjusted = baseLoadKw * multiplier;
      return {
        loadKw: Math.max(0, adjusted),
        forceOutage: Boolean(params.forceOutage && params.forceOutage > 0),
        mismatchBias: params.mismatchBias,
      };
    }
  }
}

function mapDisasterStateToInfo(disaster: ArtificialDisasterState): ArtificialDisasterInfo {
  return {
    type: disaster.kind,
    startedAt: new Date(disaster.startTime).toISOString(),
    expiresAt: disaster.duration ? new Date(disaster.startTime + disaster.duration).toISOString() : undefined,
    parameters: disaster.parameters,
    notes: disaster.notes,
  };
}

function findTransformerState(cityState: CityState, transformerId: string): TransformerState | null {
  for (const ts of cityState.transformers.values()) {
    if (ts.transformer.ID === transformerId) {
      return ts;
    }
  }
  return null;
}
