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

// Compass smoothing variables
var headingBuffer = []; // For smoothing
var HEADING_BUFFER_SIZE = 10; // Increased for more stability
var HEADING_DEADZONE = 8; // Increased to ignore small changes
var lastDirection = 0; // Last stable direction
var compassStable = false; // Whether the compass has stabilized
var lastDeviceOrientation = null; // Store last orientation reading
var LOW_PASS_FACTOR = 0.1; // Lower = smoother but slower response
var STABLE_THRESHOLD_COUNT = 5; // Number of stable readings required
var stableReadingCounter = 0;
var previousHeading = null;

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

// Variables for direction calculations
var lastAlpha = 0;
var direction = 0;
var bearing = 0;

// Position history for movement direction
var positionHistory = [];
var movementDirection = null;

// Detect device type
const isIOS = navigator.userAgent.match(/(iPod|iPhone|iPad)/) && 
              navigator.userAgent.match(/AppleWebKit/);
const isAndroid = /Android/i.test(navigator.userAgent);
const isSamsung = /SM-|SAMSUNG|Samsung/i.test(navigator.userAgent);

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
    
    // Track device orientation for tilt detection
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

// Modified startOrientation function to explicitly handle permissions
function startOrientation() {
    if (compassInitialized) {
        return; // Avoid initializing twice
    }
    
    compassInitialized = true;
    console.log("🧭 Starting orientation for " + (isIOS ? "iOS" : (isAndroid ? "Android" : "unknown")) + " device");
    
    // Function to handle orientation once permissions are granted
    function setupOrientationListeners() {
        // Try standard orientation event first (works on most devices)
        window.addEventListener("deviceorientation", handleOrientation);
        
        // Also try absolute orientation if available (more accurate on some devices)
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener("deviceorientationabsolute", handleOrientation);
            console.log("✅ Added absolute orientation listener");
        }
        
        // Check if we're getting orientation data after a short delay
        setTimeout(() => {
            if (!hasOrientationSupport) {
                console.log("⚠️ No orientation data received yet, enabling position history fallback");
                enablePositionHistory();
                
                // Show a message to the user
                alert("Your device's orientation sensors aren't responding. The app will use your movement to determine direction instead.");
            }
        }, 2000);
    }
    
    if (isIOS) {
        // iOS requires explicit permission request
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            // Show an alert explaining why we need orientation access
            alert("This app needs access to your device's orientation to point you in the right direction. Please tap OK when prompted.");
            
            DeviceOrientationEvent.requestPermission()
                .then((response) => {
                    if (response === "granted") {
                        console.log("✅ iOS orientation permission granted");
                        setupOrientationListeners();
                        hasOrientationSupport = true;
                    } else {
                        console.error("❌ iOS orientation permission denied");
                        alert("Without orientation permission, the arrow may not point correctly. Using location tracking as a fallback.");
                        enablePositionHistory(); // Fallback to position tracking
                    }
                })
                .catch((error) => {
                    console.error("❌ iOS orientation permission error:", error);
                    alert("Error accessing orientation sensors. Using location tracking as a fallback.");
                    enablePositionHistory();
                });
        } else {
            // Older iOS that doesn't need permissions
            setupOrientationListeners();
        }
    } else if (isAndroid) {
        // For Android, we'll try to detect if we have sensor access
        console.log("📱 Setting up Android orientation");
        
        // Show a helpful message to Android users
        if (isSamsung) {
            alert("Please make sure your Samsung device has location services enabled and motion sensors are allowed. This helps the app show which direction to walk.");
        } else {
            alert("Please enable location services and sensor access for the best experience. This helps the app show which direction to walk.");
        }
        
        // Set up orientation listeners
        setupOrientationListeners();
        
        // On some Android devices, we might need to explicitly request permission
        if (navigator.permissions && navigator.permissions.query) {
            try {
                navigator.permissions.query({ name: 'accelerometer' })
                    .then(result => {
                        console.log("Accelerometer permission status:", result.state);
                        if (result.state === 'denied') {
                            alert("Please enable motion sensor access in your device settings for better direction guidance.");
                        }
                    });
            } catch (error) {
                console.log("Permissions API not fully supported:", error);
            }
        }
    } else {
        // Other devices
        setupOrientationListeners();
    }
    
    // Also handle screen orientation changes
    window.addEventListener('orientationchange', function() {
        console.log("📱 Screen orientation changed to:", window.orientation);
    });
}

