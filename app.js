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
let routeStats = {
    distance: 0,
    duration: 0,
    pace: 0,
    speed: 0,
    elevationGain: 0,
    elevations: []
};

// Initialize draw control (always visible)
function initDrawControl() {
    drawControl = new L.Control.Draw({
        draw: {
            polyline: {
                shapeOptions: {
                    color: '#2563eb',
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
    document.getElementById('snapToRoadBtn').disabled = false;
    isDrawing = false;
    updateShapeButtons('draw');
});

map.on(L.Draw.Event.DELETED, function (e) {
    currentRoute = null;
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('snapToRoadBtn').disabled = true;
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
        if (drawControl && drawControl._toolbars && drawControl._toolbars.draw) {
            drawHandler = drawControl._toolbars.draw._modes.polyline.handler;
            drawHandler.enable();
        }
    });
});

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
        const paceUnit = document.getElementById('paceUnit').value;
        let paceInput = parseFloat(document.getElementById('paceInput').value) || 5.5;
        
        // Convert pace to min/km for calculations (always work in metric)
        let paceInMinPerKm = paceInput;
        if (paceUnit === 'min/mile') {
            paceInMinPerKm = paceInput * 1.60934; // Convert to min/km
        }
        
        // Store actual calculated values
        const durationMinutes = distance * paceInMinPerKm;
        const durationSeconds = durationMinutes * 60;
        const hours = Math.floor(durationMinutes / 60);
        const minutes = Math.floor(durationMinutes % 60);
        const seconds = Math.floor((durationMinutes % 1) * 60);
        const duration = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Generate and store elevations (consistent across calls)
        if (routeStats.elevations.length !== latlngs.length) {
            routeStats.elevations = generateElevations(latlngs.length);
        }
        const elevations = routeStats.elevations;
        
        // Calculate elevation gain
        let elevationGain = 0;
        for (let i = 1; i < elevations.length; i++) {
            if (elevations[i] > elevations[i-1]) {
                elevationGain += elevations[i] - elevations[i-1];
            }
        }
        
        // Calculate speed (km/h)
        const speed = distance > 0 ? (distance / (durationMinutes / 60)) : 0;
        
        // Store stats for GPX generation
        routeStats.distance = distance;
        routeStats.duration = durationSeconds; // Store in seconds
        routeStats.pace = paceInMinPerKm; // Store in min/km
        routeStats.speed = speed;
        routeStats.elevationGain = elevationGain;
        
        // Display distance with unit
        const distanceUnit = paceUnit === 'min/mile' ? 'mi' : 'km';
        const distanceValue = paceUnit === 'min/mile' ? (distance * 0.621371).toFixed(2) : distance.toFixed(2);
        
        // Display pace
        const displayPace = paceUnit === 'min/mile' ? (paceInMinPerKm / 1.60934).toFixed(2) : paceInMinPerKm.toFixed(2);
        
        document.getElementById('distance').textContent = distanceValue + ' ' + distanceUnit;
        document.getElementById('duration').textContent = duration;
        document.getElementById('elevationGain').textContent = Math.round(elevationGain) + 'm';
        document.getElementById('pace').textContent = displayPace;
        document.getElementById('speed').textContent = speed.toFixed(1) + ' km/h';
        
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
    document.getElementById('distance').textContent = '0 km';
    document.getElementById('duration').textContent = '0:00:00';
    document.getElementById('elevationGain').textContent = '0m';
    document.getElementById('pace').textContent = '5.50';
    document.getElementById('speed').textContent = '0 km/h';
    
    // Reset route stats
    routeStats = {
        distance: 0,
        duration: 0,
        pace: 0,
        speed: 0,
        elevationGain: 0,
        elevations: []
    };
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
        
        // Update pace input range and default value based on activity type
        const paceInput = document.getElementById('paceInput');
        const paceSlider = document.getElementById('paceSlider');
        
        if (currentActivityType === 'bike') {
            // Bike: typically 2-5 min/km (12-30 km/h)
            paceInput.min = '2';
            paceInput.max = '5';
            paceSlider.min = '2';
            paceSlider.max = '5';
            if (parseFloat(paceInput.value) > 5 || parseFloat(paceInput.value) < 2) {
                paceInput.value = '3.00';
                paceSlider.value = '3.00';
                document.getElementById('paceValue').textContent = '3.00';
            }
        } else {
            // Run: typically 3-15 min/km
            paceInput.min = '3';
            paceInput.max = '15';
            paceSlider.min = '3';
            paceSlider.max = '15';
            if (parseFloat(paceInput.value) > 15 || parseFloat(paceInput.value) < 3) {
                paceInput.value = '5.50';
                paceSlider.value = '5.50';
                document.getElementById('paceValue').textContent = '5.50';
            }
        }
        
        if (currentRoute) {
            updateRouteInfo(currentRoute);
            updateCharts(currentRoute);
        }
    });
});

// Pace unit change
document.getElementById('paceUnit').addEventListener('change', function() {
    const paceUnit = this.value;
    document.getElementById('paceUnitLabel').textContent = paceUnit;
    
    let pace = parseFloat(document.getElementById('paceInput').value) || 5.5;
    
    // Convert pace
    if (paceUnit === 'min/mile') {
        pace = pace * 1.60934; // Convert to min/km
    } else {
        pace = pace / 1.60934; // Convert to min/mile
    }
    
    document.getElementById('paceInput').value = pace.toFixed(2);
    document.getElementById('paceSlider').value = pace.toFixed(2);
    document.getElementById('paceValue').textContent = pace.toFixed(2);
    
    if (currentRoute) {
        updateRouteInfo(currentRoute);
        updateCharts(currentRoute);
    }
});

