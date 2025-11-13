import { NextResponse } from "next/server";

import { clearArtificialDisaster, triggerArtificialDisaster } from "@/lib/realtime-store";
import type { ArtificialDisasterKind } from "@/types/dashboard";

const DISASTER_ALIASES: Record<string, ArtificialDisasterKind> = {
  heatwave: "heatwave",
  headwave: "heatwave",
  heatwav: "heatwave",
  headwavw: "heatwave",
  typhoon: "typhoon",
  hurricane: "typhoon",
  cyclone: "typhoon",
  earthquake: "earthquake",
  quake: "earthquake",
  brownout: "brownout",
  blackout: "brownout",
  cyberattack: "cyberattack",
  cyber: "cyberattack",
  custom: "custom",
};

function normalizeDisasterKind(input: unknown): ArtificialDisasterKind | null {
  if (typeof input !== "string") return null;
  const normalized = input.toLowerCase().trim();
  return DISASTER_ALIASES[normalized] ?? null;
}

function sanitizeParameters(input: unknown): Record<string, number> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const entries = Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => {
      const numeric = typeof value === "number" ? value : Number(value);
      return Number.isFinite(numeric) ? [key, numeric] : null;
    })
    .filter((entry): entry is [string, number] => Array.isArray(entry));

  return entries.length ? Object.fromEntries(entries) : undefined;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { action, city, transformerId, disaster, durationMinutes, parameters, notes } = payload ?? {};

    if (!city || typeof city !== "string") {
      return NextResponse.json({ success: false, error: "city is required" }, { status: 400 });
    }

    if (!action || typeof action !== "string") {
      return NextResponse.json({ success: false, error: "action is required" }, { status: 400 });
    }

    const normalizedAction = action.toLowerCase().trim();

    if (normalizedAction === "trigger") {
      const kind = normalizeDisasterKind(disaster);
      if (!kind) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid disaster type: ${disaster}. Supported types: heatwave, typhoon, earthquake, brownout, cyberattack, custom.`,
          },
          { status: 400 }
        );
      }

      let parsedDuration: number | undefined;
      if (durationMinutes !== undefined) {
        const numeric = Number(durationMinutes);
        if (!Number.isFinite(numeric) || numeric < 0) {
          return NextResponse.json(
            { success: false, error: "durationMinutes must be a positive number" },
            { status: 400 }
          );
        }
        parsedDuration = numeric;
      }

      const sanitizedParameters = sanitizeParameters(parameters);
      const result = triggerArtificialDisaster(city, kind, {
        transformerId: transformerId && typeof transformerId === "string" ? transformerId : undefined,
        durationMinutes: parsedDuration,
        parameters: sanitizedParameters,
        notes: typeof notes === "string" ? notes : undefined,
      });
      const status = result.success ? 200 : 400;
      return NextResponse.json(result, { status });
    }

    if (normalizedAction === "clear") {
      const result = clearArtificialDisaster(
        city,
        transformerId && typeof transformerId === "string" ? transformerId : undefined
      );
      const status = result.success ? 200 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Use 'trigger' or 'clear'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Disaster simulation API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process disaster simulation request" },
      { status: 500 }
    );
  }
}

