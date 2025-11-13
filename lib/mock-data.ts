// Mock data generators for GridPulse

export type UserType = "Meralco" | "Barangay" | "Consumer";

export interface User {
  id: string;
  email: string;
  password: string;
  userType: UserType;
  name: string;
  city?: string;
  barangay?: string;
}

export interface Transformer {
  id: string;
  name: string;
  city: string;
  barangay: string;
  latitude: number;
  longitude: number;
  currentLoad: number; // kW
  capacity: number; // kW
  households: string[]; // household IDs
}

export interface Household {
  id: string;
  transformerId: string;
  latitude: number;
  longitude: number;
  consumerId?: string;
}

export interface WeatherData {
  temperature: number; // Celsius
  humidity: number; // %
  pressure: number; // hPa
  windSpeed: number; // m/s
  condition: string;
}

export interface SmartMeterData {
  consumerId: string;
  currentConsumption: number; // kWh
  daily: { date: string; consumption: number }[];
  weekly: { week: string; consumption: number }[];
  monthly: { month: string; consumption: number }[];
}

// Mock users
export const mockUsers: User[] = [
  {
    id: "1",
    email: "meralco@gridpulse.com",
    password: "meralco123",
    userType: "Meralco",
    name: "Meralco Admin",
  },
  {
    id: "2",
    email: "barangay@gridpulse.com",
    password: "barangay123",
    userType: "Barangay",
    name: "Barangay Admin",
    city: "Manila",
    barangay: "Barangay 1",
  },
  {
    id: "3",
    email: "consumer@gridpulse.com",
    password: "consumer123",
    userType: "Consumer",
    name: "John Doe",
  },
];

// Mock cities
export const cities = ["Quezon City"];

// Mock barangays per city
export const barangaysByCity: Record<string, string[]> = {
  "Quezon City": ["Barangay A", "Barangay B", "Barangay C"],
};

// Generate mock transformers
export function generateMockTransformers(city?: string): Transformer[] {
  const transformers: Transformer[] = [];
  const citiesToUse = city ? [city] : cities;

  citiesToUse.forEach((c) => {
    const barangays = barangaysByCity[c] || [];
    barangays.forEach((barangay, bIndex) => {
      for (let i = 0; i < 3; i++) {
        transformers.push({
          id: `transformer-${c}-${barangay}-${i}`,
          name: `Transformer ${i + 1} - ${barangay}`,
          city: c,
          barangay,
          latitude: 14.6 + (bIndex * 0.05) + (i * 0.01) + Math.random() * 0.02,
          longitude: 121.0 + (bIndex * 0.05) + (i * 0.01) + Math.random() * 0.02,
          currentLoad: Math.random() * 500 + 100, // 100-600 kW
          capacity: 800,
          households: [],
        });
      }
    });
  });

  return transformers;
}

// Generate mock households
export function generateMockHouseholds(transformers: Transformer[]): Household[] {
  const households: Household[] = [];
  
  transformers.forEach((transformer) => {
    const householdCount = Math.floor(Math.random() * 20) + 10; // 10-30 households per transformer
    
    for (let i = 0; i < householdCount; i++) {
      const household: Household = {
        id: `household-${transformer.id}-${i}`,
        transformerId: transformer.id,
        latitude: transformer.latitude + (Math.random() - 0.5) * 0.01,
        longitude: transformer.longitude + (Math.random() - 0.5) * 0.01,
      };
      
      households.push(household);
      transformer.households.push(household.id);
    }
  });

  return households;
}

// Generate mock weather data
export function generateMockWeather(city: string): WeatherData {
  return {
    temperature: Math.random() * 10 + 25, // 25-35°C
    humidity: Math.random() * 30 + 60, // 60-90%
    pressure: Math.random() * 20 + 1010, // 1010-1030 hPa
    windSpeed: Math.random() * 10 + 5, // 5-15 m/s
    condition: ["Sunny", "Cloudy", "Partly Cloudy", "Rainy"][Math.floor(Math.random() * 4)],
  };
}

// Generate mock smart meter data
export function generateMockSmartMeterData(consumerId: string): SmartMeterData {
  const now = new Date();
  const daily: { date: string; consumption: number }[] = [];
  const weekly: { week: string; consumption: number }[] = [];
  const monthly: { month: string; consumption: number }[] = [];

  // Generate daily data for last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    daily.push({
      date: date.toISOString().split("T")[0],
      consumption: Math.random() * 20 + 10, // 10-30 kWh
    });
  }

  // Generate weekly data for last 12 weeks
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);
    weekly.push({
      week: `Week ${12 - i}`,
      consumption: Math.random() * 150 + 100, // 100-250 kWh
    });
  }

  // Generate monthly data for last 12 months
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    monthly.push({
      month: months[date.getMonth()],
      consumption: Math.random() * 600 + 400, // 400-1000 kWh
    });
  }

  return {
    consumerId,
    currentConsumption: Math.random() * 20 + 10,
    daily,
    weekly,
    monthly,
  };
}

// Calculate grid health
export function calculateGridHealth(
  currentLoad: number,
  capacity: number,
  temperature: number,
  humidity: number,
  pressure: number
): number {
  // Simple formula: health decreases with load percentage, temperature, and humidity
  const loadPercentage = (currentLoad / capacity) * 100;
  const tempFactor = temperature > 30 ? (temperature - 30) * 2 : 0;
  const humidityFactor = humidity > 80 ? (humidity - 80) * 0.5 : 0;
  
  let health = 100;
  health -= (loadPercentage - 50) * 0.5; // Penalty for high load
  health -= tempFactor;
  health -= humidityFactor;
  
  return Math.max(0, Math.min(100, health));
}

