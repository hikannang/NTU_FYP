// Global variables
var loadingTimeout;
var distance = 0; // Global variable to track distance from target
var modal;
var target = { latitude: 0, longitude: 0 };
var current = { latitude: null, longitude: null };
var lastAlpha = 0;
var direction = 0;
var bookingId = '';
var carId = '';
var carDirections = '';
var carImageUrl = '';
var isViewingDirections = false;

// Check if browser is iOS
const isIOS =
    navigator.userAgent.match(/(iPod|iPhone|iPad)/) &&
    navigator.userAgent.match(/AppleWebKit/);
const geolocationOptions = { enableHighAccuracy: true };

// Show loading screen while initializing
function showLoadingScreen() {
    console.log("Showing loading screen");
    var loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }

    // Set a timeout to hide the loading screen after 3 seconds
    loadingTimeout = setTimeout(function () {
        hideLoadingScreen();
    }, 3000);
}

// Hide loading screen
function hideLoadingScreen() {
    console.log("Hiding loading screen");
    var loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }

    // Clear the timeout if it hasn't been triggered yet
    clearTimeout(loadingTimeout);  
}

// Parse URL parameters to get latitude, longitude, and booking ID
function getURLParameters() {
    console.log("Getting URL parameters");
    const urlParams = new URLSearchParams(window.location.search);
    const lat = parseFloat(urlParams.get('lat'));
    const lng = parseFloat(urlParams.get('lng'));
    const id = urlParams.get('id');
    
    console.log("URL parameters:", { lat, lng, id });
    
    if (lat && lng) {
        target.latitude = lat;
        target.longitude = lng;
        if (id) {
            bookingId = id;
        }
        return true;
    } else {
        console.error('Missing required URL parameters: lat, lng');
        return false;
    }
}

// Mock function for development - replace with actual Firebase call in production
async function fetchBookingData() {
    console.log("Fetching booking data");
    
    try {
        showLoadingScreen();
        
        // For testing without Firebase, use hardcoded values
        setTimeout(() => {
            carId = "test_car_id";
            carDirections = "Your car is parked at level 1, parking lot A5. It's a red Toyota Corolla with license plate SGX1234A.";
            carImageUrl = "https://via.placeholder.com/300x200?text=Car+Image";
            
            console.log("Car data loaded:", { carId, carDirections });
            
            // Setup AR scene after data is loaded
            setupARScene();
            hideLoadingScreen();
        }, 1500);
        
        return true;
        
        // Get a reference to the booking document
        const bookingRef = firebase.firestore().collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();
        
        if (bookingDoc.exists) {
            const bookingData = bookingDoc.data();
            carId = bookingData.car_id;
            
            // Get car data
            const carRef = firebase.firestore().collection('cars').doc(carId);
            const carDoc = await carRef.get();
            
            if (carDoc.exists) {
                const carData = carDoc.data();
                carDirections = carData.directions || 'No specific directions available.';
                carImageUrl = carData.image_url || 'AR/static/images/default-car.png';
                
                // Setup AR scene after data is loaded
                setupARScene();
                return true;
            } else {
                console.error('Car document does not exist');
                return false;
            }
        } else {
            console.error('Booking document does not exist');
            return false;
        }
        
    } catch (error) {
        console.error('Error fetching booking data:', error);
        return false;
    } finally {
        hideLoadingScreen();
    }
}

// Initialize the AR scene
function setupARScene() {
    console.log("Setting up AR scene");
    
    // Create AR entity with the pin model
    if (document.querySelector('a-scene')) {
        // Check if pin already exists and remove it if it does
        let existingPin = document.getElementById('arPin');
        if (existingPin) {
            existingPin.parentNode.removeChild(existingPin);
        }
        
        // Create new pin entity
        const arPin = document.createElement('a-entity');
        arPin.id = 'arPin';
        
        // Set model and position
        arPin.setAttribute('gltf-model', '../AR/static/3dModels/pin.glb');
        arPin.setAttribute('scale', '0.5 0.5 0.5');
        arPin.setAttribute('rotation', '0 0 0');
        arPin.setAttribute('gps-entity-place', `latitude: ${target.latitude}; longitude: ${target.longitude}`);
        arPin.setAttribute('animation', 'property: position; to: 0 1.5 0; dur: 2000; easing: easeInOutQuad; loop: true; dir: alternate');
        
        // Add to scene
        document.querySelector('a-scene').appendChild(arPin);
        
        console.log("AR pin created with coordinates:", target);
        
        // Print the path to verify it's correct
        console.log("GLB model path:", '../AR/static/3dModels/pin.glb');
    } else {
        console.error("A-Scene not found!");
    }
}

