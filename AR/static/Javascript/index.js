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

// Variables for compass calculations
var lastAlpha = 0;
var direction = 0;
var bearing = 0;

// Detect iOS device
const isIOS = navigator.userAgent.match(/(iPod|iPhone|iPad)/) && 
              navigator.userAgent.match(/AppleWebKit/);

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

        // Set timeout to hide loading screen after 3 seconds
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
    
    console.log("🌎 URL parameters - lat:", lat, "lng:", lng, "bookingId:", bookingId);
    
    if (!isNaN(lat) && !isNaN(lng)) {
        target.latitude = lat;
        target.longitude = lng;
        
        console.log("✅ Target coordinates set to:", target.latitude, target.longitude);
        
        // Create AR marker at destination
        createDestinationMarker(lat, lng);
        
        // Immediately start location services when we have valid coordinates
        startServices();
    } else {
        console.error("❌ No valid coordinates in URL parameters");
        alert("Missing or invalid location coordinates. Please check the URL.");
    }
    
    // Fetch car data if booking ID is provided
    if (bookingId) {
        fetchCarData(bookingId);
    } else {
        console.warn("⚠️ No booking ID provided in URL parameters");
    }
}

// Create AR marker at destination
function createDestinationMarker(lat, lng) {
    if (document.getElementById('destinationMarker')) {
        return; // Marker already exists
    }
    
    console.log("🚩 Creating destination marker at:", lat, lng);
    
    // Get AR scene
    const scene = document.querySelector('a-scene');
    
    if (!scene) {
        console.error("❌ A-Frame scene not found");
        return;
    }
    
    // Create entity for destination marker
    const entity = document.createElement('a-entity');
    entity.setAttribute('id', 'destinationMarker');
    entity.setAttribute('gltf-model', './static/3dModels/GLB/location3.glb');
    entity.setAttribute('scale', '2 2 2');
    
    // Try different attribute format for position - this is crucial for correct placement
    entity.setAttribute('gps-projected-entity-place', `latitude: ${lat}; longitude: ${lng}`);
    
    // Add animation
    entity.setAttribute('animation-mixer', '');
    
    // Add to scene
    scene.appendChild(entity);
    
    // Log for debugging
    console.log("🏠 AR marker added to scene with coordinates:", lat, lng);
    
    // Show loading screen while AR content loads
    showLoadingScreen();
}

// Fetch car data from Firebase
async function fetchCarData(bookingId) {
    try {
        console.log("🔍 Fetching car data for booking:", bookingId);
        
        // Get booking document
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnapshot = await getDoc(bookingRef);
        
        if (bookingSnapshot.exists()) {
            const bookingData = bookingSnapshot.data();
            const carId = bookingData.car_id;
            
            console.log("🚗 Found booking, fetching car data for car ID:", carId);
            
            // Get car document
            const carRef = doc(db, "cars", carId.toString());
            const carSnapshot = await getDoc(carRef);
            
            if (carSnapshot.exists()) {
                const carData = carSnapshot.data();
                
                // Save car directions for display in the destination modal
                carDirections = carData.directions || "You have reached your destination.";
                console.log("📝 Retrieved car directions:", carDirections);
            } else {
                console.warn("⚠️ Car document not found");
            }
        } else {
            console.warn("⚠️ Booking document not found");
        }
    } catch (error) {
        console.error("❌ Error fetching car data:", error);
    }
}

// Initialize geolocation and device orientation
function init() {
    console.log("🚀 Initializing AR wayfinding");
    
    // Parse URL parameters
    getUrlParameters();
    
    // Start UI updates for compass
    updateUI();
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

// Request permission for device orientation (required for iOS)
function startCompass() {
    console.log("🧭 Requesting compass permissions");
    
    if (isIOS) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then((response) => {
                    if (response === "granted") {
                        console.log("✅ iOS orientation permission granted");
                        window.addEventListener("deviceorientation", handleOrientation);
                    } else {
                        console.error("❌ iOS orientation permission denied");
                        alert("Permission is required for compass functionality");
                    }
                })
                .catch((error) => {
                    console.error("❌ iOS orientation permission error:", error);
                    alert("Device orientation not supported");
                });
        } else {
            // Older iOS that doesn't need permissions
            window.addEventListener("deviceorientation", handleOrientation);
        }
    } else {
        // Non-iOS devices - try different event types
        if (window.DeviceOrientationAbsoluteEvent) {
            window.addEventListener("deviceorientationabsolute", handleOrientation);
        } else if (window.DeviceOrientation) {
            window.addEventListener("deviceorientation", handleOrientation);
        } else {
            console.error("Device orientation not supported by this device");
            alert("Your device doesn't support compass functionality.");
        }
    }
}

