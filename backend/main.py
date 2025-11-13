"""
VOLTAGE Backend - BGHI Algorithm & Anomaly Detection
FastAPI server for real-time grid health monitoring
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uvicorn

# Initialize FastAPI app
app = FastAPI(
    title="VOLTAGE API",
    description="Grid Health Intelligence API for Barangay Early Warning",
    version="1.0.0"
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== Pydantic Models ==========

class NodeReading(BaseModel):
    """Single power reading from a smart meter node"""
    node_id: str
    zone_id: str
    timestamp: datetime
    power_w: float
    voltage_v: Optional[float] = None
    current_a: Optional[float] = None

class BulkReadings(BaseModel):
    """Batch of readings from multiple nodes"""
    readings: List[NodeReading]

class BGHIComponents(BaseModel):
    """Individual components of BGHI score"""
    load_stress: float = Field(..., ge=0, le=100)
    outage_score: float = Field(..., ge=0, le=100)
    power_quality: float = Field(..., ge=0, le=100)
    anomaly_frequency: float = Field(..., ge=0, le=100)
    environmental_stress: float = Field(..., ge=0, le=100)
    mismatch_score: float = Field(..., ge=0, le=100)

class BGHIResponse(BaseModel):
    """BGHI calculation response"""
    zone_id: str
    bghi_score: float = Field(..., ge=0, le=100)
    health_status: str  # "Critical", "Warning", "Good"
    components: BGHIComponents
    timestamp: datetime
    transformer_load_pct: float

class Alert(BaseModel):
    """Anomaly alert structure"""
    alert_id: str
    zone_id: str
    alert_type: str  # "SPIKE", "SUSTAINED_OVERDRAW", "OUTAGE", etc.
    severity: str  # "HIGH", "MEDIUM", "LOW"
    confidence: float = Field(..., ge=0, le=1)
    timestamp: datetime
    evidence: Dict[str, Any]
    predicted_duration_min: Optional[int] = None
    recommended_action: str

class ForecastResponse(BaseModel):
    """24-hour load forecast"""
    zone_id: str
    timestamp: datetime
    predictions: List[Dict[str, Any]]  # List of {hour, predicted_load_kw, risk_ratio}
    max_risk_hour: int
    max_risk_ratio: float
    predictive_alert: Optional[Alert] = None

class EscalateRequest(BaseModel):
    """Request to escalate alert to Meralco HES"""
    alert: Alert
    escalated_by: str
    notes: Optional[str] = None


# ========== API Endpoints ==========

@app.get("/")
async def root():
    """API health check"""
    return {
        "service": "VOLTAGE API",
        "status": "operational",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/readings", status_code=201)
async def ingest_readings(data: BulkReadings):
    """
    Ingest power readings from smart meter nodes
    This endpoint receives telemetry data and triggers processing
    """
    try:
        # TODO: Store readings in database
        # TODO: Trigger anomaly detection
        # TODO: Update rolling statistics
        
        return {
            "status": "success",
            "readings_received": len(data.readings),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bghi/{zone_id}", response_model=BGHIResponse)
async def get_bghi(zone_id: str):
    """
    Calculate and return current BGHI score for a zone
    """
    try:
        # TODO: Implement BGHI calculation from stored data
        # For now, return mock data
        
        components = BGHIComponents(
            load_stress=45.0,
            outage_score=10.0,
            power_quality=20.0,
            anomaly_frequency=15.0,
            environmental_stress=25.0,
            mismatch_score=5.0
        )
        
        # Calculate weighted BGHI (example weights)
        deterioration = (
            0.35 * components.load_stress +
            0.25 * components.outage_score +
            0.15 * components.power_quality +
            0.10 * components.anomaly_frequency +
            0.10 * components.environmental_stress +
            0.05 * components.mismatch_score
        )
        
        bghi_score = 100 - deterioration
        
        # Determine health status
        if bghi_score >= 80:
            health_status = "Good"
        elif bghi_score >= 60:
            health_status = "Warning"
        else:
            health_status = "Critical"
        
        return BGHIResponse(
            zone_id=zone_id,
            bghi_score=bghi_score,
            health_status=health_status,
            components=components,
            timestamp=datetime.utcnow(),
            transformer_load_pct=68.5
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/forecast/{zone_id}", response_model=ForecastResponse)
async def get_forecast(zone_id: str):
    """
    Get 24-hour load forecast with predictive overload detection
    """
    try:
        # TODO: Implement EWMA forecasting algorithm
        # For now, return mock forecast
        
        predictions = []
        for hour in range(24):
            predictions.append({
                "hour": hour,
                "predicted_load_kw": 75.0 + (hour % 12) * 5,
                "risk_ratio": 0.75 + (hour % 12) * 0.02
            })
        
        return ForecastResponse(
            zone_id=zone_id,
            timestamp=datetime.utcnow(),
            predictions=predictions,
            max_risk_hour=11,
            max_risk_ratio=0.89,
            predictive_alert=None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/alerts/{zone_id}")
async def get_alerts(zone_id: str, limit: int = 10):
    """
    Get recent alerts for a zone
    """
    try:
        # TODO: Query alerts from database
        return {
            "zone_id": zone_id,
            "alerts": [],
            "count": 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/escalate", status_code=201)
async def escalate_alert(request: EscalateRequest, background_tasks: BackgroundTasks):
    """
    Escalate an alert to Meralco HES system
    """
    try:
        # TODO: Implement actual escalation to Meralco API
        # For demo, just log the escalation
        
        return {
            "status": "escalated",
            "alert_id": request.alert.alert_id,
            "escalated_at": datetime.utcnow().isoformat(),
            "escalated_by": request.escalated_by
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/zones")
async def get_zones():
    """
    Get list of all monitored zones
    """
    try:
        # TODO: Query zones from database
        return {
            "zones": [
                {"zone_id": "BGY-001", "name": "Barangay San Antonio", "transformer_capacity_kw": 150},
                {"zone_id": "BGY-002", "name": "Barangay Poblacion", "transformer_capacity_kw": 200},
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    """
    Detailed health check endpoint
    """
    return {
        "status": "healthy",
        "database": "connected",  # TODO: Check actual DB connection
        "ml_models": "loaded",     # TODO: Check model status
        "timestamp": datetime.utcnow().isoformat()
    }


# ========== Startup Event ==========

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    print("🚀 VOLTAGE API starting up...")
    # TODO: Load ML models
    # TODO: Initialize database connection
    # TODO: Load zone configurations
    print("✅ VOLTAGE API ready!")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("🛑 VOLTAGE API shutting down...")
    # TODO: Close database connections
    # TODO: Save state


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
