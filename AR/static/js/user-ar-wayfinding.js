import { db, auth } from '../../../static/js/common/firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let current = { latitude: null, longitude: null };
let target = { latitude: 0, longitude: 0 };
let lastAlpha = 0;
let direction = 0;
let distance = 0;
let carVisible = false;
let isArActive = false;
let userId = null;
let bookingId = null;
let carId = null;
let bookingData = null;
let carData = null;
let carEntity = null;
let distanceUpdateInterval = null;
let map = null;

// Check if device is iOS
const isIOS = navigator.userAgent.match(/(iPod|iPhone|iPad)/) && navigator.userAgent.match(/AppleWebKit/);

// DOM elements
const loadingScreen = document.getElementById('loading-screen');
const instructionModal = document.getElementById('instruction-modal');
const modalClose = document.getElementById('modal-close');
const startArButton = document.getElementById('start-ar-button');
const backButton = document.getElementById('back-button');
const distanceFromTarget = document.getElementById('distance-display');
const carModel = document.getElementById('car-model');
const licensePlate = document.getElementById('license-plate');
const errorText = document.getElementById('error-text');
const errorOverlay = document.getElementById('error-message');
const toggleViewButton = document.getElementById('toggle-view-button');
const arView = document.getElementById('ar-view');
const mapView = document.getElementById('map-view');

