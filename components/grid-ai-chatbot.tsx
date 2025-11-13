"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface GridAIChatbotProps {
  context?: {
    barangay?: string;
    bghiScore?: number;
    status?: string;
    totalTransformers?: number;
    warningTransformers?: number;
    criticalTransformers?: number;
    temperature?: number;
    weatherCondition?: string;
  };
}

export function GridAIChatbot({ context }: GridAIChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<"english" | "filipino">("english");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi there! 👋 I'm GridPulse AI, your friendly neighborhood grid assistant. I can help you understand what's happening with your local electricity grid. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Send only last 10 messages to avoid token limits (5 exchanges)
      const recentHistory = messages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          context,
          conversationHistory: recentHistory,
          language,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again!",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I'm having trouble connecting. Please try again later!",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleLanguage = () => {
    const newLanguage = language === "english" ? "filipino" : "english";
    setLanguage(newLanguage);
    
    // Add system message about language change
    const langMessage: Message = {
      role: "assistant",
      content: newLanguage === "filipino" 
        ? "Switched to Filipino! Magtanong ka lang sa akin tungkol sa ating kuryente. 🇵🇭"
        : "Switched to English! Ask me anything about your electricity grid. 🇺🇸",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, langMessage]);
  };

  const suggestedQuestions = language === "english" 
    ? [
        "What's BGHI and why should I care?",
        "Is my power safe right now?",
        "Why does hot weather cause brownouts?",
        "How can I save on electricity?",
      ]
    : [
        "Ano ang BGHI at bakit importante?",
        "Safe ba ang kuryente ko ngayon?",
        "Bakit nauubusan ng kuryente pag mainit?",
        "Paano makakatipid sa kuryente?",
      ];

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-orange-500 hover:bg-orange-600 shadow-lg z-50"
          size="icon"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl z-50 flex flex-col">
          <CardHeader className="bg-orange-500 text-white rounded-t-lg flex flex-row items-center justify-between py-3">
            <div className="flex items-center space-x-2">
              <MessageCircle className="h-5 w-5" />
              <CardTitle className="text-lg">GridPulse AI</CardTitle>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleLanguage}
                className="text-white hover:bg-orange-600 h-8 w-8"
                title={`Switch to ${language === "english" ? "Filipino" : "English"}`}
              >
                <Languages className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-orange-600 h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}

            {/* Suggested Questions (only show at start) */}
            {messages.length === 1 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-semibold">Try asking:</p>
                {suggestedQuestions.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(question);
                    }}
                    className="block w-full text-left text-xs bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md p-2 text-gray-700 dark:text-gray-300"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </CardContent>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-800"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="bg-orange-500 hover:bg-orange-600"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