// Pace slider
document.getElementById('paceSlider').addEventListener('input', function() {
    const value = parseFloat(this.value);
    document.getElementById('paceValue').textContent = value.toFixed(2);
    document.getElementById('paceInput').value = value.toFixed(2);
    
    if (currentRoute) {
        updateRouteInfo(currentRoute);
        updateCharts(currentRoute);
    }
});

// Pace input change
document.getElementById('paceInput').addEventListener('input', function() {
    const value = parseFloat(this.value) || 5.5;
    document.getElementById('paceSlider').value = value;
    document.getElementById('paceValue').textContent = value.toFixed(2);
    
    if (currentRoute) {
        updateRouteInfo(currentRoute);
        updateCharts(currentRoute);
    }
});

// Pace inconsistency slider
document.getElementById('paceInconsistency').addEventListener('input', function() {
    document.getElementById('paceInconsistencyValue').textContent = this.value + '%';
    if (currentRoute) {
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
    
    // Use stored stats to ensure consistency
    const totalDistance = routeStats.distance || calculateDistance(latlngs);
    const totalDurationSeconds = routeStats.duration || (totalDistance * (parseFloat(document.getElementById('paceInput').value) || 5.5) * 60);
    const averagePaceInMinPerKm = routeStats.pace || (parseFloat(document.getElementById('paceInput').value) || 5.5);
    const inconsistency = parseFloat(document.getElementById('paceInconsistency').value) || 0;
    
    // Use stored elevations or generate if not available
    const elevations = routeStats.elevations.length === latlngs.length 
        ? routeStats.elevations 
        : generateElevations(latlngs.length);
    
    // Calculate time per point (in seconds)
    const timePerPointSeconds = totalDurationSeconds / latlngs.length;
    
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

    // Pre-calculate segment distances and times for consistency
    const segmentDistances = [];
    const segmentTimes = [];
    let totalCalculatedTime = 0;
    
    for (let i = 0; i < latlngs.length; i++) {
        if (i === 0) {
            segmentDistances.push(0);
            segmentTimes.push(0);
        } else {
            const segDist = latlngs[i-1].distanceTo(latlngs[i]) / 1000; // km
            segmentDistances.push(segDist);
            
            // Apply pace variation if inconsistency is set
            const paceVariation = inconsistency > 0 ? (Math.random() - 0.5) * inconsistency * 0.1 : 0;
            const adjustedPace = averagePaceInMinPerKm + paceVariation;
            
            // Time in seconds: distance (km) * pace (min/km) * 60 (sec/min)
            const segTime = segDist * adjustedPace * 60;
            segmentTimes.push(segTime);
            totalCalculatedTime += segTime;
        }
    }
    
    // Scale times to match total duration if there's a mismatch
    const timeScale = totalDurationSeconds > 0 ? totalDurationSeconds / totalCalculatedTime : 1;
    
    latlngs.forEach((latlng, index) => {
        // Calculate cumulative time
        let cumulativeTime = 0;
        for (let i = 0; i < index; i++) {
            cumulativeTime += segmentTimes[i] * timeScale;
        }
        
        const pointTime = new Date(startDateTime.getTime() + cumulativeTime * 1000);
        
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

// Snap to road functionality
async function snapToRoad() {
    if (!currentRoute || !(currentRoute instanceof L.Polyline)) {
        alert('Please draw a route first!');
        return;
    }
    
    const latlngs = currentRoute.getLatLngs();
    if (latlngs.length < 2) {
        alert('Route needs at least 2 points to snap to roads');
        return;
    }
    
    const snapBtn = document.getElementById('snapToRoadBtn');
    snapBtn.disabled = true;
    snapBtn.innerHTML = '<span class="btn-icon">⏳</span> Snapping...';
    
    try {
        // Use OSRM routing service
        const profile = currentActivityType === 'bike' ? 'cycling' : 'foot';
        const coordinates = latlngs.map(ll => `${ll.lng},${ll.lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const snappedCoordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]); // Convert [lng, lat] to [lat, lng]
            
            // Remove old route
            drawnItems.removeLayer(currentRoute);
            
            // Create new snapped route
            const snappedRoute = L.polyline(snappedCoordinates, { color: '#2563eb', weight: 5 });
            drawnItems.addLayer(snappedRoute);
            currentRoute = snappedRoute;
            
            updateRouteInfo(snappedRoute);
            updateCharts(snappedRoute);
            map.fitBounds(snappedRoute.getBounds());
            
            if (document.getElementById('showWaypoints').checked) {
                showWaypoints();
            }
        } else {
            alert('Could not snap route to roads. Please try again or draw a different route.');
        }
    } catch (error) {
        console.error('Error snapping to road:', error);
        alert('Error snapping route to roads. Please try again.');
    } finally {
        snapBtn.disabled = false;
        snapBtn.innerHTML = '<span class="btn-icon">🛣️</span> Align Path to Road';
    }
}

document.getElementById('snapToRoadBtn').addEventListener('click', snapToRoad);

document.getElementById('clearBtn').addEventListener('click', function() {
    if (confirm('Are you sure you want to clear the route?')) {
        drawnItems.clearLayers();
        currentRoute = null;
        document.getElementById('exportBtn').disabled = true;
        document.getElementById('snapToRoadBtn').disabled = true;
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
