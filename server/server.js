// server/index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const satellite = require('satellite.js')
const tleCache = new Map();
const CACHE_TTL = 60000; // 1 minute

const app = express();
const PORT = process.env.PORT || 3001; // Use port 3001 for the server

app.use(express.static(path.resolve(__dirname, '../client/build')));

async function getCachedTLE(noradId, apiKey) {
  const key = `${noradId}`;
  const cached = tleCache.get(key);
  const now = Date.now();
  
  // Return cached if fresh
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.tle;
  }
  
  // Fetch fresh
  try {
    const url = `https://api.n2yo.com/rest/v1/satellite/tle/${noradId}?apiKey=${apiKey}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.tle) {
      const tleData = { tle: response.data.tle, timestamp: now };
      tleCache.set(key, tleData);
      return tleData.tle;
    }
  } catch (err) {
    console.log(`N2YO fail ${noradId}:`, err.message);
  }
  
  return null; // Cache miss + API fail
}

app.get('/api/iridium/tle', async (req, res) => {
  try {
    const apiKey = process.env.N2YO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing N2YO_API_KEY in environment variables' });
    }

    const filePath = path.resolve(__dirname, 'iridium.json');
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const noradIds = fileData.testNoradIDs;

    // N2YO rate limits 
    const results = [];

    for (const id of noradIds) {
      try {
        const url = `https://api.n2yo.com/rest/v1/satellite/tle/${id}?apiKey=${apiKey}`;
        const response = await axios.get(url);

        results.push({
          noradId: id,
          tle: response.data.tle
        });

        // Small delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`Failed for NORAD ${id}`);
      }
    }

    res.json({ satellites: results });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to fetch TLE data' });
  }
});

app.get('/api/iridium/pos', async (req, res) => {
  try {
    const apiKey = process.env.N2YO_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing N2YO_API_KEY in environment variables' });
    }

    const filePath = path.resolve(__dirname, 'iridium.json');
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const noradIds = fileData.testNoradIDs;

    const results = [];

    for (const id of noradIds) {
      try {
        const url = `https://api.n2yo.com/rest/v1/satellite/tle/${id}?apiKey=${apiKey}`;
        const response = await axios.get(url);

        const tleString = response.data.tle;

        const [line1, line2] = tleString.trim().split(/\r?\n/);

        const satrec = satellite.twoline2satrec(line1, line2);

        const now = new Date();

        const positionAndVelocity = satellite.propagate(satrec, now);

        if (!positionAndVelocity.position) continue;

        const gmst = satellite.gstime(now);

        const geodetic = satellite.eciToGeodetic(
          positionAndVelocity.position,
          gmst
        );

        const latitude = satellite.degreesLat(geodetic.latitude);
        const longitude = satellite.degreesLong(geodetic.longitude);

        const altitudeKm = geodetic.height;

        results.push({
          noradId: id,
          lat: latitude,
          lng: longitude,
          altitudeKm: altitudeKm,
          altitudeRatio: altitudeKm / 6371 
        });

        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`Failed for NORAD ${id}`, err.message);
      }
    }

    res.json({
      timestamp: new Date(),
      satellites: results
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Failed to fetch TLE data' });
  }
});

app.get('/api/iridium/coverage', async (req, res) => {
  const { lat = 45.42, lng = -75.7, alt = 100 } = req.query;
  const apiKey = process.env.N2YO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing N2YO_API_KEY' });

  const filePath = path.resolve(__dirname, 'iridium.json');
  const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const noradIds = fileData.testNoradIDs;

  const results = [];
  for (const id of noradIds) {
    try {
      const tleString = await getCachedTLE(id, apiKey);
      if (!tleString) {
        console.log(`NORAD ${id}: No TLE (skipped)`);
        continue;
      }
      const [line1, line2] = tleString.trim().split(/\r?\n/);
      const satrec = satellite.twoline2satrec(line1, line2);
      const now = new Date();
      const pv = satellite.propagate(satrec, now);
      if (!pv || !pv.position) continue;

      const gmst = satellite.gstime(now);
      const geo = satellite.eciToGeodetic(pv.position, gmst);
      const satPos = {
        lat: satellite.degreesLat(geo.latitude),
        lng: satellite.degreesLong(geo.longitude),
        altitudeKm: geo.height
      };

      const observerGd = {
        longitude: satellite.degreesToRadians(lng),
        latitude: satellite.degreesToRadians(lat),
        height: alt / 1000  // meters -> km
      };

      // Satellite position in ECF
      const satEcf = satellite.eciToEcf(pv.position, gmst);

      // Look angles: observer (geodetic) + satellite (ECF)
      const lookAngles = satellite.ecfToLookAngles(observerGd, satEcf);

      const elevation = satellite.radiansToDegrees(lookAngles.elevation);
      const rangeKm = lookAngles.range;
      
      if (rangeKm && !isNaN(rangeKm)) {
        const pathLossDb = 32.44 + 20 * Math.log10(rangeKm) + 20 * Math.log10(14);
        results.push({
          noradId: id,
          ...satPos,
          elevation: +(elevation).toFixed(1),
          rangeKm: Math.round(rangeKm),
          pathLossDb: Math.round(pathLossDb),
          available: elevation > 10 && pathLossDb < 160
        });
      } else {
        results.push({
          noradId: id,
          ...satPos,
          elevation: +(elevation).toFixed(1),
          rangeKm: null,
          pathLossDb: null,
          available: false  // Skip bad range
        });
      }

      await new Promise(resolve => setTimeout(resolve, 300));  // Rate limit
    } catch (err) {
      console.error(`NORAD ${id}:`, err.message);
    }
  }

  res.json({
    observer: { lat, lng, alt: `${alt}m` },
    satellites: results
  });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
