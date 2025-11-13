# GridPulse - Energy Consumption Monitoring Platform

GridPulse is a comprehensive energy monitoring and analytics platform for Meralco, Barangay administrators, and consumers. It provides real-time grid health monitoring, transformer load analytics, weather-based predictive insights, and smart meter data visualization.

## Grid Health Index (BGHI)

The **GHI** is a composite metric (0-100 scale) that evaluates the overall health of a barangay's electrical grid infrastructure. Unlike simple averages, BGHI uses a **weighted aggregate approach** that accounts for both the severity of issues and the number of households affected.

### How BGHI Works

#### Per-Transformer Calculation

Each transformer receives an individual BGHI score based on six weighted components:

**1. Load Stress (35% weight)** - Primary failure indicator
- **Formula**: `((loadPct - 70) / 30) × 100` if >70%, else 0
- **Justification**: According to IEEE C57.91 (Transformer Loading Guide) and Meralco operational standards, transformer overload is the **primary cause of equipment failure**. Operating above 70% capacity exponentially increases failure risk due to thermal stress and insulation degradation. Weighted at 35% because it's the most direct predictor of catastrophic failure.

**2. Outage Score (25% weight)** - Reliability metric
- **Formula**: `(outageMinutes / 60) × 100`
- **Justification**: Service reliability is Meralco's core KPI as mandated by the Energy Regulatory Commission (ERC). Frequent outages indicate systemic issues—loose connections, vegetation interference, or equipment degradation. Weighted at 25% because reliability directly impacts customer satisfaction and regulatory compliance.

**3. Power Quality (15% weight)** - Equipment longevity
- **Formula**: `spikeEvents24h × 5` (capped at 100)
- **Detection**: Statistical anomaly detection using 3-sigma threshold on rolling window
- **Justification**: Based on EPRI (Electric Power Research Institute) power quality standards, voltage spikes cause premature equipment aging and customer complaints. Industry studies show poor power quality reduces transformer lifespan by 20-30%. Weighted at 15% as it's a leading indicator of equipment stress.

**4. Anomaly Frequency (10% weight)** - Early warning system
- **Formula**: `(anomalyCount / 10) × 100`
- **Detectors**: 4 types (Spike, Sustained Overdraw, Outage, Feeder Mismatch)
- **Justification**: Anomalies are early warning indicators. A transformer with frequent anomalies needs proactive maintenance before catastrophic failure. Weighted at 10% as it complements other metrics by detecting unusual patterns.

**5. Environmental Stress (10% weight)** - Climate impact
- **Formula**: `((temp - 30) / 15) × 100` if >30°C, multiplied by humidity factor if >70%
- **Data Source**: Real-time from OpenWeatherMap API
- **Justification**: Ambient temperature above 30°C degrades transformer oil viscosity and cooling efficiency. The Philippines' tropical climate makes this critical—transformers are designed for 30°C ambient but frequently operate at 35-40°C. High humidity (>70%) compounds thermal stress by reducing heat dissipation.

**6. Mismatch Score (5% weight)** - Distribution efficiency
- **Formula**: `(|difference| / feederPower / 0.3) × 100`
- **Justification**: Small discrepancies (<10%) are normal due to line losses. Only severe mismatches (>30%) indicate theft or equipment malfunction. Weighted lowest (5%) because it's a secondary indicator that requires additional investigation.

**Final Per-Transformer BGHI**: `100 - (weighted sum of deterioration factors)`

#### Barangay-Level Aggregation

The barangay BGHI is **not** a simple average. It uses a **weighted aggregate** that reflects grid system dynamics:

**Formula**:
```
Barangay BGHI = Σ(Transformer BGHI × Households × Urgency Multiplier) / Σ(Weights)

Where:
- Households = NumDownstreamBuildings (impact weight)
- Urgency Multiplier = 3.0 for Critical, 1.5 for Warning, 1.0 for Good
```

**Why Weighted Aggregate?**

Electrical grids are **interdependent systems**, not independent components. A simple average would hide critical issues:

**Example**:
- 9 healthy transformers (BGHI=100) serving 200 homes each
- 1 critical transformer (BGHI=45) serving 500 homes

**Simple Average**: `(9×100 + 1×45) / 10 = 94.5 "Good"` ❌ Misleading!
- Ignores that 500 households are at risk
- Treats all transformers equally despite different impacts

