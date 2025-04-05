// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Global variables
var distance;
var isViewed = false;
var loadingTimeout;
var bookingId = null;
var carDirections = "";

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
    
    console.log("URL parameters - lat:", lat, "lng:", lng, "bookingId:", bookingId);
    
    if (lat && lng) {
        target.latitude = lat;
        target.longitude = lng;
        
        // Create AR marker at destination
        createDestinationMarker(lat, lng);
    } else {
        console.error("No valid coordinates in URL parameters");
    }
    
    // Fetch car data if booking ID is provided
    if (bookingId) {
        fetchCarData(bookingId);
    } else {
        console.warn("No booking ID provided in URL parameters");
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
    entity.setAttribute('gps-projected-entity-place', `latitude: ${lat}; longitude: ${lng}`);
    entity.setAttribute('animation-mixer', '');
    
    // Add entity to scene
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

// Initialize geolocation and device orientation
function init() {
    console.log("Initializing AR wayfinding");
    
    // Parse URL parameters
    getUrlParameters();
    
    // We'll start location services when user closes intro modal
    // This is handled in startServices() function
}

// Request permission for device orientation (required for iOS)
function startCompass() {
    console.log("Requesting compass permissions");
    
    if (isIOS) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then((response) => {
                    if (response === "granted") {
                        console.log("iOS orientation permission granted");
                        window.addEventListener("deviceorientation", runCalculation);
                    } else {
                        console.error("iOS orientation permission denied");
                        alert("Permission is required for compass functionality");
                    }
                })
                .catch((error) => {
                    console.error("iOS orientation permission error:", error);
                    alert("Device orientation not supported");
                });
        } else {
            // Older iOS that doesn't need permissions
            window.addEventListener("deviceorientation", runCalculation);
        }
    } else {
        // Non-iOS devices
        try {
            window.addEventListener("deviceorientationabsolute", runCalculation);
        } catch (e) {
            console.warn("deviceorientationabsolute not supported, falling back to deviceorientation");
            window.addEventListener("deviceorientation", runCalculation);
        }
    }
}

// Update current position from geolocation API
function setCurrentPosition(position) {
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
    console.log("Current position updated:", current.latitude, current.longitude);
}

// Calculate compass direction and distance to target
function runCalculation(event) {
    var alpha = Math.abs(360 - event.webkitCompassHeading) || event.alpha;
    
    // Only update if there's a significant change to reduce computation
    if (alpha == null || Math.abs(alpha - lastAlpha) > 1) {
        // Make sure we have valid coordinates
        if (current.latitude === null || current.longitude === null || 
            target.latitude === 0 || target.longitude === 0) {
            return; // Skip calculation if coordinates aren't valid
        }
        
        var lat1 = current.latitude * (Math.PI / 180);
        var lon1 = current.longitude * (Math.PI / 180);
        var lat2 = target.latitude * (Math.PI / 180);
        var lon2 = target.longitude * (Math.PI / 180);
        
        // Calculate compass direction
        var y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        var x = Math.cos(lat1) * Math.sin(lat2) -
                Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        var bearing = Math.atan2(y, x) * (180 / Math.PI);
        direction = (alpha + bearing + 360) % 360;
        direction = direction.toFixed(0);
        lastAlpha = alpha;
        
        // Calculate distance
        var R = 6371; // Radius of the earth in km
        var dLat = lat2 - lat1;
        var dLon = lon2 - lon1;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance = R * c; // Distance in km
        distance = distance * 1000; // Convert to meters
        
        // Update distance display
        var distanceElement = document.getElementById("distanceFromTarget");
        if (distance > 20000) {
            distanceElement.innerHTML = 'Please Select Destination!';
        } else if (distance <= 1) {
            distanceElement.innerHTML = '';
        } else {
            // Display the actual distance
            distanceElement.innerHTML = Math.floor(distance) + "m to destination";
        }
        
        // Show destination modal when user is within 15m
        if (distance < 15 && !isViewed) {
            console.log("Within 15m of destination, showing modal");
            showDestinationModal();
            isViewed = true;
        }
    }
}

// Show destination modal with car directions
function showDestinationModal() {
    // Create the destination modal if it doesn't exist
    if (!document.getElementById('destinationModal')) {
        createDestinationModal();
    }
    
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

// Create destination modal structure
function createDestinationModal() {
    console.log("Creating destination modal");
    
    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'destinationModal';
    modal.className = 'modal';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'common-modal-content';
    
    // Create close button
    const closeBtn = document.createElement('span');
    closeBtn.id = 'destinationModalClose';
    closeBtn.className = 'close common-close-btn';
    
    const closeImg = document.createElement('img');
    closeImg.src = './static/images/icons/close-red-icon.png';
    closeImg.alt = 'Close Button';
    closeImg.className = 'common-close-img';
    
    closeBtn.appendChild(closeImg);
    
    // Create heading
    const heading = document.createElement('h2');
    heading.textContent = 'You Have Arrived';
    heading.style.cssText = 'text-align: center; margin-top: 20px; color: #333;';
    
    // Create directions content
    const directionsDiv = document.createElement('div');
    directionsDiv.id = 'directionsContent';
    directionsDiv.style.cssText = 'padding: 20px; font-size: 18px; text-align: center;';
    directionsDiv.textContent = carDirections || "You have reached your destination.";
    
    // Assemble the modal
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(heading);
    modalContent.appendChild(directionsDiv);
    modal.appendChild(modalContent);
    
    // Add to document
    document.body.appendChild(modal);
    
    // Add event listeners for both click and touch
    closeBtn.addEventListener('click', closeDestinationModal);
    closeBtn.addEventListener('touchend', function(e) {
        e.preventDefault();
        closeDestinationModal();
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeDestinationModal();
        }
    });
    
    modal.addEventListener('touchend', function(e) {
        if (e.target === modal) {
            e.preventDefault();
            closeDestinationModal();
        }
    });
}

