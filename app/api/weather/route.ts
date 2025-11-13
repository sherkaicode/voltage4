import { NextResponse } from "next/server";
import { fetchRealWeather } from "@/lib/weather-api";
import { generateMockWeather } from "@/lib/mock-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city") || "Quezon City";
    const useMock = searchParams.get("mock") === "true";

    console.log(`🌤️ Weather API called for: ${city}, mock: ${useMock}`);

    let weather;
    
    if (useMock) {
      // Allow mock mode for testing/demo
      weather = generateMockWeather(city);
    } else {
      // Fetch real weather data
      const realWeather = await fetchRealWeather(city);
      
      // Convert to our standard format
      weather = {
        temperature: realWeather.temperature,
        humidity: realWeather.humidity,
        pressure: realWeather.pressure,
        windSpeed: realWeather.windSpeed,
        condition: realWeather.condition,
      };
    }

    return NextResponse.json({
      success: true,
      data: weather,
      source: useMock ? 'mock' : 'openweathermap',
      city: city,
    });
  } catch (error) {
    console.error("Weather API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

