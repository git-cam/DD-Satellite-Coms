// satUtil.js
function greatCircleDistance(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS = 6371; 
  
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS * c;
}

function generateHeatmap(satellites) {
  const EARTH_RADIUS = 6371; 
  const GRID_SPACING_KM = 300; 
  
  const coveragePoints = [];
  
  satellites.forEach((sat) => {
    const h = sat.altitude * EARTH_RADIUS; 
    const centralAngle = Math.acos(EARTH_RADIUS / (EARTH_RADIUS + h));
    const coverageRadiusKm = EARTH_RADIUS * centralAngle;
    
    const coverageRadiusDeg = coverageRadiusKm / 111;
    
    const minLat = Math.max(-90, sat.lat - coverageRadiusDeg);
    const maxLat = Math.min(90, sat.lat + coverageRadiusDeg);
    
    const latStepDeg = GRID_SPACING_KM / 111;
    
    for (let lat = minLat; lat <= maxLat; lat += latStepDeg) {
      const latCos = Math.max(0.01, Math.cos(lat * Math.PI / 180));
      const lonStepDeg = GRID_SPACING_KM / (111 * latCos);
      
      const minLng = sat.lng - coverageRadiusDeg / latCos;
      const maxLng = sat.lng + coverageRadiusDeg / latCos;
      
      for (let lng = minLng; lng <= maxLng; lng += lonStepDeg) {
       
        let normLng = lng;
        while (normLng < -180) normLng += 360;
        while (normLng >= 180) normLng -= 360;
        
        const distance = greatCircleDistance(sat.lat, sat.lng, lat, normLng);
        
        if (distance <= coverageRadiusKm) {
          coveragePoints.push([lat, normLng]);
        }
      }
    }
  });
  
  return coveragePoints;
}

export { generateHeatmap };