// Initialize compass and geolocation
function init() {
    console.log("Initializing app");
    
    // Setup the compass with image
    setupCompass();
    
    // Display instruction modal
    toggleInstructionModal();
    
    // Check URL parameters
    if (!getURLParameters()) {
        toggleErrorModal('Invalid URL parameters. Please try again.');
        return;
    }
    
    // For testing, start with hardcoded position to see UI even without GPS
    current.latitude = target.latitude - 0.0002; 
    current.longitude = target.longitude - 0.0003;
    
    // Show compass and distance immediately using mock data
    updateDistanceDisplay();
    updateUI();
    
    // Fetch booking data
    fetchBookingData().then(success => {
        if (!success) {
            toggleErrorModal('Could not fetch booking data. Please try again.');
        }
    });
    
    // Start watching user position
    navigator.geolocation.watchPosition(
        setCurrentPosition, 
        handleGeolocationError, 
        geolocationOptions
    );
    
    // Set up device orientation
    if (window.DeviceOrientationEvent) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ needs permission
            console.log("iOS device detected, waiting for permission request");
        } else {
            // Non-iOS devices
            window.addEventListener("deviceorientation", runCalculation);
            console.log("Added deviceorientation event listener");
        }
    } else {
        console.warn("DeviceOrientationEvent not supported!");
    }
    
    // Create a debug button for iOS permission
    createIOSPermissionButton();
    
    // Add a button to verify the 3D model path
    addModelTestButton();
}

// Create a button for iOS orientation permission
function createIOSPermissionButton() {
    if (isIOS) {
        const btn = document.createElement('button');
        btn.innerText = 'Enable Compass';
        btn.style.position = 'fixed';
        btn.style.bottom = '20px';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.style.padding = '10px 20px';
        btn.style.backgroundColor = '#4285F4';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.borderRadius = '20px';
        btn.style.zIndex = '2000';
        
        btn.addEventListener('click', startCompass);
        document.body.appendChild(btn);
    }
}

// Handle geolocation errors
function handleGeolocationError(error) {
    console.error('Geolocation error:', error);
    toggleErrorModal('Could not access your location. Please enable location services and try again.');
}

// Request permission for device orientation (required for iOS)
function startCompass() {
    console.log("Starting compass");
    
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then((response) => {
                if (response === "granted") {
                    window.addEventListener("deviceorientation", runCalculation);
                    console.log("Device orientation permission granted");
                    
                    // Remove the permission button
                    const permBtn = document.querySelector('button');
                    if (permBtn) permBtn.remove();
                } else {
                    console.error("Permission not granted for device orientation");
                    toggleErrorModal('Device orientation permission is required for the compass to work.');
                }
            })
            .catch((error) => {
                console.error("Error requesting device orientation permission:", error);
                toggleErrorModal('Could not request device orientation permission.');
            });
    }
}

// Update current position from geolocation
function setCurrentPosition(position) {
    console.log("Position updated:", position.coords);
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
    updateDistanceDisplay();
}

