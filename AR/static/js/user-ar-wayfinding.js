import { db, auth } from "../static/js/common/firebase-config.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
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
let watchId = null;
let carInfoShown = false;

// Check if device is iOS
const isIOS =
  navigator.userAgent.match(/(iPod|iPhone|iPad)/) &&
  navigator.userAgent.match(/AppleWebKit/);

// DOM elements
const loadingScreen = document.getElementById("loading-screen");
const instructionModal = document.getElementById("instruction-modal");
const modalClose = document.getElementById("modal-close");
const distanceFromTarget = document.getElementById("distanceFromTarget");
const carImage = document.getElementById("car-image");
const carModel = document.getElementById("car-model");
const licensePlate = document.getElementById("license-plate");
const carDirections = document.getElementById("car-directions");
const errorOverlay = document.getElementById("error-overlay");
const errorText = document.getElementById("error-text");
const retryButton = document.getElementById("retry-button");
const mapFallbackButton = document.getElementById("map-fallback-button");
const backButton = document.getElementById("back-button");
const toggleViewButton = document.getElementById("toggle-view-button");
const carInfoModal = document.getElementById("car-info-modal");
const closeModalButton = document.getElementById("close-modal-button");
const arView = document.querySelector("a-scene");
const mapView = document.getElementById("map-view");

// Geolocation options
const geolocationOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
};

// Early in your initialization code, add this:
function getUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    lat: parseFloat(urlParams.get('lat')),
    lng: parseFloat(urlParams.get('lng')),
    id: urlParams.get('id')
  };
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Remove any existing onclick attributes that might conflict
  const elements = document.querySelectorAll("[onclick]");
  elements.forEach(el => el.removeAttribute("onclick"));
  // Setup global click handler for instruction modal
  window.closeInstructionModal = function () {
    console.log("Close instruction modal called");
    const modal = document.getElementById("instruction-modal");
    modal.style.display = "none";
    startAR();
  };

  // Check authentication
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      userId = user.uid;
      
      // Get params from URL
      const urlParams = getUrlParams();
      
      // Use URL params first, fallback to sessionStorage
      bookingId = urlParams.id || sessionStorage.getItem("arBookingId");
      
      // If URL has coordinates, use those directly
      if (urlParams.lat && urlParams.lng) {
        target.latitude = urlParams.lat;
        target.longitude = urlParams.lng;
        
        // Try to get car details but don't block if missing
        try {
          if (bookingId) {
            await loadCarData();
          }
        } catch (error) {
          console.warn("Could not load full car details, using coordinates only");
        }
      } else {
        // Get carId and load full car data
        carId = sessionStorage.getItem("arCarId");
        if (!bookingId || !carId) {
          showError("Booking information is missing. Please return to your bookings.");
          return;
        }
        
        try {
          await loadCarData();
        } catch (error) {
          console.error("Error loading car data:", error);
        }
      }
      
      // Show instruction modal to start
      loadingScreen.style.display = "none";
      instructionModal.style.display = "flex";

      // Try to load car data in background while showing instructions
      try {
        await loadCarData();
      } catch (error) {
        console.error("Error loading car data:", error);
      }

      // Set up event listeners
      setupEventListeners();

      // Initialize UI updates
      requestAnimationFrame(updateUI);
    } else {
      // Redirect to login if not authenticated
      window.location.href = "../index.html";
    }
  });
});