// Improved handleOrientation function with more stability
function handleOrientation(event) {
    // Set the flag to true as soon as we get any orientation data
    if (!hasOrientationSupport) {
        console.log(`✅ Received first orientation data`);
        hasOrientationSupport = true;
    }
    
    // Get orientation data - focusing only on alpha for stability
    const alpha = event.alpha; // Z-axis rotation (compass direction)
    
    // Ignore beta and gamma for heading calculation - these cause most of the instability
    // Only use them to check if the phone is being held correctly
    
    if (alpha !== null && alpha !== undefined) {
        let heading;
        
        if (event.webkitCompassHeading !== undefined) {
            // iOS provides this value already calibrated (clockwise from North)
            heading = event.webkitCompassHeading;
        } else {
            // For Android: convert alpha (counter-clockwise from East) to heading (clockwise from North)
            heading = (360 - alpha) % 360;
            
            // Skip tilt compensation which can introduce noise
            // Only adjust for screen orientation which is essential
            if (window.orientation !== undefined) {
                if (window.orientation === 90) {
                    heading = (heading + 90) % 360;
                } else if (window.orientation === -90) {
                    heading = (heading - 90) % 360;
                } else if (window.orientation === 180) {
                    heading = (heading + 180) % 360;
                }
            }
        }
        
        // Skip headings that change dramatically (likely noise)
        if (previousHeading !== null) {
            const headingDifference = Math.abs((heading - previousHeading + 180) % 360 - 180);
            if (headingDifference > 40 && headingDifference < 320) {
                console.log("⚠️ Skipping erratic heading change:", headingDifference.toFixed(1) + "°");
                return; // Skip this reading
            }
        }
        
        // Apply low-pass filter before adding to buffer (stronger smoothing)
        if (previousHeading !== null) {
            // Blend previous and current values
            heading = previousHeading * (1 - LOW_PASS_FACTOR) + heading * LOW_PASS_FACTOR;
        }
        previousHeading = heading;
        
        // Add to smoothing buffer
        headingBuffer.push(heading);
        if (headingBuffer.length > HEADING_BUFFER_SIZE) {
            headingBuffer.shift(); // Remove oldest reading
        }
        
        // Wait until we have enough readings
        if (headingBuffer.length < 3) return;
        
        // Calculate smoothed heading (weighted median-like approach)
        // Sort values to eliminate outliers
        const sortedHeadings = [...headingBuffer].sort((a, b) => a - b);
        
        // Use the median for more stability against outliers
        let smoothedHeading;
        if (sortedHeadings.length % 2 === 0) {
            // Even number: average the middle two
            const mid = sortedHeadings.length / 2;
            smoothedHeading = (sortedHeadings[mid - 1] + sortedHeadings[mid]) / 2;
        } else {
            // Odd number: take the middle value
            smoothedHeading = sortedHeadings[Math.floor(sortedHeadings.length / 2)];
        }
        
        // Calculate bearing (direction to target)
        bearing = calculateBearing();
        
        // Calculate direction to point arrow
        const newDirection = (bearing - smoothedHeading + 360) % 360;
        
        // Apply a stronger deadzone to reduce jitter
        // Only update direction if it changed significantly or if we've been stable for a while
        if (!compassStable || Math.abs(newDirection - lastDirection) > HEADING_DEADZONE) {
            // Check if we've been stable
            if (Math.abs(newDirection - lastDirection) <= HEADING_DEADZONE) {
                stableReadingCounter++;
                if (stableReadingCounter >= STABLE_THRESHOLD_COUNT) {
                    // We've had several stable readings in a row, accept the new direction
                    direction = newDirection;
                    lastDirection = direction;
                    compassStable = true;
                    stableReadingCounter = 0;
                }
            } else {
                // Big change, reset stability counter but only update if we're confident
                stableReadingCounter = 0;
                
                // Only accept sudden large changes if compass isn't already stable
                if (!compassStable) {
                    direction = newDirection;
                    lastDirection = direction;
                }
            }
        }
    }
    
    // Update distance display
    updateDistanceDisplay();
}

// Enable position history tracking for direction estimation
function enablePositionHistory() {
    if (positionHistoryEnabled) return;
    
    positionHistoryEnabled = true;
    console.log("📍 Enabling position history tracking for direction estimation");
    
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
            
            // Need at least 2 positions to calculate direction
            if (positionHistory.length >= 2) {
                calculateMovementDirection();
            }
        }
    }, 1000); // Check every second
}

