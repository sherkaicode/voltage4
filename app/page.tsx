"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BarChart3, MapPin, Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="bg-white backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img
              src="/icons/meralcodark.svg"
              alt="Meralco logo"
              className="w-40 h-20 text-[#ff7a1a]"
            />
            {/* <Zap className="h-8 w-8 text-[#ff7a1a]" /> */}
            {/* <span className="text-2xl font-bold text-[#ff7a1a]">
              GridPulse
            </span> */}
          </div>
          <div className="flex items-center space-x-4 pr-20">
            {/* <Link
              href="/"
              className="text-[#ff7a1a] hover:text-orange-500 transition-colors"
            >
              Home
            </Link>
            <Link
              href="#about"
              className="text-[#ff7a1a] hover:text-orange-500 transition-colors"
            >
              About
            </Link> */}
            <Link href="/login">
              <Button
                className="bg-white hover:bg-[#ff7a1a] text-[#ff7a1a] border-[3px] hover:text-white border-[#ff7a1a] hover: rounded-full px-10 py-5 text-lg"
              >
                Login
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-[#ff7a1a] container mx-auto px-4 pt-10 pb-5 text-center rounded-t-[100px]">
        <div className="max-w-4xl mx-auto">
          {/* <h1 className="text-6xl font-bold text-white mb-6">
            GridPulse
          </h1> */}
          <div className="flex items-center justify-center">
            <img
              src="/icons/gridpulselight.svg"
              alt="Gridpulse Logo"
              className="w-full max-w-[600px] h-auto object-contain py-10"
            />
          </div>
          <p className="text-2xl text-white mb-4 font-semibold">
            Powering Smarter Energy Insights
          </p>
          <p className="text-sm text-white mb-8 max-w-3xl mx-auto">
            A comprehensive energy monitoring and analytics platform for Meralco,
            Barangay administrators, and consumers.<br></br> Monitor grid health,
            transformer loads, and consumption patterns in real-time.
          </p>
          {/* <div className="flex gap-4 justify-center">
            <Link href="/login">
              <Button
                size="lg"
                className="bg-[#ff7a1a] hover:bg-orange-600 text-white"
              >
                Get Started
              </Button>
            </Link>
            <Link href="#about">
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-[#ff7a1a] text-[#ff7a1a] hover:bg-orange-50"
              >
                Learn More
              </Button>
            </Link>
          </div> */}
        </div>
      </section>

      {/* Features Section */}
      <section id="about" className="container mx-auto px-4 bg-[#ff7a1a]">
        {/* <h2 className="text-4xl font-bold text-center mb-12 text-[#ff7a1a]">
          Key Features
        </h2> */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="group bg-white p-6 rounded-lg shadow-lg border border-[#ff7a1a] hover:bg-[#ff7a1a] transition-all hover:scale-105">
            <MapPin className="h-12 w-12 text-[#ff7a1a] mb-4 group-hover:text-white" />
            <h3 className="text-xl font-semibold mb-2 text-[#ff7a1a] group-hover:text-white">
              Interactive Maps
            </h3>
            <p className="text-[#ff7a1a]/90 group-hover:text-white/90">
              Visualize transformers and households on interactive maps with
              real-time grid health indicators.
            </p>
          </div>
          <div className="group bg-white p-6 rounded-lg shadow-lg border border-[#ff7a1a] hover:bg-[#ff7a1a] transition-all hover:scale-105">
            <BarChart3 className="h-12 w-12 text-[#ff7a1a] mb-4 group-hover:text-white" />
            <h3 className="text-xl font-semibold mb-2 text-[#ff7a1a] group-hover:text-white">
              Analytics & Insights
            </h3>
            <p className="text-[#ff7a1a]/90 group-hover:text-white/90">
              Track consumption trends, grid health metrics, and predictive
              insights for better energy management.
            </p>
          </div>
          <div className="group bg-white p-6 rounded-lg shadow-lg border border-[#ff7a1a] hover:bg-[#ff7a1a] transition-all hover:scale-105">
            <Shield className="h-12 w-12 text-[#ff7a1a] mb-4 group-hover:text-white" />
            <h3 className="text-xl font-semibold mb-2 text-[#ff7a1a] group-hover:text-white">
              Multi-Level Access
            </h3>
            <p className="text-[#ff7a1a]/90 group-hover:text-white/90">
              Role-based dashboards for Meralco administrators, Barangay officials,
              and individual consumers.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#ff7a1a]">
        <div className="container mx-auto px-4 text-center text-[white] bg-[#ff7a1a] py-8">
          <p>&copy; 2025 GridPulse. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
