// Initialize map
const map = L.map('map').setView([40.7128, -74.0060], 13); // Default to New York

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// Add geocoder for location search
const geocoder = L.Control.Geocoder.nominatim();
if (typeof L.Control.Geocoder !== 'undefined') {
    L.Control.geocoder({
        geocoder: geocoder,
        position: 'topright'
    }).addTo(map);
}

// Variables to track drawing state
let drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

let drawControl = null;
let drawHandler = null;
let isDrawing = false;
let currentRoute = null;
let currentActivityType = 'run';
let paceChart = null;
let elevationChart = null;
let waypointMarkers = [];

// Initialize draw control (always visible)
function initDrawControl() {
    drawControl = new L.Control.Draw({
        draw: {
            polyline: {
                shapeOptions: {
                    color: '#667eea',
                    weight: 5
                },
                metric: true,
                showLength: true,
                repeatMode: false
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
}

// Initialize draw control
initDrawControl();

// Initialize charts
function initCharts() {
    const paceCtx = document.getElementById('paceChart').getContext('2d');
    paceChart = new Chart(paceCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Pace (min/km)',
                data: [],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    reverse: true
                }
            }
        }
    });

    const elevationCtx = document.getElementById('elevationChart').getContext('2d');
    elevationChart = new Chart(elevationCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Elevation (m)',
                data: [],
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
}

initCharts();

// Handle draw events
map.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    drawnItems.clearLayers();
    drawnItems.addLayer(layer);
    currentRoute = layer;
    updateRouteInfo(layer);
    updateCharts(layer);
    document.getElementById('exportBtn').disabled = false;
    isDrawing = false;
    updateShapeButtons('draw');
});

map.on(L.Draw.Event.DELETED, function (e) {
    currentRoute = null;
    document.getElementById('exportBtn').disabled = true;
    clearCharts();
    clearWaypoints();
});

map.on(L.Draw.Event.DRAWSTART, function (e) {
    isDrawing = true;
});

map.on(L.Draw.Event.DRAWSTOP, function (e) {
    isDrawing = false;
    if (drawHandler) {
        drawHandler.disable();
        drawHandler = null;
    }
});

// Location search
document.getElementById('locationSearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const query = this.value;
        if (query.trim()) {
            geocoder.geocode(query, function(results) {
                if (results && results.length > 0) {
                    const result = results[0];
                    map.setView(result.center, 13);
                    L.marker(result.center).addTo(map)
                        .bindPopup(result.name || query)
                        .openPopup();
                }
            });
        }
    }
});

// Shape selector buttons
document.querySelectorAll('.shape-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const shape = this.dataset.shape;
        updateShapeButtons(shape);
        
        if (shape === 'draw') {
            if (drawControl && drawControl._toolbars && drawControl._toolbars.draw) {
                drawHandler = drawControl._toolbars.draw._modes.polyline.handler;
                drawHandler.enable();
            }
        } else if (shape === 'heart') {
            createHeartShape();
        } else if (shape === 'circle') {
            createCircleShape();
        }
    });
});

function updateShapeButtons(activeShape) {
    document.querySelectorAll('.shape-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.shape === activeShape) {
            btn.classList.add('active');
        }
    });
}

// Create heart shape
function createHeartShape() {
    const center = map.getCenter();
    const points = [];
    const radius = 0.01; // Adjust size
    
    for (let t = 0; t <= 2 * Math.PI; t += 0.1) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
        points.push([center.lat + y * radius * 0.1, center.lng + x * radius]);
    }
    
    const polyline = L.polyline(points, { color: '#667eea', weight: 5 });
    drawnItems.clearLayers();
    drawnItems.addLayer(polyline);
    currentRoute = polyline;
    updateRouteInfo(polyline);
    updateCharts(polyline);
    document.getElementById('exportBtn').disabled = false;
    map.fitBounds(polyline.getBounds());
}

// Create circle shape
function createCircleShape() {
    const center = map.getCenter();
    const radius = 0.01; // Adjust size
    const points = [];
    
    for (let i = 0; i <= 360; i += 10) {
        const angle = (i * Math.PI) / 180;
        const lat = center.lat + radius * Math.cos(angle);
        const lng = center.lng + radius * Math.sin(angle);
        points.push([lat, lng]);
    }
    
    const polyline = L.polyline(points, { color: '#667eea', weight: 5 });
    drawnItems.clearLayers();
    drawnItems.addLayer(polyline);
    currentRoute = polyline;
    updateRouteInfo(polyline);
    updateCharts(polyline);
    document.getElementById('exportBtn').disabled = false;
    map.fitBounds(polyline.getBounds());
}

