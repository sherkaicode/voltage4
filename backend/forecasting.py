"""
Load Forecasting Module
EWMA-based 24-hour load prediction with risk assessment
"""

from typing import Dict, List, Optional
from datetime import datetime, timedelta
import numpy as np


class EWMAForecaster:
    """
    Exponentially Weighted Moving Average forecaster
    Combines hourly baseline patterns with recent trends
    """
    
    def __init__(self, alpha: float = 0.5):
        """
        Initialize forecaster
        
        Args:
            alpha: Smoothing parameter (0-1). Higher = more weight to recent data
        """
        self.alpha = alpha
        self.hourly_baseline: Dict[int, float] = {}
    
    def set_baseline(self, hourly_averages: Dict[int, float]):
        """
        Set hourly baseline from historical data
        
        Args:
            hourly_averages: Dict mapping hour (0-23) to average load (kW)
        """
        self.hourly_baseline = hourly_averages
    
    def generate_baseline_from_pattern(
        self,
        peak_hour: int = 19,
        peak_load: float = 150.0,
        base_load: float = 80.0
    ):
        """
        Generate a typical daily pattern for demo/testing
        
        Args:
            peak_hour: Hour of peak demand (default 7 PM)
            peak_load: Peak load in kW
            base_load: Minimum load in kW
        """
        baseline = {}
        for hour in range(24):
            # Simple sinusoidal pattern with peak at specified hour
            phase = (hour - peak_hour) * 2 * np.pi / 24
            variation = (peak_load - base_load) / 2
            baseline[hour] = base_load + variation * (1 + np.cos(phase))
        
        self.hourly_baseline = baseline
    
    def forecast_24h(
        self,
        current_hour: int,
        recent_mean_kw: float,
        transformer_capacity_kw: float
    ) -> List[Dict]:
        """
        Generate 24-hour forecast
        
        Args:
            current_hour: Current hour of day (0-23)
            recent_mean_kw: Recent average load (e.g., last hour mean)
            transformer_capacity_kw: Transformer capacity for risk calculation
        
        Returns:
            List of dicts with predictions for each hour
        """
        if not self.hourly_baseline:
            raise ValueError("Baseline not set. Call set_baseline() first.")
        
        # Calculate adjustment based on recent trend
        baseline_current = self.hourly_baseline[current_hour]
        adjustment = self.alpha * (recent_mean_kw - baseline_current)
        
        predictions = []
        
        for offset in range(24):
            future_hour = (current_hour + offset) % 24
            future_time = datetime.utcnow() + timedelta(hours=offset)
            
            # Base prediction from historical pattern
            baseline_load = self.hourly_baseline[future_hour]
            
            # Apply exponential decay to adjustment over time
            decay_factor = np.exp(-offset / 12)  # Half-life ~8 hours
            adjusted_load = baseline_load + (adjustment * decay_factor)
            
            # Ensure non-negative
            adjusted_load = max(0, adjusted_load)
            
            # Calculate risk ratio
            risk_ratio = adjusted_load / transformer_capacity_kw
            
            predictions.append({
                "hour": future_hour,
                "offset_hours": offset,
                "timestamp": future_time.isoformat(),
                "predicted_load_kw": round(adjusted_load, 2),
                "baseline_load_kw": round(baseline_load, 2),
                "adjustment_kw": round(adjustment * decay_factor, 2),
                "risk_ratio": round(risk_ratio, 3),
                "risk_level": self._classify_risk(risk_ratio)
            })
        
        return predictions
    
    def _classify_risk(self, risk_ratio: float) -> str:
        """Classify risk level based on ratio"""
        if risk_ratio >= 0.90:
            return "CRITICAL"
        elif risk_ratio >= 0.80:
            return "HIGH"
        elif risk_ratio >= 0.70:
            return "MODERATE"
        elif risk_ratio >= 0.50:
            return "LOW"
        else:
            return "MINIMAL"
    
    def find_peak_risk(self, predictions: List[Dict]) -> Dict:
        """
        Find hour with maximum risk
        
        Args:
            predictions: List of prediction dicts
        
        Returns:
            Dict with peak risk information
        """
        if not predictions:
            return {}
        
        peak = max(predictions, key=lambda p: p["risk_ratio"])
        
        return {
            "hour": peak["hour"],
            "offset_hours": peak["offset_hours"],
            "timestamp": peak["timestamp"],
            "predicted_load_kw": peak["predicted_load_kw"],
            "risk_ratio": peak["risk_ratio"],
            "risk_level": peak["risk_level"]
        }
    
    def assess_overload_risk(
        self,
        predictions: List[Dict],
        critical_threshold: float = 0.90,
        min_lead_time_hours: int = 2
    ) -> Optional[Dict]:
        """
        Assess if predictive overload alert should be raised
        
        Args:
            predictions: Forecast predictions
            critical_threshold: Risk ratio threshold for alert
            min_lead_time_hours: Minimum advance warning time required
        
        Returns:
            Alert dict if overload risk detected, None otherwise
        """
        # Find critical hours
        critical_hours = [
            p for p in predictions 
            if p["risk_ratio"] >= critical_threshold 
            and p["offset_hours"] >= min_lead_time_hours
        ]
        
        if not critical_hours:
            return None
        
        # Get earliest critical hour
        first_critical = min(critical_hours, key=lambda p: p["offset_hours"])
        
        # Calculate confidence based on how far above threshold
        excess_ratio = first_critical["risk_ratio"] - critical_threshold
        confidence = min(0.95, 0.6 + (excess_ratio / 0.2))
        
        return {
            "alert_type": "PREDICTIVE_OVERLOAD",
            "first_critical_hour": first_critical["hour"],
            "hours_ahead": first_critical["offset_hours"],
            "predicted_load_kw": first_critical["predicted_load_kw"],
            "risk_ratio": first_critical["risk_ratio"],
            "confidence": round(confidence, 3),
            "critical_hours_count": len(critical_hours),
            "recommended_action": self._generate_recommendation(first_critical)
        }
    
    def _generate_recommendation(self, critical_prediction: Dict) -> str:
        """Generate action recommendation based on prediction"""
        hours_ahead = critical_prediction["offset_hours"]
        risk_ratio = critical_prediction["risk_ratio"]
        
        if risk_ratio >= 0.98:
            action = "URGENT: Pre-stage crew for immediate intervention. "
        elif risk_ratio >= 0.92:
            action = "WARNING: Monitor closely and prepare load management. "
        else:
            action = "ADVISORY: Voluntary load reduction recommended. "
        
        if hours_ahead >= 6:
            timing = f"Expected in {hours_ahead} hours - sufficient time for planned response."
        elif hours_ahead >= 3:
            timing = f"Expected in {hours_ahead} hours - coordinate with barangay officials."
        else:
            timing = f"Expected in {hours_ahead} hours - immediate action required."
        
        return action + timing


