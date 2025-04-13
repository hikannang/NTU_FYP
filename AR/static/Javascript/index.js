// Import Firebase services from firebase-config.js instead of initializing directly
import { db } from "../../../static/js/common/firebase-config.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

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

// Comprehensive fetchCarData function with detailed logging and error handling
async function fetchCarData(bookingId) {
    try {
        console.log("🔍 Fetching car data for booking ID:", bookingId);
        
        if (!bookingId) {
            console.error("❌ Invalid booking ID provided");
            return;
        }
        
        // 1. Retrieve the booking document
        console.log("📚 Retrieving booking document...");
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnapshot = await getDoc(bookingRef);
        
        if (!bookingSnapshot.exists()) {
            console.error("❌ Booking document not found for ID:", bookingId);
            
            // Fallback for demo purposes
            if (bookingId === "demo_booking") {
                console.log("📝 Using demo data for car");
                window.carType = "vezel_white";
                window.carId = "car1";
                window.carModelName = "Honda Vezel (White)";
                window.carLicensePlate = "SGP1234A";
                carDirections = "The car is located in parking lot B, spot 42. It's a white Honda Vezel.";
                window.carDirections = carDirections;
            }
            return;
        }
        
        // 2. Extract booking data
        const bookingData = bookingSnapshot.data();
        console.log("📋 Booking data retrieved:", bookingData);
        
        // 3. Get car_id and car_type from the booking
        const carId = bookingData.car_id || null;
        const carType = bookingData.car_type || null;
        
        if (!carType) {
            console.warn("⚠️ No car_type found in booking");
            window.carModelName = "Unknown";
            return;
        }
        
        console.log("🚗 Car info from booking:", { carId, carType });
        
        // Save to global variables
        window.carType = carType;
        window.carId = carId;
        
        // 4. Parse car_type to extract model and color
        let baseModelName = carType;
        let carColor = "";
        
        if (carType.includes('_')) {
            const parts = carType.split('_');
            baseModelName = parts[0];
            carColor = parts[1] || "";
            
            if (carColor) {
                carColor = carColor.charAt(0).toUpperCase() + carColor.slice(1);
            }
        }
        
        console.log("🚗 Parsed car type:", { baseModelName, carColor });
        
        // 5. Fetch the car model details from car_models collection
        let modelName = "";
        
        try {
            console.log("🔍 Fetching car model document:", baseModelName);
            const modelDocRef = doc(db, "car_models", baseModelName);
            const modelDoc = await getDoc(modelDocRef);
            
            if (modelDoc.exists()) {
                const modelData = modelDoc.data();
                console.log("� Car model data:", modelData);
                
                if (modelData.name) {
                    modelName = modelData.name;
                    console.log("✅ Found model name:", modelName);
                } else {
                    console.warn("⚠️ No 'name' field in model document");
                    
                    // Try alternative field names that might contain the model name
                    const possibleNameFields = ['displayName', 'display_name', 'model_name', 'make_model'];
                    
                    for (const field of possibleNameFields) {
                        if (modelData[field]) {
                            modelName = modelData[field];
                            console.log(`✅ Found name in alternate field '${field}':`, modelName);
                            break;
                        }
                    }
                }
            } else {
                console.warn("⚠️ Car model document not found for:", baseModelName);
                
                // Debug: List available model documents
                try {
                    console.log("📋 Listing available car models...");
                    const modelsRef = collection(db, "car_models");
                    const modelsSnapshot = await getDocs(modelsRef);
                    
                    if (modelsSnapshot.empty) {
                        console.log("📋 No documents in car_models collection");
                    } else {
                        console.log(`📋 Found ${modelsSnapshot.size} model documents:`);
                        modelsSnapshot.forEach(doc => {
                            console.log(` - ${doc.id}`);
                        });
                    }
                } catch (e) {
                    console.error("❌ Error listing car models:", e);
                }
            }
        } catch (modelError) {
            console.error("❌ Error fetching car model:", modelError);
        }
        
        // 6. Format the car model name with color
        if (modelName && carColor) {
            window.carModelName = `${modelName} (${carColor})`;
        } else if (modelName) {
            window.carModelName = modelName;
        } else {
            // Fallback: Use capitalized base model name
            window.carModelName = baseModelName.charAt(0).toUpperCase() + baseModelName.slice(1);
            if (carColor) {
                window.carModelName += ` (${carColor})`;
            }
        }
        
        console.log("🏷️ Final car model name:", window.carModelName);
        
        // 7. Fetch car document to get license plate and directions
        if (carId) {
            try {
                console.log("🔍 Fetching car document for ID:", carId);
                const carDocRef = doc(db, "cars", carId.toString());
                const carDoc = await getDoc(carDocRef);
                
                if (carDoc.exists()) {
                    const carData = carDoc.data();
                    console.log("📋 Car document data:", carData);
                    
                    // Set license plate
                    window.carLicensePlate = carData.license_plate || "Unknown";
                    console.log("🔢 License plate:", window.carLicensePlate);
                    
                    // Set directions
                    carDirections = carData.directions || 
                                   "Follow the arrow to reach your car.";
                    window.carDirections = carDirections;
                    console.log("🧭 Directions:", window.carDirections);
                } else {
                    console.warn("⚠️ Car document not found for ID:", carId);
                    window.carLicensePlate = "Unknown";
                    window.carDirections = "Follow the arrow to reach your car.";
                }
            } catch (carError) {
                console.error("❌ Error fetching car document:", carError);
                window.carLicensePlate = "Unknown";
                window.carDirections = "Follow the arrow to reach your car.";
            }
        } else {
            console.warn("⚠️ No car_id provided in booking");
            window.carLicensePlate = "Unknown";
            window.carDirections = "Follow the arrow to reach your car.";
        }
        
        // 8. Update the modal if it's already visible
        if (document.getElementById('destinationModal')?.style.display === 'flex') {
            updateAdditionalCarInfo();
        }
        
    } catch (error) {
        console.error("❌ Error in fetchCarData:", error);
    }
}

