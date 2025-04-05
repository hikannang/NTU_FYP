// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Global variables
var distance;
var isViewed = false;
var loadingTimeout;
var bookingId = null;
var carDirections = "";
var servicesStarted = false;
var compassInitialized = false;
var hasOrientationSupport = false;
var positionHistoryEnabled = false;

// Simple compass variables (Google Maps style)
var smoothedHeading = null;
var direction = 0;
var bearing = 0;
var lastDeviceOrientation = null;

// Initialize target coordinates
var target = {
    latitude: 0,
    longitude: 0
};

// Initialize current location
var current = { 
    latitude: null, 
    longitude: null 
};

// Position history for movement direction
var positionHistory = [];
var movementDirection = null;

// Detect device type
const isIOS = navigator.userAgent.match(/(iPod|iPhone|iPad)/) && 
              navigator.userAgent.match(/AppleWebKit/);
const isAndroid = /Android/i.test(navigator.userAgent);

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAyCFiPFqo9vK70--rLgwKUNw6MB_fFE54",
    authDomain: "bao-car-liao.firebaseapp.com",
    projectId: "bao-car-liao",
    storageBucket: "bao-car-liao.appspot.com",
    messagingSenderId: "823459566475",
    appId: "1:823459566475:web:06e8127e7f910630276e68",
    measurementId: "G-NZ6QEZ6HQG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Show loading screen
function showLoadingScreen() {
    var loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        loadingTimeout = setTimeout(function () {
            hideLoadingScreen();
        }, 3000);
    }
}

// Hide loading screen
function hideLoadingScreen() {
    var loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
        clearTimeout(loadingTimeout);
    }
}

// Parse URL parameters to get target coordinates and booking ID
function getUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Get latitude, longitude, and booking ID
    const lat = parseFloat(urlParams.get('lat'));
    const lng = parseFloat(urlParams.get('lng'));
    bookingId = urlParams.get('id');
    
    console.log("URL parameters - lat:", lat, "lng:", lng, "bookingId:", bookingId);
    
    if (!isNaN(lat) && !isNaN(lng)) {
        target.latitude = lat;
        target.longitude = lng;
        
        console.log("Target coordinates set to:", target.latitude, target.longitude);
        
        // Create AR marker at destination
        createDestinationMarker(lat, lng);
        
        // Start location services
        startServices();
    } else {
        console.error("No valid coordinates in URL parameters");
        alert("Missing or invalid location coordinates. Please check the URL.");
    }
    
    // Fetch car data if booking ID is provided
    if (bookingId) {
        fetchCarData(bookingId);
    }
}

// Create AR marker at destination
function createDestinationMarker(lat, lng) {
    if (document.getElementById('destinationMarker')) {
        return; // Marker already exists
    }
    
    console.log("Creating destination marker at:", lat, lng);
    
    // Get AR scene
    const scene = document.querySelector('a-scene');
    
    if (!scene) {
        console.error("A-Frame scene not found");
        return;
    }
    
    // Create entity for destination marker
    const entity = document.createElement('a-entity');
    entity.setAttribute('id', 'destinationMarker');
    entity.setAttribute('gltf-model', './static/3dModels/GLB/location3.glb');
    entity.setAttribute('scale', '2 2 2');
    
    // Use original AR.js attribute format
    entity.setAttribute('gps-projected-entity-place', `latitude: ${lat}; longitude: ${lng}`);
    
    // Add animation
    entity.setAttribute('animation-mixer', '');
    
    // Add to scene
    scene.appendChild(entity);
    
    // Show loading screen while AR content loads
    showLoadingScreen();
}

// Fetch car data from Firebase
async function fetchCarData(bookingId) {
    try {
        console.log("Fetching car data for booking:", bookingId);
        
        // Get booking document
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnapshot = await getDoc(bookingRef);
        
        if (bookingSnapshot.exists()) {
            const bookingData = bookingSnapshot.data();
            const carId = bookingData.car_id;
            
            console.log("Found booking, fetching car data for car ID:", carId);
            
            // Get car document
            const carRef = doc(db, "cars", carId.toString());
            const carSnapshot = await getDoc(carRef);
            
            if (carSnapshot.exists()) {
                const carData = carSnapshot.data();
                
                // Save car directions for display in the destination modal
                carDirections = carData.directions || "You have reached your destination.";
                console.log("Retrieved car directions:", carDirections);
            } else {
                console.warn("Car document not found");
            }
        } else {
            console.warn("Booking document not found");
        }
    } catch (error) {
        console.error("Error fetching car data:", error);
    }
}

// Initialize the application
function init() {
    console.log("Initializing AR wayfinding");
    
    // Parse URL parameters
    getUrlParameters();
    
    // Start UI updates for compass
    updateUI();
    
    // Track device orientation for reference
    window.addEventListener("deviceorientation", function(event) {
        lastDeviceOrientation = {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma
        };
    }, false);
}

