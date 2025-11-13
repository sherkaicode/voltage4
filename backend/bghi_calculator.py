"""
BGHI (Barangay Grid Health Index) Calculation Module
Computes the 0-100 health score from component sub-scores
"""

from dataclasses import dataclass
from typing import Dict
import numpy as np


@dataclass
class BGHIWeights:
    """Configurable weights for BGHI components (must sum to 1.0)"""
    load_stress: float = 0.35
    outage_score: float = 0.25
    power_quality: float = 0.15
    anomaly_frequency: float = 0.10
    environmental_stress: float = 0.10
    mismatch_score: float = 0.05


def clamp(value: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    """Clamp value between min and max"""
    return max(min_val, min(max_val, value))


def compute_load_stress(
    transformer_load_pct: float,
    safe_threshold: float = 70.0,
    critical_threshold: float = 100.0
) -> float:
    """
    Compute LoadStressScore (LS)
    
    Args:
        transformer_load_pct: Current load as percentage of capacity
        safe_threshold: Percentage where stress begins (default 70%)
        critical_threshold: Percentage at maximum stress (default 100%)
    
    Returns:
        Score from 0 (no stress) to 100 (critical stress)
    """
    if transformer_load_pct <= safe_threshold:
        return 0.0
    
    stress_range = critical_threshold - safe_threshold
    ls = ((transformer_load_pct - safe_threshold) / stress_range) * 100
    return clamp(ls, 0, 100)


def compute_outage_score(
    outage_minutes_24h: float,
    max_outage_minutes: float = 60.0
) -> float:
    """
    Compute OutageScore (OS)
    
    Args:
        outage_minutes_24h: Total outage time in last 24 hours
        max_outage_minutes: Minutes that result in score of 100 (default 60 min)
    
    Returns:
        Score from 0 (no outages) to 100 (sustained outages)
    """
    os = (outage_minutes_24h / max_outage_minutes) * 100
    return clamp(os, 0, 100)


def compute_power_quality_score(
    voltage_deviation_pct: float = None,
    events_last_24h: int = 0
) -> float:
    """
    Compute PowerQualityScore (PQ)
    
    Args:
        voltage_deviation_pct: Percentage of time voltage outside acceptable range
        events_last_24h: Number of power quality events (if voltage not available)
    
    Returns:
        Score from 0 (good quality) to 100 (poor quality)
    """
    if voltage_deviation_pct is not None:
        pq = voltage_deviation_pct * 100
    else:
        # Proxy: use spike counts
        pq = min(100, events_last_24h * 5)
    
    return clamp(pq, 0, 100)


def compute_anomaly_frequency_score(
    events_last_24h: int,
    max_events: int = 10
) -> float:
    """
    Compute AnomalyFrequencyScore (AF)
    
    Args:
        events_last_24h: Number of anomaly events detected in last 24h
        max_events: Number of events that result in score of 100
    
    Returns:
        Score from 0 (no anomalies) to 100 (frequent anomalies)
    """
    af = (events_last_24h / max_events) * 100
    return clamp(af, 0, 100)


def compute_environmental_stress_score(
    ambient_temp_c: float,
    humidity_pct: float = None,
    temp_safe_threshold: float = 30.0,
    temp_critical_threshold: float = 45.0
) -> float:
    """
    Compute EnvironmentalStressScore (ES)
    
    Args:
        ambient_temp_c: Current ambient temperature in Celsius
        humidity_pct: Optional humidity percentage
        temp_safe_threshold: Temperature where stress begins (default 30°C)
        temp_critical_threshold: Temperature at maximum stress (default 45°C)
    
    Returns:
        Score from 0 (ideal conditions) to 100 (harsh conditions)
    """
    # Temperature component
    if ambient_temp_c <= temp_safe_threshold:
        temp_score = 0.0
    else:
        temp_range = temp_critical_threshold - temp_safe_threshold
        temp_score = ((ambient_temp_c - temp_safe_threshold) / temp_range) * 100
    
    # Optional: factor in humidity (high humidity increases stress)
    if humidity_pct is not None:
        humidity_factor = 1.0 + (max(0, humidity_pct - 70) / 100)
        temp_score *= humidity_factor
    
    return clamp(temp_score, 0, 100)


def compute_mismatch_score(
    mismatch_ratio: float,
    max_mismatch: float = 0.3
) -> float:
    """
    Compute MismatchScore (MS) - indicates potential NTL or measurement issues
    
    Args:
        mismatch_ratio: (feeder_meter - sum_nodes) / max(feeder_meter, epsilon)
        max_mismatch: Ratio that results in score of 100 (default 0.3 = 30%)
    
    Returns:
        Score from 0 (no mismatch) to 100 (significant mismatch)
    """
    ms = (abs(mismatch_ratio) / max_mismatch) * 100
    return clamp(ms, 0, 100)


def calculate_bghi(
    load_stress: float,
    outage_score: float,
    power_quality: float,
    anomaly_frequency: float,
    environmental_stress: float,
    mismatch_score: float,
    weights: BGHIWeights = None
) -> Dict[str, float]:
    """
    Calculate final BGHI score from component scores
    
    Args:
        All component scores (0-100)
        weights: Optional custom weights (default uses standard weights)
    
    Returns:
        Dictionary with 'bghi_score', 'deterioration', and 'status'
    """
    if weights is None:
        weights = BGHIWeights()
    
    # Calculate weighted deterioration
    deterioration = (
        weights.load_stress * load_stress +
        weights.outage_score * outage_score +
        weights.power_quality * power_quality +
        weights.anomaly_frequency * anomaly_frequency +
        weights.environmental_stress * environmental_stress +
        weights.mismatch_score * mismatch_score
    )
    
    # BGHI is inverse of deterioration
    bghi_score = 100 - deterioration
    
    # Determine health status
    if bghi_score >= 80:
        status = "Good"
        color = "green"
    elif bghi_score >= 60:
        status = "Warning"
        color = "amber"
    else:
        status = "Critical"
        color = "red"
    
    return {
        "bghi_score": round(bghi_score, 2),
        "deterioration": round(deterioration, 2),
        "status": status,
        "color": color
    }


# Example usage and testing
if __name__ == "__main__":
    # Example calculation
    components = {
        "load_stress": compute_load_stress(85.0),  # 85% load
        "outage_score": compute_outage_score(15.0),  # 15 min outage
        "power_quality": compute_power_quality_score(events_last_24h=3),
        "anomaly_frequency": compute_anomaly_frequency_score(5),
        "environmental_stress": compute_environmental_stress_score(35.0),
        "mismatch_score": compute_mismatch_score(0.08)
    }
    
    result = calculate_bghi(**components)
    
    print("BGHI Calculation Example:")
    print(f"  Load Stress: {components['load_stress']:.2f}")
    print(f"  Outage Score: {components['outage_score']:.2f}")
    print(f"  Power Quality: {components['power_quality']:.2f}")
    print(f"  Anomaly Frequency: {components['anomaly_frequency']:.2f}")
    print(f"  Environmental Stress: {components['environmental_stress']:.2f}")
    print(f"  Mismatch Score: {components['mismatch_score']:.2f}")
    print(f"\nFinal BGHI: {result['bghi_score']:.2f} ({result['status']})")
