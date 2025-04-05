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
    loadingScreen.style.display = 'flex';

    // Set timeout to hide loading screen after 3 seconds
    loadingTimeout = setTimeout(function () {
        hideLoadingScreen();
    }, 3000);
}

// Hide loading screen
function hideLoadingScreen() {
    var loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.style.display = 'none';
    clearTimeout(loadingTimeout);
}

// Parse URL parameters to get target coordinates and booking ID
function getUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Get latitude, longitude, and booking ID
    const lat = parseFloat(urlParams.get('lat'));
    const lng = parseFloat(urlParams.get('lng'));
    bookingId = urlParams.get('id');
    
    if (lat && lng) {
        target.latitude = lat;
        target.longitude = lng;
        
        // Create AR marker at destination
        createDestinationMarker(lat, lng);
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
    
    // Get AR scene
    const scene = document.querySelector('a-scene');
    
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
        // Get booking document
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnapshot = await getDoc(bookingRef);
        
        if (bookingSnapshot.exists()) {
            const bookingData = bookingSnapshot.data();
            const carId = bookingData.car_id;
            
            // Get car document
            const carRef = doc(db, "cars", carId.toString());
            const carSnapshot = await getDoc(carRef);
            
            if (carSnapshot.exists()) {
                const carData = carSnapshot.data();
                
                // Save car directions for display in the destination modal
                carDirections = carData.directions || "You have reached your destination.";
            }
        }
    } catch (error) {
        console.error("Error fetching car data:", error);
    }
}

// Initialize geolocation and device orientation
function init() {
    // Parse URL parameters
    getUrlParameters();
    
    // Start geolocation tracking
    navigator.geolocation.watchPosition(setCurrentPosition, null, { enableHighAccuracy: true });
    
    // Add device orientation event listener based on device type
    if (!isIOS) {
        window.addEventListener("deviceorientationabsolute", runCalculation);
    }
    
    // Start UI updates
    updateUI();
}

// Request permission for device orientation (required for iOS)
function startCompass() {
    if (isIOS) {
        DeviceOrientationEvent.requestPermission()
            .then((response) => {
                if (response === "granted") {
                    window.addEventListener("deviceorientation", runCalculation);
                } else {
                    alert("Permission is required for compass functionality");
                }
            })
            .catch(() => alert("Device orientation not supported"));
    }
}

// Update current position from geolocation API
function setCurrentPosition(position) {
    current.latitude = position.coords.latitude;
    current.longitude = position.coords.longitude;
}

// Initialize the application
window.addEventListener('DOMContentLoaded', init);

// Calculate compass direction and distance to target
function runCalculation(event) {
    var alpha = Math.abs(360 - event.webkitCompassHeading) || event.alpha;
    if (alpha == null || Math.abs(alpha - lastAlpha) > 1) {
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
    closeBtn.onclick = closeDestinationModal;
    
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
}

// Close destination modal
function closeDestinationModal() {
    var modal = document.getElementById('destinationModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Expose the close function to global scope for HTML onclick handlers
window.closeDestinationModal = closeDestinationModal;

// Add event listener to close modal when clicking outside content
document.addEventListener('DOMContentLoaded', function() {
    // Get the destination modal or create it if it doesn't exist
    let modal = document.getElementById('destinationModal');
    
    if (!modal) {
        createDestinationModal();
        modal = document.getElementById('destinationModal');
    }
    
    // Add click event listener to close when clicking outside content
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeDestinationModal();
        }
    });
    
    // Also ensure the close button works
    const closeBtn = document.getElementById('destinationModalClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDestinationModal);
    }
});

// Map modal functions
function toggleMModal() {
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
    var modalMap = document.getElementById("modalMap");
    modalMap.style.display = 'none';
}

// Map modal close button
if (document.getElementsByClassName("closeM")[0]) {
    document.getElementsByClassName("closeM")[0].onclick = function() {
        closeModal();
    };
}

// Instruction modal functions
function toggleIModal() {
    var modalI = document.getElementById("modalI");
    modalI.style.display = "block";
}

function closeModalI() {
    var modalI = document.getElementById("modalI");
    modalI.style.display = 'none';
}

if (document.getElementsByClassName("closeI")[0]) {
    document.getElementsByClassName("closeI")[0].onclick = function() {
        closeModalI();
    };
}

// Introduction modal functions
function toggleLModal() {
    var modalL = document.getElementById("modalL");
    modalL.style.display = "block";
}

function closeModalL() {
    var modalL = document.getElementById("modalL");
    modalL.style.display = 'none';
}

if (document.getElementsByClassName("closeL")[0]) {
    document.getElementsByClassName("closeL")[0].onclick = function() {
        closeModalL();
    };
}

// Error modal functions
function toggleEModal() {
    var modalE = document.getElementById("modalE");
    modalE.style.display = "block";
}

function closeModalE() {
    var modalE = document.getElementById("modalE");
    modalE.style.display = 'none';
}

if (document.getElementsByClassName("closeE")[0]) {
    document.getElementsByClassName("closeE")[0].onclick = function() {
        closeModalE();
    };
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

// Show introduction modal on page load
document.addEventListener('DOMContentLoaded', function() {
    // Display introduction modal
    toggleLModal();
    
    // Start compass (important for iOS)
    if (isIOS) {
        const body = document.querySelector('body');
        body.addEventListener('click', function() {
            startCompass();
        }, { once: true });
    }
});

// Remove the menu circles that were for color selection
document.addEventListener('DOMContentLoaded', function() {
    const moreOptionsDiv = document.getElementById('moreOptionsDiv');
    if (moreOptionsDiv) {
        moreOptionsDiv.style.display = 'none';
    }
});

// Expose modal functions to global scope
window.closeModalL = closeModalL;
window.closeModalI = closeModalI;
window.closeModalE = closeModalE;
window.closeModal = closeModal;
window.toggleMModal = toggleMModal;
window.toggleIModal = toggleIModal;
window.toggleLModal = toggleLModal;
window.toggleEModal = toggleEModal;

// Add proper event listeners for modal interactions
document.addEventListener('DOMContentLoaded', function() {
    // Introduction modal (L)
    const modalLContent = document.querySelector("#modalL .common-modal-content");
    if (modalLContent) {
        modalLContent.addEventListener('click', function() {
            closeModalL();
        });
    }
    
    // Instruction modal (I)
    const modalIContent = document.querySelector("#modalI .common-modal-content");
    if (modalIContent) {
        modalIContent.addEventListener('click', function() {
            closeModalI();
        });
    }
    
    // Error modal (E)
    const modalEContent = document.querySelector("#modalE .common-modal-content");
    if (modalEContent) {
        modalEContent.addEventListener('click', function() {
            closeModalE();
        });
    }
});