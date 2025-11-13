import { NextResponse } from "next/server";
import { triggerArtificialOutage, clearArtificialOutage } from "@/lib/realtime-store";

export async function POST(request: Request) {
  try {
    const { transformerId, city, action, durationMinutes } = await request.json();

    if (!transformerId || !city) {
      return NextResponse.json(
        { success: false, error: "transformerId and city are required" },
        { status: 400 }
      );
    }

    if (action === "trigger") {
      const result = triggerArtificialOutage(city, transformerId, durationMinutes);
      return NextResponse.json(result);
    } else if (action === "clear") {
      const result = clearArtificialOutage(city, transformerId);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Use 'trigger' or 'clear'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Outage API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process outage request" },
      { status: 500 }
    );
  }
}
