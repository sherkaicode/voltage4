/**
 * Load Shedding Planner
 * 
 * Helps operators make data-driven decisions during brownouts/grid stress
 * by recommending which transformers to shed load from while minimizing impact.
 */

import type { TransformerRealtimeMetrics } from "@/types/dashboard";

export interface LoadSheddingConstraints {
  protectCriticalInfrastructure: boolean;
  respectEquityThresholds: boolean;
  minimizeAffectedHouseholds: boolean;
  maxSheddingDurationMinutes?: number;
}

export interface SheddingCandidate {
  transformerId: string;
  currentLoadKw: number;
  loadPercentage: number;
  downstreamBuildings: number;
  priorityScore: number; // 0-100, higher = better candidate for shedding
  estimatedRelief: number; // MW
  recentOutageMinutes: number;
  isCriticalInfrastructure: boolean;
  sheddingOrder?: number;
  reasoning: string[];
}

export interface LoadSheddingPlan {
  targetReductionMW: number;
  actualReductionMW: number;
  recommendedTransformers: SheddingCandidate[];
  impactSummary: {
    totalBuildingsAffected: number;
    criticalInfrastructureWarnings: string[];
    estimatedGridRelief: number;
    transformersToShed: number;
  };
  alternatives: {
    scenario: string;
    transformers: number;
    buildingsAffected: number;
    reliefMW: number;
  }[];
  timestamp: string;
}

interface OutageHistory {
  transformerId: string;
  timestamp: number;
  durationMinutes: number;
}

/**
 * Load outage history from localStorage
 */
function loadOutageHistory(): OutageHistory[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem('voltage_outage_history');
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load outage history:', error);
    return [];
  }
}

/**
 * Calculate recent outage minutes for a transformer (last 24 hours)
 */
function getRecentOutageMinutes(transformerId: string): number {
  const history = loadOutageHistory();
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  
  return history
    .filter(h => h.transformerId === transformerId && h.timestamp > twentyFourHoursAgo)
    .reduce((sum, h) => sum + h.durationMinutes, 0);
}

/**
 * Determine if transformer serves critical infrastructure
 * Based on transformer ID patterns and location
 */
function isCriticalInfrastructure(transformer: TransformerRealtimeMetrics): boolean {
  const id = transformer.transformer.ID.toLowerCase();
  
  // Critical patterns: hospitals, police, fire, water treatment, telecom hubs
  const criticalPatterns = [
    'hospital', 'clinic', 'medical', 'health',
    'police', 'precinct', 'station',
    'fire', 'emergency',
    'water', 'treatment',
    'telecom', 'cell', 'tower',
    'government', 'city hall', 'municipal'
  ];
  
  return criticalPatterns.some(pattern => id.includes(pattern));
}

/**
 * Calculate priority score for load shedding
 * Higher score = better candidate for shedding
 * 
 * Factors:
 * - Critical Infrastructure Weight (40%): Never shed from critical facilities
 * - Impact Minimization (30%): Prefer transformers with fewer buildings
 * - Grid Relief Effectiveness (20%): Target high-load transformers
 * - Equity Factor (10%): Avoid areas recently shed
 */
function calculatePriorityScore(
  transformer: TransformerRealtimeMetrics,
  allTransformers: TransformerRealtimeMetrics[],
  constraints: LoadSheddingConstraints
): { score: number; reasoning: string[] } {
  const reasoning: string[] = [];
  let score = 50; // Start at midpoint
  
  // Factor 1: Critical Infrastructure (40% weight)
  if (isCriticalInfrastructure(transformer)) {
    if (constraints.protectCriticalInfrastructure) {
      score = 0; // Never shed critical infrastructure
      reasoning.push('❌ Critical infrastructure - protected by policy');
      return { score, reasoning };
    } else {
      score -= 40;
      reasoning.push('⚠️ Serves critical infrastructure');
    }
  } else {
    score += 20;
    reasoning.push('✓ Non-critical infrastructure');
  }
  
  // Factor 2: Impact Minimization (30% weight)
  const buildings = transformer.transformer.NumDownstreamBuildings || 0;
  const maxBuildings = Math.max(...allTransformers.map(t => t.transformer.NumDownstreamBuildings || 0));
  const avgBuildings = allTransformers.reduce((sum, t) => sum + (t.transformer.NumDownstreamBuildings || 0), 0) / allTransformers.length;
  
  if (constraints.minimizeAffectedHouseholds) {
    if (buildings < avgBuildings * 0.5) {
      score += 30;
      reasoning.push(`✓ Low impact: only ${buildings} buildings affected`);
    } else if (buildings < avgBuildings) {
      score += 15;
      reasoning.push(`⚠️ Moderate impact: ${buildings} buildings affected`);
    } else {
      score -= 15;
      reasoning.push(`⚠️ High impact: ${buildings} buildings (above average)`);
    }
  }
  
  // Factor 3: Grid Relief Effectiveness (20% weight)
  const loadPercentage = transformer.loadPercentage;
  if (loadPercentage >= 80) {
    score += 20;
    reasoning.push(`✓ High relief: transformer at ${loadPercentage.toFixed(1)}% capacity`);
  } else if (loadPercentage >= 65) {
    score += 10;
    reasoning.push(`⚠️ Moderate relief: transformer at ${loadPercentage.toFixed(1)}% capacity`);
  } else {
    score -= 10;
    reasoning.push(`⚠️ Low relief: transformer only at ${loadPercentage.toFixed(1)}% capacity`);
  }
  
  // Factor 4: Equity Factor (10% weight)
  const recentOutageMinutes = getRecentOutageMinutes(transformer.transformer.ID);
  if (constraints.respectEquityThresholds) {
    if (recentOutageMinutes > 60) {
      score -= 20;
      reasoning.push(`❌ Recently shed: ${recentOutageMinutes} min outage in last 24h`);
    } else if (recentOutageMinutes > 30) {
      score -= 10;
      reasoning.push(`⚠️ Some recent outage: ${recentOutageMinutes} min in last 24h`);
    } else {
      score += 10;
      reasoning.push(`✓ No recent outages in last 24h`);
    }
  }
  
  return { score: Math.max(0, Math.min(100, score)), reasoning };
}

