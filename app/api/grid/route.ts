import { NextResponse } from "next/server";
import { generateMockTransformers, generateMockHouseholds } from "@/lib/mock-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    const transformers = generateMockTransformers(city || undefined);
    const households = generateMockHouseholds(transformers);

    return NextResponse.json({
      success: true,
      data: {
        transformers,
        households,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