// Show/hide waypoints
document.getElementById('showWaypoints').addEventListener('change', function() {
    if (this.checked) {
        showWaypoints();
    } else {
        clearWaypoints();
    }
});

function showWaypoints() {
    clearWaypoints();
    if (currentRoute && currentRoute instanceof L.Polyline) {
        const latlngs = currentRoute.getLatLngs();
        latlngs.forEach((latlng, index) => {
            const marker = L.marker(latlng).addTo(map)
                .bindPopup(`Waypoint ${index + 1}`);
            waypointMarkers.push(marker);
        });
    }
}

function clearWaypoints() {
    waypointMarkers.forEach(marker => map.removeLayer(marker));
    waypointMarkers = [];
}

// Update route information and stats
function updateRouteInfo(layer) {
    if (layer instanceof L.Polyline) {
        const latlngs = layer.getLatLngs();
        const distance = calculateDistance(latlngs);
        const pace = parseFloat(document.getElementById('paceInput').value) || 5.5;
        const durationMinutes = distance * pace;
        const hours = Math.floor(durationMinutes / 60);
        const minutes = Math.floor(durationMinutes % 60);
        const duration = `${hours}:${minutes.toString().padStart(2, '0')}`;
        
        // Calculate elevation gain
        let elevationGain = 0;
        const elevations = generateElevations(latlngs.length);
        for (let i = 1; i < elevations.length; i++) {
            if (elevations[i] > elevations[i-1]) {
                elevationGain += elevations[i] - elevations[i-1];
            }
        }
        
        document.getElementById('distance').textContent = distance.toFixed(2);
        document.getElementById('duration').textContent = duration;
        document.getElementById('elevationGain').textContent = Math.round(elevationGain) + 'm';
        
        if (document.getElementById('showWaypoints').checked) {
            showWaypoints();
        }
    }
}

// Update charts
function updateCharts(layer) {
    if (!layer || !(layer instanceof L.Polyline)) {
        return;
    }
    
    const latlngs = layer.getLatLngs();
    const distance = calculateDistance(latlngs);
    const pace = parseFloat(document.getElementById('paceInput').value) || 5.5;
    const inconsistency = parseFloat(document.getElementById('paceInconsistency').value) || 0;
    
    // Generate pace data
    const paceData = [];
    const elevationData = [];
    const labels = [];
    const elevations = generateElevations(latlngs.length);
    
    let cumulativeDistance = 0;
    for (let i = 0; i < latlngs.length; i++) {
        if (i > 0) {
            cumulativeDistance += latlngs[i-1].distanceTo(latlngs[i]) / 1000;
        }
        labels.push(cumulativeDistance.toFixed(2));
        
        // Pace with inconsistency
        const paceVariation = (Math.random() - 0.5) * inconsistency * 0.1;
        paceData.push(pace + paceVariation);
        elevationData.push(elevations[i]);
    }
    
    // Update pace chart
    paceChart.data.labels = labels;
    paceChart.data.datasets[0].data = paceData;
    paceChart.update();
    
    const avgPace = (paceData.reduce((a, b) => a + b, 0) / paceData.length).toFixed(2);
    document.getElementById('paceInfo').textContent = `Average: ${avgPace} min/km`;
    
    // Update elevation chart
    elevationChart.data.labels = labels;
    elevationChart.data.datasets[0].data = elevationData;
    elevationChart.update();
    
    const totalGain = elevations.reduce((sum, elev, i) => {
        if (i > 0 && elev > elevations[i-1]) {
            return sum + (elev - elevations[i-1]);
        }
        return sum;
    }, 0);
    document.getElementById('elevationInfo').textContent = `Total Gain: ${Math.round(totalGain)}m`;
}

function clearCharts() {
    paceChart.data.labels = [];
    paceChart.data.datasets[0].data = [];
    paceChart.update();
    
    elevationChart.data.labels = [];
    elevationChart.data.datasets[0].data = [];
    elevationChart.update();
    
    document.getElementById('paceInfo').textContent = 'Average: 5.50 min/km';
    document.getElementById('elevationInfo').textContent = 'Total Gain: 0m';
    document.getElementById('distance').textContent = '0';
    document.getElementById('duration').textContent = '0:00';
    document.getElementById('elevationGain').textContent = '0m';
}

// Generate elevation data
function generateElevations(count) {
    const elevations = [];
    let baseElevation = 50;
    for (let i = 0; i < count; i++) {
        const elevation = baseElevation + Math.sin(i * 0.1) * 20 + Math.random() * 10;
        elevations.push(Math.max(0, elevation));
    }
    return elevations;
}