// Geolocation options
const geolocationOptions = { 
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            
            // Get booking and car IDs from session storage
            bookingId = sessionStorage.getItem('arBookingId');
            carId = sessionStorage.getItem('arCarId');
            
            if (!bookingId || !carId) {
                showError("Booking information is missing. Please return to your bookings.");
                return;
            }
            
            // Show instruction modal
            loadingScreen.style.display = 'none';
            instructionModal.style.display = 'flex';
            
            // Try to load car data while showing instructions
            try {
                await loadCarData();
            } catch (error) {
                console.error("Error loading car data:", error);
            }
            
            // Set up event listeners
            setupEventListeners();
            
            // Initialize UI updates
            updateUI();
        } else {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

// Load car and booking data
async function loadCarData() {
    try {
        // Get booking document
        if (!carId || !bookingId) return;
        
        // Get car document
        const carDoc = await getDoc(doc(db, 'cars', carId));
        if (!carDoc.exists()) {
            throw new Error("Car not found");
        }
        
        carData = carDoc.data();
        
        // Get booking document
        const bookingDoc = await getDoc(doc(db, 'timesheets', carId, 'bookings', bookingId));
        if (!bookingDoc.exists()) {
            throw new Error("Booking not found");
        }
        
        bookingData = bookingDoc.data();
        
        // Verify booking belongs to user
        if (bookingData.user_id !== userId) {
            throw new Error("You don't have permission to view this booking");
        }
        
        // Set target location
        if (carData.current_location) {
            target.latitude = carData.current_location.latitude;
            target.longitude = carData.current_location.longitude;
            
            // Update UI with car details
            updateCarInfo();
        } else {
            throw new Error("Car location is not available");
        }
        
        return true;
    } catch (error) {
        console.error("Error loading car data:", error);
        showError(error.message || "Failed to load car information");
        return false;
    }
}

// Update car information in UI
function updateCarInfo() {
    if (carModel) {
        carModel.textContent = carData.car_type || 'Car';
    }
    
    if (licensePlate && carData.license_plate) {
        licensePlate.textContent = carData.license_plate;
    }
}

// Set up event listeners
function setupEventListeners() {
    // Close instruction modal
    modalClose.addEventListener('click', closeInstructionModal);
    
    // Start AR button
    startArButton.addEventListener('click', startAR);
    
    // Back button
    backButton.addEventListener('click', navigateBack);
    
    // Error retry button
    const retryButton = document.getElementById('retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            errorOverlay.style.display = 'none';
            startAR();
        });
    }
    
    // Map fallback button
    const fallbackButton = document.getElementById('fallback-button');
    if (fallbackButton) {
        fallbackButton.addEventListener('click', () => {
            // Redirect to Google Maps with directions
            if (target.latitude && target.longitude) {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}`;
                window.open(url, '_blank');
            } else {
                alert("Car location is not available");
            }
        });
    }
    
    // View toggle button
    if (toggleViewButton) {
        toggleViewButton.addEventListener('click', toggleView);
    }
}

// Toggle between AR and Map views
function toggleView() {
    if (arView.style.display === 'none') {
        // Switch to AR view
        arView.style.display = 'block';
        mapView.style.display = 'none';
        toggleViewButton.innerHTML = '<i class="bi bi-map"></i>';
    } else {
        // Switch to Map view
        arView.style.display = 'none';
        mapView.style.display = 'block';
        toggleViewButton.innerHTML = '<i class="bi bi-camera"></i>';
        
        // Initialize map if not already done
        if (!map && target.latitude && target.longitude) {
            initMap();
        }
    }
}

// Close instruction modal
function closeInstructionModal() {
    instructionModal.style.display = 'none';
    // Don't automatically start AR - wait for button click
}

// Start AR experience
function startAR() {
    closeInstructionModal();
    loadingScreen.style.display = 'flex';
    
    // Make AR overlay visible
    document.querySelector('.ar-overlay').style.display = 'block';
    
    // Initialize geolocation
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            setCurrentPosition, 
            handleGeolocationError, 
            geolocationOptions
        );
    } else {
        showError("Geolocation is not supported by this browser.");
        return;
    }
    
    // Request device orientation permissions for iOS
    if (isIOS) {
        startCompass();
    } else {
        // For non-iOS devices
        window.addEventListener("deviceorientationabsolute", runCalculation);
        // Fallback if deviceorientationabsolute is not available
        window.addEventListener("deviceorientation", runCalculation);
    }
    
    isArActive = true;
    
    // Find the car entity
    carEntity = document.getElementById('carOff') || document.getElementById('car');
    
    // Start distance update interval
    if (!distanceUpdateInterval) {
        distanceUpdateInterval = setInterval(updateDistanceDisplay, 3000);
    }
}

// Navigate back to booking details
function navigateBack() {
    // Clean up before leaving
    if (distanceUpdateInterval) {
        clearInterval(distanceUpdateInterval);
    }
    
    if (bookingId && carId) {
        window.location.href = `../user/user-booking-details.html?id=${bookingId}&carId=${carId}`;
    } else {
        window.location.href = '../user/user-bookings.html';
    }
}

// Start compass for iOS devices
function startCompass() {
    if (isIOS && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', runCalculation);
                } else {
                    showError('Permission to access device orientation is required for AR navigation.');
                }
            })
            .catch(error => {
                console.error('Error requesting device orientation permission:', error);
                showError('Could not access device orientation. Please ensure permissions are granted.');
            });
    }
}

// Store current position from geolocation API
function setCurrentPosition(position) {
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
    
    // Hide loading screen once we have position
    loadingScreen.style.display = 'none';
    
    // Show car if we have a valid target and current position
    if (target.latitude !== 0 && target.longitude !== 0) {
        // Calculate distance
        calculateDistance();
        
        // Show car based on distance
        if (distance <= 300) { // Only show car model within 300m
            showCar();
        } else {
            hideCar();
        }
    }
}

// Handle geolocation errors
function handleGeolocationError(error) {
    loadingScreen.style.display = 'none';
    
    let errorMsg = "Error accessing your location: ";
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMsg += "Location permission denied.";
            break;
        case error.POSITION_UNAVAILABLE:
            errorMsg += "Location information unavailable.";
            break;
        case error.TIMEOUT:
            errorMsg += "Location request timed out.";
            break;
        default:
            errorMsg += "Unknown error occurred.";
    }
    
    showError(errorMsg);
}

// Show error message
function showError(message) {
    loadingScreen.style.display = 'none';
    
    if (errorOverlay && errorText) {
        errorText.textContent = message;
        errorOverlay.style.display = 'flex';
    } else {
        alert(message);
    }
}

// Show car 3D model
function showCar() {
    if (!carVisible && carEntity) {
        carEntity.id = 'car';
        carEntity.setAttribute('gltf-model', '#car-model');
        carEntity.setAttribute('gps-projected-entity-place', `latitude: ${target.latitude}; longitude: ${target.longitude}`);
        carEntity.setAttribute('scale', '2 2 2');
        carEntity.setAttribute('animation-mixer', '');
        carVisible = true;
    }
}

// Hide car 3D model
function hideCar() {
    if (carVisible && carEntity) {
        carEntity.id = 'carOff';
        carEntity.removeAttribute('gltf-model');
        carEntity.removeAttribute('animation-mixer');
        carVisible = false;
    }
}

// Calculate distance between current position and target
function calculateDistance() {
    if (!current.latitude || !target.latitude) return 0;
    
    const R = 6371; // Earth radius in km
    const lat1 = current.latitude * (Math.PI / 180);
    const lon1 = current.longitude * (Math.PI / 180);
    const lat2 = target.latitude * (Math.PI / 180);
    const lon2 = target.longitude * (Math.PI / 180);
    
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distance = R * c * 1000; // Convert to meters
    
    return distance;
}

// Calculate and update compass bearing
function runCalculation(event) {
    if (!current.latitude || !target.latitude) return;
    
    // Get compass heading
    let alpha;
    
    if (isIOS && event.webkitCompassHeading) {
        // iOS provides this value in degrees from magnetic north, clockwise
        alpha = Math.abs(360 - event.webkitCompassHeading);
    } else if (event.alpha !== null) {
        // Android/other - alpha is in degrees from 0 to 360
        alpha = event.alpha;
    } else {
        // No orientation data available
        return;
    }
    
    // Only update if we have significant changes or no last value
    if (alpha == null || Math.abs(alpha - lastAlpha) > 1) {
        // Calculate bearing
        const lat1 = current.latitude * (Math.PI / 180);
        const lon1 = current.longitude * (Math.PI / 180);
        const lat2 = target.latitude * (Math.PI / 180);
        const lon2 = target.longitude * (Math.PI / 180);
        
        // Calculate compass direction
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        const bearing = Math.atan2(y, x) * (180 / Math.PI);
        
        // Set arrow direction
        direction = (alpha + bearing + 360) % 360;
        direction = direction.toFixed(0);
        lastAlpha = alpha;
        
        // Calculate distance
        calculateDistance();
        
        // Update distance display
        updateDistanceDisplay();
        
        // Show/hide car model based on distance
        if (distance <= 300) {
            showCar();
        } else {
            hideCar();
        }
    }
}

// Update distance display
function updateDistanceDisplay() {
    if (!distanceFromTarget) return;
    
    if (distance > 10000) {
        distanceFromTarget.innerHTML = 'Select a valid destination';
        distanceFromTarget.className = 'distance-text';
    } else if (distance <= 5) {
        distanceFromTarget.innerHTML = 'You have arrived!';
        distanceFromTarget.className = 'distance-text arrived';
    } else if (distance < 1000) {
        distanceFromTarget.innerHTML = `${Math.floor(distance)}m to your car`;
        distanceFromTarget.className = 'distance-text';
    } else {
        distanceFromTarget.innerHTML = `${(distance / 1000).toFixed(1)}km to your car`;
        distanceFromTarget.className = 'distance-text';
    }
    
    // Update instruction text based on distance
    updateInstructionText();
    
    // Update map marker if map is initialized
    if (map) {
        updateMapMarkers();
    }
}

// Update instruction text based on distance
function updateInstructionText() {
    const instructionText = document.getElementById('instruction-text');
    if (!instructionText) return;
    
    if (distance <= 5) {
        instructionText.textContent = "You've arrived at your car!";
        instructionText.className = 'instruction-text arrived';
    } else if (distance < 20) {
        instructionText.textContent = "Your car is very close. Look around!";
        instructionText.className = 'instruction-text close';
    } else if (distance < 100) {
        instructionText.textContent = "You're getting closer. Keep following the arrow.";
        instructionText.className = 'instruction-text medium';
    } else {
        instructionText.textContent = "Follow the arrow to reach your car.";
        instructionText.className = 'instruction-text far';
    }
}

// Initialize Google Map
function initMap() {
    if (!target.latitude || !target.longitude) return;
    
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    
    map = new google.maps.Map(mapElement, {
        center: { lat: target.latitude, lng: target.longitude },
        zoom: 18,
        mapTypeControl: false,
        fullscreenControl: true,
        streetViewControl: false,
        zoomControl: true
    });
    
    updateMapMarkers();
}

// Make initMap available for Google Maps API callback
window.initMap = initMap;

// Update map markers
function updateMapMarkers() {
    if (!map) return;
    
    // Clear existing markers and paths
    if (window.carMarker) window.carMarker.setMap(null);
    if (window.userMarker) window.userMarker.setMap(null);
    if (window.path) window.path.setMap(null);
    
    // Add car marker
    window.carMarker = new google.maps.Marker({
        position: { lat: target.latitude, lng: target.longitude },
        map: map,
        title: carData ? carData.car_type : 'Your Car',
        icon: {
            url: '../static/assets/images/car-marker.png',
            scaledSize: new google.maps.Size(32, 32)
        }
    });
    
    // Add user marker if position is available
    if (current.latitude && current.longitude) {
        window.userMarker = new google.maps.Marker({
            position: { lat: current.latitude, lng: current.longitude },
            map: map,
            title: 'Your Location',
            icon: {
                url: '../static/assets/images/user-marker.png',
                scaledSize: new google.maps.Size(24, 24)
            }
        });
        
        // Add path between user and car
        window.path = new google.maps.Polyline({
            path: [
                { lat: current.latitude, lng: current.longitude },
                { lat: target.latitude, lng: target.longitude }
            ],
            geodesic: true,
            strokeColor: '#1e88e5',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            map: map
        });
        
        // Fit both markers
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: current.latitude, lng: current.longitude });
        bounds.extend({ lat: target.latitude, lng: target.longitude });
        map.fitBounds(bounds);
    }
}

// Update UI elements
function updateUI() {
    if (isArActive) {
        // Update arrow rotation
        const arrow = document.querySelector(".arrow");
        if (arrow) {
            arrow.style.transform = `rotate(${direction}deg)`;
        }
    }
    
    // Continue updating UI
    requestAnimationFrame(updateUI);
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (distanceUpdateInterval) {
        clearInterval(distanceUpdateInterval);
    }
});