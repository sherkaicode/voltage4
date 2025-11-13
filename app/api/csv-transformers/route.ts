import { NextResponse } from "next/server";
import Papa from "papaparse";
import { readFileSync } from "fs";
import { join } from "path";
import { processCSVData, type CSVTransformer } from "@/lib/csv-data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city");

    let csvFile = "";
    if (city === "Quezon City" || city === "QC") {
      csvFile = "mock_meralco_transformers_QC.csv";
    } else if (city === "UP Diliman" || city === "UPD") {
      csvFile = "mock_meralco_transformers_UPDiliman.csv";
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid city. Use 'Quezon City' or 'UP Diliman'" },
        { status: 400 }
      );
    }

    // Read CSV file from public directory
    const csvPath = join(process.cwd(), "public", csvFile);
    const csvText = readFileSync(csvPath, "utf-8");

    // Parse CSV
    const parsed = Papa.parse<CSVTransformer>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => {
        // Normalize header names
        const headerMap: Record<string, string> = {
          entitytype: "EntityType",
          id: "ID",
          parentid: "ParentID",
          latitude: "Latitude",
          longitude: "Longitude",
          numdownstreambuildings: "NumDownstreamBuildings",
        };
        return headerMap[header.toLowerCase()] || header;
      },
      transform: (value, field) => {
        if (field === "Latitude" || field === "Longitude") {
          return parseFloat(value) || 0;
        }
        if (field === "NumDownstreamBuildings") {
          return parseInt(value, 10) || 0;
        }
        return value;
      },
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: "CSV parsing errors", errors: parsed.errors },
        { status: 400 }
      );
    }

    // Process the data
    const result = processCSVData(parsed.data);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error processing CSV data:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