// Load car and booking data
async function loadCarData() {
  try {
    // Get car document
    const carDoc = await getDoc(doc(db, "cars", carId));
    if (!carDoc.exists()) {
      throw new Error("Car not found");
    }

    carData = carDoc.data();

    // Get booking document
    const bookingDoc = await getDoc(
      doc(db, "timesheets", carId, "bookings", bookingId)
    );
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

      // Update car info UI elements
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
  // Set car model name
  if (carModel) {
    carModel.textContent = carData.car_type || "Car";
  }

  // Set license plate
  if (licensePlate && carData.license_plate) {
    licensePlate.textContent = carData.license_plate || "";
  }

  // Set car image based on type
  if (carImage) {
    const imagePath = `../static/assets/images/${carData.car_type.toLowerCase()}.jpg`;
    carImage.src = imagePath;
    carImage.onerror = () => {
      carImage.src = "../static/assets/images/car-placeholder.jpg";
    };
  }

  // Set car directions
  if (carDirections && carData.directions) {
    carDirections.textContent = carData.directions;
  } else if (carDirections) {
    carDirections.textContent =
      "Park at designated parking spot. The car key is in the glove compartment.";
  }
}

// Set up event listeners
function setupEventListeners() {
  console.log("Setting up event listeners");
  
  // Modal close button
  const modalCloseBtn = document.getElementById("modal-close");
  if (modalCloseBtn) {
    console.log("Modal close button found");
    modalCloseBtn.addEventListener("click", function(event) {
      console.log("Close button clicked");
      event.preventDefault();
      event.stopPropagation();
      closeAndStartAR();
    });
  }
  
  // Close modal when clicking anywhere on the modal content
  const modalContent = document.querySelector(".modal-content");
  if (modalContent) {
    modalContent.addEventListener("click", function(event) {
      // Only if target is the modal content itself, not its children
      if (event.target === this) {
        console.log("Modal content clicked");
        closeAndStartAR();
      }
    });
  }
  
  // Back button
  if (backButton) {
    backButton.addEventListener("click", navigateBack);
  }

  // Toggle view button
  if (toggleViewButton) {
    toggleViewButton.addEventListener("click", toggleView);
  }

  // Error retry button
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      errorOverlay.style.display = "none";
      startAR();
    });
  }

  // Map fallback button
  if (mapFallbackButton) {
    mapFallbackButton.addEventListener("click", () => {
      if (target.latitude && target.longitude) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}`;
        window.open(url, "_blank");
      } else {
        alert("Car location is not available");
      }
    });
  }

  // Close car info modal button
  if (closeModalButton) {
    closeModalButton.addEventListener("click", () => {
      carInfoModal.style.display = "none";
      carInfoShown = false;
    });
  }
}

// Helper function to close modal and start AR
function closeAndStartAR() {
  console.log("Closing modal and starting AR");
  if (instructionModal) {
    instructionModal.style.display = "none";
  }
  startAR();
}

// Toggle between AR and Map views
function toggleView() {
  if (mapView.style.display === "block") {
    // Switch to AR view
    arView.style.display = "block";
    mapView.style.display = "none";
    toggleViewButton.innerHTML = '<i class="bi bi-map"></i>';
  } else {
    // Switch to map view
    arView.style.display = "none";
    mapView.style.display = "block";
    toggleViewButton.innerHTML = '<i class="bi bi-camera"></i>';

    // Initialize map if needed
    if (!map) {
      initMap();
    } else {
      updateMapMarkers();
    }
  }
}

// Start AR experience
function startAR() {
  // Show AR overlay
  document.querySelector(".ar-overlay").style.display = "block";

  // Initialize geolocation
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
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
  carEntity =
    document.getElementById("carOff") || document.getElementById("car");

  // Start distance update interval
  if (!distanceUpdateInterval) {
    distanceUpdateInterval = setInterval(updateDistanceDisplay, 2000);
  }
}

// Navigate back to booking details
function navigateBack() {
  // Clean up before leaving
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
  }

  if (distanceUpdateInterval) {
    clearInterval(distanceUpdateInterval);
  }

  // Navigate back to booking details
  if (bookingId && carId) {
    window.location.href = `../user/user-booking-details.html?id=${bookingId}&carId=${carId}`;
  } else {
    window.location.href = "../user/user-bookings.html";
  }
}

// Start compass for iOS devices
function startCompass() {
  if (isIOS && typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((response) => {
        if (response === "granted") {
          window.addEventListener("deviceorientation", runCalculation);
        } else {
          showError(
            "Permission to access device orientation is required for AR navigation."
          );
        }
      })
      .catch((error) => {
        console.error("Error requesting device orientation permission:", error);
        showError(
          "Could not access compass. Please ensure permissions are granted in your device settings."
        );
      });
  } else if (isIOS) {
    // Older iOS versions or devices that don't require permission
    window.addEventListener("deviceorientation", runCalculation);
  }
}

// Store current position from geolocation API
function setCurrentPosition(position) {
  current.latitude = position.coords.latitude;
  current.longitude = position.coords.longitude;

  // Hide loading screen once we have position
  loadingScreen.style.display = "none";

  // Calculate new distance if we have target coordinates
  if (target.latitude && target.longitude) {
    // Calculate distance
    calculateDistance();

    // Show car based on distance
    updateCarVisibility();

    // Show car info modal when close (within 20m)
    if (distance <= 20 && !carInfoShown) {
      showCarInfoModal();
    }

    // Update map if it's visible
    if (mapView.style.display === "block" && map) {
      updateMapMarkers();
    }
  }
}

// Handle geolocation errors
function handleGeolocationError(error) {
  loadingScreen.style.display = "none";

  let errorMessage = "Error accessing your location: ";
  switch (error.code) {
    case error.PERMISSION_DENIED:
      errorMessage +=
        "Location permission denied. Please allow access to your location.";
      break;
    case error.POSITION_UNAVAILABLE:
      errorMessage += "Location information is unavailable. Please try again.";
      break;
    case error.TIMEOUT:
      errorMessage +=
        "Location request timed out. Please check your connection.";
      break;
    default:
      errorMessage += "Unknown error occurred.";
  }

  showError(errorMessage);
}

// Show error message
function showError(message) {
  loadingScreen.style.display = "none";

  if (errorOverlay && errorText) {
    errorText.textContent = message;
    errorOverlay.style.display = "flex";
  } else {
    alert(message);
  }
}

// Show car info modal
function showCarInfoModal() {
  console.log("Attempting to show car info modal");
  if (carInfoModal) {
    carInfoModal.style.display = "block";
    carInfoModal.classList.add("active");
    carInfoShown = true;
    console.log("Car info modal display set to:", carInfoModal.style.display);
  } else {
    console.error("carInfoModal element not found");
  }
}

// Show 3D model
function showCar() {
  if (!carVisible && carEntity) {
    carEntity.id = "car";
    carEntity.setAttribute("gltf-model", "#pin-model");
    carEntity.setAttribute(
      "gps-entity-place",
      `latitude: ${target.latitude}; longitude: ${target.longitude}`
    );
    carEntity.setAttribute("scale", "1 1 1");
    carVisible = true;
  }
}

// Hide 3D model
function hideCar() {
  if (carVisible && carEntity) {
    carEntity.id = "carOff";
    carEntity.removeAttribute("gltf-model");
    carVisible = false;
  }
}

// Update car visibility based on distance
function updateCarVisibility() {
  // Only show car model if within 300 meters
  if (distance <= 300) {
    showCar();
  } else {
    hideCar();
  }
}

// Calculate distance between current position and target
function calculateDistance() {
  if (!current.latitude || !target.latitude) return 0;

  const R = 6371; // Earth's radius in km
  const dLat = ((target.latitude - current.latitude) * Math.PI) / 180;
  const dLon = ((target.longitude - current.longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((current.latitude * Math.PI) / 180) *
      Math.cos((target.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
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
    // iOS provides this value in degrees from magnetic north
    alpha = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    // Android/other - alpha is in degrees from 0 to 360
    alpha = 360 - event.alpha;
  } else {
    // No orientation data available
    return;
  }

  // Only update if significant change or no previous value
  if (Math.abs(alpha - lastAlpha) > 1 || lastAlpha === 0) {
    // Calculate bearing to target
    const lat1 = (current.latitude * Math.PI) / 180;
    const lon1 = (current.longitude * Math.PI) / 180;
    const lat2 = (target.latitude * Math.PI) / 180;
    const lon2 = (target.longitude * Math.PI) / 180;

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    let bearing = (Math.atan2(y, x) * 180) / Math.PI;
    bearing = (bearing + 360) % 360;

    // Calculate direction to point arrow
    direction = (bearing - alpha + 360) % 360;
    lastAlpha = alpha;
  }
}

// Update distance display
function updateDistanceDisplay() {
  if (!distanceFromTarget || !distance) return;

  if (distance > 10000) {
    distanceFromTarget.innerHTML = "Location too far";
    distanceFromTarget.className = "";
  } else if (distance <= 5) {
    distanceFromTarget.innerHTML = "You have arrived!";
    distanceFromTarget.className = "arrived";

    // Show car info modal if not already shown
    if (!carInfoShown) {
      showCarInfoModal();
    }
  } else if (distance < 1000) {
    distanceFromTarget.innerHTML = `${Math.round(distance)}m to car`;
    distanceFromTarget.className = "";
  } else {
    distanceFromTarget.innerHTML = `${(distance / 1000).toFixed(1)}km to car`;
    distanceFromTarget.className = "";
  }
}

// Initialize Google Map
function initMap() {
  if (!mapView || !target.latitude || !target.longitude) return;

  try {
    map = new google.maps.Map(document.getElementById("map"), {
      center: { lat: target.latitude, lng: target.longitude },
      zoom: 17,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      zoomControl: true,
    });

    updateMapMarkers();
  } catch (error) {
    console.error("Error initializing map:", error);
  }
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
    title: carData ? carData.car_type : "Your Car",
    icon: {
      url: "../static/assets/images/car-marker.png",
      scaledSize: new google.maps.Size(32, 32),
    },
  });

  // Add user location marker if available
  if (current.latitude && current.longitude) {
    window.userMarker = new google.maps.Marker({
      position: { lat: current.latitude, lng: current.longitude },
      map: map,
      title: "Your Location",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#4285F4",
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
      },
    });

    // Draw path between user and car
    window.path = new google.maps.Polyline({
      path: [
        { lat: current.latitude, lng: current.longitude },
        { lat: target.latitude, lng: target.longitude },
      ],
      geodesic: true,
      strokeColor: "#1e88e5",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      map: map,
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
window.addEventListener("beforeunload", () => {
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
  }

  if (distanceUpdateInterval) {
    clearInterval(distanceUpdateInterval);
  }
});