// Handle device orientation event
function handleOrientation(event) {
    // Get heading (direction device is facing)
    let heading = 0;
    
    // iOS uses webkitCompassHeading (degrees clockwise from North)
    if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
    } 
    // Android uses alpha (degrees counterclockwise from East)
    else if (event.alpha !== null) {
        heading = 360 - event.alpha; // Convert to clockwise from North
    }
    
    // Calculate direction to point (bearing minus heading)
    bearing = calculateBearing();
    direction = (bearing - heading + 360) % 360;
    
    // Log heading and direction
    console.log(`Heading: ${heading.toFixed(1)}°, Bearing: ${bearing.toFixed(1)}°, Arrow: ${direction.toFixed(1)}°`);
    
    // Force update the distance
    updateDistanceDisplay();
}

// Update current position from geolocation API
function setCurrentPosition(position) {
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
    console.log("📍 Current position updated:", current.latitude, current.longitude);
    
    // Recalculate bearing when position changes
    bearing = calculateBearing();
    
    // Force update the distance display
    updateDistanceDisplay();
}

// Update the distance display independently
function updateDistanceDisplay() {
    if (current.latitude === null || current.longitude === null || 
        target.latitude === 0 || target.longitude === 0) {
        return; // Skip if coordinates aren't valid
    }
    
    // Calculate distance
    var lat1 = current.latitude * (Math.PI / 180);
    var lon1 = current.longitude * (Math.PI / 180);
    var lat2 = target.latitude * (Math.PI / 180);
    var lon2 = target.longitude * (Math.PI / 180);
    
    var R = 6371; // Radius of the earth in km
    var dLat = lat2 - lat1;
    var dLon = lon2 - lon1;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distance = R * c * 1000; // Distance in meters
    
    // Update distance display
    var distanceElement = document.getElementById("distanceFromTarget");
    if (distanceElement) {
        if (distance > 20000) {
            distanceElement.innerHTML = 'Please Select Destination!';
        } else if (distance <= 1) {
            distanceElement.innerHTML = 'You have reached your car!';
        } else {
            // Display the distance with car-specific text
            distanceElement.innerHTML = Math.floor(distance) + "m to your booked car!";
        }
        console.log("📏 Distance: " + Math.floor(distance) + "m");
    } else {
        console.error("❌ Distance element not found");
    }
    
    // Check for arrival
    if (distance < 15 && !isViewed) {
        console.log("🏁 Within 15m of destination, showing modal");
        showDestinationModal();
        isViewed = true;
    }
}

// Show destination modal with car directions
function showDestinationModal() {
    console.log("🏁 Showing destination modal");
    
    // Update modal content with car directions
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
    console.log("🗺️ Opening Google Maps");
    
    // Get coordinates for maps
    const lat = current.latitude;
    const lng = current.longitude;
    const destLat = target.latitude;
    const destLng = target.longitude;
    
    // Open Google Maps with walking directions
    if (lat && lng && destLat && destLng) {
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destLat},${destLng}&travelmode=walking`;
        window.open(mapsUrl, '_blank');
    } else {
        alert('Unable to open maps. Location data is not available.');
    }
}

// Update UI elements (compass arrow)
function updateUI() {
    const arrow = document.querySelector(".arrow");
    
    if (arrow) {
        // Apply rotation to the arrow based on direction
        arrow.style.transform = `translate(-50%, -50%) rotate(${direction}deg)`;
    }
    
    // Continue updating
    requestAnimationFrame(updateUI);
}

// Function to explicitly trigger location and compass services
function startServices() {
    // Prevent multiple starts
    if (servicesStarted) {
        console.log("⏭️ Services already started, skipping...");
        return;
    }
    
    servicesStarted = true;
    console.log("🚀 Starting location and compass services");
    
    // Explicitly start geolocation
    navigator.geolocation.getCurrentPosition(
        function(position) {
            console.log("📍 Initial position obtained:", position.coords.latitude, position.coords.longitude);
            setCurrentPosition(position);
            
            // Start continuous tracking
            navigator.geolocation.watchPosition(
                setCurrentPosition, 
                function(error) { 
                    console.error("❌ Geolocation error:", error);
                    alert("Location error: " + error.message);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );
        },
        function(error) {
            console.error("❌ Initial position error:", error);
            alert("Cannot access your location. Please enable location services.");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    
    // Start compass
    startCompass();
}

// Expose functions to global scope for the HTML script to use
window.startARServices = startServices;
window.openGoogleMapsNav = openGoogleMaps;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("📄 DOM loaded, initializing AR application");
    
    // Set up app functionality
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
    
    // For iOS devices, add click listener to body
    if (isIOS) {
        document.body.addEventListener('click', function() {
            console.log("👆 Body clicked, requesting iOS compass permission");
            if (!servicesStarted) {
                startServices();
            }
        }, { once: true });
    }
    
    console.log("✅ AR module initialization complete");
});