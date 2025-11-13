import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import csv

# In kW
MIN_KW = 0.0
MAX_KW = 100.0
BASE = 0.5

class SmartMeter:
    """
    Simulate a smart meter producing instantaneous load (kW) every minute.
    Pattern includes morning/evening peaks, weekday/weekend differences, smoothing,
    and optional temperature influence (AC load) — modelled for the Philippines.
    """

    def __init__(self, meter_id: str, min_kw=MIN_KW, max_kw=MAX_KW, base_kw=BASE):
        self.meter_id = meter_id
        self.min_kw = min_kw
        self.max_kw = max_kw
        self.base_kw = base_kw  # baseline consumption (kW)
        # per-meter randomization to reflect diverse customers
        self.morning_amp = np.random.uniform(0.8, 3.0) * self.base_kw
        self.evening_amp = np.random.uniform(1.0, 4.0) * self.base_kw
        self.noise_scale = np.random.uniform(0.02, 0.15) * max_kw
        self.ac_sensitivity = np.random.uniform(0.01, 0.05)  # kW per degC above comfort
        self._load_cache = {} # cache: {timestamp: load_kw}

    def _daily_profile(self, ts: datetime):
        hour = ts.hour + ts.minute / 60.0
        # two Gaussian-like peaks (morning ~7-9, evening ~18-21)
        morning = self.morning_amp * np.exp(-0.5 * ((hour - 8.0) / 1.8) ** 2)
        evening = self.evening_amp * np.exp(-0.5 * ((hour - 19.0) / 2.2) ** 2)
        # small daytime baseline bump (business hours)
        midday = 0.3 * self.base_kw * np.exp(-0.5 * ((hour - 13.0) / 3.0) ** 2)
        return morning + midday + evening
    
    def generate_loads(self, num_minutes=24*60, start_time=None, external_temp_series=None):
        """
        Generate a minute-by-minute load series.

        Args:
            num_minutes: number of minutes to simulate
            start_time: datetime start (default now)
            external_temp_series: optional Series/array of external temps aligned to minutes
        Returns:
            DataFrame with columns: timestamp, meter_id, load_kw
        """
        if start_time is None:
            start_time = datetime.now().replace(second=0, microsecond=0)
        timestamps = [start_time + timedelta(minutes=i) for i in range(num_minutes)]

        loads = []
        prev_load = None
        for i, ts in enumerate(timestamps):
            base_profile = self.base_kw + self._daily_profile(ts)
            # weekend reduction
            if ts.weekday() >= 5:
                base_profile *= np.random.uniform(0.6, 0.9)
            # temperature influence (AC): if external_temp_series provided, add proportional load
            temp_influence = 0.0
            if external_temp_series is not None:
                try:
                    ext_temp = external_temp_series[i]
                    # assume comfort ~ 26°C; hotter -> more AC load
                    temp_influence = max(0.0, ext_temp - 26.0) * self.ac_sensitivity
                except Exception:
                    temp_influence = 0.0
            # random instantaneous noise and occasional spikes
            noise = np.random.normal(0, self.noise_scale)
            spike = 0.0
            if np.random.rand() < 0.002:  # rare appliance spike
                spike = np.random.uniform(0.5, 3.0) * self.base_kw
            raw = base_profile + temp_influence + noise + spike
            # smoothing: small inertia so minute-to-minute doesn't jump unrealistically
            if prev_load is None:
                load = raw
            else:
                load = prev_load + (raw - prev_load) * np.random.uniform(0.2, 0.6)
            load = float(np.clip(load, self.min_kw, self.max_kw))
            load = round(load, 3)
            loads.append(load)
            prev_load = load

            # Cache the load at this timestamp
            self._load_cache[ts] = load

        return pd.DataFrame({
            'timestamp': timestamps,
            'meter_id': [self.meter_id] * num_minutes,
            'load_kw': loads
        })
    
    def get_load_at_timestamp(self, timestamp: datetime) -> float:
        """
        Retrieve cached load at a specific timestamp.
        
        Args:
            timestamp: target datetime
            
        Returns:
            Load value in kW at that timestamp, or 0.0 if not found
        """
        return self._load_cache.get(timestamp, 0.0)
    
    # def save_to_csv(self, df, output_file):
    #     df.to_csv(output_file, index=False)
    #     print(f"Smart meter data saved to {output_file}")
    #     return output_file