// Calculate total distance of route
function calculateDistance(latlngs) {
    let totalDistance = 0;
    for (let i = 0; i < latlngs.length - 1; i++) {
        totalDistance += latlngs[i].distanceTo(latlngs[i + 1]) / 1000; // Convert to km
    }
    return totalDistance;
}

// Activity type toggle
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentActivityType = this.dataset.activity;
    });
});

// Pace inconsistency slider
document.getElementById('paceInconsistency').addEventListener('input', function() {
    document.getElementById('paceInconsistencyValue').textContent = this.value + '%';
    if (currentRoute) {
        updateCharts(currentRoute);
    }
});

// Pace input change
document.getElementById('paceInput').addEventListener('change', function() {
    if (currentRoute) {
        updateRouteInfo(currentRoute);
        updateCharts(currentRoute);
    }
});

// Set default date and time
document.getElementById('runDate').valueAsDate = new Date();
const now = new Date();
document.getElementById('startTime').value = now.toTimeString().slice(0, 5);

// Generate GPX file content
function generateGPX(layer) {
    if (!layer || !(layer instanceof L.Polyline)) {
        return null;
    }

    const latlngs = layer.getLatLngs();
    const runDate = document.getElementById('runDate').value;
    const startTime = document.getElementById('startTime').value;
    const runName = document.getElementById('runName').value || 'My Running Route';
    const description = document.getElementById('description').value || '';
    const includeHeartRate = document.getElementById('includeHeartRate').checked;
    
    // Create start datetime
    const startDateTime = new Date(runDate + 'T' + startTime);
    const timestamp = startDateTime.toISOString();
    
    // Calculate total distance for realistic timing
    const totalDistance = calculateDistance(latlngs);
    const averagePace = parseFloat(document.getElementById('paceInput').value) || 5.0;
    const inconsistency = parseFloat(document.getElementById('paceInconsistency').value) || 0;
    const totalTimeMinutes = totalDistance * averagePace;
    const timePerPoint = totalTimeMinutes / latlngs.length;
    
    // Generate elevations
    const elevations = generateElevations(latlngs.length);
    
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX2Strava" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${runName}</name>
    <desc>${description}</desc>
    <time>${timestamp}</time>
  </metadata>
  <trk>
    <name>${runName}</name>
    <type>${currentActivityType === 'run' ? 'Running' : 'Biking'}</type>
    <trkseg>
`;

    latlngs.forEach((latlng, index) => {
        // Create timestamps with pace variation
        const paceVariation = (Math.random() - 0.5) * inconsistency * 0.1;
        const adjustedPace = averagePace + paceVariation;
        const adjustedTimePerPoint = (totalDistance / latlngs.length) * adjustedPace;
        const timeOffset = index * adjustedTimePerPoint * 60 * 1000;
        const pointTime = new Date(startDateTime.getTime() + timeOffset);
        
        gpx += `      <trkpt lat="${latlng.lat}" lon="${latlng.lng}">
        <ele>${elevations[index].toFixed(2)}</ele>
        <time>${pointTime.toISOString()}</time>`;
        
        if (includeHeartRate) {
            // Generate realistic heart rate (140-180 for running, 120-160 for biking)
            const baseHR = currentActivityType === 'run' ? 160 : 140;
            const hr = baseHR + Math.floor(Math.random() * 20) - 10;
            gpx += `
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>${hr}</gpxtpx:hr>
          </gpxtpx:TrackPointExtension>
        </extensions>`;
        }
        
        gpx += `
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

    const runName = document.getElementById('runName').value || 'running-route';
    const filename = runName.toLowerCase().replace(/\s+/g, '-') + '.gpx';

    // Create blob and download
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Button event listeners
document.getElementById('drawBtn').addEventListener('click', function() {
    if (isDrawing) {
        if (drawHandler) {
            drawHandler.disable();
            drawHandler = null;
        }
        isDrawing = false;
    } else {
        if (drawControl && drawControl._toolbars && drawControl._toolbars.draw) {
            drawHandler = drawControl._toolbars.draw._modes.polyline.handler;
            drawHandler.enable();
            isDrawing = true;
        }
    }
});

document.getElementById('clearBtn').addEventListener('click', function() {
    if (confirm('Are you sure you want to clear the route?')) {
        drawnItems.clearLayers();
        currentRoute = null;
        document.getElementById('exportBtn').disabled = true;
        clearCharts();
        clearWaypoints();
    }
});

document.getElementById('exportBtn').addEventListener('click', exportGPX);

// Get user's location (optional)
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
        map.setView([position.coords.latitude, position.coords.longitude], 13);
    }, function() {
        console.log('Geolocation not available, using default location');
    });
}
