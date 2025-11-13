import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

interface EnergyTipRequest {
  currentLoadKw: number;
  bghiScore: number;
  gridStatus: string;
  forecastPeakKw?: number;
  hoursToOverload?: number;
}

function generateFallbackTips(data: EnergyTipRequest): string[] {
  const tips: string[] = [];
  
  // Grid status based tips
  if (data.bghiScore < 70) {
    tips.push("⚠️ Your local grid is under stress. Reduce non-essential appliance usage for the next 2-3 hours to help prevent outages.");
    tips.push("🌡️ Set your air conditioner to 24°C or higher. Every degree saves 10% energy and helps stabilize the grid.");
    tips.push("💡 Delay using washing machines, dryers, and dishwashers until after 10 PM when grid load typically decreases.");
  } else if (data.bghiScore < 85) {
    tips.push("⏰ Your grid is moderately loaded. Consider shifting heavy appliance use to off-peak hours (10 PM - 6 AM).");
    tips.push("💰 Use energy-efficient LED bulbs. They consume 75% less energy than incandescent bulbs and help reduce grid stress.");
    tips.push("🔌 Unplug devices on standby mode (TVs, chargers, appliances). They consume 5-10% of your monthly bill even when 'off'.");
  } else {
    tips.push("✅ Your grid is healthy! Great time to charge electric vehicles or run energy-intensive appliances.");
    tips.push("🌿 Consider running your laundry, ironing, or other heavy tasks now while grid capacity is available.");
    tips.push("💚 Your area has excellent grid health. Keep up your energy-conscious habits!");
  }
  
  // Forecast-based tips
  if (data.hoursToOverload && data.hoursToOverload <= 4) {
    tips.push(`⚠️ Transformer overload predicted in ${data.hoursToOverload} hours. Reduce AC/heater usage starting now to prevent service interruptions.`);
  } else if (data.forecastPeakKw && data.currentLoadKw > 0) {
    const increaseKw = data.forecastPeakKw - data.currentLoadKw;
    // Only show if increase is significant (> 0.5 kW) and reasonable (< 5 kW)
    if (increaseKw > 0.5 && increaseKw < 5) {
      tips.push(`📈 Your household load is expected to increase by ${increaseKw.toFixed(1)} kW today. Plan energy-intensive tasks during current low-demand period.`);
    }
  }
  
  // Consumption-based tips
  if (data.currentLoadKw > 3) {
    tips.push("🔥 Your current load is high. Check if multiple high-power appliances are running simultaneously (AC, water heater, electric stove).");
  } else if (data.currentLoadKw < 0.5) {
    tips.push("🌟 Excellent! You're consuming minimal power right now. Your energy-conscious behavior helps grid stability.");
  }
  
  // General best practices
  tips.push("💡 Pro tip: Clean your AC filters monthly. Dirty filters increase energy consumption by up to 15%.");
  tips.push("🌞 Use natural lighting during daytime. Open curtains instead of turning on lights to save energy and reduce grid load.");
  
  // Return random 4 tips
  return tips.sort(() => Math.random() - 0.5).slice(0, 4);
}

async function generateAITips(data: EnergyTipRequest): Promise<string[]> {
  if (!groq) {
    return generateFallbackTips(data);
  }

  const prompt = `You are an energy efficiency advisor for GridPulse, helping Filipino households optimize electricity consumption.

Current Context:
- Household Load: ${data.currentLoadKw.toFixed(2)} kW
- Local Grid Health (BGHI): ${data.bghiScore.toFixed(0)}/100 (${data.gridStatus})
${data.forecastPeakKw ? `- Peak Load Forecast: ${data.forecastPeakKw.toFixed(2)} kW` : ''}
${data.hoursToOverload ? `- Transformer Overload Risk: ${data.hoursToOverload} hours` : ''}

Generate 4 personalized energy-saving tips for this household. Each tip should:
1. Start with an emoji
2. Be specific and actionable (not generic advice)
3. Reference the current grid status or load when relevant
4. Be written for Filipino consumers (friendly, practical tone)
5. Include numbers/percentages when possible (e.g., "save 10%", "reduce by 2 kW")

Focus on:
- Immediate actions if grid is stressed (BGHI < 70)
- Smart timing for appliance usage
- Cost savings and grid stability benefits
- Practical Philippine household scenarios (AC, rice cooker, electric fan, water heater)

Format: Return ONLY 4 tips, one per line, no numbering, no extra text.`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      return generateFallbackTips(data);
    }

    const tips = response
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 4);

    return tips.length === 4 ? tips : generateFallbackTips(data);
  } catch (error) {
    console.error("Error generating AI tips:", error);
    return generateFallbackTips(data);
  }
}

export async function POST(request: Request) {
  try {
    const data: EnergyTipRequest = await request.json();

    const tips = await generateAITips(data);

    return NextResponse.json({
      success: true,
      tips,
      usingAI: !!groq,
    });
  } catch (error) {
    console.error("Energy tips API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate energy tips",
        tips: generateFallbackTips({
          currentLoadKw: 2,
          bghiScore: 85,
          gridStatus: "Good",
        }),
      },
      { status: 500 }
    );
  }
}