// Calculate bearing (direction from current to target)
function calculateBearing() {
    if (current.latitude === null || current.longitude === null || 
        target.latitude === 0 || target.longitude === 0) {
        return 0; // Default bearing if no valid coordinates
    }
    
    var lat1 = current.latitude * (Math.PI / 180);
    var lon1 = current.longitude * (Math.PI / 180);
    var lat2 = target.latitude * (Math.PI / 180);
    var lon2 = target.longitude * (Math.PI / 180);
    
    var y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    
    var brng = Math.atan2(y, x) * (180 / Math.PI);
    return (brng + 360) % 360; // Normalize to 0-360
}

// Setup device orientation
function startOrientation() {
    if (compassInitialized) return;
    
    compassInitialized = true;
    console.log("Setting up orientation for " + (isIOS ? "iOS" : "Android") + " device");
    
    // For iOS
    if (isIOS) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then((response) => {
                    if (response === "granted") {
                        console.log("iOS orientation permission granted");
                        window.addEventListener("deviceorientation", handleOrientation);
                        hasOrientationSupport = true;
                    } else {
                        console.error("iOS orientation permission denied");
                        enablePositionHistory(); // Fallback
                    }
                })
                .catch((error) => {
                    console.error("iOS orientation permission error:", error);
                    enablePositionHistory(); // Fallback
                });
        } else {
            // Older iOS
            window.addEventListener("deviceorientation", handleOrientation);
        }
    } else {
        // For Android (Google Maps style approach)
        window.addEventListener("deviceorientation", handleOrientation);
        
        // Also try absolute orientation if available
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener("deviceorientationabsolute", handleOrientation);
            console.log("Added absolute orientation listener");
        }
        
        // Check if orientation data is received
        setTimeout(() => {
            if (!hasOrientationSupport) {
                console.log("No orientation data received, using position fallback");
                enablePositionHistory();
            }
        }, 2000);
    }
    
    // Handle screen orientation changes
    window.addEventListener('orientationchange', function() {
        console.log("Screen orientation changed");
        // Reset smoothed heading when orientation changes
        smoothedHeading = null;
    });
}

// Google Maps style orientation handler
function handleOrientation(event) {
    // Set flag that we have orientation data
    hasOrientationSupport = true;
    
    // Get raw heading
    let rawHeading;
    
    if (event.webkitCompassHeading !== undefined) {
        // iOS - already calibrated
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        // Android - convert alpha to heading
        rawHeading = (360 - event.alpha) % 360;
        
        // Adjust for screen orientation
        if (window.orientation !== undefined) {
            if (window.orientation === 90) {
                rawHeading = (rawHeading + 90) % 360;
            } else if (window.orientation === -90) {
                rawHeading = (rawHeading - 90) % 360;
            } else if (window.orientation === 180) {
                rawHeading = (rawHeading + 180) % 360;
            }
        }
    } else {
        return; // No valid data
    }
    
    // Google Maps style heading smoothing
    if (smoothedHeading === null) {
        // First reading - just use it directly
        smoothedHeading = rawHeading;
    } else {
        // Difference between readings
        let diff = rawHeading - smoothedHeading;
        
        // Handle wrap-around (e.g., going from 359° to 0°)
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        // Apply stronger smoothing for small changes (Google Maps approach)
        let factor = Math.min(Math.abs(diff) / 45, 1) * 0.1 + 0.02;
        
        // Update smoothed heading
        smoothedHeading = (smoothedHeading + diff * factor + 360) % 360;
    }
    
    // Calculate bearing to target
    bearing = calculateBearing();
    
    // Calculate arrow direction
    direction = (bearing - smoothedHeading + 360) % 360;
}

// Enable position history tracking for direction estimation
function enablePositionHistory() {
    if (positionHistoryEnabled) return;
    
    positionHistoryEnabled = true;
    console.log("Enabling position history tracking for direction estimation");
    
    // Clear any existing interval
    if (window.positionHistoryInterval) clearInterval(window.positionHistoryInterval);
    
    // Update position history and calculate movement direction
    window.positionHistoryInterval = setInterval(() => {
        if (current.latitude && current.longitude) {
            // Add current position to history
            positionHistory.push({
                latitude: current.latitude,
                longitude: current.longitude,
                timestamp: Date.now()
            });
            
            // Keep only the last 5 positions
            if (positionHistory.length > 5) {
                positionHistory.shift();
            }
            
            // Calculate direction if we have enough positions
            if (positionHistory.length >= 2) {
                calculateMovementDirection();
            }
        }
    }, 1000);
}

