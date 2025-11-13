// Real weather API integration with OpenWeatherMap

export interface RealWeatherData {
  temperature: number; // Celsius
  humidity: number; // %
  pressure: number; // hPa
  windSpeed: number; // m/s
  condition: string;
  description: string;
  city: string;
  timestamp: number;
}

const API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY || process.env.OPENWEATHER_API_KEY || '';
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

// City coordinates for Philippines - FOCUSED ON QUEZON CITY
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'Quezon City': { lat: 14.6760, lon: 121.0437 },
  'UP Diliman': { lat: 14.6519, lon: 121.0568 },
};

/**
 * Fetch real weather data from OpenWeatherMap API
 */
export async function fetchRealWeather(city: string): Promise<RealWeatherData> {
  const coords = CITY_COORDS[city];
  
  if (!coords) {
    console.warn(`⚠️ No coordinates configured for city: ${city}`);
    return generateMockWeatherFallback(city);
  }

  if (!API_KEY) {
    console.warn('⚠️ OpenWeatherMap API key not configured, using mock data');
    console.warn('Make sure NEXT_PUBLIC_OPENWEATHER_API_KEY is set in .env.local');
    return generateMockWeatherFallback(city);
  }

  console.log(`🌤️ Fetching real weather for ${city}...`);
  
  try {
    const url = `${BASE_URL}?lat=${coords.lat}&lon=${coords.lon}&appid=${API_KEY}&units=metric`;
    
    const response = await fetch(url, {
      next: { revalidate: 300 } // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error(`Weather API error: ${response.status} ${response.statusText}`);
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`✅ Real weather data received for ${city}: ${data.main.temp}°C`);

    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: data.wind.speed,
      condition: mapCondition(data.weather[0].main),
      description: data.weather[0].description,
      city: data.name,
      timestamp: data.dt * 1000,
    };
  } catch (error) {
    console.error('❌ Failed to fetch real weather, using mock data:', error);
    return generateMockWeatherFallback(city);
  }
}

/**
 * Map OpenWeatherMap conditions to our simplified conditions
 */
function mapCondition(weatherMain: string): string {
  const conditionMap: Record<string, string> = {
    'Clear': 'Sunny',
    'Clouds': 'Cloudy',
    'Rain': 'Rainy',
    'Drizzle': 'Rainy',
    'Thunderstorm': 'Rainy',
    'Snow': 'Cloudy',
    'Mist': 'Cloudy',
    'Fog': 'Cloudy',
    'Haze': 'Partly Cloudy',
  };

  return conditionMap[weatherMain] || 'Partly Cloudy';
}

/**
 * Fallback mock weather when API is unavailable
 */
function generateMockWeatherFallback(city: string): RealWeatherData {
  return {
    temperature: Math.random() * 10 + 25, // 25-35°C
    humidity: Math.random() * 30 + 60, // 60-90%
    pressure: Math.random() * 20 + 1010, // 1010-1030 hPa
    windSpeed: Math.random() * 10 + 5, // 5-15 m/s
    condition: ['Sunny', 'Cloudy', 'Partly Cloudy', 'Rainy'][Math.floor(Math.random() * 4)],
    description: 'simulated weather data',
    city,
    timestamp: Date.now(),
  };
}

/**
 * Get weather for multiple cities (batch request)
 */
export async function fetchWeatherForCities(cities: string[]): Promise<Record<string, RealWeatherData>> {
  const weatherPromises = cities.map(city => 
    fetchRealWeather(city).then(data => ({ city, data }))
  );

  const results = await Promise.all(weatherPromises);
  
  return results.reduce((acc, { city, data }) => {
    acc[city] = data;
    return acc;
  }, {} as Record<string, RealWeatherData>);
}
