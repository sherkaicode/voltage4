// PDF Export utilities for GridPulse reports
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DashboardDataResponse, TransformerRealtimeMetrics } from '@/types/dashboard';

/**
 * Generate AI-powered executive summary for grid health report
 */
async function generateAIExecutiveSummary(data: DashboardDataResponse): Promise<string> {
  try {
    const prompt = `You are a senior electrical grid analyst preparing an executive summary for utility management.

Grid Data Analysis:
- City: ${data.city}
- BGHI Score: ${data.summary.bghiScore.toFixed(1)} (${data.summary.status})
- Total Transformers: ${data.summary.totalTransformers}
- Critical Transformers: ${data.summary.criticalTransformers}
- Warning Transformers: ${data.summary.warningTransformers}
- Average Load: ${data.summary.averageLoadPct.toFixed(1)}%
- 24h Anomalies: ${data.summary.anomalyCount24h}
- Active Alerts: ${data.summary.alertsCount}
- Weather: ${data.weather.temperature.toFixed(1)}°C, ${data.weather.condition}

Task: Write a professional 3-4 sentence executive summary for management that:
1. States the overall grid health status clearly
2. Highlights the most critical issue requiring attention
3. Provides one actionable recommendation
4. Maintains a professional, confident tone

Write ONLY the summary text, no headers or labels.`;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        context: {},
        conversationHistory: [],
        language: 'english',
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      return result.response;
    } else {
      // Fallback summary if AI fails
      return generateFallbackSummary(data);
    }
  } catch (error) {
    console.error('Failed to generate AI summary:', error);
    return generateFallbackSummary(data);
  }
}

/**
 * Fallback summary when AI is unavailable
 */
function generateFallbackSummary(data: DashboardDataResponse): string {
  const statusText = data.summary.status === 'Critical' 
    ? 'requires immediate attention'
    : data.summary.status === 'Warning'
    ? 'shows signs of stress'
    : 'is operating normally';
    
  const criticalText = data.summary.criticalTransformers > 0
    ? `${data.summary.criticalTransformers} transformer(s) are in critical state`
    : data.summary.warningTransformers > 0
    ? `${data.summary.warningTransformers} transformer(s) require monitoring`
    : 'all transformers are operating within normal parameters';
    
  return `The ${data.city} electrical grid ${statusText} with a BGHI score of ${data.summary.bghiScore.toFixed(1)}. Currently, ${criticalText}. ${data.summary.averageLoadPct > 75 ? 'High average load suggests potential capacity constraints that may require infrastructure expansion.' : 'Load distribution is manageable across the network.'} ${data.summary.alertsCount > 0 ? `Predictive analytics indicate ${data.summary.alertsCount} potential overload event(s) in the next 24 hours.` : ''}`;
}

/**
 * Generate AI-powered recommendations for PDF report
 */
async function generateAIRecommendations(data: DashboardDataResponse): Promise<string[]> {
  try {
    const criticalTransformers = data.transformers
      .filter(t => t.bghi.status === 'Critical')
      .map(t => `${t.transformer.ID} (${t.loadPercentage.toFixed(1)}% load, BGHI: ${t.bghi.score.toFixed(1)})`)
      .slice(0, 3);
    
    const highLoadTransformers = data.transformers
      .filter(t => t.loadPercentage > 80)
      .length;
    
    const avgAnomalyRate = (data.summary.anomalyCount24h / 24).toFixed(1);
    
    const prompt = `You are a senior utility operations manager preparing technical action items for executive management with 20+ years IEEE standards experience.

Grid Operations Report (${data.city}):
- Overall BGHI: ${data.summary.bghiScore.toFixed(1)}/100 (${data.summary.status})
- Critical Transformers: ${data.summary.criticalTransformers} ${criticalTransformers.length > 0 ? `[${criticalTransformers.join('; ')}]` : ''}
- Warning Status: ${data.summary.warningTransformers} transformers
- High Load Units: ${highLoadTransformers} transformers >80% capacity (IEEE C57.91 emergency threshold)
- Average Grid Load: ${data.summary.averageLoadPct.toFixed(1)}%
- Anomaly Rate: ${avgAnomalyRate} events/hour over 24h
- Active Alerts: ${data.summary.alertsCount} predictive overload warnings
- Environmental: ${data.weather.temperature.toFixed(1)}°C, ${data.weather.condition}, ${data.weather.humidity}% humidity

IEEE/ERC Standards Context:
- IEEE C57.91: Normal = 0-80%, Emergency = 80-100%, Overload = >100%
- IEEE 1100: Voltage quality <5% deviation per ERC standards
- PEC/ERC: Response time for critical = <2h, warnings = <24h

Task: Generate 4-6 HIGHLY SPECIFIC executive action items prioritized by urgency. Each must:
1. Start with priority: CRITICAL (immediate), HIGH (<4h), MEDIUM (<24h), ADVISORY (planned)
2. Include EXACT technical details: transformer IDs, kW values, percentages, timelines, crew requirements
3. Reference IEEE/ERC standards or technical justification
4. Provide clear success metrics (target load %, expected BGHI improvement)
5. Be 20-35 words per recommendation

Example Format:
• CRITICAL: Deploy 2-person crew to ${data.transformers[0]?.transformer.ID || 'QC-101'} by 14:00 - redistribute 23.5 kW to QC-098 (47% load) per IEEE C57.91 emergency protocol, target 75% load
• HIGH: Schedule thermal imaging inspection for 3 warning transformers within 4h - ${data.weather.temperature.toFixed(0)}°C ambient risks winding temps >140°C per IEEE C57.140 thermal model

Return as bullet points (•). Be precise, technical, and actionable for management decisions.`;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        context: {},
        conversationHistory: [],
        language: 'english',
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      // Extract bullet points from response
      const lines = result.response
        .split(/\n/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.startsWith('•') || s.match(/^[\d+\.\-\*]/))
        .map((s: string) => s.replace(/^[\d+\.\-\*]\s*/, '• ').trim())
        .slice(0, 6);
      
      if (lines.length > 0) {
        return lines;
      }
    }
    
    // Fallback recommendations
    return generateFallbackRecommendations(data);
  } catch (error) {
    console.error('Failed to generate AI recommendations:', error);
    return generateFallbackRecommendations(data);
  }
}

