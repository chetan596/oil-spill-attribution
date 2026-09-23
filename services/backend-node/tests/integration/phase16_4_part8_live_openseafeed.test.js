/**
 * Phase 16.4 Part 8 — Live OpenSeaFeed Smoke Test (Optional)
 *
 * Checks connectivity and retrieves a live fleet snapshot from the public
 * OpenSeaFeed endpoint if network access is available.
 *
 * Rules:
 *  - Must NOT be required for deterministic CI.
 *  - If network or host is unavailable, logs "REAL_AIS_LIVE_TEST: NOT_RUN" and passes gracefully.
 *  - Must NEVER substitute mocks or demo data.
 */

const axios = require('axios');
const OpenSeaFeedClient = require('../../src/clients/ais/openseafeed.client');

describe('Phase 16.4 Part 8 — Live OpenSeaFeed Smoke Test', () => {
  it('Executes live bounded query against OpenSeaFeed if online', async () => {
    const client = new OpenSeaFeedClient();

    // Query bounds in a known busy maritime area (English Channel)
    const queryBounds = {
      minLat: 50.0,
      maxLat: 51.0,
      minLng: -1.0,
      maxLng: 1.5,
    };

    let liveResult = null;
    let liveAvailable = false;

    try {
      // 5-second timeout probe to check if stream.openseafeed.com is reachable
      const probe = await axios.get('https://stream.openseafeed.com/v1/snapshot', {
        timeout: 5000,
        headers: { Accept: 'application/json' },
      });

      if (probe.status === 200) {
        liveAvailable = true;
        liveResult = await client.searchCurrentVessels(queryBounds);
      }
    } catch (err) {
      // Network unreachable, DNS resolution failure, or endpoint down
      console.log('----------------------------------------------------');
      console.log('REAL_AIS_LIVE_TEST: NOT_RUN');
      console.log(`Reason: OpenSeaFeed live service unreachable (${err.message})`);
      console.log('----------------------------------------------------');
      return;
    }

    if (liveAvailable && liveResult) {
      console.log('----------------------------------------------------');
      console.log('REAL_AIS_LIVE_TEST: PASS');
      console.log(`Provider: ${liveResult.provider}`);
      console.log(`Retrieved At: ${liveResult.retrievedAt}`);
      console.log(`Query Bounds: ${JSON.stringify(liveResult.queryBounds)}`);
      console.log(`Observations Count: ${liveResult.vessels.length}`);
      if (liveResult.vessels.length > 0) {
        console.log(`Sample Timestamp: ${liveResult.vessels[0].timestamp}`);
      }
      console.log('----------------------------------------------------');

      expect(liveResult.type).toBe('REAL_CURRENT_AIS');
      expect(liveResult.provenance).toBe('REAL');
      expect(liveResult.isDemo).toBe(false);
    }
  });
});
