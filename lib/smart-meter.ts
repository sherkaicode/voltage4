// Utilities and class for smart meter load simulation

export interface SmartMeterOptions {
  minKw?: number;
  maxKw?: number;
  baseKw?: number;
}

export interface SmartMeterReading {
  timestamp: Date;
  meterId: string;
  loadKw: number;
}

const DEFAULT_MIN_KW = 0.2;
const DEFAULT_MAX_KW = 8;
const DEFAULT_BASE_KW = 0.8;

const BASE_KW_RANGE: [number, number] = [0.4, 1.4];

function randomUniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Box-Muller transform for normal distribution
function randomNormal(mean = 0, standardDeviation = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = Math.random();
  }
  while (v === 0) {
    v = Math.random();
  }
  const magnitude = Math.sqrt(-2.0 * Math.log(u));
  const angle = 2.0 * Math.PI * v;
  return mean + standardDeviation * magnitude * Math.cos(angle);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, decimalPlaces: number): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

function truncateToInterval(date: Date, intervalSeconds: number): Date {
  const truncated = new Date(date);
  const ms = intervalSeconds * 1000;
  truncated.setTime(Math.floor(truncated.getTime() / ms) * ms);
  return truncated;
}

export class SmartMeter {
  private readonly minKw: number;
  private readonly maxKw: number;
  private readonly baseKw: number;
  private readonly morningAmplitude: number;
  private readonly eveningAmplitude: number;
  private readonly noiseScale: number;
  private readonly acSensitivity: number;
  private readonly loadCache: Map<string, number> = new Map();

  constructor(public readonly meterId: string, options: SmartMeterOptions = {}) {
    this.minKw = options.minKw ?? DEFAULT_MIN_KW;
    this.maxKw = options.maxKw ?? DEFAULT_MAX_KW;
    this.baseKw = options.baseKw ?? DEFAULT_BASE_KW;

    this.morningAmplitude = randomUniform(0.8, 3.0) * this.baseKw;
    this.eveningAmplitude = randomUniform(1.0, 4.0) * this.baseKw;
    this.noiseScale = randomUniform(0.02, 0.15) * this.maxKw;
    this.acSensitivity = randomUniform(0.01, 0.05);
  }

  private cacheKey(timestamp: Date): string {
    return timestamp.toISOString();
  }

  private dailyProfile(timestamp: Date): number {
    const hour = timestamp.getHours() + timestamp.getMinutes() / 60;

    const morningPeak = this.morningAmplitude * Math.exp(-0.5 * Math.pow((hour - 8.0) / 1.8, 2));
    const eveningPeak = this.eveningAmplitude * Math.exp(-0.5 * Math.pow((hour - 19.0) / 2.2, 2));
    const middayBump = 0.3 * this.baseKw * Math.exp(-0.5 * Math.pow((hour - 13.0) / 3.0, 2));

    return morningPeak + eveningPeak + middayBump;
  }

  generateLoads(
    numMinutes = 24 * 60,
    startTime: Date = truncateToInterval(new Date(), 60),
    externalTempSeries?: number[]
  ): SmartMeterReading[] {
    const readings: SmartMeterReading[] = [];
    const timestamps: Date[] = [];

    for (let i = 0; i < numMinutes; i++) {
      const timestamp = new Date(startTime.getTime() + i * 60 * 1000);
      timestamps.push(timestamp);
    }

    let previousLoad: number | null = null;

    timestamps.forEach((timestamp, index) => {
      let baseProfile = this.baseKw + this.dailyProfile(timestamp);

      if (timestamp.getDay() >= 5) {
        baseProfile *= randomUniform(0.6, 0.9);
      }

      let temperatureInfluence = 0;
      if (externalTempSeries && externalTempSeries[index] !== undefined) {
        const externalTemp = externalTempSeries[index];
        temperatureInfluence = Math.max(0, externalTemp - 26) * this.acSensitivity;
      }

      const noise = randomNormal(0, this.noiseScale);
      const spike = Math.random() < 0.002 ? randomUniform(0.5, 3.0) * this.baseKw : 0;
      const raw = baseProfile + temperatureInfluence + noise + spike;

      let load: number;
      if (previousLoad === null) {
        load = raw;
      } else {
        const smoothingFactor = randomUniform(0.2, 0.6);
        load = previousLoad + (raw - previousLoad) * smoothingFactor;
      }

      load = clamp(load, this.minKw, this.maxKw);
      load = roundTo(load, 3);

      previousLoad = load;
      this.loadCache.set(this.cacheKey(timestamp), load);
      readings.push({
        timestamp,
        meterId: this.meterId,
        loadKw: load,
      });
    });

    return readings;
  }

  getLoadAtTimestamp(timestamp: Date): number {
    return this.loadCache.get(this.cacheKey(timestamp)) ?? 0;
  }

  generateInstantaneousLoad(
    timestamp: Date = new Date(),
    cacheIntervalSeconds = 30
  ): SmartMeterReading {
    const bucketedTimestamp = truncateToInterval(timestamp, cacheIntervalSeconds);
    const cacheKey = this.cacheKey(bucketedTimestamp);
    const existing = this.loadCache.get(cacheKey);
    if (existing !== undefined) {
      return {
        timestamp: bucketedTimestamp,
        meterId: this.meterId,
        loadKw: existing,
      };
    }

    const [reading] = this.generateLoads(1, truncateToInterval(timestamp, 60));
    this.loadCache.set(cacheKey, reading.loadKw);
    return {
      ...reading,
      timestamp: bucketedTimestamp,
    };
  }
}

export function createSmartMeter(
  meterId: string,
  options: SmartMeterOptions = {}
): SmartMeter {
  const baseKw = options.baseKw ?? randomUniform(BASE_KW_RANGE[0], BASE_KW_RANGE[1]);
  return new SmartMeter(meterId, {
    ...options,
    baseKw,
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __SMART_METERS__: Map<string, SmartMeter> | undefined;
}

function getSmartMeterStore(): Map<string, SmartMeter> {
  if (!globalThis.__SMART_METERS__) {
    globalThis.__SMART_METERS__ = new Map();
  }
  return globalThis.__SMART_METERS__;
}

export function getOrCreateSmartMeter(meterId: string): SmartMeter {
  const store = getSmartMeterStore();
  if (!store.has(meterId)) {
    store.set(meterId, createSmartMeter(meterId));
  }
  return store.get(meterId)!;
}

export function getSmartMeterReading(
  meterId: string,
  timestamp: Date = new Date(),
  cacheIntervalSeconds = 30
): SmartMeterReading {
  const meter = getOrCreateSmartMeter(meterId);
  return meter.generateInstantaneousLoad(timestamp, cacheIntervalSeconds);
}

export function resetSmartMeterCache() {
  globalThis.__SMART_METERS__ = new Map();
}
