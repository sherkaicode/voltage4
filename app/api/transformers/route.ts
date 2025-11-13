import { NextResponse } from "next/server";
import { generateMockTransformers } from "@/lib/mock-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");
    const barangay = searchParams.get("barangay");

    let transformers = generateMockTransformers(city || undefined);
    
    if (barangay) {
      transformers = transformers.filter((t) => t.barangay === barangay);
    }

    return NextResponse.json({
      success: true,
      data: transformers,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