// Close destination modal
function closeDestinationModal() {
    console.log("Closing destination modal");
    var modal = document.getElementById('destinationModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Map modal functions
function toggleMModal() {
    console.log("Opening Google Maps");
    
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

// Function to close map modal
function closeModal() {
    console.log("Closing map modal");
    var modalMap = document.getElementById("modalMap");
    if (modalMap) {
        modalMap.style.display = 'none';
    }
}

// Instruction modal functions
function toggleIModal() {
    console.log("Opening instruction modal");
    var modalI = document.getElementById("modalI");
    if (modalI) {
        modalI.style.display = "block";
    }
}

function closeModalI() {
    console.log("Closing instruction modal");
    var modalI = document.getElementById("modalI");
    if (modalI) {
        modalI.style.display = 'none';
    }
}

// Introduction modal functions
function toggleLModal() {
    console.log("Opening introduction modal");
    var modalL = document.getElementById("modalL");
    if (modalL) {
        modalL.style.display = "block";
    }
}

function closeModalL() {
    console.log("Closing introduction modal");
    var modalL = document.getElementById("modalL");
    if (modalL) {
        modalL.style.display = 'none';
        // Start services after intro modal is closed
        startServices();
    }
}

// Error modal functions
function toggleEModal() {
    console.log("Opening error modal");
    var modalE = document.getElementById("modalE");
    if (modalE) {
        modalE.style.display = "block";
    }
}

function closeModalE() {
    console.log("Closing error modal");
    var modalE = document.getElementById("modalE");
    if (modalE) {
        modalE.style.display = 'none';
    }
}

// Update UI elements (compass arrow)
function updateUI() {
    const arrow = document.querySelector(".arrow");
    
    if (arrow) {
        arrow.style.transform = `rotate(${direction}deg)`;
    }
    
    // Continue updating
    requestAnimationFrame(updateUI);
}

// Function to explicitly trigger location and compass services
function startServices() {
    console.log("Starting location and compass services");
    
    // Start UI updates for compass
    updateUI();
    
    // Explicitly start geolocation
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
                { enableHighAccuracy: true }
            );
        },
        function(error) {
            console.error("Initial position error:", error);
            alert("Cannot access your location. Please enable location services.");
        },
        { enableHighAccuracy: true }
    );
    
    // Start compass
    startCompass();
}

// Add mobile support for touch events
function addMobileSupport() {
    console.log("Adding mobile touch support");
    
    // Get all modals
    const modals = [
        document.getElementById("modalL"),
        document.getElementById("modalI"), 
        document.getElementById("modalE"),
        document.getElementById("modalMap"),
        document.getElementById("destinationModal")
    ];
    
    // Add touch event listeners to modal backgrounds
    modals.forEach(modal => {
        if (modal) {
            // Add touchend event for mobile
            modal.addEventListener('touchend', function(e) {
                console.log("Touch end on modal:", modal.id);
                if (e.target === this) {
                    e.preventDefault();
                    if (modal.id === "modalL") {
                        closeModalL();
                    } else if (modal.id === "modalI") {
                        closeModalI();
                    } else if (modal.id === "modalE") {
                        closeModalE();
                    } else if (modal.id === "modalMap") {
                        closeModal();
                    } else if (modal.id === "destinationModal") {
                        closeDestinationModal();
                    }
                }
            });
        }
    });
    
    // Add touch events to close buttons
    document.querySelectorAll(".common-close-btn").forEach(btn => {
        btn.addEventListener('touchend', function(e) {
            console.log("Touch end on close button");
            e.preventDefault();
            e.stopPropagation();
            
            if (btn.classList.contains("closeL")) {
                closeModalL();
            } else if (btn.classList.contains("closeI")) {
                closeModalI();
            } else if (btn.classList.contains("closeE")) {
                closeModalE();
            } else if (btn.classList.contains("closeM")) {
                closeModal();
            } else if (btn.id === "destinationModalClose") {
                closeDestinationModal();
            }
        });
    });
    
    // Add touch event for map button
    const mapBtn = document.querySelector('.maps');
    if (mapBtn) {
        mapBtn.addEventListener('touchend', function(e) {
            e.preventDefault();
            toggleMModal();
        });
    }
}

// Expose ALL functions needed by HTML to global scope
window.closeModalL = closeModalL;
window.closeModalI = closeModalI;
window.closeModalE = closeModalE;
window.closeModal = closeModal;
window.toggleMModal = toggleMModal;
window.toggleIModal = toggleIModal;
window.toggleLModal = toggleLModal;
window.toggleEModal = toggleEModal;
window.closeDestinationModal = closeDestinationModal;
window.startCompass = startCompass; // Important for iOS

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM content loaded, initializing application");
    
    // Hide menu circles that were for color selection
    const moreOptionsDiv = document.getElementById('moreOptionsDiv');
    if (moreOptionsDiv) {
        moreOptionsDiv.style.display = 'none';
    }
    
    // Initialize the application
    init();
    
    // Add mobile support
    addMobileSupport();
    
    // Show introduction modal
    toggleLModal();
    
    // For iOS devices, we need a user interaction to request compass permissions
    if (isIOS) {
        document.body.addEventListener('click', function() {
            console.log("Body clicked, requesting iOS compass permission");
            startCompass();
        }, { once: true });
    }
});