// Calculate direction and distance to target
function runCalculation(event) {
    if (!event.alpha && event.alpha !== 0) {
        console.warn("No alpha value in orientation event");
        return;
    }
    
    var alpha = isIOS ? Math.abs(360 - event.webkitCompassHeading) : event.alpha;
    
    if (alpha == null) {
        console.warn("No compass heading available");
        return;
    }
    
    // Only update if alpha changed significantly or we're forcing an update
    if (Math.abs(alpha - lastAlpha) > 1) {
        var lat1 = current.latitude * (Math.PI / 180);
        var lon1 = current.longitude * (Math.PI / 180);
        var lat2 = target.latitude * (Math.PI / 180);
        var lon2 = target.longitude * (Math.PI / 180);
        
        // Calculate compass direction
        var y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        var x =
            Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        var bearing = Math.atan2(y, x) * (180 / Math.PI);
        
        direction = (alpha + bearing + 360) % 360;
        
        lastAlpha = alpha;
        
        // Calculate distance
        var R = 6371; // Radius of the earth in km
        var dLat = lat2 - lat1;
        var dLon = lon2 - lon1;
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = R * c * 1000; // Distance in meters
        
        console.log("Direction:", direction, "Distance:", distance);
        
        updateDistanceDisplay();
        
        // Show car directions when user is close to target
        if (distance <= 10 && !isViewingDirections) {
            toggleCarDirectionsModal();
            isViewingDirections = true;
        }
    }
}

// Update distance display
function updateDistanceDisplay() {
    var distanceElement = document.getElementById("distanceFromTarget");
    if (distanceElement) {
        if (!current.latitude || !current.longitude) {
            distanceElement.innerHTML = 'Waiting for location...';
        } else if (distance > 10000) {
            distanceElement.innerHTML = 'Calculating distance...';
        } else if (distance <= 1) {
            distanceElement.innerHTML = 'You have arrived!';
        } else {
            distanceElement.innerHTML = Math.floor(distance) + "m to destination";
        }
    }
}

// Continuously update UI
function updateUI() {
    // Update arrow rotation
    const arrow = document.querySelector(".arrow");
    if (arrow) {
        // The direction is calculated based on compass heading and bearing to target
        arrow.style.transform = `translate(-50%, -50%) rotate(${direction}deg)`;
    }
    requestAnimationFrame(updateUI);
}

// Toggle instructions modal
function toggleInstructionModal() {
    console.log("Toggling instruction modal");
    var modalInstructions = document.getElementById("modalInstructions");
    if (modalInstructions) {
        modalInstructions.style.display = "block";
    }
}

// Close instructions modal
function closeInstructionModal() {
    console.log("Closing instruction modal");
    var modalInstructions = document.getElementById("modalInstructions");
    if (modalInstructions) {
        modalInstructions.style.display = "none";
    }
}

// Toggle error modal
function toggleErrorModal(errorMessage) {
    console.log("Toggling error modal:", errorMessage);
    var modalError = document.getElementById("modalError");
    var errorText = document.getElementById("errorText");
    
    if (modalError && errorText) {
        errorText.textContent = errorMessage;
        modalError.style.display = "block";
    }
}

// Close error modal
function closeErrorModal() {
    console.log("Closing error modal");
    var modalError = document.getElementById("modalError");
    if (modalError) {
        modalError.style.display = "none";
    }
}

// Toggle car directions modal
function toggleCarDirectionsModal() {
    console.log("Toggling car directions modal");
    var modalCarDirections = document.getElementById("modalCarDirections");
    var carImage = document.getElementById("carImage");
    var directionsText = document.getElementById("directionsText");
    
    if (modalCarDirections && carImage && directionsText) {
        carImage.src = carImageUrl;
        directionsText.textContent = carDirections;
        modalCarDirections.style.display = "block";
    }
}

// Close car directions modal
function closeCarDirectionsModal() {
    console.log("Closing car directions modal");
    var modalCarDirections = document.getElementById("modalCarDirections");
    if (modalCarDirections) {
        modalCarDirections.style.display = "none";
        isViewingDirections = false; // Reset flag so modal can show again
    }
}

