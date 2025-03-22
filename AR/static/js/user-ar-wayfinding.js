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

// Initialize the AR scene with better entity placement
function setupARScene() {
    console.log("Setting up AR scene");
    
    // Get the scene
    const scene = document.querySelector('a-scene');
    if (!scene) {
        console.error("A-Scene not found!");
        return;
    }
    
    // Remove any existing pin to avoid duplicates
    let existingPin = document.getElementById('arPin');
    if (existingPin) {
        existingPin.parentNode.removeChild(existingPin);
        console.log("Removed existing pin");
    }
    
    // Create the AR pin entity with improved attributes
    const arPin = document.createElement('a-entity');
    arPin.id = 'arPin';
    
    // Set model and position with more reliable configuration
    arPin.setAttribute('gltf-model', '../3dModels/pin.glb');
    arPin.setAttribute('scale', '1 1 1');
    arPin.setAttribute('look-at', '[gps-camera]'); // Make it face the camera
    arPin.setAttribute('gps-entity-place', `latitude: ${target.latitude}; longitude: ${target.longitude}`);
    
    // Add animation to make it more visible (floating effect)
    arPin.setAttribute('animation', 'property: position; to: 0 1 0; dir: alternate; dur: 2000; easing: easeInOutQuad; loop: true;');
    
    // Add to scene
    scene.appendChild(arPin);
    
    console.log("AR pin created with coordinates:", target);
    
    // Add a static pin as a fallback to verify model loading
    addStaticPin(scene);
}

// Add a static pin that's visible regardless of GPS location (for testing)
function addStaticPin(scene) {
    const staticPin = document.createElement('a-entity');
    staticPin.id = 'staticPin';
    staticPin.setAttribute('gltf-model', '../3dModels/pin.glb');
    staticPin.setAttribute('position', '0 -1 -3'); // Position in front of the camera
    staticPin.setAttribute('scale', '0.5 0.5 0.5');
    staticPin.setAttribute('rotation', '0 0 0');
    
    scene.appendChild(staticPin);
    console.log("Added static pin in front of camera for testing");
}

// Ensure proper configuration of the AR scene
function enhanceARScene() {
    // Get the scene and camera
    const scene = document.querySelector('a-scene');
    const camera = document.querySelector('[gps-camera]');
    
    if (!scene || !camera) {
        console.error("Required AR elements not found");
        return;
    }
    
    // Improve camera settings for AR
    camera.setAttribute('gps-camera', {
        simulateLatitude: target.latitude,
        simulateLongitude: target.longitude,
        positionMinAccuracy: 100, // Be more lenient with GPS accuracy
        alert: false // Disable alerts
    });
    
    // Configure scene for better performance
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
    scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;');
}

// Update existing pin position based on current distance
function updatePinPosition() {
    const pin = document.getElementById('arPin');
    if (pin && distance !== null) {
        // Make the pin more visible when close
        if (distance < 50) {
            pin.setAttribute('scale', '1 1 1'); // Make it larger when close
        } else {
            pin.setAttribute('scale', '0.5 0.5 0.5');
        }
        
        console.log("Updated pin with distance:", distance);
    }
}

// Initialize compass and geolocation with enhanced AR features
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
    
    // Enhance AR scene configuration
    setTimeout(() => {
        enhanceARScene();
    }, 1000); // Wait for AR.js to initialize
    
    // For testing, start with hardcoded position to see UI even without GPS
    current.latitude = target.latitude - 0.0002; 
    current.longitude = target.longitude - 0.0003;
    
    // Show compass and distance immediately using mock data
    updateDistanceDisplay();
    updateUI();
    
    // Set up AR scene
    setupARScene();
    
    // Fetch booking data
    fetchBookingData().then(success => {
        if (!success) {
            toggleErrorModal('Could not fetch booking data. Please try again.');
        }
    });
    
    // Add debug button to toggle static pin view
    addDebugButton();
    
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
    
    // Add this at the end of the function to update pin position
    updatePinPosition();
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
            testEntity.setAttribute('scale', '1 1 1');
            testEntity.setAttribute('rotation', '0 0 0');
            
            scene.appendChild(testEntity);
            
            alert('Test 3D model added in front of camera. If you don\'t see it, check the model path.');
        }
    });
    
    document.body.appendChild(btn);
}

