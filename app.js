// Initialize map
const map = L.map('map').setView([40.7128, -74.0060], 13); // Default to New York

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Variables to track drawing state
let drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

let drawControl = null;
let isDrawing = false;
let currentRoute = null;

// Handle draw events
map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    drawnItems.clearLayers();
    drawnItems.addLayer(layer);
    currentRoute = layer;
    updateRouteInfo(layer);
    document.getElementById('exportBtn').disabled = false;
    isDrawing = false;
    document.getElementById('drawBtn').textContent = 'Draw Route';
    
    // Remove draw control after route is created
    if (drawControl) {
        map.removeControl(drawControl);
        drawControl = null;
    }
});

map.on(L.Draw.Event.DELETED, function (e) {
    currentRoute = null;
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('routeInfo').textContent = 'Draw a route on the map to get started';
});

map.on(L.Draw.Event.DRAWSTART, function (e) {
    isDrawing = true;
});

map.on(L.Draw.Event.DRAWSTOP, function (e) {
    isDrawing = false;
});

// Update route information
function updateRouteInfo(layer) {
    if (layer instanceof L.Polyline) {
        const latlngs = layer.getLatLngs();
        const distance = calculateDistance(latlngs);
        const pointCount = latlngs.length;
        
        document.getElementById('routeInfo').innerHTML = `
            <strong>Route Created!</strong><br>
            Distance: ${distance.toFixed(2)} km (${(distance * 0.621371).toFixed(2)} miles)<br>
            Waypoints: ${pointCount}
        `;
    }
}

// Calculate total distance of route
function calculateDistance(latlngs) {
    let totalDistance = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
        totalDistance += latlngs[i].distanceTo(latlngs[i + 1]) / 1000; // Convert to km
    }
    return totalDistance;
}

// Generate GPX file content
function generateGPX(layer) {
    if (!layer || !(layer instanceof L.Polyline)) {
        return null;
    }

    const latlngs = layer.getLatLngs();
    const now = new Date();
    const timestamp = now.toISOString();
    
    // Calculate total distance for realistic timing
    const totalDistance = calculateDistance(latlngs);
    const averagePace = 5.0; // minutes per kilometer (adjustable)
    const totalTimeMinutes = totalDistance * averagePace;
    const timePerPoint = totalTimeMinutes / latlngs.length;
    
    // Generate base elevation (can be enhanced with elevation API)
    let baseElevation = 50; // meters above sea level
    
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX2Strava" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Custom Running Route</name>
    <time>${timestamp}</time>
  </metadata>
  <trk>
    <name>Running Route</name>
    <type>Running</type>
    <trkseg>
`;

    latlngs.forEach((latlng, index) => {
        // Create timestamps that simulate a realistic running pace
        const timeOffset = index * timePerPoint * 60 * 1000; // Convert minutes to milliseconds
        const pointTime = new Date(now.getTime() + timeOffset);
        
        // Simulate slight elevation variations for realism
        const elevation = baseElevation + Math.sin(index * 0.1) * 10 + Math.random() * 5;
        
        gpx += `      <trkpt lat="${latlng.lat}" lon="${latlng.lng}">
        <ele>${elevation.toFixed(2)}</ele>
        <time>${pointTime.toISOString()}</time>
      </trkpt>
`;
    });

    gpx += `    </trkseg>
  </trk>
</gpx>`;

    return gpx;
}

// Export GPX file
function exportGPX() {
    if (!currentRoute) {
        alert('Please draw a route first!');
        return;
    }

    const gpxContent = generateGPX(currentRoute);
    if (!gpxContent) {
        alert('Error generating GPX file');
        return;
    }

    // Create blob and download
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `running-route-${Date.now()}.gpx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Button event listeners
document.getElementById('drawBtn').addEventListener('click', function() {
    // Remove existing draw control
    if (drawControl) {
        map.removeControl(drawControl);
    }
    
    // Create new draw control and enable polyline drawing
    drawControl = new L.Control.Draw({
        draw: {
            polyline: {
                shapeOptions: {
                    color: '#667eea',
                    weight: 5
                },
                metric: true,
                showLength: true
            },
            polygon: false,
            circle: false,
            rectangle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    
    map.addControl(drawControl);
    
    // Enable polyline drawing immediately
    setTimeout(() => {
        if (drawControl._toolbars && drawControl._toolbars.draw) {
            drawControl._toolbars.draw._modes.polyline.handler.enable();
        }
    }, 100);
    
    isDrawing = true;
    this.textContent = 'Drawing... Click map to draw';
});

document.getElementById('clearBtn').addEventListener('click', function() {
    if (confirm('Are you sure you want to clear the route?')) {
        drawnItems.clearLayers();
        currentRoute = null;
        document.getElementById('exportBtn').disabled = true;
        document.getElementById('routeInfo').textContent = 'Draw a route on the map to get started';
    }
});

document.getElementById('exportBtn').addEventListener('click', exportGPX);

// Get user's location (optional)
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
        map.setView([position.coords.latitude, position.coords.longitude], 13);
    }, function() {
        // Default to New York if geolocation fails
        console.log('Geolocation not available, using default location');
    });
}