/**
 * Fallback recommendations when AI is unavailable
 */
function generateFallbackRecommendations(data: DashboardDataResponse): string[] {
  const recommendations: string[] = [];
  
  if (data.summary.criticalTransformers > 0) {
    const criticalList = data.transformers
      .filter(t => t.bghi.status === 'Critical')
      .slice(0, 2)
      .map(t => `${t.transformer.ID} (${t.loadPercentage.toFixed(0)}%)`);
    recommendations.push(`• CRITICAL: Deploy maintenance crew within 2h for ${data.summary.criticalTransformers} critical unit(s): ${criticalList.join(', ')} - IEEE C57.91 emergency loading protocol`);
  }
  
  if (data.summary.warningTransformers > 3) {
    const avgLoad = data.summary.averageLoadPct.toFixed(1);
    recommendations.push(`• HIGH: Load balance ${data.summary.warningTransformers} warning transformers - target <75% per IEEE standards, current grid avg ${avgLoad}%`);
  }
  
  if (data.alerts.length > 0) {
    const nearestAlert = data.alerts[0];
    const peakLoad = (nearestAlert.alert.riskRatio * 100).toFixed(0);
    recommendations.push(`• MEDIUM: Pre-stage crew for predicted ${peakLoad}% peak at ${nearestAlert.transformerName} in ${nearestAlert.alert.hoursAhead}h - coordinate demand response`);
  }
  
  if (data.summary.anomalyCount24h > 5) {
    const rate = (data.summary.anomalyCount24h / 24).toFixed(1);
    recommendations.push(`• HIGH: Investigate ${data.summary.anomalyCount24h} anomalies (${rate}/hr rate) - exceeds 0.5/hr ERC threshold for root cause analysis`);
  }
  
  if (data.weather.condition === 'Rainy') {
    recommendations.push(`• MEDIUM: Deploy voltage monitoring equipment - rainy conditions risk ${data.weather.humidity}% humidity-induced flashovers per IEEE 1410`);
  }
  
  if (data.summary.averageLoadPct > 75) {
    const excess = (data.summary.averageLoadPct - 75).toFixed(1);
    recommendations.push(`• ADVISORY: Grid at ${data.summary.averageLoadPct.toFixed(1)}% (${excess}% above IEEE normal) - evaluate infrastructure expansion or distributed generation`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push(`• All ${data.summary.totalTransformers} transformers within IEEE C57.91 normal loading parameters - continue routine monitoring per ERC compliance schedule`);
  }
  
  return recommendations;
}

/**
 * Generate Meralco Grid Health Report PDF
 */
export async function generateGridHealthReport(data: DashboardDataResponse) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Header
  doc.setFillColor(249, 115, 22); // Orange-500
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('GridPulse', 14, 15);
  
  doc.setFontSize(16);
  doc.text('Grid Health Report', 14, 25);
  
  // Report metadata
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`City: ${data.city}`, pageWidth - 14, 15, { align: 'right' });
  doc.text(`Generated: ${new Date(data.updatedAt).toLocaleString()}`, pageWidth - 14, 20, { align: 'right' });
  doc.text(`Report Period: Last 24 Hours`, pageWidth - 14, 25, { align: 'right' });
  
  let yPos = 45;
  
  // Executive Summary Section with AI
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('EXECUTIVE SUMMARY', 14, yPos);
  yPos += 8;
  
  // Generate AI summary (async)
  const aiSummary = await generateAIExecutiveSummary(data);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const summaryLines = doc.splitTextToSize(aiSummary, pageWidth - 28);
  doc.text(summaryLines, 14, yPos);
  yPos += summaryLines.length * 5 + 8;
  
  // Summary boxes (Key Metrics)
  const summaryData = [
    ['BGHI Score', data.summary.bghiScore.toFixed(1), data.summary.status],
    ['Total Transformers', data.summary.totalTransformers.toString(), 'Active'],
    ['Average Load', `${data.summary.averageLoadPct.toFixed(1)}%`, 'Capacity'],
    ['Weather', `${data.weather.temperature.toFixed(1)}°C`, data.weather.condition],
  ];
  
  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value', 'Status']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [249, 115, 22], textColor: 255 },
    styles: { fontSize: 10 },
    margin: { left: 14, right: 14 },
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Critical Status Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('GRID STATUS OVERVIEW', 14, yPos);
  yPos += 8;
  
  const statusData = [
    ['Critical Transformers', data.summary.criticalTransformers.toString(), 'Requires immediate attention'],
    ['Warning Transformers', data.summary.warningTransformers.toString(), 'Monitor closely'],
    ['Anomalies (24h)', data.summary.anomalyCount24h.toString(), 'Events detected'],
    ['Active Alerts', data.summary.alertsCount.toString(), 'Overload predictions'],
  ];
  
  autoTable(doc, {
    startY: yPos,
    body: statusData,
    theme: 'striped',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'center', cellWidth: 30 },
      2: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Check if we need a new page
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = 20;
  }
  
  // Transformer Details Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSFORMER STATUS', 14, yPos);
  yPos += 8;
  
  // Sort transformers by load percentage (highest first)
  const sortedTransformers = [...data.transformers]
    .sort((a, b) => b.loadPercentage - a.loadPercentage)
    .slice(0, 15); // Top 15 transformers
  
  const transformerData = sortedTransformers.map(t => [
    t.transformer.ID,
    `${t.currentLoadKw.toFixed(1)} kW`,
    `${t.loadPercentage.toFixed(1)}%`,
    t.bghi.status,
    t.transformer.NumDownstreamBuildings?.toString() || 'N/A',
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Transformer', 'Load', 'Capacity', 'Status', 'Buildings']],
    body: transformerData,
    theme: 'grid',
    headStyles: { fillColor: [249, 115, 22], textColor: 255 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { halign: 'right', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'center', cellWidth: 30 },
      4: { halign: 'center', cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      // Color code status column
      if (data.column.index === 3 && data.section === 'body') {
        const status = data.cell.text[0];
        if (status === 'Critical') {
          data.cell.styles.textColor = [239, 68, 68]; // Red
          data.cell.styles.fontStyle = 'bold';
        } else if (status === 'Warning') {
          data.cell.styles.textColor = [245, 158, 11]; // Amber
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [34, 197, 94]; // Green
        }
      }
    },
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Check if we need a new page for alerts
  if (yPos > pageHeight - 80) {
    doc.addPage();
    yPos = 20;
  }
  
  // Critical Alerts Section
  if (data.alerts.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CRITICAL ALERTS', 14, yPos);
    yPos += 8;
    
    const alertData = data.alerts.slice(0, 10).map(a => [
      a.transformerName,
      a.alert.confidence > 0.8 ? 'High' : a.alert.confidence > 0.6 ? 'Medium' : 'Low',
      `+${a.alert.hoursAhead}h`,
      `${(a.alert.riskRatio * 100).toFixed(0)}%`,
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Transformer', 'Severity', 'Time', 'Peak Load']],
      body: alertData,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { halign: 'center', cellWidth: 40 },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 40 },
      },
      margin: { left: 14, right: 14 },
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // Anomalies Section
  if (data.anomalies.length > 0) {
    // Check if we need a new page
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ANOMALY REPORT (24H)', 14, yPos);
    yPos += 8;
    
    // Count anomaly types
    const anomalyTypes = data.anomalies.reduce((acc, a) => {
      acc[a.anomalyType] = (acc[a.anomalyType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const anomalyData = Object.entries(anomalyTypes).map(([type, count]) => [
      type,
      count.toString(),
      'Detected',
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Anomaly Type', 'Count', 'Status']],
      body: anomalyData,
      theme: 'striped',
      headStyles: { fillColor: [249, 115, 22], textColor: 255 },
      styles: { fontSize: 10 },
      margin: { left: 14, right: 14 },
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // Recommendations Section with AI
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = 20;
  }
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('RECOMMENDATIONS', 14, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Generate AI-powered recommendations
  const recommendations = await generateAIRecommendations(data);
  
  recommendations.forEach(rec => {
    doc.text(rec, 14, yPos, { maxWidth: pageWidth - 28 });
    yPos += 7;
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `GridPulse Grid Health Report | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }
  
  // Save the PDF
  const filename = `GridPulse_Report_${data.city}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

/**
 * Generate AI summary for Barangay report
 */
async function generateBarangayAISummary(data: DashboardDataResponse, barangay: string): Promise<string> {
  try {
    const prompt = `You are a barangay-level grid analyst preparing a summary for local officials.

Barangay: ${barangay}
Grid Status:
- BGHI Score: ${data.summary.bghiScore.toFixed(1)} (${data.summary.status})
- Transformers: ${data.summary.totalTransformers}
- Critical: ${data.summary.criticalTransformers}
- Warning: ${data.summary.warningTransformers}
- Average Load: ${data.summary.averageLoadPct.toFixed(1)}%
- Anomalies (24h): ${data.summary.anomalyCount24h}

Task: Write a 2-3 sentence summary for barangay officials that:
1. States the community's power grid health in simple terms
2. Highlights immediate concerns if any
3. Provides community-level advice

Keep it accessible for non-technical readers. Write ONLY the summary text.`;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        context: {},
        conversationHistory: [],
        language: 'english',
      }),
    });

    const result = await response.json();
    
    if (result.success) {
      return result.response;
    } else {
      return `Barangay ${barangay}'s electrical grid is ${data.summary.status.toLowerCase()} with ${data.summary.totalTransformers} active transformers. ${data.summary.criticalTransformers > 0 ? `${data.summary.criticalTransformers} transformer(s) need urgent maintenance.` : 'All systems are functioning normally.'} Residents should ${data.summary.averageLoadPct > 75 ? 'conserve electricity during peak hours' : 'continue normal usage patterns'}.`;
    }
  } catch (error) {
    console.error('Failed to generate Barangay AI summary:', error);
    return `Barangay ${barangay}'s electrical grid is ${data.summary.status.toLowerCase()} with ${data.summary.totalTransformers} active transformers. ${data.summary.criticalTransformers > 0 ? `${data.summary.criticalTransformers} transformer(s) need urgent maintenance.` : 'All systems are functioning normally.'} Residents should ${data.summary.averageLoadPct > 75 ? 'conserve electricity during peak hours' : 'continue normal usage patterns'}.`;
  }
}

/**
 * Generate Barangay Transformer Report PDF
 */
export async function generateBarangayReport(data: DashboardDataResponse, barangay: string) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('GridPulse', 14, 15);
  
  doc.setFontSize(16);
  doc.text(`Barangay ${barangay} Report`, 14, 25);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 20, { align: 'right' });
  
  let yPos = 45;
  
  // AI-Generated Summary
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BARANGAY OVERVIEW', 14, yPos);
  yPos += 8;
  
  const aiSummary = await generateBarangayAISummary(data, barangay);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const summaryLines = doc.splitTextToSize(aiSummary, pageWidth - 28);
  doc.text(summaryLines, 14, yPos);
  yPos += summaryLines.length * 5 + 8;
  
  // Key Metrics Table
  
  const summaryData = [
    ['BGHI Score', data.summary.bghiScore.toFixed(1)],
    ['Transformers', data.summary.totalTransformers.toString()],
    ['Average Load', `${data.summary.averageLoadPct.toFixed(1)}%`],
    ['Critical Status', data.summary.criticalTransformers.toString()],
  ];
  
  autoTable(doc, {
    startY: yPos,
    body: summaryData,
    theme: 'striped',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'right', cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // Transformer details
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('TRANSFORMER DETAILS', 14, yPos);
  yPos += 8;
  
  const transformerData = data.transformers.map(t => [
    t.transformer.ID,
    `${t.currentLoadKw.toFixed(1)} kW`,
    `${t.loadPercentage.toFixed(1)}%`,
    t.bghi.status,
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['ID', 'Load', 'Capacity', 'Status']],
    body: transformerData,
    theme: 'grid',
    headStyles: { fillColor: [249, 115, 22], textColor: 255 },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });
  
  const filename = `Barangay_${barangay}_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