class SimpleMovingAverageForecaster:
    """
    Simple baseline forecaster using moving average
    Can be used as fallback or comparison
    """
    
    def __init__(self, window_hours: int = 24):
        self.window_hours = window_hours
        self.history: List[Dict] = []
    
    def add_observation(self, timestamp: datetime, load_kw: float):
        """Add historical observation"""
        self.history.append({
            "timestamp": timestamp,
            "load_kw": load_kw,
            "hour": timestamp.hour
        })
        
        # Keep only recent history
        cutoff = datetime.utcnow() - timedelta(hours=self.window_hours * 2)
        self.history = [h for h in self.history if h["timestamp"] > cutoff]
    
    def forecast_next_hour(self) -> float:
        """Simple forecast: average of same hour in recent days"""
        if not self.history:
            return 0.0
        
        current_hour = datetime.utcnow().hour
        next_hour = (current_hour + 1) % 24
        
        # Get all observations for next hour
        same_hour_obs = [h["load_kw"] for h in self.history if h["hour"] == next_hour]
        
        if not same_hour_obs:
            # Fallback to overall average
            return np.mean([h["load_kw"] for h in self.history])
        
        return np.mean(same_hour_obs)


# Example usage and testing
if __name__ == "__main__":
    print("Load Forecasting Module - Test\n")
    
    # Initialize forecaster
    forecaster = EWMAForecaster(alpha=0.5)
    
    # Generate typical baseline pattern
    forecaster.generate_baseline_from_pattern(
        peak_hour=19,  # 7 PM
        peak_load=150.0,
        base_load=75.0
    )
    
    print("Hourly Baseline Pattern:")
    for hour in range(24):
        print(f"  {hour:02d}:00 - {forecaster.hourly_baseline[hour]:.1f} kW")
    
    # Generate forecast
    current_hour = 14  # 2 PM
    recent_mean = 95.0  # Current load higher than baseline
    capacity = 180.0   # Transformer capacity
    
    print(f"\nCurrent Conditions:")
    print(f"  Hour: {current_hour}:00")
    print(f"  Recent Mean Load: {recent_mean:.1f} kW")
    print(f"  Baseline for Hour: {forecaster.hourly_baseline[current_hour]:.1f} kW")
    print(f"  Transformer Capacity: {capacity:.1f} kW")
    
    predictions = forecaster.forecast_24h(current_hour, recent_mean, capacity)
    
    print(f"\n24-Hour Forecast:")
    for pred in predictions[:12]:  # Show first 12 hours
        print(f"  +{pred['offset_hours']:2d}h ({pred['hour']:02d}:00): "
              f"{pred['predicted_load_kw']:6.1f} kW "
              f"[Risk: {pred['risk_ratio']:.2%} - {pred['risk_level']}]")
    
    # Check for overload risk
    peak_risk = forecaster.find_peak_risk(predictions)
    print(f"\nPeak Risk Hour:")
    print(f"  Hour: {peak_risk['hour']:02d}:00 (+{peak_risk['offset_hours']}h)")
    print(f"  Load: {peak_risk['predicted_load_kw']:.1f} kW")
    print(f"  Risk: {peak_risk['risk_ratio']:.2%} ({peak_risk['risk_level']})")
    
    overload_alert = forecaster.assess_overload_risk(predictions, critical_threshold=0.85)
    if overload_alert:
        print(f"\n⚠️  PREDICTIVE ALERT:")
        print(f"  Type: {overload_alert['alert_type']}")
        print(f"  Hours Ahead: {overload_alert['hours_ahead']}")
        print(f"  Confidence: {overload_alert['confidence']:.2%}")
        print(f"  Action: {overload_alert['recommended_action']}")
    else:
        print(f"\n✓ No overload risk detected")
