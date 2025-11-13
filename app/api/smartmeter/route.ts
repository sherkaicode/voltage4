import { NextResponse } from "next/server";
import { generateMockSmartMeterData } from "@/lib/mock-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const consumerId = searchParams.get("consumerId") || "consumer-1";

    const data = generateMockSmartMeterData(consumerId);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