// Calculate direction of movement from position history
function calculateMovementDirection() {
    if (positionHistory.length < 2) return;
    
    // Get oldest and newest positions
    const oldest = positionHistory[0];
    const newest = positionHistory[positionHistory.length - 1];
    
    // Check if movement is significant
    const latDiff = newest.latitude - oldest.latitude;
    const lngDiff = newest.longitude - oldest.longitude;
    
    if (Math.abs(latDiff) > 0.00001 || Math.abs(lngDiff) > 0.00001) {
        // Calculate bearing between points
        const lat1 = oldest.latitude * (Math.PI / 180);
        const lon1 = oldest.longitude * (Math.PI / 180);
        const lat2 = newest.latitude * (Math.PI / 180);
        const lon2 = newest.longitude * (Math.PI / 180);
        
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        
        const movementBearing = Math.atan2(y, x) * (180 / Math.PI);
        movementDirection = (movementBearing + 360) % 360;
        
        // If orientation not available, use movement direction
        if (!hasOrientationSupport) {
            bearing = calculateBearing();
            direction = (bearing - movementDirection + 360) % 360;
        }
    }
}

// Update current position
function setCurrentPosition(position) {
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
    
    // Update bearing
    bearing = calculateBearing();
    
    // Update display
    updateDistanceDisplay();
}

// Update distance display
function updateDistanceDisplay() {
    if (current.latitude === null || current.longitude === null || 
        target.latitude === 0 || target.longitude === 0) {
        return;
    }
    
    // Calculate distance using Haversine formula
    var lat1 = current.latitude * (Math.PI / 180);
    var lon1 = current.longitude * (Math.PI / 180);
    var lat2 = target.latitude * (Math.PI / 180);
    var lon2 = target.longitude * (Math.PI / 180);
    
    var R = 6371; // Earth radius in km
    var dLat = lat2 - lat1;
    var dLon = lon2 - lon1;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distance = R * c * 1000; // Distance in meters
    
    // Update UI
    var distanceElement = document.getElementById("distanceFromTarget");
    if (distanceElement) {
        if (distance > 20000) {
            distanceElement.innerHTML = 'Please Select Destination!';
        } else if (distance <= 1) {
            distanceElement.innerHTML = 'You have reached your car!';
        } else {
            distanceElement.innerHTML = Math.floor(distance) + "m to your booked car!";
        }
    }
    
    // Check if arrived at destination
    if (distance < 15 && !isViewed) {
        console.log("Within 15m of destination, showing modal");
        showDestinationModal();
        isViewed = true;
    }
}

// Show destination modal with car directions
function showDestinationModal() {
    console.log("Showing destination modal");
    
    // Update modal content
    var directionsContent = document.getElementById('directionsContent');
    if (directionsContent) {
        directionsContent.textContent = carDirections || "You have reached your destination.";
    }
    
    // Show the modal
    var modal = document.getElementById('destinationModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

// Open Google Maps with walking directions
function openGoogleMaps() {
    console.log("Opening Google Maps");
    
    const lat = current.latitude;
    const lng = current.longitude;
    const destLat = target.latitude;
    const destLng = target.longitude;
    
    if (lat && lng && destLat && destLng) {
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destLat},${destLng}&travelmode=walking`;
        window.open(mapsUrl, '_blank');
    } else {
        alert('Unable to open maps. Location data is not available.');
    }
}

// Update UI elements (compass arrow) - Google Maps style
function updateUI() {
    const arrow = document.querySelector(".arrow");
    
    if (arrow) {
        // Google Maps uses a slower transition for stability
        arrow.style.transition = "transform 0.5s ease";
        
        // Rotate the arrow
        arrow.style.transform = `translate(-50%, -50%) rotate(${direction}deg)`;
    }
    
    // Continue updating
    requestAnimationFrame(updateUI);
}

// Start location and orientation services
function startServices() {
    if (servicesStarted) return;
    
    servicesStarted = true;
    console.log("Starting location and orientation services");
    
    // Start geolocation
    navigator.geolocation.getCurrentPosition(
        function(position) {
            console.log("Initial position obtained");
            setCurrentPosition(position);
            
            // Start continuous tracking
            navigator.geolocation.watchPosition(
                setCurrentPosition, 
                function(error) { 
                    console.error("Geolocation error:", error);
                    alert("Location error: " + error.message);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );
        },
        function(error) {
            console.error("Initial position error:", error);
            alert("Cannot access your location. Please enable location services.");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    
    // Start orientation
    startOrientation();
}

// Expose functions to global scope for HTML
window.startARServices = startServices;
window.openGoogleMapsNav = openGoogleMaps;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing AR application");
    
    // Set up app
    init();
    
    // Add click handler for map button
    const mapBtn = document.querySelector('.maps');
    if (mapBtn) {
        mapBtn.addEventListener('click', openGoogleMaps);
        mapBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            openGoogleMaps();
        });
    }
    
    // For iOS, add click listener to body
    if (isIOS) {
        document.body.addEventListener('click', function() {
            console.log("Body clicked, requesting iOS permissions");
            if (!servicesStarted) {
                startServices();
            }
        }, { once: true });
    }
    
    console.log("AR module initialization complete");
});