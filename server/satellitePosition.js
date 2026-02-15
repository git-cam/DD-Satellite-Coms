// satellitePosition.js
import * as satellite from 'satellite.js';

export function getSatellitePosition(tleLine1, tleLine2, date = new Date()) {

  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);

  // Propagate to given time
  const positionAndVelocity = satellite.propagate(satrec, date);

  const positionEci = positionAndVelocity.position;
  if (!positionEci) return null;

  // GMST (Earth rotation)
  const gmst = satellite.gstime(date);

  // Convert ECI → Geodetic coordinates
  const geodetic = satellite.eciToGeodetic(positionEci, gmst);

  const latitude = satellite.degreesLat(geodetic.latitude);
  const longitude = satellite.degreesLong(geodetic.longitude);
  const height = geodetic.height * 1000; // km → meters

  return {
    lat: latitude,
    lng: longitude,
    altitude: height
  };
}
