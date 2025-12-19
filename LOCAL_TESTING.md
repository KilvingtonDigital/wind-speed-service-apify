# Local Testing - Replicate Apify Environment

## Quick Start

### Option 1: Docker (Identical to Apify)

This runs the exact same container that Apify uses.

```bash
# Build the container
docker build -t asce-wind-actor .

# Run with test input
docker run --rm -e APIFY_LOCAL_STORAGE_DIR=/tmp/storage asce-wind-actor
```

### Option 2: Using Apify CLI (Recommended)

The Apify CLI provides the most accurate local simulation.

```bash
# Install Apify CLI globally
npm install -g apify-cli

# Run the actor locally
apify run --input='{"address": "411 Crusaders Drive, Sanford, NC 27330", "debugScreenshots": true}'
```

### Option 3: Direct Node.js (Quick testing)

For rapid iteration without Docker:

```bash
# Install dependencies
npm install

# Run with test script
node test-local.js
```

## Viewing Screenshots

After running locally:

- **Apify CLI**: Check `./apify_storage/key_value_stores/default/`
- **Docker**: Mount a volume to save screenshots
- **Direct Node**: Screenshots saved to `./screenshots/`

## Debugging Tips

1. **Check console output** for step-by-step progress
2. **Look at screenshots** saved at each step
3. **Compare with Apify logs** side-by-side
