# Artificial Transformer Outage Guide

## How to Trigger an Artificial Outage

You can trigger an artificial outage for testing purposes using the API endpoint.

### API Endpoint
**POST** `/api/transformer-outage`

### Request Examples

#### 1. Trigger an Outage (Indefinite)
```bash
curl -X POST http://localhost:3000/api/transformer-outage \
  -H "Content-Type: application/json" \
  -d '{
    "transformerId": "TX001",
    "city": "Quezon City",
    "action": "trigger"
  }'
```

#### 2. Trigger an Outage with Duration
```bash
curl -X POST http://localhost:3000/api/transformer-outage \
  -H "Content-Type: application/json" \
  -d '{
    "transformerId": "TX001",
    "city": "Quezon City",
    "action": "trigger",
    "durationMinutes": 5
  }'
```

#### 3. Clear an Outage
```bash
curl -X POST http://localhost:3000/api/transformer-outage \
  -H "Content-Type: application/json" \
  -d '{
    "transformerId": "TX001",
    "city": "Quezon City",
    "action": "clear"
  }'
```

## How It Works

### When an Outage is Triggered:

1. **Load Set to Zero**: All household loads connected to the transformer are set to 0 kW
2. **Outage Detection**: The system detects this as an outage anomaly
3. **Alerts Generated**: Grid health index updates and alerts are triggered
4. **Dashboard Updates**: The transformer shows as critical with 0% load
5. **Auto-Expiration**: If a duration is set, the outage automatically clears after that time

### System Response:

When you trigger an outage, the transformer will:
- Show 0 kW load
- Display as "Critical" status
- Generate "OUTAGE" anomalies
- Update the 24-hour outage minutes counter
- Trigger alerts to the dashboard

### Using JavaScript/Fetch:

```javascript
// Trigger outage
async function triggerOutage(transformerId, city, durationMinutes = null) {
  const response = await fetch('/api/transformer-outage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transformerId,
      city,
      action: 'trigger',
      durationMinutes
    })
  });
  return response.json();
}

// Clear outage
async function clearOutage(transformerId, city) {
  const response = await fetch('/api/transformer-outage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transformerId,
      city,
      action: 'clear'
    })
  });
  return response.json();
}

// Usage
await triggerOutage('TX001', 'Quezon City', 5); // 5 minutes
// or
await triggerOutage('TX001', 'Quezon City'); // Indefinite

// Clear it
await clearOutage('TX001', 'Quezon City');
```

## Testing the Feature

1. Open the barangay or meralco dashboard
2. Note a transformer's ID (e.g., from the map or transformer list)
3. Use the API endpoint to trigger an outage with a 2-5 minute duration
4. Watch the transformer status change:
   - Load drops to 0 kW
   - Status turns red (Critical)
   - Anomalies appear (OUTAGE)
   - Outage minutes counter increases
5. Wait for auto-expiration or manually clear the outage

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Artificial outage triggered for transformer TX001 for 5 minutes"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Transformer TX001 not found"
}
```

## Notes

- Outages are stored in memory per transformer state
- They work across all dashboard views (Meralco, Barangay)
- The system automatically clears expired outages
- Multiple outages can be active simultaneously on different transformers
- Dashboard updates happen every 15 seconds with the current refresh rate
