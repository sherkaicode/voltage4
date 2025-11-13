// Historical BGHI data generation and persistence

export interface HistoricalBGHI {
  date: string;
  bghiScore: number;
  status: "Good" | "Warning" | "Critical";
  avgLoad: number;
  anomalyCount: number;
  criticalTransformers: number;
}

interface BGHISnapshot {
  city: string;
  date: string;
  bghiScore: number;
  status: string;
  avgLoad: number;
  anomalyCount: number;
  criticalTransformers: number;
}

/**
 * Generate realistic historical BGHI data based on city patterns
 */
export function generateHistoricalBGHI(
  city: string,
  daysBack: number = 30,
  currentBGHI?: number
): HistoricalBGHI[] {
  const history: HistoricalBGHI[] = [];
  const today = new Date();
  
  // Base BGHI for each city (preset realistic averages)
  const cityBaselines: Record<string, number> = {
    "Quezon City": 76,      // Urban, moderate stress
    "UP Diliman": 84,        // University, better infrastructure
    "Makati": 71,            // Business district, high demand
    "Pasig": 79,             // Mixed residential/commercial
  };
  
  const baseline = cityBaselines[city] || 80;
  
  for (let i = daysBack; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    // Pattern 1: Weekend improvement (less business load)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const weekendBonus = isWeekend ? 6 : 0;
    
    // Pattern 2: Summer stress (April-May in Philippines - hot season)
    const month = date.getMonth();
    const summerPenalty = (month === 3 || month === 4) ? -10 : 0;
    const decemberPenalty = month === 11 ? -5 : 0; // Holiday season
    
    // Pattern 3: Weather events (random stress days - typhoons, storms)
    const hasWeatherEvent = Math.random() > 0.88; // 12% chance
    const weatherStress = hasWeatherEvent ? -12 : 0;
    
    // Pattern 4: Gradual improvement trend (infrastructure upgrades)
    const improvementTrend = (daysBack - i) * 0.08; // Slow improvement over time
    
    // Pattern 5: Day-of-week pattern (higher stress on weekdays)
    const dayOfWeek = date.getDay();
    const weekdayStress = (dayOfWeek >= 1 && dayOfWeek <= 5) ? -2 : 0;
    
    // Pattern 6: Natural variation
    const noise = (Math.random() - 0.5) * 10; // ±5 points
    
    let bghiScore = baseline + weekendBonus + summerPenalty + decemberPenalty + 
                    weatherStress + improvementTrend + weekdayStress + noise;
    
    // If this is today and we have current BGHI, use it
    if (i === 0 && currentBGHI !== undefined) {
      bghiScore = currentBGHI;
    }
    
    // Clamp to valid range
    bghiScore = Math.max(45, Math.min(98, bghiScore));
    
    const status: "Good" | "Warning" | "Critical" = 
      bghiScore >= 80 ? "Good" :
      bghiScore >= 60 ? "Warning" : "Critical";
    
    // Correlate other metrics with BGHI
    const stressFactor = (100 - bghiScore) / 100;
    
    history.push({
      date: date.toISOString().split('T')[0],
      bghiScore: Number(bghiScore.toFixed(1)),
      status,
      avgLoad: Number((baseline * 1.5 + noise * 0.8).toFixed(1)),
      anomalyCount: Math.floor(stressFactor * 15), // More stress = more anomalies
      criticalTransformers: Math.floor(stressFactor * 5), // 0-5 critical transformers
    });
  }
  
  return history;
}

/**
 * Save daily BGHI snapshot to localStorage
 */
export function saveDailySnapshot(
  city: string,
  bghiScore: number,
  status: string,
  avgLoad: number,
  anomalyCount: number,
  criticalTransformers: number
): void {
  if (typeof window === 'undefined') return; // Server-side check
  
  try {
    const key = `bghi_history_${city.replace(/\s+/g, '_')}`;
    const stored = localStorage.getItem(key);
    const history: BGHISnapshot[] = stored ? JSON.parse(stored) : [];
    
    const today = new Date().toISOString().split('T')[0];
    
    // Check if today's snapshot already exists
    const existingIndex = history.findIndex(h => h.date === today);
    
    const snapshot: BGHISnapshot = {
      city,
      date: today,
      bghiScore,
      status,
      avgLoad,
      anomalyCount,
      criticalTransformers,
    };
    
    if (existingIndex >= 0) {
      // Update today's snapshot with latest values
      history[existingIndex] = snapshot;
    } else {
      // Add new snapshot
      history.push(snapshot);
    }
    
    // Keep last 90 days only (3 months)
    if (history.length > 90) {
      history.splice(0, history.length - 90);
    }
    
    localStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save BGHI snapshot:', error);
  }
}

/**
 * Load BGHI history with fallback to generated data
 */
export function loadBGHIHistory(city: string, daysBack: number = 30): HistoricalBGHI[] {
  if (typeof window === 'undefined') {
    // Server-side: return generated data
    return generateHistoricalBGHI(city, daysBack);
  }
  
  try {
    const key = `bghi_history_${city.replace(/\s+/g, '_')}`;
    const stored = localStorage.getItem(key);
    
    if (!stored) {
      // No stored data - return generated
      return generateHistoricalBGHI(city, daysBack);
    }
    
    const snapshots: BGHISnapshot[] = JSON.parse(stored);
    
    // Convert to HistoricalBGHI format
    const history: HistoricalBGHI[] = snapshots.map(s => ({
      date: s.date,
      bghiScore: s.bghiScore,
      status: s.status as "Good" | "Warning" | "Critical",
      avgLoad: s.avgLoad,
      anomalyCount: s.anomalyCount,
      criticalTransformers: s.criticalTransformers,
    }));
    
    // If we don't have enough data, fill with generated
    if (history.length < daysBack) {
      const generated = generateHistoricalBGHI(city, daysBack - history.length);
      return [...generated, ...history];
    }
    
    // Return last N days
    return history.slice(-daysBack);
  } catch (error) {
    console.error('Failed to load BGHI history:', error);
    return generateHistoricalBGHI(city, daysBack);
  }
}

/**
 * Get BGHI trends with current value
 */
export function getBGHITrends(
  city: string,
  currentBGHI: number,
  currentAvgLoad: number,
  currentAnomalyCount: number,
  currentCriticalTransformers: number,
  daysBack: number = 30
): HistoricalBGHI[] {
  // Load existing history
  let history = loadBGHIHistory(city, daysBack);
  
  // Update today's value with current actual data
  const today = new Date().toISOString().split('T')[0];
  const todayIndex = history.findIndex(h => h.date === today);
  
  if (todayIndex >= 0) {
    history[todayIndex].bghiScore = currentBGHI;
    history[todayIndex].status = 
      currentBGHI >= 80 ? "Good" :
      currentBGHI >= 60 ? "Warning" : "Critical";
    history[todayIndex].avgLoad = currentAvgLoad;
    history[todayIndex].anomalyCount = currentAnomalyCount;
    history[todayIndex].criticalTransformers = currentCriticalTransformers;
  }
  
  // Save the snapshot
  saveDailySnapshot(
    city,
    currentBGHI,
    currentBGHI >= 80 ? "Good" : currentBGHI >= 60 ? "Warning" : "Critical",
    currentAvgLoad,
    currentAnomalyCount,
    currentCriticalTransformers
  );
  
  return history;
}

/**
 * Clear stored history (for testing)
 */
export function clearBGHIHistory(city: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const key = `bghi_history_${city.replace(/\s+/g, '_')}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to clear BGHI history:', error);
  }
}