**Weighted Aggregate**: 
```
Numerator: (9×100×200×1.0) + (1×45×500×3.0) = 180,000 + 67,500 = 247,500
Denominator: (9×200×1.0) + (1×500×3.0) = 1,800 + 1,500 = 3,300
BGHI: 247,500 / 3,300 = 75.0 "Warning"
```
✅ Correctly identifies system risk!

**Status Thresholds**:
- **Good** (80-100): Grid is healthy, no immediate concerns
- **Warning** (60-79): Elevated risk, proactive intervention recommended
- **Critical** (<60): Grid at risk, immediate action required

**Escalation Rule**: If ≥30% of transformers are in Warning state, the barangay status escalates to Warning regardless of score, reflecting systemic vulnerability.

### Technical Implementation

BGHI calculation runs every 15 seconds with:
- Rolling window statistics (1-hour mean/stddev for spike detection)
- Real-time weather API integration
- 24-hour historical data retention
- EWMA forecasting for predictive alerts

### References

- IEEE C57.91-2011: IEEE Guide for Loading Mineral-Oil-Immersed Transformers
- ERC Resolution No. 11, Series of 2004: Philippine Distribution Code
- EPRI 1001665: Power Quality Application Guide

## Features

- **Multi-Level Dashboards**: Role-based dashboards for Meralco, Barangay, and Consumer users
- **Interactive Maps**: Visualize transformers and households on interactive maps with real-time grid health indicators
- **Analytics & Insights**: Track consumption trends, grid health metrics, and predictive insights
- **Real Weather Integration**: Live weather data from OpenWeatherMap API for accurate predictions
- **Smart Meter Visualization**: Detailed consumption tracking for consumers
- **Dark Mode Support**: Full dark mode support with theme switching
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Charts**: Recharts
- **Maps**: Leaflet with React-Leaflet
- **Authentication**: JWT-based authentication
- **Backend**: Next.js API Routes

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - Copy `.env.local.example` or create `.env.local`
   - Add your OpenWeatherMap API key (get free key at https://openweathermap.org/api)
   ```
   OPENWEATHER_API_KEY=your_api_key_here
   JWT_SECRET=your-secret-key-here
   ```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Login Credentials

### Meralco Admin
- Email: `meralco@gridpulse.com`
- Password: `meralco123`
- User Type: `Meralco`

### Barangay Admin
- Email: `barangay@gridpulse.com`
- Password: `barangay123`
- User Type: `Barangay`

### Consumer
- Email: `consumer@gridpulse.com`
- Password: `consumer123`
- User Type: `Consumer`

## Project Structure

```
HMeralco/
├── app/
│   ├── api/              # API routes
│   ├── dashboard/         # Dashboard pages
│   ├── login/            # Login page
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Landing page
│   └── globals.css       # Global styles
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── dashboard-layout.tsx
│   └── map-view.tsx
├── lib/
│   ├── auth.ts           # Authentication utilities
│   ├── mock-data.ts      # Mock data generators
│   └── utils.ts          # Utility functions
└── middleware.ts         # Route protection
```

## API Endpoints

- `POST /api/login` - User authentication
- `GET /api/grid?city={city}` - Get grid data for a city
- `GET /api/transformers?city={city}&barangay={barangay}` - Get transformers
- `GET /api/weather?city={city}` - Get weather data
- `GET /api/smartmeter?consumerId={id}` - Get smart meter data

## Features by User Type

### Meralco Dashboard
- City selector for viewing different regions
- Interactive map with all transformers and households
- Transformer load monitoring
- Weather-based grid health predictions
- Predictive insights and recommendations
- Comprehensive analytics charts

### Barangay Dashboard
- Barangay-specific grid view
- Transformer monitoring for the barangay
- Grid health indicators
- Predictive insights for local area
- Load distribution analytics

### Consumer Dashboard
- Real-time consumption display
- Daily, weekly, and monthly consumption trends
- Comparison to average household usage
- Detailed consumption statistics
- Interactive charts and visualizations

## Development

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables

Create a `.env.local` file for production:

```
JWT_SECRET=your-secret-key-here
```

## Future Enhancements

- Real database integration (MongoDB/PostgreSQL)
- Real-time data updates via WebSockets
- Integration with actual weather APIs
- Advanced machine learning predictions
- Mobile app support
- Export functionality for reports
- Notification system

## License

MIT