// Add debug info to the page
function addDebugInfo() {
    const debugDiv = document.createElement('div');
    debugDiv.style.position = 'fixed';
    debugDiv.style.bottom = '80px';
    debugDiv.style.left = '10px';
    debugDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
    debugDiv.style.color = 'white';
    debugDiv.style.padding = '10px';
    debugDiv.style.borderRadius = '5px';
    debugDiv.style.zIndex = '2000';
    debugDiv.style.maxWidth = '80%';
    debugDiv.style.fontSize = '12px';
    debugDiv.id = 'debugInfo';
    document.body.appendChild(debugDiv);
    
    // Update debug info regularly
    setInterval(() => {
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            debugInfo.innerHTML = `
                <strong>Debug Info:</strong><br>
                Current: ${current.latitude}, ${current.longitude}<br>
                Target: ${target.latitude}, ${target.longitude}<br>
                Distance: ${Math.round(distance)}m<br>
                Direction: ${Math.round(direction)}°<br>
                Has orientation: ${window.DeviceOrientationEvent ? 'Yes' : 'No'}<br>
                Is iOS: ${isIOS ? 'Yes' : 'No'}<br>
            `;
        }
    }, 500);
}

// Initialize the app when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded");
    
    // Set up event listeners for modals
    document.querySelector(".modal-instructions-content").addEventListener("click", function() {
        closeInstructionModal();
    });
    
    if (document.querySelector(".closeInstructions")) {
        document.querySelector(".closeInstructions").addEventListener("click", function() {
            closeInstructionModal();
        });
    }
    
    if (document.querySelector(".modal-error-content")) {
        document.querySelector(".modal-error-content").addEventListener("click", function() {
            closeErrorModal();
        });
    }
    
    if (document.querySelector(".closeError")) {
        document.querySelector(".closeError").addEventListener("click", function() {
            closeErrorModal();
        });
    }
    
    if (document.querySelector(".modal-car-directions-content")) {
        document.querySelector(".modal-car-directions-content").addEventListener("click", function() {
            closeCarDirectionsModal();
        });
    }
    
    if (document.querySelector(".closeCarDirections")) {
        document.querySelector(".closeCarDirections").addEventListener("click", function() {
            closeCarDirectionsModal();
        });
    }
    
    // Add debug info during development
    addDebugInfo();
    
    // Initialize the app
    init();
});
// Replace the triangle with the provided arrow image that rotates towards the target
function setupCompass() {
    console.log("Setting up compass with image arrow");
    
    const arrow = document.querySelector(".arrow");
    if (arrow) {
        // Remove any existing CSS styling that created the triangle
        arrow.style.backgroundColor = "transparent";
        arrow.style.clipPath = "none";
        
        // Add the arrow image
        arrow.style.backgroundImage = "url('../AR/static/images/arrow.png')";
        arrow.style.backgroundSize = "contain";
        arrow.style.backgroundRepeat = "no-repeat";
        arrow.style.backgroundPosition = "center";
        
        console.log("Arrow image applied to compass");
    } else {
        console.error("Arrow element not found");
    }
}

// Add a button to test if the 3D model loads properly
function addModelTestButton() {
    const btn = document.createElement('button');
    btn.innerText = 'Test 3D Model';
    btn.style.position = 'fixed';
    btn.style.bottom = '120px';
    btn.style.left = '50%';
    btn.style.transform = 'translateX(-50%)';
    btn.style.padding = '10px 20px';
    btn.style.backgroundColor = '#4CAF50';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '20px';
    btn.style.zIndex = '2000';
    
    btn.addEventListener('click', function() {
        // Create a test entity in the scene to verify the 3D model loads
        const scene = document.querySelector('a-scene');
        if (scene) {
            // Create a test entity that's visible regardless of GPS
            const testEntity = document.createElement('a-entity');
            testEntity.setAttribute('gltf-model', '../AR/static/3dModels/pin.glb');
            testEntity.setAttribute('position', '0 0 -3');  // 3 meters in front of camera
            testEntity.setAttribute('scale', '0.5 0.5 0.5');
            testEntity.setAttribute('rotation', '0 0 0');
            
            scene.appendChild(testEntity);
            
            alert('Test 3D model added in front of camera. If you don\'t see it, check the model path.');
        }
    });
    
    document.body.appendChild(btn);
}