class Transformer:
    """
    Simulates a transformer that produces a temperature, ..., ..., from the smart meters (households) adjacent
    to it. The transformer includes its location {longitude and latitude}, list of smart meters adjacent to it [list of SmartMeter obj].
    """

    def __init__(self, h: float, location: tuple[float, float], barangay: str, neighbors: list[SmartMeter]):
        """
        Initialize a transformer.
        
        Args:
            location: tuple of (latitude, longitude) in decimal degrees
            barangay: barangay name (e.g., "UP Campus")
            neighbors: list of SmartMeter objects connected to this transformer
        """
        self.h = h # some heat transfer constant
        self.location = location  # (latitude, longitude)
        self.barangay = barangay
        self.neighbors = neighbors
        self.base_temp = 25.0  # baseline transformer temp (°C)
        self.thermal_mass = 50.0  # thermal mass for smoothing
        self.prev_temp = self.base_temp
    
    def get_total_load(self, timestamp: datetime) -> float:
        """
        Calculate total instantaneous load across all connected smart meters at a given timestamp.
        Queries actual cached loads from each meter.

        Args:
            timestamp: datetime to query load at
            
        Returns:
            Total load in kW across all neighbors
        """
        total_load = 0.0
        for meter in self.neighbors:
            total_load += meter.get_load_at_timestamp(timestamp)
        return round(total_load, 3)
    
    def get_temperature_of_transformer_from_loads(self, total_load: float, external_temp: float) -> float:
        """
        Calculate transformer temperature based on total load and external ambient temperature.
        Uses a thermal model with internal heat generation proportional to load.
        
        Args:
            total_load: total instantaneous load in kW
            external_temp: external ambient temperature in °C
            
        Returns:
            Estimated transformer temperature in °C
        """
        # Thermal model: 
        # dT/dt = (load_factor * total_load + k_amb * (external_temp - T)) / thermal_mass
        # Simplified single-step integration:
        
        load_factor = 0.8  # temperature rise per kW of load
        k_amb = 0.5  # ambient heat transfer coefficient
        dt = 1.0  # time step (minute)
        
        # Heat generated by load
        heat_gen = load_factor * total_load
        
        # Heat dissipation/absorption from environment
        heat_transfer = k_amb * (external_temp - self.prev_temp)
        
        # Net temperature change
        dT = (heat_gen + heat_transfer) / self.thermal_mass * dt
        new_temp = self.prev_temp + dT
        
        # Clamp within realistic bounds (transformers typically 30-80°C under normal operation)
        new_temp = np.clip(new_temp, 20.0, 120.0)
        self.prev_temp = new_temp
        
        return round(new_temp, 2)
    
    def _process_load_at_time(self, timestamp: datetime, external_temp: float) -> dict:
        """
        Process a complete snapshot at a given timestamp: total load and resulting temperature.
        
        Args:
            timestamp: datetime of the snapshot
            external_temp: external ambient temperature in °C
            
        Returns:
            Dictionary with timestamp, location, barangay, total_load_kw, transformer_temp_c
        """
        total_load = self.get_total_load(timestamp)
        transformer_temp = self.get_temperature_of_transformer_from_loads(total_load, external_temp)
        
        return {
            'timestamp': timestamp,
            'latitude': self.location[0],
            'longitude': self.location[1],
            'barangay': self.barangay,
            'total_load_kw': total_load,
            'transformer_temp_c': transformer_temp,
            'external_temp_c': external_temp
        }
    
    def generate_timeseries(self, num_minutes=24*60, start_time=None, external_temp_series=None) -> pd.DataFrame:
        """
        Generate a complete time series of transformer state over multiple minutes.
        
        Args:
            num_minutes: number of minutes to simulate
            start_time: starting datetime (default now)
            external_temp_series: array of external temps (one per minute)
            
        Returns:
            DataFrame with columns: timestamp, latitude, longitude, barangay, total_load_kw, transformer_temp_c, external_temp_c
        """
        if start_time is None:
            start_time = datetime.now().replace(second=0, microsecond=0)
        
        if external_temp_series is None:
            # Generate default Philippine ambient temps if not provided
            hours = np.array([(start_time + timedelta(minutes=i)).hour + ((start_time + timedelta(minutes=i)).minute/60.0) for i in range(num_minutes)])
            external_temp_series = 26.0 + 4.5 * np.exp(-0.5 * ((hours - 14.0) / 4.0) ** 2) + np.random.normal(0, 0.3, size=num_minutes)
        
        results = []
        for i in range(num_minutes):
            ts = start_time + timedelta(minutes=i)
            ext_temp = float(external_temp_series[i]) if i < len(external_temp_series) else 30.0
            snapshot = self._process_load_at_time(ts, ext_temp)
            results.append(snapshot)
        
        return pd.DataFrame(results)
    
    def save_to_csv(self, df, output_file):
        """Save transformer time series to CSV."""
        df.to_csv(output_file, index=False)
        print(f"Transformer data saved to {output_file}")
        return output_file



