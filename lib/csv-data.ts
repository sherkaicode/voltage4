// CSV data types and utilities

import { getSmartMeterReading } from "@/lib/smart-meter";

export interface CSVTransformer {
  EntityType: "SubstationTransformer" | "PolePadTransformer";
  ID: string;
  ParentID: string;
  Latitude: number;
  Longitude: number;
  NumDownstreamBuildings: number;
}

export interface TransformerWithLoad extends CSVTransformer {
  totalLoad: number; // kW
  households: Household[];
}

export interface Household {
  id: string;
  transformerId: string;
  latitude: number;
  longitude: number;
  load: number; // kW
}

// Smart meter function now generates realistic loads based on the SmartMeter simulation
export function smartMeter(buildingID: string): number {
  const reading = getSmartMeterReading(buildingID);
  return reading.loadKw;
}

// Generate random household coordinates around a transformer
export function generateHouseholdsAroundTransformer(
  transformer: CSVTransformer,
  count: number
): Household[] {
  const households: Household[] = [];
  const radius = 0.001; // Approximately 100 meters in degrees (roughly)

  for (let i = 0; i < count; i++) {
    // Generate random angle and distance
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radius;

    const household: Household = {
      id: `household-${transformer.ID}-${i}`,
      transformerId: transformer.ID,
      latitude: transformer.Latitude + distance * Math.cos(angle),
      longitude: transformer.Longitude + distance * Math.sin(angle),
      load: smartMeter(`building-${transformer.ID}-${i}`),
    };

    households.push(household);
  }

  return households;
}

// Calculate total load for a transformer based on downstream buildings
export function calculateTransformerLoad(
  transformer: CSVTransformer,
  households: Household[]
): number {
  if (transformer.EntityType === "SubstationTransformer") {
    // Substation transformers don't have direct loads
    return 0;
  }

  // Sum up all household loads connected to this transformer
  const connectedHouseholds = households.filter(
    (h) => h.transformerId === transformer.ID
  );

  return connectedHouseholds.reduce((sum, h) => sum + h.load, 0);
}

// Parse CSV data and generate transformer data with loads
export function processCSVData(csvData: CSVTransformer[]): {
  transformers: TransformerWithLoad[];
  households: Household[];
} {
  const households: Household[] = [];
  const transformers: TransformerWithLoad[] = [];

  // First, generate households for all PolePadTransformers
  csvData.forEach((transformer) => {
    if (transformer.EntityType === "PolePadTransformer") {
      const transformerHouseholds = generateHouseholdsAroundTransformer(
        transformer,
        transformer.NumDownstreamBuildings
      );
      households.push(...transformerHouseholds);
    }
  });

  // Then, calculate loads and create transformer objects
  csvData.forEach((transformer) => {
    const transformerHouseholds = households.filter(
      (h) => h.transformerId === transformer.ID
    );

    const totalLoad = calculateTransformerLoad(transformer, households);

    transformers.push({
      ...transformer,
      totalLoad,
      households: transformerHouseholds,
    });
  });

  return { transformers, households };
}

