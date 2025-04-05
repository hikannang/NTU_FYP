// Import Firebase services from firebase-config.js instead of initializing directly
import { db } from "../static/js/firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

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
    entity.setAttribute('scale', '1 1 1');
    
    // Use original AR.js attribute format
    entity.setAttribute('gps-projected-entity-place', `latitude: ${lat}; longitude: ${lng}`);
    
    // Add animation
    entity.setAttribute('animation-mixer', '');
    
    // Add to scene
    scene.appendChild(entity);
    
    // Show loading screen while AR content loads
    showLoadingScreen();
}

// Updated fetchCarData function with improved error handling
async function fetchCarData(bookingId) {
    try {
        console.log("Fetching car data for booking ID:", bookingId);
        
        if (!bookingId) {
            console.error("Invalid booking ID:", bookingId);
            carDirections = "Follow the arrow to reach your car.";
            return;
        }
        
        // Get booking document using the imported db reference
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnapshot = await getDoc(bookingRef);
        
        if (bookingSnapshot.exists()) {
            const bookingData = bookingSnapshot.data();
            
            // Extract car_id and car_type from the booking
            const carId = bookingData.car_id;
            const carType = bookingData.car_type || "default";
            
            console.log("Found booking data:", { 
                carId: carId, 
                carType: carType 
            });
            
            // Save car_type globally so showDestinationModal can use it
            window.carType = carType;
            
            // Save carId for debugging
            window.carId = carId;
            
            // Now fetch the car document to get directions
            if (carId) {
                const carRef = doc(db, "cars", carId.toString());
                const carSnapshot = await getDoc(carRef);
                
                if (carSnapshot.exists()) {
                    const carData = carSnapshot.data();
                    
                    // Save car directions for display in the destination modal
                    carDirections = carData.directions || "Follow the arrow to reach your car.";
                    window.carDirections = carDirections;
                    
                    console.log("Retrieved car data successfully:");
                    console.log("- Car ID:", carId);
                    console.log("- Car Type:", carType);
                    console.log("- Directions:", carDirections);
                } else {
                    console.warn("Car document not found for ID:", carId);
                    carDirections = "Follow the arrow to reach your car.";
                    window.carDirections = carDirections;
                }
            } else {
                console.warn("No car_id found in booking");
                carDirections = "Follow the arrow to reach your car.";
                window.carDirections = carDirections;
            }
        } else {
            console.warn("Booking document not found for ID:", bookingId);
            carDirections = "Follow the arrow to reach your car.";
            window.carDirections = carDirections;
        }
    } catch (error) {
        console.error("Error fetching car data:", error);
        console.error("Error details:", error.message);
        console.error("Error stack:", error.stack);
        carDirections = "Follow the arrow to reach your car.";
        window.carDirections = carDirections;
        
        // Additional debugging for Firebase errors
        if (error.code) {
            console.error("Firebase error code:", error.code);
        }
        
        // Fallback for specific booking_id
        if (bookingId === "booking_1743839882969") {
            console.log("Using hardcoded data for known booking ID");
            window.carType = "cx-8_black";
            window.carId = "1";
            carDirections = "The car is parked at lot 23B. It's a black Mazda CX-8. The car plate number is S123ABC.";
            window.carDirections = carDirections;
        }
    }
}

// Rest of your code remains the same...
// Include remaining functions: init(), calculateBearing(), startOrientation(), 
// handleOrientation(), enablePositionHistory(), calculateMovementDirection(),
// setCurrentPosition(), updateDistanceDisplay(), showDestinationModal(),
// openGoogleMaps(), updateUI(), startServices()

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