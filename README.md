# ASCE Wind Speed Extractor

An Apify actor that extracts wind speed hazard data from the [ASCE Hazard Tool](https://ascehazardtool.org/) for a given address.

## Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Full property address (street, city, state, zip) |
| `debugScreenshots` | boolean | No | Capture screenshots at each step for debugging |

### Example Input

```json
{
    "address": "411 Crusaders Drive, Sanford, NC 27330",
    "debugScreenshots": false
}
```

## Output

```json
{
    "address": "411 Crusaders Drive, Sanford, NC 27330",
    "windSpeed": "114",
    "unit": "mph",
    "riskCategory": "II",
    "source": "ASCE Hazard Tool",
    "timestamp": "2025-12-19T12:00:00Z",
    "success": true,
    "error": null
}
```

## How it Works

1. Navigates to <https://ascehazardtool.org/>
2. Dismisses the welcome modal
3. Enters the address in the geocoder input
4. Clicks SEARCH
5. Selects Risk Category II
6. Selects Wind hazard type
7. Clicks VIEW RESULTS
8. Extracts the wind speed value (e.g., "114 Vmph")

## Development

```bash
# Install dependencies
npm install

# Run locally (for testing)
node main.js --address="411 Crusaders Drive, Sanford, NC 27330"
```

## Deployment

This actor is designed to be deployed via GitHub integration on Apify.

## License

ISC
