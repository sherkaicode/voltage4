import { NextResponse } from "next/server";

import { getDashboardData } from "@/lib/realtime-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    if (!city) {
      return NextResponse.json(
        { success: false, error: "City parameter is required" },
        { status: 400 }
      );
    }

    try {
      const data = await getDashboardData(city);
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error("Dashboard data error", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to generate dashboard data",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Dashboard API request error", error);
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}
