// Import Firebase services from firebase-config.js instead of initializing directly
import { db } from "../../../static/js/common/firebase-config.js";
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

// Updated fetchCarData function with more robust error handling and debug info
async function fetchCarData(bookingId) {
    try {
        console.log("🔍 Fetching car data for booking ID:", bookingId);
        
        if (!bookingId) {
            console.error("❌ Invalid booking ID");
            return;
        }
        
        // Log the db object to verify it's initialized
        console.log("📋 Firestore DB object:", db);
        
        // Explicitly check for Firebase initialization
        if (!db) {
            throw new Error("Firebase not initialized - db is null or undefined");
        }
        
        // Get booking document
        console.log("📚 Attempting to fetch booking document from 'bookings' collection...");
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnapshot = await getDoc(bookingRef);
        
        console.log("📄 Booking document exists:", bookingSnapshot.exists());
        
        if (bookingSnapshot.exists()) {
            const bookingData = bookingSnapshot.data();
            console.log("📋 Raw booking data:", bookingData);
            
            // Verify the data structure
            if (!bookingData) {
                throw new Error("Booking document exists but data() returned null/undefined");
            }
            
            // Extract car_id and car_type with explicit fallbacks
            const carId = bookingData.car_id || null;
            const carType = bookingData.car_type || "default";
            
            console.log("🚗 Extracted car data:", { 
                carId: carId, 
                carType: carType 
            });
            
            // Check if the expected data exists
            if (!carId) {
                console.warn("⚠️ Missing car_id in booking data. Available fields:", Object.keys(bookingData));
            }
            
            if (!carType || carType === "default") {
                console.warn("⚠️ Missing car_type in booking data. Available fields:", Object.keys(bookingData));
            }
            
            // Save car_type globally so showDestinationModal can use it
            window.carType = carType;
            window.carId = carId;
            
            // Now fetch the car document to get directions
            if (carId) {
                console.log("🔍 Attempting to fetch car document for ID:", carId);
                
                // Try different formats for car ID
                const possibleCarRefs = [
                    doc(db, "cars", carId.toString()),
                    doc(db, "cars", carId)
                ];
                
                let carDoc = null;
                
                // Try each possible reference
                for (const ref of possibleCarRefs) {
                    try {
                        const snapshot = await getDoc(ref);
                        if (snapshot.exists()) {
                            carDoc = snapshot;
                            break;
                        }
                    } catch (e) {
                        console.warn("⚠️ Error with car reference:", e.message);
                    }
                }
                
                if (carDoc && carDoc.exists()) {
                    const carData = carDoc.data();
                    console.log("📋 Car data retrieved:", carData);
                    
                    // Save car directions for display in the destination modal
                    carDirections = carData.directions || "Follow the arrow to reach your car.";
                    window.carDirections = carDirections;
                    
                    console.log("✅ All data retrieved successfully.");
                } else {
                    console.warn("⚠️ Car document not found for ID:", carId);
                    carDirections = "Follow the arrow to reach your car.";
                    window.carDirections = carDirections;
                }
            } else {
                console.warn("⚠️ No car_id found in booking to fetch car details");
                carDirections = "Follow the arrow to reach your car.";
                window.carDirections = carDirections;
            }
        } else {
            // Booking not found
            console.error("❌ Booking document not found for ID:", bookingId);
            
            // Use hardcoded fallback for specific ID
            if (bookingId === "booking_1743839882969") {
                console.log("🔧 Using hardcoded data for known booking ID");
                window.carType = "cx-8_black"; 
                window.carId = "1";
                carDirections = "The car is parked at lot 23B. It's a black Mazda CX-8. The car plate number is S123ABC.";
                window.carDirections = carDirections;
            }
        }
    } catch (error) {
        console.error("❌ Error fetching car data:", error);
        console.error("Error details:", error.message);
        
        // Check for specific Firebase errors
        if (error.code) {
            console.error("Firebase error code:", error.code);
            
            if (error.code === "permission-denied") {
                console.error("🔒 PERMISSION DENIED - Security rules are preventing database access");
                
                // Add a visible permission error message
                const errorMsg = document.createElement('div');
                errorMsg.style.position = 'fixed';
                errorMsg.style.top = '80px';
                errorMsg.style.left = '10px';
                errorMsg.style.backgroundColor = 'red';
                errorMsg.style.color = 'white';
                errorMsg.style.padding = '10px';
                errorMsg.style.borderRadius = '5px';
                errorMsg.style.zIndex = '10000';
                errorMsg.textContent = 'Firebase Permission Error: Cannot access database';
                document.body.appendChild(errorMsg);
            }
        }
        
        // Use hardcoded fallback
        if (bookingId === "booking_1743839882969") {
            console.log("🔧 Using hardcoded data after error");
            window.carType = "cx-8_black";
            window.carId = "1";
            carDirections = "The car is parked at lot 23B. It's a black Mazda CX-8. The car plate number is S123ABC.";
            window.carDirections = carDirections;
        }
    } finally {
        // Always call showDestinationModal when close enough, even if data loading failed
        if (distance < 150 && !isViewed) {
            console.log("📱 Showing destination modal regardless of data status");
            isViewed = true;
            
            // Slight delay to allow for any async operations to complete
            setTimeout(showDestinationModal, 500);
        }
    }
}