// Helper function to add debug info to the page
function addDebugInfo(info) {
    // Only add in development mode
    if (window.location.hostname !== 'localhost' && 
        !window.location.hostname.includes('127.0.0.1')) {
        return;
    }
    
    const debugDiv = document.createElement('div');
    debugDiv.style.position = 'fixed';
    debugDiv.style.bottom = '10px';
    debugDiv.style.left = '10px';
    debugDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
    debugDiv.style.color = 'white';
    debugDiv.style.padding = '10px';
    debugDiv.style.borderRadius = '5px';
    debugDiv.style.fontSize = '12px';
    debugDiv.style.maxWidth = '80%';
    debugDiv.style.zIndex = '9999';
    
    let content = '<strong>Debug Info:</strong><br>';
    for (const [key, value] of Object.entries(info)) {
        content += `<strong>${key}:</strong> ${value}<br>`;
    }
    
    debugDiv.innerHTML = content;
    document.body.appendChild(debugDiv);
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

// Raw bearing calculation - direction from current position to target
function calculateBearing() {
    // Safety check
    if (!current.latitude || !current.longitude || !target.latitude || !target.longitude) {
        return 0;
    }
    
    // Convert coordinates from degrees to radians
    const lat1 = current.latitude * (Math.PI / 180);
    const lon1 = current.longitude * (Math.PI / 180);
    const lat2 = target.latitude * (Math.PI / 180);
    const lon2 = target.longitude * (Math.PI / 180);
    
    // Calculate bearing using great circle formula
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    
    // Convert back to degrees
    let brng = Math.atan2(y, x) * (180 / Math.PI);
    
    // Normalize to 0-360
    brng = (brng + 360) % 360;
    
    return brng;
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

// Updated handleOrientation function
function handleOrientation(event) {
    // First, check if we have valid orientation data
    if (!event || (event.alpha === null && event.webkitCompassHeading === undefined)) {
        console.log("Invalid orientation data:", event);
        return;
    }
    
    // Set flag that we have orientation data
    hasOrientationSupport = true;
    
    // Get raw device heading (direction device is pointing)
    let deviceHeading;
    
    // iOS devices
    if (typeof event.webkitCompassHeading === 'number') {
        deviceHeading = event.webkitCompassHeading;
        // Log occasionally to avoid console flood
        if (Math.random() < 0.01) console.log("iOS compass:", deviceHeading.toFixed(1));
    }
    // Android devices
    else if (typeof event.alpha === 'number') {
        deviceHeading = 360 - event.alpha;
        // Log occasionally
        if (Math.random() < 0.01) console.log("Android compass:", deviceHeading.toFixed(1));
    }
    else {
        console.log("No valid heading data in event:", event);
        return;
    }
    
    // Apply stronger smoothing when heading changes are large
    // This prevents rapid oscillations
    if (smoothedHeading === null) {
        smoothedHeading = deviceHeading;
    } else {
        // Calculate difference between current and previous heading
        let diff = deviceHeading - smoothedHeading;
        
        // Handle the 0/360 edge case
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        // Use different smoothing factor based on change magnitude
        // Less smoothing for small changes, more for large changes
        const filterFactor = Math.abs(diff) > 20 ? 0.05 : 0.2;
        
        // Apply smoothing
        smoothedHeading = (smoothedHeading + diff * filterFactor) % 360;
        if (smoothedHeading < 0) smoothedHeading += 360;
    }
    
    // Get bearing to target
    bearing = calculateBearing();
    
    // Calculate arrow direction - simple subtraction
    direction = bearing - smoothedHeading;
    
    // Keep direction in 0-360 range
    if (direction < 0) {
        direction += 360;
    }
}

// Also update the updateUI function to ensure it's using the correct direction value
function updateUI() {
    const arrow = document.querySelector(".arrow");
    
    if (arrow) {
        // Google Maps uses a slower transition for stability
        arrow.style.transition = "transform 0.5s ease";
        
        // Use the global direction variable to update arrow
        arrow.style.transform = `translate(-50%, -50%) rotate(${direction}deg)`;
        
        // Debugging - log arrow direction and styles occasionally
        if (Math.random() < 0.05) { // Log very occasionally
            console.log("Arrow direction:", direction.toFixed(1), "Current transform:", arrow.style.transform);
        }
    }
    
    // Continue updating
    requestAnimationFrame(updateUI);
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
    if (distance < 200 && !isViewed) {
        console.log("Within range of destination, showing modal");
        showDestinationModal();
        isViewed = true;
    }
}

function showDestinationModal() {
    console.log("Showing destination modal");
    
    // Lock the background scrolling when modal is shown
    document.body.style.overflow = 'hidden';
    
    // Update car image with better model detection
    const carImage = document.getElementById('carImage');
    if (carImage) {
        // Set default image first
        carImage.src = '../static/images/car_images/default.png';
        
        // Try to load car-specific image with progressive fallbacks
        if (window.carType) {
            console.log("Loading car image for type:", window.carType);
            
            // First, try the specific car type (e.g., "vezel_white")
            loadCarImageWithFallbacks(carImage, [
                `../static/images/car_images/${window.carType}.png`,
                `../static/images/car_images/${window.carType.split('_')[0]}.png`, // Try without color
                `../static/images/car_models/${window.carType}.png`, // Try car_models folder
                `../static/images/cars/${window.carType}.png`, // Try cars folder
                '../static/images/car_images/default.png' // Final fallback
            ]);
        } else if (window.carModelId) {
            // If we have a model ID but no type
            console.log("Loading car image for model ID:", window.carModelId);
            
            loadCarImageWithFallbacks(carImage, [
                `../static/images/car_images/${window.carModelId}.png`,
                `../static/images/car_models/${window.carModelId}.png`,
                '../static/images/car_images/default.png'
            ]);
        }
    } else {
        console.error("Car image element not found");
    }
    
    // Update directions text
    const directionsText = document.getElementById('directionsText');
    if (directionsText) {
        console.log("Setting directions:", carDirections);
        directionsText.textContent = carDirections || "Follow the arrow to reach your car.";
    } else {
        console.error("Directions text element not found");
    }
    
    // Add more car information to modal
    updateAdditionalCarInfo();
    
    // Show the modal with animation
    const modal = document.getElementById('destinationModal');
    if (modal) {
        // Remove any previous click handlers by cloning the modal
        const newModal = modal.cloneNode(true);
        modal.parentNode.replaceChild(newModal, modal);
        
        // Get fresh reference
        const freshModal = document.getElementById('destinationModal');
        
        // Show the modal
        freshModal.classList.add('show');
        freshModal.style.display = 'flex';
        
        // Add a short delay to prevent accidental immediate dismissal
        setTimeout(() => {
            // Add click handler to close modal on ANY click (not just outside content)
            freshModal.addEventListener('click', function modalClickHandler() {
                console.log("Modal clicked, hiding modal");
                hideDestinationModal();
                // Remove the event listener after first click
                freshModal.removeEventListener('click', modalClickHandler);
            });
            
            console.log("Modal click handler activated");
        }, 800); // Delay to prevent accidental clicks
    } else {
        console.error("Destination modal element not found");
    }
}

// Helper function to try multiple image paths with fallbacks
function loadCarImageWithFallbacks(imgElement, pathsArray, currentIndex = 0) {
    if (currentIndex >= pathsArray.length) {
        console.warn("All image paths failed, using default");
        imgElement.src = '../static/images/car_images/default.png';
        return;
    }
    
    const currentPath = pathsArray[currentIndex];
    console.log(`Trying to load image from: ${currentPath}`);
    
    // Create a temporary image to test loading
    const testImg = new Image();
    
    testImg.onload = function() {
        console.log(`Successfully loaded: ${currentPath}`);
        imgElement.src = currentPath;
    };
    
    testImg.onerror = function() {
        console.warn(`Failed to load: ${currentPath}, trying next option...`);
        loadCarImageWithFallbacks(imgElement, pathsArray, currentIndex + 1);
    };
    
    testImg.src = currentPath;
}

// Function to add more car information to the modal
function updateAdditionalCarInfo() {
    // Add license plate info
    const licensePlateElement = document.getElementById('carLicensePlate');
    if (licensePlateElement) {
        licensePlateElement.textContent = window.carLicensePlate || "Unknown";
    }
    
    // Add car model info with the proper format
    const carModelElement = document.getElementById('carModelName');
    if (carModelElement) {
        // Use the model name we retrieved from car_models collection
        carModelElement.textContent = window.carModelName || "Unknown";
    }
}

// Improved hideDestinationModal function
function hideDestinationModal() {
    console.log("Hiding destination modal");
    
    const modal = document.getElementById('destinationModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        // Restore scrolling
        document.body.style.overflow = '';
        console.log("Modal hidden successfully");
    } else {
        console.error("Could not find destination modal to hide");
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
    
    // Get user location with improved error handling and longer timeout
    navigator.geolocation.getCurrentPosition(
        // Success callback
        function(position) {
            setCurrentPosition(position);
            console.log("Initial position acquired:", position.coords.latitude, position.coords.longitude);
            
            // Start watching for position updates
            startPositionWatching();
            
            // Create destination marker if we have target coordinates
            if (target.latitude && target.longitude) {
                createDestinationMarker(target.latitude, target.longitude);
            }
        },
        // Error callback
        function(error) {
            let errorMessage = "Unknown location error";
            
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = "Location permission denied. Please enable location services.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = "Location information unavailable. Please check your device settings.";
                    break;
                case error.TIMEOUT:
                    errorMessage = "Location request timed out. Poor GPS signal or connectivity issues.";
                    break;
            }
            
            // Display error but don't alert (less intrusive)
            console.error("Geolocation error:", errorMessage);
            
            // Show error in UI instead of alert
            const errorElement = document.getElementById('location-error');
            if (errorElement) {
                errorElement.textContent = errorMessage;
                errorElement.style.display = 'block';
                
                // Hide after 5 seconds
                setTimeout(() => {
                    errorElement.style.display = 'none';
                }, 5000);
            }
            
            // Try again with high accuracy disabled (may help in some cases)
            navigator.geolocation.getCurrentPosition(
                position => {
                    console.log("Got position with lower accuracy");
                    setCurrentPosition(position);
                    startPositionWatching();
                },
                err => console.error("Second position attempt failed:", err),
                { 
                    enableHighAccuracy: false,
                    timeout: 15000,
                    maximumAge: 30000 
                }
            );
        },
        // Options with longer timeout
        {
            enableHighAccuracy: true,
            timeout: 10000,     // Increase timeout to 10 seconds (default is often 3s)
            maximumAge: 5000    // Allow cached positions up to 5 seconds old
        }
    );
}

// Update the position watching function to be more resilient
function startPositionWatching() {
    // Clear any existing watch
    if (positionWatchId) {
        navigator.geolocation.clearWatch(positionWatchId);
    }
    
    // Start a new position watch
    positionWatchId = navigator.geolocation.watchPosition(
        setCurrentPosition,
        handlePositionError,
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 2000
        }
    );
    
    console.log("Position watching started with ID:", positionWatchId);
}

// Error handler for continuous position watching
function handlePositionError(error) {
    console.warn("Position watching error:", error.code, error.message);
    
    // Only show UI for complete failures, not intermittent ones
    if (error.code === error.PERMISSION_DENIED) {
        const errorElement = document.getElementById('location-error');
        if (errorElement) {
            errorElement.textContent = "Location permission denied. Please enable location services.";
            errorElement.style.display = 'block';
        }
    }
    
    // For timeouts or unavailable positions, we just log and wait for the next update
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