// Calculate direction of movement from position history
function calculateMovementDirection() {
    // Need at least 2 positions
    if (positionHistory.length < 2) return;
    
    // Get the oldest and newest positions
    const oldest = positionHistory[0];
    const newest = positionHistory[positionHistory.length - 1];
    
    // Make sure there's meaningful movement
    const latDiff = newest.latitude - oldest.latitude;
    const lngDiff = newest.longitude - oldest.longitude;
    
    // Check if movement is significant enough
    if (Math.abs(latDiff) > 0.00001 || Math.abs(lngDiff) > 0.00001) {
        // Calculate bearing between the two points
        const lat1 = oldest.latitude * (Math.PI / 180);
        const lon1 = oldest.longitude * (Math.PI / 180);
        const lat2 = newest.latitude * (Math.PI / 180);
        const lon2 = newest.longitude * (Math.PI / 180);
        
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        
        const movementBearing = Math.atan2(y, x) * (180 / Math.PI);
        movementDirection = (movementBearing + 360) % 360;
        
        console.log("🚶 Movement direction:", movementDirection.toFixed(1) + "°");
        
        // Use movement direction as heading if orientation isn't available
        if (!hasOrientationSupport) {
            // The bearing to the target
            bearing = calculateBearing();
            
            // Direction is the difference between where we want to go and where we're facing
            direction = (bearing - movementDirection + 360) % 360;
            
            console.log(`Using movement - Heading: ${movementDirection.toFixed(1)}°, Bearing: ${bearing.toFixed(1)}°, Arrow: ${direction.toFixed(1)}°`);
        }
    }
}

// Update current position from geolocation API
function setCurrentPosition(position) {
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
    
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
        // Apply smooth transition when rotating
        if (!arrow.style.transition) {
            arrow.style.transition = "transform 0.3s ease-out";
        }
        
        // Apply rotation to the arrow based on direction
        arrow.style.transform = `translate(-50%, -50%) rotate(${direction}deg)`;
        
        // Visual indicator for compass status
        const compass = document.querySelector(".compass");
        if (compass) {
            // Change color based on orientation support
            if (hasOrientationSupport) {
                compass.style.borderColor = "#4CAF50"; // Green for working orientation
            } else if (positionHistoryEnabled && movementDirection !== null) {
                compass.style.borderColor = "#FFC107"; // Yellow for movement-based direction
            } else {
                compass.style.borderColor = "#F44336"; // Red for no direction data
            }
        }
        
        // Visual indicator for phone orientation
        const distanceElement = document.getElementById("distanceFromTarget");
        if (distanceElement && lastDeviceOrientation) {
            const beta = Math.abs(lastDeviceOrientation.beta || 0);
            
            // Provide feedback only when orientation is way off
            if (beta > 60) {
                // Phone is too horizontal
                distanceElement.style.backgroundColor = "rgba(255, 87, 34, 0.7)"; // Orange warning
            } else {
                // Phone is being held acceptably
                distanceElement.style.backgroundColor = "rgba(0, 0, 0, 0.6)"; // Normal
            }
        }
    }
    
    // Continue updating
    requestAnimationFrame(updateUI);
}

// Function to explicitly trigger location and orientation services
function startServices() {
    // Prevent multiple starts
    if (servicesStarted) {
        console.log("⏭️ Services already started, skipping...");
        return;
    }
    
    servicesStarted = true;
    console.log("🚀 Starting location and orientation services");
    
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
    
    // Start orientation
    startOrientation();
    
    // Enable debug mode via URL parameter or tap gesture
    const urlParams = new URLSearchParams(window.location.search);
    window.DEBUG_MODE = urlParams.has('debug');
    
    // Add debug mode toggle with triple tap
    let tapCount = 0;
    let lastTap = 0;
    document.addEventListener('click', function() {
        const now = new Date().getTime();
        if (now - lastTap < 500) {
            tapCount++;
            if (tapCount >= 3) {
                window.DEBUG_MODE = !window.DEBUG_MODE;
                alert("Debug mode " + (window.DEBUG_MODE ? "enabled" : "disabled"));
                tapCount = 0;
            }
        } else {
            tapCount = 1;
        }
        lastTap = now;
    });
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
            console.log("👆 Body clicked, requesting iOS permissions");
            if (!servicesStarted) {
                startServices();
            }
        }, { once: true });
    }
    
    console.log("✅ AR module initialization complete");
});