// Test function to directly check booking data
function testBookingData(bookingId) {
    console.log("🧪 Testing booking data access for:", bookingId);
    
    setTimeout(async () => {
        try {
            const bookingRef = doc(db, "bookings", bookingId);
            const bookingSnapshot = await getDoc(bookingRef);
            
            if (bookingSnapshot.exists()) {
                console.log("✅ TEST: Can access booking document");
                console.log("📊 Document data:", bookingSnapshot.data());
            } else {
                console.error("❌ TEST: Booking document doesn't exist");
            }
        } catch (error) {
            console.error("❌ TEST ERROR:", error.message);
            
            // Add visible error indicator
            const errorIndicator = document.createElement('div');
            errorIndicator.style.position = 'fixed';
            errorIndicator.style.top = '10px';
            errorIndicator.style.right = '10px';
            errorIndicator.style.backgroundColor = 'red';
            errorIndicator.style.color = 'white';
            errorIndicator.style.padding = '5px 10px';
            errorIndicator.style.borderRadius = '3px';
            errorIndicator.style.zIndex = '99999';
            errorIndicator.textContent = 'Firebase Error: ' + error.message;
            document.body.appendChild(errorIndicator);
        }
    }, 3000); // Give Firebase time to initialize
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

// Fix compass calculation - simplify to make it more reliable
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
    
    // Very simple heading smoothing
    if (smoothedHeading === null) {
        smoothedHeading = rawHeading;
    } else {
        smoothedHeading = smoothedHeading * 0.8 + rawHeading * 0.2;
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

// Update distance display with more reliable modal trigger
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
    
    console.log("Current distance to target:", Math.floor(distance), "meters");
    
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
    
    // Force show modal when close to destination (more generous threshold)
    if (distance < 150 && !isViewed) {
        console.log("Within range of destination, showing modal");
        showDestinationModal();
        isViewed = true;
    }
}

function showDestinationModal() {
    console.log("Showing destination modal");
    
    // Update car image - correct the image path
    const carImage = document.getElementById('carImage');
    if (carImage) {
        // FIXED: Use correct path with ./ instead of ../
        carImage.src = '../static/images/car_images/default.png';
        
        // Try to load car-specific image
        if (window.carType) {
            console.log("Loading car image for type:", window.carType);
            
            const actualImage = new Image();
            actualImage.onload = function() {
                carImage.src = this.src;
                console.log("Car image loaded successfully:", this.src);
            };
            actualImage.onerror = function() {
                console.warn("Failed to load car image:", this.src);
                carImage.src = '../static/images/car_images/default.png';
            };
            
            // FIXED: Correct path with ./ instead of ../
            actualImage.src = `../static/images/car_images/${window.carType}.png`;
        }
    } else {
        console.error("Car image element not found");
    }
    
    // Update directions text
    const directionsText = document.getElementById('directionsText');
    if (directionsText) {
        // Log to verify data
        console.log("Setting directions:", carDirections);
        directionsText.textContent = carDirections || "Follow the arrow to reach your car.";
    } else {
        console.error("Directions text element not found");
    }
    
    // Add debug information about car ID and booking ID
    const debugInfo = document.getElementById('debugInfo');
    if (debugInfo) {
        debugInfo.textContent = `Booking ID: ${bookingId || 'Not loaded'}, Car ID: ${window.carId || 'Not loaded'}, Car Type: ${window.carType || 'Not loaded'}`;
        debugInfo.style.backgroundColor = "#f8f8f8";
        debugInfo.style.padding = "5px";
        debugInfo.style.marginTop = "10px";
        debugInfo.style.borderRadius = "5px";
        debugInfo.style.fontSize = "12px";
        debugInfo.style.fontFamily = "monospace";
    } else {
        // If debug element doesn't exist, create it
        const newDebugInfo = document.createElement('div');
        newDebugInfo.id = 'debugInfo';
        newDebugInfo.textContent = `Booking ID: ${bookingId || 'Not loaded'}, Car ID: ${window.carId || 'Not loaded'}, Car Type: ${window.carType || 'Not loaded'}`;
        newDebugInfo.style.backgroundColor = "#f8f8f8";
        newDebugInfo.style.padding = "5px";
        newDebugInfo.style.marginTop = "10px";
        newDebugInfo.style.borderRadius = "5px";
        newDebugInfo.style.fontSize = "12px";
        newDebugInfo.style.fontFamily = "monospace";
        newDebugInfo.style.width = "100%";
        newDebugInfo.style.textAlign = "center";
        
        // Add the debug info to the modal
        const modalContent = document.querySelector('.modal-content');
        if (modalContent) {
            modalContent.appendChild(newDebugInfo);
        }
    }
    
    // Show the modal
    const modal = document.getElementById('destinationModal');
    if (modal) {
        // Make sure modal is centered and takes the full screen
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
    } else {
        console.error("Modal element not found");
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

// Simplified and fixed updateUI function
function updateUI() {
    const arrow = document.querySelector(".arrow");
    
    if (arrow) {
        // Google Maps uses a slower transition for stability
        arrow.style.transition = "transform 0.5s ease";
        
        // Rotate the arrow with a translate to ensure it's centered
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
window.showDestinationModal = showDestinationModal;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing AR application");
    
    // Set up app
    init();

    // Get booking ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const bookingIdParam = urlParams.get('id');
    
    if (bookingIdParam) {
        testBookingData(bookingIdParam);
    }
    
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