/**
 * Generate load shedding plan based on target reduction and constraints
 */
export function generateLoadSheddingPlan(
  transformers: TransformerRealtimeMetrics[],
  targetReductionMW: number,
  constraints: LoadSheddingConstraints
): LoadSheddingPlan {
  // Calculate priority scores for all transformers
  const candidates: SheddingCandidate[] = transformers.map(t => {
    const { score, reasoning } = calculatePriorityScore(t, transformers, constraints);
    return {
      transformerId: t.transformer.ID,
      currentLoadKw: t.currentLoadKw,
      loadPercentage: t.loadPercentage,
      downstreamBuildings: t.transformer.NumDownstreamBuildings || 0,
      priorityScore: score,
      estimatedRelief: t.currentLoadKw / 1000, // Convert kW to MW
      recentOutageMinutes: getRecentOutageMinutes(t.transformer.ID),
      isCriticalInfrastructure: isCriticalInfrastructure(t),
      reasoning,
    };
  });
  
  // Sort by priority score (descending) - higher score = better to shed
  const sortedCandidates = [...candidates].sort((a, b) => b.priorityScore - a.priorityScore);
  
  // Select transformers to meet target reduction
  const selectedTransformers: SheddingCandidate[] = [];
  let accumulatedReliefMW = 0;
  let order = 1;
  
  for (const candidate of sortedCandidates) {
    if (accumulatedReliefMW >= targetReductionMW) break;
    if (candidate.priorityScore === 0) continue; // Skip protected transformers
    
    selectedTransformers.push({
      ...candidate,
      sheddingOrder: order++,
    });
    accumulatedReliefMW += candidate.estimatedRelief;
  }
  
  // Calculate impact summary
  const totalBuildingsAffected = selectedTransformers.reduce((sum, t) => sum + t.downstreamBuildings, 0);
  const criticalWarnings: string[] = [];
  
  selectedTransformers.forEach(t => {
    if (t.isCriticalInfrastructure && !constraints.protectCriticalInfrastructure) {
      criticalWarnings.push(`${t.transformerId} serves critical infrastructure`);
    }
    if (t.recentOutageMinutes > 60) {
      criticalWarnings.push(`${t.transformerId} was shed for ${t.recentOutageMinutes} min in last 24h`);
    }
  });
  
  // Generate alternative scenarios
  const alternatives = [
    {
      scenario: 'Minimize Impact (More Transformers)',
      transformers: Math.ceil(selectedTransformers.length * 1.5),
      buildingsAffected: Math.floor(totalBuildingsAffected * 0.7),
      reliefMW: targetReductionMW,
    },
    {
      scenario: 'Maximize Efficiency (Fewer Transformers)',
      transformers: Math.max(1, Math.floor(selectedTransformers.length * 0.6)),
      buildingsAffected: Math.ceil(totalBuildingsAffected * 1.3),
      reliefMW: targetReductionMW * 0.9,
    },
    {
      scenario: 'Balanced Approach',
      transformers: selectedTransformers.length,
      buildingsAffected: totalBuildingsAffected,
      reliefMW: accumulatedReliefMW,
    },
  ];
  
  return {
    targetReductionMW,
    actualReductionMW: accumulatedReliefMW,
    recommendedTransformers: selectedTransformers,
    impactSummary: {
      totalBuildingsAffected,
      criticalInfrastructureWarnings: criticalWarnings,
      estimatedGridRelief: accumulatedReliefMW,
      transformersToShed: selectedTransformers.length,
    },
    alternatives,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Record a load shedding event to history
 */
export function recordSheddingEvent(transformerId: string, durationMinutes: number): void {
  if (typeof window === 'undefined') return;
  
  try {
    const history = loadOutageHistory();
    history.push({
      transformerId,
      timestamp: Date.now(),
      durationMinutes,
    });
    
    // Keep only last 7 days of history
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const filtered = history.filter(h => h.timestamp > sevenDaysAgo);
    
    localStorage.setItem('voltage_outage_history', JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to record shedding event:', error);
  }
}

/**
 * Get shedding statistics for reporting
 */
export function getSheddingStatistics(): {
  totalEvents: number;
  totalDurationMinutes: number;
  affectedTransformers: string[];
  last24Hours: number;
} {
  const history = loadOutageHistory();
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  const recentEvents = history.filter(h => h.timestamp > twentyFourHoursAgo);
  
  return {
    totalEvents: history.length,
    totalDurationMinutes: history.reduce((sum, h) => sum + h.durationMinutes, 0),
    affectedTransformers: [...new Set(history.map(h => h.transformerId))],
    last24Hours: recentEvents.length,
  };
}