// Generate predictive insights
/**
 * Generate AI-powered predictive insights for a transformer
 */
export async function generatePredictiveInsights(
  transformer: Transformer,
  weather: WeatherData
): Promise<string[]> {
  try {
    const loadPercentage = (transformer.currentLoad / transformer.capacity) * 100;
    const thermalStress = loadPercentage > 80 ? 'HIGH' : loadPercentage > 70 ? 'MODERATE' : 'LOW';
    const weatherImpact = weather.temperature > 32 ? 'SIGNIFICANT' : weather.temperature > 28 ? 'MODERATE' : 'MINIMAL';
    
    const prompt = `You are a senior electrical grid engineer with expertise in IEEE C57.91 transformer loading standards and Philippine grid operations.

Transformer Technical Analysis:
- Transformer ID: ${transformer.name}
- Current Load: ${transformer.currentLoad.toFixed(1)} kW (${loadPercentage.toFixed(1)}% of ${transformer.capacity} kW capacity)
- Thermal Stress Level: ${thermalStress}
- Ambient Temperature: ${weather.temperature.toFixed(1)}°C (${weather.condition})
- Humidity: ${weather.humidity}% 
- Weather Impact Factor: ${weatherImpact}

IEEE Standards Context:
- IEEE C57.91: Normal loading = 0-80%, Emergency = 80-100%, Overload = >100%
- IEEE C57.140: Temperature rise per 10°C ambient increase = ~7-10°C winding temp
- ERC Standards: Philippine grid requires <5% voltage deviation, thermal trip at 150°C

Task: Generate 2-4 HIGHLY SPECIFIC technical recommendations. Each must:
1. Include exact numbers (kW, °C, %, hours, coordinates if applicable)
2. Reference IEEE/ERC standards or technical principles
3. Provide actionable steps with timing (e.g., "within 2 hours", "before 3 PM")
4. Explain WHY based on physics/engineering (thermal aging, voltage drop, power factor)
5. Be 15-25 words max per recommendation

Example Format:
["Redistribute 12.3 kW to adjacent transformers within 2h - IEEE C57.91 emergency loading at ${loadPercentage.toFixed(0)}% risks 15% lifespan reduction", "Install thermal monitoring - ambient ${weather.temperature.toFixed(0)}°C + 82% load = predicted 145°C winding temp (IEEE limit 150°C)"]

Return ONLY a JSON array of strings. Be precise, technical, and reference standards.`;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        context: {},
        conversationHistory: [],
        language: 'english',
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      // Try to parse JSON array from response
      try {
        const jsonMatch = result.response.match(/\[.*\]/s);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          if (Array.isArray(insights) && insights.length > 0) {
            return insights.slice(0, 4); // Max 4 insights
          }
        }
      } catch (parseError) {
        // If JSON parsing fails, split by newlines/bullets
        const lines = result.response
          .split(/\n|•|\d+\./)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 20 && s.length < 200);
        
        if (lines.length > 0) {
          return lines.slice(0, 4);
        }
      }
    }
    
    // Fallback to intelligent hardcoded insights
    return generateFallbackInsights(transformer, weather);
  } catch (error) {
    console.error('Failed to generate AI insights:', error);
    return generateFallbackInsights(transformer, weather);
  }
}

/**
 * Fallback insights when AI is unavailable
 */
function generateFallbackInsights(
  transformer: Transformer,
  weather: WeatherData
): string[] {
  const insights: string[] = [];
  const loadPercentage = (transformer.currentLoad / transformer.capacity) * 100;
  const excessKw = transformer.currentLoad - (transformer.capacity * 0.8);
  const tempRise = weather.temperature - 28; // Base ambient
  const windingTemp = 100 + (loadPercentage * 0.5) + (tempRise * 8); // Simplified thermal model

  if (loadPercentage > 85) {
    insights.push(`URGENT: ${transformer.name} at ${loadPercentage.toFixed(1)}% (IEEE C57.91 emergency) - redistribute ${excessKw.toFixed(1)} kW within 2h to prevent thermal trip`);
  } else if (loadPercentage > 75) {
    const hoursToLimit = ((100 - loadPercentage) / 5).toFixed(1); // Assume 5%/hr growth
    insights.push(`WARNING: ${transformer.name} at ${loadPercentage.toFixed(1)}% - ${hoursToLimit}h until 100% capacity at current load growth rate`);
  }

  if (weather.temperature > 32 && loadPercentage > 70) {
    insights.push(`Thermal stress: ${weather.temperature.toFixed(0)}°C ambient + ${loadPercentage.toFixed(0)}% load = ~${windingTemp.toFixed(0)}°C winding temp (IEEE limit 150°C) - monitor hourly`);
  }

  if (weather.condition === "Rainy" && loadPercentage > 60) {
    insights.push(`Rainy conditions risk voltage fluctuations - install surge protection and monitor for ${(loadPercentage * 1.15).toFixed(0)}% transient peaks`);
  }

  if (loadPercentage < 30) {
    const maintenanceWindow = loadPercentage < 20 ? '2-6 AM' : '3-5 AM';
    insights.push(`Optimal maintenance window ${maintenanceWindow} - current ${loadPercentage.toFixed(0)}% load allows ${(transformer.capacity * 0.3).toFixed(0)} kW safety margin`);
  }

  if (insights.length === 0) {
    insights.push(`${transformer.name} within IEEE normal loading (${loadPercentage.toFixed(1)}%) - continue routine monitoring per ERC standards`);
  }

  return insights;
}

