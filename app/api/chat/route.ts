import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export async function POST(request: Request) {
  try {
    const { message, context, conversationHistory = [], language = "english" } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 }
      );
    }

    // Build context-aware system prompt
    const languageInstruction = language === "filipino" 
      ? "IMPORTANT: Respond ONLY in Filipino (Tagalog). Use natural Filipino expressions and be culturally relevant."
      : "IMPORTANT: Respond ONLY in English. Be clear and conversational.";

    const systemPrompt = `You are GridPulse AI, a friendly and conversational assistant helping residents understand their local electrical grid health. You have a warm personality and remember what users have asked you before.

${languageInstruction}

Current Grid Status (Real-time):
- Barangay: ${context?.barangay || "Quezon City"}
- BGHI Score: ${context?.bghiScore || "N/A"} (${context?.status || "Unknown"})
- Grid Status: ${context?.status || "Unknown"}
- Active Transformers: ${context?.totalTransformers || "N/A"}
- Warning Transformers: ${context?.warningTransformers || 0}
- Critical Transformers: ${context?.criticalTransformers || 0}
- Current Temperature: ${context?.temperature || "N/A"}°C
- Weather: ${context?.weatherCondition || "N/A"}

Your conversational style:
- Be warm, empathetic, and relatable (like talking to a helpful neighbor)
- Reference previous questions in the conversation naturally
- Share quick analogies ("Think of BGHI like a health score for your neighborhood's power")
- Give actionable tips ("Try running appliances after 9 PM when it's cooler")
- Show concern when grid status is critical ("I see some transformers need attention...")
- Celebrate good status ("Great news! Your grid is healthy today!")

Your expertise:
1. Explain BGHI (Barangay Grid Health Index) in simple terms
2. Help users understand what the numbers mean for their daily life
3. Provide safety tips and energy-saving advice
4. Explain weather impacts on power (heat = more AC = more load)
5. Help users know when to report issues to Meralco

Guidelines:
- Keep responses conversational but informative (2-4 sentences)
- Reference current grid data when relevant ("I see your BGHI is ${context?.bghiScore}...")
- Remember context from previous messages in this conversation
- End with a question or helpful tip to keep conversation flowing
- If user seems worried, reassure them with actionable steps`;;

    // Build message history with system prompt + conversation history + new message
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    const completion = await groq.chat.completions.create({
      messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.8, // Slightly higher for more conversational responses
      max_tokens: 350,
      top_p: 0.95,
      frequency_penalty: 0.3, // Reduce repetition
      presence_penalty: 0.2, // Encourage diverse responses
    });

    const response = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

    return NextResponse.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    
    // Provide helpful error messages
    if (error?.message?.includes("API key")) {
      return NextResponse.json(
        { success: false, error: "AI service not configured. Please add GROQ_API_KEY to environment." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to process chat request. Please try again." },
      { status: 500 }
    );
  }
}