if __name__ == "__main__":
    
    # SAMPLE USAGE

    start = datetime.now().replace(second=0, microsecond=0)
    minutes = 24 * 60  # simulate 1 day at 1-minute resolution; change as needed

    # Create a simple external temp series averaged to minutes from transformer external temps if desired.
    # Here we create a realistic daily external temp pattern for the Philippines: warm and humid.
    hours = np.array([(start + timedelta(minutes=i)).hour + ((start + timedelta(minutes=i)).minute/60.0) for i in range(minutes)])

    # daily ambient temp: low early morning ~25-27, peak midafternoon ~31-34
    ambient_daily = 26.0 + 4.5 * np.exp(-0.5 * ((hours - 14.0) / 4.0) ** 2) + np.random.normal(0, 0.3, size=minutes)

    meter1 = SmartMeter(meter_id='SM-001', min_kw=0.0, max_kw=20.0, base_kw=0.6)  # example residential meter
    sm_df1 = meter1.generate_loads(num_minutes=minutes, start_time=start, external_temp_series=ambient_daily)
    # print(sm_df1.head())
    # print(f"Smart meter 1 dataset shape: {sm_df1.shape}")
    # meter1.save_to_csv(sm_df1, output_file='smart_meter_loads1.csv')

    meter2 = SmartMeter(meter_id='SM-002', min_kw=0.0, max_kw=20.0, base_kw=0.6)  # example residential meter
    sm_df2 = meter2.generate_loads(num_minutes=minutes, start_time=start, external_temp_series=ambient_daily)
    # print(sm_df2.head())
    # print(f"Smart meter 2 dataset shape: {sm_df2.shape}")
    # meter2.save_to_csv(sm_df2, output_file='smart_meter_loads2.csv')

    # Example transformer usage
    transformer_location = (14.6519, 121.0568)  # Example: UP Diliman, Quezon City
    transformer_neighbors = [meter1, meter2]  # In practice, add more SmartMeter objects here

    transformer = Transformer(h=0.5, location=transformer_location, barangay="UP Campus", neighbors=transformer_neighbors)
    ts_df = transformer.generate_timeseries(num_minutes=minutes, start_time=start, external_temp_series=ambient_daily)
    print(ts_df.head())
    print(f"Transformer timeseries shape: {ts_df.shape}")
    transformer.save_to_csv(ts_df, output_file='transformer_timeseries.csv')

    print("\nVerification (first 5 rows):")
    for i, row in ts_df.head().iterrows():
        ts = row['timestamp']
        meter1_load = meter1.get_load_at_timestamp(ts)
        meter2_load = meter2.get_load_at_timestamp(ts)
        total_sum = meter1_load + meter2_load
        reported_load = row['total_load_kw']
        print(f"  {ts}: Meter1={meter1_load}, Meter2={meter2_load}, Sum={total_sum}, Reported={reported_load}")


"""
    TODO:

    - Fix temperature generated


"""