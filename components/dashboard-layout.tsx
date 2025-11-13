"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Anomaly } from "@/lib/anomaly";

interface DashboardLayoutProps {
  role: "meralco" | "barangay" | "consumer";
  children: React.ReactNode;
  title: string;
  warnings?: Anomaly[];
}

export function DashboardLayout({ role, children, title, warnings = [] }: DashboardLayoutProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const getBannerSrc = (role: "meralco" | "barangay" | "consumer") => {
    switch (role) {
      case "meralco":
        return "/icons/citywatch.svg";
      case "barangay":
        return "/icons/barangaywatch.svg";
      case "consumer":
        return "/icons/bahaywatch.svg";
      default:
        return "/icons/citywatch.svg";
    }
  };

  const handleLogout = () => {
    document.cookie = "auth-token=; path=/; max-age=0";
    window.location.href = "/login";
  };

  // Get unique high-severity warnings (HIGH and MEDIUM severity)
  const recentWarnings = warnings
    .filter((w) => w.severity === "HIGH" || w.severity === "MEDIUM")
    .slice(-10); // Show last 10 warnings

  return (
    <div className="min-h-screen flex flex-col bg-[#ff7a1a]">
      {/* Top bar */}
      <header className="w-full bg-[#ff7a1a] sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img
              src="/icons/meralcolight.svg"
              alt="Meralco logo"
              className="w-40 h-20 text-[#ff7a1a]"
            />
            {/* <Zap className="h-8 w-8 text-white" /> */}
            {/* heading moved to footer per request */}
          </div>

          <div className="hidden md:flex items-center space-x-4 pr-20">
            {/* Notifications Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative text-white rounded-full">
                  <Bell className="h-5 w-5" />
                  {recentWarnings.length > 0 && (
                    <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                      {recentWarnings.length > 9 ? "9+" : recentWarnings.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <div className="px-4 py-2">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                    Recent Warnings
                  </h3>
                  <p className="text-xs text-gray-500">
                    {recentWarnings.length} active warning
                    {recentWarnings.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <DropdownMenuSeparator />
                {recentWarnings.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto">
                    {recentWarnings.map((warning, idx) => (
                      <div
                        key={`${warning.zoneId}-${warning.timestamp}-${idx}`}
                        className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                      >
                        <div className="flex items-start space-x-3">
                          <AlertTriangle
                            className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                              warning.severity === "HIGH"
                                ? "text-red-500"
                                : "text-amber-500"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {warning.zoneId}
                              </p>
                              <span
                                className={`text-xs font-medium px-2 py-1 rounded ${
                                  warning.severity === "HIGH"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                                }`}
                              >
                                {warning.anomalyType}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              {warning.recommendedAction}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {new Date(warning.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-gray-500">No warnings</p>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme Toggle
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white">
                  {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> */}

            {/* Logout */}
            <Button variant="outline" className="border-[3px] border-white bg-[#ff7a1a] text-white  hover:text-[#ff7a1a] hover:border-white hover: rounded-full px-10 py-5 text-lg" onClick={handleLogout}>
              Exit
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 bg-white">
        <div className ="flex justify-center bg-[#ff7a1a] pb-10 rounded-b-[100px]">
        <img
                src={getBannerSrc(role)}
                alt="Gridpulse Logo"
                className="w-full max-w-[400px] h-auto object-contain"
              />
    </div>
        {title && (
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          </div>
        )}
        <div className="container mx-auto px-4 pb-8">{children}</div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-gray-50 border-t border-gray-200">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-600">
          <p>&copy; 2025 GridPulse. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