// Add a debug button to help with testing
function addDebugButton() {
    const btn = document.createElement('button');
    btn.innerText = '3D Model Test';
    btn.style.position = 'fixed';
    btn.style.bottom = '20px';
    btn.style.right = '20px';
    btn.style.padding = '10px';
    btn.style.backgroundColor = '#4CAF50';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '50%';
    btn.style.width = '60px';
    btn.style.height = '60px';
    btn.style.zIndex = '2000';
    
    btn.addEventListener('click', function() {
        // Toggle the visibility of the static pin
        const staticPin = document.getElementById('staticPin');
        if (staticPin) {
            const currentPosition = staticPin.getAttribute('position');
            if (currentPosition.z === -3) {
                staticPin.setAttribute('position', '0 -1 -1.5'); // Bring closer
                btn.style.backgroundColor = '#F44336';
            } else {
                staticPin.setAttribute('position', '0 -1 -3'); // Move back
                btn.style.backgroundColor = '#4CAF50';
            }
        }
    });
    
    document.body.appendChild(btn);
}

// Add this function to your code
function addTestModel() {
    console.log("Adding test model to verify GLB loading");
    
    // Get scene
    const scene = document.querySelector('a-scene');
    if (!scene) {
        console.error("Scene not found for test model");
        return;
    }
    
    // Create test entity
    const testEntity = document.createElement('a-entity');
    testEntity.id = 'testModel';
    
    // Position it directly in front of the camera
    testEntity.setAttribute('position', '0 0 -3'); // 3 meters in front
    testEntity.setAttribute('scale', '0.5 0.5 0.5');
    testEntity.setAttribute('rotation', '0 0 0');
    
    // Try multiple paths to find the working one
    const paths = [
        '../3dModels/pin.glb',
        'static/3dModels/pin.glb',
        './static/3dModels/pin.glb',
        '../static/3dModels/pin.glb',
        'AR/static/3dModels/pin.glb',
        './AR/static/3dModels/pin.glb',
    ];
    
    // Try each path
    testEntity.setAttribute('gltf-model', paths[0]);
    
    // Add to scene
    scene.appendChild(testEntity);
    
    console.log("Test model added with path:", paths[0]);
    
    // Add UI to try different paths
    addPathTestUI(paths);
}

// Add UI to test different paths
function addPathTestUI(paths) {
    const testUI = document.createElement('div');
    testUI.style.position = 'fixed';
    testUI.style.bottom = '10px';
    testUI.style.left = '10px';
    testUI.style.zIndex = '1000';
    testUI.style.backgroundColor = 'rgba(0,0,0,0.7)';
    testUI.style.padding = '10px';
    testUI.style.borderRadius = '5px';
    testUI.style.color = 'white';
    
    let html = '<h3>Test Model Paths</h3>';
    
    paths.forEach((path, index) => {
        html += `<button onclick="tryPath(${index})" style="margin: 5px; padding: 5px;">${path}</button><br>`;
    });
    
    testUI.innerHTML = html;
    document.body.appendChild(testUI);
    
    // Add global function to try different paths
    window.tryPath = function(index) {
        const testModel = document.getElementById('testModel');
        if (testModel) {
            const path = paths[index];
            console.log("Trying path:", path);
            testModel.setAttribute('gltf-model', path);
            
            // Highlight the working button
            const buttons = testUI.querySelectorAll('button');
            buttons.forEach((btn, i) => {
                btn.style.backgroundColor = i === index ? '#4CAF50' : '#555';
            });
        }
    };
}

// Call this function after your scene is initialized
addTestModel();