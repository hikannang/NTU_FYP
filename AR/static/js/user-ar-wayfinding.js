// Global variables
var loadingTimeout;
var distance; // Global variable to track distance from target
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
    var loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }

    // Clear the timeout if it hasn't been triggered yet
    clearTimeout(loadingTimeout);  
}

// Parse URL parameters to get latitude, longitude, and booking ID
function getURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const lat = parseFloat(urlParams.get('lat'));
    const lng = parseFloat(urlParams.get('lng'));
    const id = urlParams.get('id');
    
    if (lat && lng && id) {
        target.latitude = lat;
        target.longitude = lng;
        bookingId = id;
        return true;
    } else {
        console.error('Missing required URL parameters: lat, lng, or id');
        return false;
    }
}

// Fetch booking data from Firestore
async function fetchBookingData() {
    try {
        showLoadingScreen();
        
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
    // Create AR entity with the pin model
    if (document.getElementById('arPin')) {
        const arPin = document.getElementById('arPin');
        arPin.setAttribute('gltf-model', 'AR/static/3dModels/pin.glb');
        arPin.setAttribute('scale', '1 1 1');
        arPin.setAttribute('gps-projected-entity-place', `latitude: ${target.latitude}; longitude: ${target.longitude}`);
    }
}

// Initialize compass and geolocation
function init() {
    // Check URL parameters
    if (!getURLParameters()) {
        toggleErrorModal('Invalid URL parameters. Please try again.');
        return;
    }
    
    // Fetch booking data
    fetchBookingData().then(success => {
        if (!success) {
            toggleErrorModal('Could not fetch booking data. Please try again.');
            return;
        }
    });
    
    // Start watching user position
    navigator.geolocation.watchPosition(setCurrentPosition, handleGeolocationError, geolocationOptions);
    
    // Set up device orientation
    if (!isIOS) {
        window.addEventListener("deviceorientationabsolute", runCalculation);
    }
    
    // Display instruction modal
    toggleInstructionModal();
    
    // Start UI updates
    updateUI();
}

// Handle geolocation errors
function handleGeolocationError(error) {
    console.error('Geolocation error:', error);
    toggleErrorModal('Could not access your location. Please enable location services and try again.');
}

// Request permission for device orientation (required for iOS)
function startCompass() {
    if (isIOS) {
        DeviceOrientationEvent.requestPermission()
            .then((response) => {
                if (response === "granted") {
                    window.addEventListener("deviceorientation", runCalculation);
                } else {
                    toggleErrorModal('Device orientation permission is required for the compass to work.');
                }
            })
            .catch(() => toggleErrorModal('Device orientation not supported on this device.'));
    }
}

// Update current position from geolocation
function setCurrentPosition(position) {
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
}

// Calculate direction and distance to target
function runCalculation(event) {
    var alpha = Math.abs(360 - event.webkitCompassHeading) || event.alpha;
    
    if (alpha == null || Math.abs(alpha - lastAlpha) > 1) {
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
        direction = direction.toFixed(0);
        
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
        if (distance > 10000) {
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
        arrow.style.transform = `translate(-50%, -50%) rotate(${direction}deg)`;
    }
    requestAnimationFrame(updateUI);
}

// Initialize the app when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    init();
});

// ========== MODAL FUNCTIONS ==========

// Handle instruction modal
function toggleInstructionModal() {
    var modalInstructions = document.getElementById("modalInstructions");
    if (modalInstructions) {
        modalInstructions.style.zIndex = "6000";
        modalInstructions.style.display = "block";
    }
}

function closeInstructionModal() {
    var modalInstructions = document.getElementById("modalInstructions");
    if (modalInstructions) {
        modalInstructions.style.display = 'none';
    }
}

// Handle error modal
function toggleErrorModal(errorMessage) {
    var modalError = document.getElementById("modalError");
    var errorText = document.getElementById("errorText");
    
    if (modalError && errorText) {
        errorText.textContent = errorMessage;
        modalError.style.zIndex = "6000";
        modalError.style.display = "block";
    }
}

