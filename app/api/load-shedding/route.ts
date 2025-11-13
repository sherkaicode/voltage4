import { NextRequest, NextResponse } from "next/server";
import { generateLoadSheddingPlan } from "@/lib/load-shedding";
import type { LoadSheddingConstraints } from "@/lib/load-shedding";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transformers, targetReductionMW, constraints } = body;

    if (!transformers || !Array.isArray(transformers)) {
      return NextResponse.json(
        { success: false, error: "Transformers array is required" },
        { status: 400 }
      );
    }

    if (typeof targetReductionMW !== "number" || targetReductionMW <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid targetReductionMW is required" },
        { status: 400 }
      );
    }

    const sheddingConstraints: LoadSheddingConstraints = {
      protectCriticalInfrastructure: constraints?.protectCriticalInfrastructure ?? true,
      respectEquityThresholds: constraints?.respectEquityThresholds ?? true,
      minimizeAffectedHouseholds: constraints?.minimizeAffectedHouseholds ?? true,
      maxSheddingDurationMinutes: constraints?.maxSheddingDurationMinutes,
    };

    const plan = generateLoadSheddingPlan(
      transformers,
      targetReductionMW,
      sheddingConstraints
    );

    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (error) {
    console.error("Error generating load shedding plan:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate load shedding plan" },
      { status: 500 }
    );
  }
}
