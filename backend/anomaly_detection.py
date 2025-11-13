"""
Anomaly Detection Module
Rule-based detectors for real-time grid anomalies
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
import numpy as np


@dataclass
class AnomalyEvidence:
    """Evidence supporting an anomaly detection"""
    mean: float
    std: float
    z_score: float
    duration_seconds: float
    threshold: float
    samples_analyzed: int


@dataclass
class Anomaly:
    """Detected anomaly with metadata"""
    anomaly_type: str
    zone_id: str
    timestamp: datetime
    severity: str  # "HIGH", "MEDIUM", "LOW"
    confidence: float
    evidence: AnomalyEvidence
    recommended_action: str


class RollingWindowStats:
    """Maintains rolling statistics for time series data"""
    
    def __init__(self, window_size: int = 60):
        self.window_size = window_size
        self.values: List[float] = []
        self.timestamps: List[datetime] = []
    
    def add(self, value: float, timestamp: datetime):
        """Add new value to rolling window"""
        self.values.append(value)
        self.timestamps.append(timestamp)
        
        # Keep only recent values
        if len(self.values) > self.window_size:
            self.values.pop(0)
            self.timestamps.pop(0)
    
    def mean(self) -> float:
        """Calculate mean of window"""
        return np.mean(self.values) if self.values else 0.0
    
    def std(self) -> float:
        """Calculate standard deviation of window"""
        return np.std(self.values) if len(self.values) > 1 else 0.0
    
    def min(self) -> float:
        """Get minimum value in window"""
        return min(self.values) if self.values else 0.0
    
    def max(self) -> float:
        """Get maximum value in window"""
        return max(self.values) if self.values else 0.0
    
    def latest(self) -> Optional[float]:
        """Get most recent value"""
        return self.values[-1] if self.values else None


class SpikeDetector:
    """Detects sudden spikes in power consumption"""
    
    def __init__(
        self,
        z_threshold: float = 3.0,
        persistence_samples: int = 3,
        absolute_min_w: float = 50.0
    ):
        self.z_threshold = z_threshold
        self.persistence_samples = persistence_samples
        self.absolute_min_w = absolute_min_w
        self.spike_counter = 0
    
    def detect(
        self,
        current_value: float,
        rolling_stats: RollingWindowStats,
        zone_id: str
    ) -> Optional[Anomaly]:
        """
        Detect spike: current value significantly above rolling mean
        
        Args:
            current_value: Latest power reading (W)
            rolling_stats: Historical statistics
            zone_id: Zone identifier
        
        Returns:
            Anomaly object if spike detected, None otherwise
        """
        mean = rolling_stats.mean()
        std = rolling_stats.std()
        
        # Calculate threshold
        threshold = max(self.absolute_min_w, mean + self.z_threshold * std)
        
        # Check if spike condition met
        if current_value > threshold:
            self.spike_counter += 1
        else:
            self.spike_counter = 0
        
        # Require persistence
        if self.spike_counter >= self.persistence_samples:
            z_score = (current_value - mean) / std if std > 0 else 0
            
            evidence = AnomalyEvidence(
                mean=mean,
                std=std,
                z_score=z_score,
                duration_seconds=self.spike_counter * 5.0,  # Assuming 5s samples
                threshold=threshold,
                samples_analyzed=len(rolling_stats.values)
            )
            
            # Determine severity
            if z_score >= 5.0:
                severity = "HIGH"
            elif z_score >= 3.5:
                severity = "MEDIUM"
            else:
                severity = "LOW"
            
            confidence = min(0.95, 0.5 + (z_score / 10))
            
            self.spike_counter = 0  # Reset after detection
            
            return Anomaly(
                anomaly_type="SPIKE",
                zone_id=zone_id,
                timestamp=datetime.utcnow(),
                severity=severity,
                confidence=confidence,
                evidence=evidence,
                recommended_action="Investigate sudden load increase. Check for equipment malfunction or unauthorized connection."
            )
        
        return None


class SustainedOverdrawDetector:
    """Detects sustained high power consumption above baseline"""
    
    def __init__(
        self,
        overdraw_threshold: float = 1.2,
        min_duration_seconds: float = 600.0  # 10 minutes
    ):
        self.overdraw_threshold = overdraw_threshold
        self.min_duration_seconds = min_duration_seconds
        self.overdraw_start: Optional[datetime] = None
        self.baseline_mean: Optional[float] = None
    
    def detect(
        self,
        current_value: float,
        rolling_mean_10min: float,
        baseline_hourly_mean: float,
        zone_id: str
    ) -> Optional[Anomaly]:
        """
        Detect sustained overdraw: rolling mean significantly above baseline
        
        Args:
            current_value: Latest power reading
            rolling_mean_10min: 10-minute rolling mean
            baseline_hourly_mean: Expected baseline for current hour
            zone_id: Zone identifier
        
        Returns:
            Anomaly if sustained overdraw detected
        """
        threshold = baseline_hourly_mean * self.overdraw_threshold
        
        if rolling_mean_10min > threshold:
            if self.overdraw_start is None:
                self.overdraw_start = datetime.utcnow()
                self.baseline_mean = baseline_hourly_mean
            
            # Check duration
            duration = (datetime.utcnow() - self.overdraw_start).total_seconds()
            
            if duration >= self.min_duration_seconds:
                overdraw_ratio = rolling_mean_10min / baseline_hourly_mean
                
                evidence = AnomalyEvidence(
                    mean=rolling_mean_10min,
                    std=0.0,  # Not applicable for this detector
                    z_score=0.0,
                    duration_seconds=duration,
                    threshold=threshold,
                    samples_analyzed=0
                )
                
                # Determine severity based on overdraw magnitude
                if overdraw_ratio >= 1.5:
                    severity = "HIGH"
                elif overdraw_ratio >= 1.3:
                    severity = "MEDIUM"
                else:
                    severity = "LOW"
                
                confidence = min(0.90, 0.6 + (duration / 3600))
                
                # Don't reset immediately - allow for continued monitoring
                
                return Anomaly(
                    anomaly_type="SUSTAINED_OVERDRAW",
                    zone_id=zone_id,
                    timestamp=datetime.utcnow(),
                    severity=severity,
                    confidence=confidence,
                    evidence=evidence,
                    recommended_action="Sustained high load detected. Consider load management or capacity upgrade."
                )
        else:
            # Reset if condition no longer met
            self.overdraw_start = None
            self.baseline_mean = None
        
        return None


class OutageDetector:
    """
    Detects power outages (total loss of supply)
    
    Spec: P_inst <= 5W continuously for >= T_outage
    - Production: T_outage = 1800s (30 min)
    - Demo: T_outage = 6-30s (fast feedback)
    """
    
    def __init__(
        self,
        outage_threshold_w: float = 5.0,  # Per spec: P_min = 5W
        min_duration_seconds: float = 30.0,  # Demo mode: 30s (use 1800 for production)
        min_consecutive_samples: int = 3  # Require at least 3 consecutive low readings
    ):
        self.outage_threshold_w = outage_threshold_w
        self.min_duration_seconds = min_duration_seconds
        self.min_consecutive_samples = min_consecutive_samples
        self.outage_start: Optional[datetime] = None
        self.consecutive_low_readings = 0
        self.last_alert_time: Optional[datetime] = None  # Prevent spam
        self.alert_cooldown_seconds = 300.0  # 5 min cooldown between alerts
    
    def detect(
        self,
        current_value: float,
        zone_id: str
    ) -> Optional[Anomaly]:
        """
        Detect outage: power below threshold for sustained period
        
        Spec compliance:
        - Triggers when P_inst <= 5W continuously for >= T_outage seconds
        - Requires multiple consecutive samples to avoid single bad readings
        - Has cooldown period to prevent alert spam
        
        Args:
            current_value: Latest power reading (W)
            zone_id: Zone identifier
        
        Returns:
            Anomaly if outage detected, None otherwise
        """
        # Check cooldown (prevent spamming same outage alert)
        if self.last_alert_time is not None:
            time_since_last = (datetime.utcnow() - self.last_alert_time).total_seconds()
            if time_since_last < self.alert_cooldown_seconds:
                return None  # Still in cooldown period
        
        if current_value <= self.outage_threshold_w:
            self.consecutive_low_readings += 1
            
            if self.outage_start is None:
                self.outage_start = datetime.utcnow()
            
            duration = (datetime.utcnow() - self.outage_start).total_seconds()
            
            # Per spec: continuous low power for >= T_outage AND multiple samples
            if (duration >= self.min_duration_seconds and 
                self.consecutive_low_readings >= self.min_consecutive_samples):
                
                evidence = AnomalyEvidence(
                    mean=current_value,
                    std=0.0,
                    z_score=0.0,
                    duration_seconds=duration,
                    threshold=self.outage_threshold_w,
                    samples_analyzed=self.consecutive_low_readings
                )
                
                # Outages are always high severity
                severity = "HIGH"
                confidence = 0.95
                
                # Set cooldown and reset counters
                self.last_alert_time = datetime.utcnow()
                self.outage_start = None
                self.consecutive_low_readings = 0
                
                return Anomaly(
                    anomaly_type="OUTAGE",
                    zone_id=zone_id,
                    timestamp=datetime.utcnow(),
                    severity=severity,
                    confidence=confidence,
                    evidence=evidence,
                    recommended_action="Power outage detected. Dispatch crew immediately. Notify affected residents."
                )
        else:
            # Power restored - reset all counters and clear cooldown
            self.outage_start = None
            self.consecutive_low_readings = 0
            self.last_alert_time = None  # Clear cooldown when power restored
        
        return None


class MismatchDetector:
    """Detects feeder-to-node power mismatch (potential NTL)"""
    
    def __init__(
        self,
        mismatch_threshold: float = 0.12,
        min_duration_seconds: float = 1800.0  # 30 minutes
    ):
        self.mismatch_threshold = mismatch_threshold
        self.min_duration_seconds = min_duration_seconds
        self.mismatch_start: Optional[datetime] = None
    
    def detect(
        self,
        feeder_power: float,
        sum_node_power: float,
        zone_id: str
    ) -> Optional[Anomaly]:
        """
        Detect mismatch: significant difference between feeder and sum of nodes
        
        Args:
            feeder_power: Power measured at feeder (W)
            sum_node_power: Sum of all node measurements (W)
            zone_id: Zone identifier
        
        Returns:
            Anomaly if persistent mismatch detected
        """
        if feeder_power < 1.0:  # Avoid division by zero
            return None
        
        mismatch_ratio = abs(feeder_power - sum_node_power) / feeder_power
        
        if mismatch_ratio >= self.mismatch_threshold:
            if self.mismatch_start is None:
                self.mismatch_start = datetime.utcnow()
            
            duration = (datetime.utcnow() - self.mismatch_start).total_seconds()
            
            if duration >= self.min_duration_seconds:
                evidence = AnomalyEvidence(
                    mean=mismatch_ratio,
                    std=0.0,
                    z_score=0.0,
                    duration_seconds=duration,
                    threshold=self.mismatch_threshold,
                    samples_analyzed=0
                )
                
                # High mismatch is more severe
                if mismatch_ratio >= 0.25:
                    severity = "HIGH"
                elif mismatch_ratio >= 0.18:
                    severity = "MEDIUM"
                else:
                    severity = "LOW"
                
                confidence = min(0.85, 0.5 + (duration / 7200))
                
                return Anomaly(
                    anomaly_type="METER_MISMATCH",
                    zone_id=zone_id,
                    timestamp=datetime.utcnow(),
                    severity=severity,
                    confidence=confidence,
                    evidence=evidence,
                    recommended_action="Significant mismatch detected. Possible NTL or meter calibration issue. Schedule investigation."
                )
        else:
            self.mismatch_start = None
        
        return None


# Example usage
if __name__ == "__main__":
    print("Anomaly Detection Module - Test")
    
    # Simulate spike detection
    detector = SpikeDetector()
    stats = RollingWindowStats(window_size=30)
    
    # Add normal readings
    for i in range(30):
        stats.add(100.0 + np.random.normal(0, 5), datetime.utcnow())
    
    # Add spike
    anomaly = detector.detect(200.0, stats, "BGY-001")
    if anomaly:
        print(f"Detected: {anomaly.anomaly_type} with {anomaly.confidence:.2%} confidence")