function closeErrorModal() {
    var modalError = document.getElementById("modalError");
    if (modalError) {
        modalError.style.display = 'none';
    }
}

// Handle car directions modal
function toggleCarDirectionsModal() {
    var modalCarDirections = document.getElementById("modalCarDirections");
    var carImage = document.getElementById("carImage");
    var directionsText = document.getElementById("directionsText");
    
    if (modalCarDirections && carImage && directionsText) {
        carImage.src = carImageUrl;
        directionsText.textContent = carDirections;
        modalCarDirections.style.zIndex = "6000";
        modalCarDirections.style.display = "block";
    }
}

function closeCarDirectionsModal() {
    var modalCarDirections = document.getElementById("modalCarDirections");
    if (modalCarDirections) {
        modalCarDirections.style.display = 'none';
    }
}

// ========== EVENT LISTENERS ==========

// Set up event listeners once DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Handle instruction modal close
    document.querySelector(".modal-instructions-content").addEventListener("click", function() {
        closeInstructionModal();
    });
    
    document.querySelector(".closeInstructions").addEventListener("click", function() {
        closeInstructionModal();
    });
    
    // Handle error modal close
    document.querySelector(".modal-error-content").addEventListener("click", function() {
        closeErrorModal();
    });
    
    document.querySelector(".closeError").addEventListener("click", function() {
        closeErrorModal();
    });
    
    // Handle car directions modal close
    document.querySelector(".modal-car-directions-content").addEventListener("click", function() {
        closeCarDirectionsModal();
    });
    
    document.querySelector(".closeCarDirections").addEventListener("click", function() {
        closeCarDirectionsModal();
    });
    
    // Request device orientation permission (for iOS)
    if (isIOS) {
        document.addEventListener("click", function() {
            if (!hasRequestedOrientation) {
                startCompass();
                hasRequestedOrientation = true;
            }
        }, { once: true });
    }
    
    // Handle reload button
    var reloadButton = document.getElementById("reloadButton");
    if (reloadButton) {
        reloadButton.addEventListener("click", function() {
            location.reload();
        });
    }
    
    // Handle back button
    var backButton = document.getElementById("backButton");
    if (backButton) {
        backButton.addEventListener("click", function() {
            window.history.back();
        });
    }
});

// ========== UTILITY FUNCTIONS ==========

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c * 1000; // Distance in meters
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Format distance for display
function formatDistance(distance) {
    if (distance < 1000) {
        return Math.round(distance) + "m";
    } else {
        return (distance / 1000).toFixed(1) + "km";
    }
}

// Check if device has internet connection
function checkInternetConnection() {
    return navigator.onLine;
}

// Handle offline status
function handleOffline() {
    toggleErrorModal('You are offline. Please check your internet connection and try again.');
}

// Event listeners for online/offline status
window.addEventListener('online', function() {
    // Reload to restore functionality when coming back online
    location.reload();
});

window.addEventListener('offline', function() {
    handleOffline();
});

// Add a variable to track if orientation permission has been requested
var hasRequestedOrientation = false;

// Add Firebase initialization check
function checkFirebaseInitialization() {
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error('Firebase is not initialized');
        toggleErrorModal('Could not connect to the database. Please try again later.');
        return false;
    }
    return true;
}

// Add this to the init function at the appropriate place
function setupErrorHandling() {
    window.onerror = function(message, source, lineno, colno, error) {
        console.error('Error caught:', error);
        toggleErrorModal('An error occurred: ' + message);
        return true; // Prevents default browser error handling
    };
}

// Call this early in the init function
setupErrorHandling();

// Check if the Firebase app is initialized before trying to use it
if (!checkFirebaseInitialization()) {
    toggleErrorModal('Database connection failed. Please try again later.');
}