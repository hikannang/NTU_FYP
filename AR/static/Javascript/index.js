// Import Firebase services
import { db } from "../../../static/js/common/firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Global variables for location tracking
let current = { latitude: null, longitude: null };
let target = { latitude: null, longitude: null };
let destination = { latitude: null, longitude: null };
let bearing = 0;
let direction = 0;
let smoothedHeading = null;
let carDirections = "Follow the arrow to reach your car.";
let positionWatchId = null;
let hasOrientationSupport = false;
let distance;
let isViewed = false;
let arEntityLoaded = false;

// Constants
const DISTANCE_UPDATE_INTERVAL = 1000; // Update distance every second
const MODAL_TRIGGER_DISTANCE = 20; // Show modal when within 20 meters

// Initialize AR experience and fetch car data
function initAR() {
  console.log("Initializing AR experience");

  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const targetLat = parseFloat(urlParams.get("lat"));
  const targetLng = parseFloat(urlParams.get("lng"));
  const bookingId = urlParams.get("id"); // Get booking ID from URL parameter "id"

  console.log("URL parameters:", { targetLat, targetLng, bookingId });

  // Set target coordinates
  if (!isNaN(targetLat) && !isNaN(targetLng)) {
    target.latitude = targetLat;
    target.longitude = targetLng;
    destination.latitude = targetLat;
    destination.longitude = targetLng;
    console.log("Target set to:", target);

    // Start location and orientation services
    startServices();

    // Start UI updates
    updateUI();

    // Start distance calculations
    setInterval(updateDistanceDisplay, DISTANCE_UPDATE_INTERVAL);

    // Initialize map button
    initMapButton();
  } else {
    console.error("No valid coordinates in URL parameters");
    showError("Missing or invalid location coordinates");
  }

  // Fetch car data if booking ID is provided
  if (bookingId) {
    fetchCarData(bookingId);
  } else {
    console.warn("No booking ID provided in URL");
  }
}

// Start location and orientation services
function startServices() {
  // Request device orientation with better error handling
  if (window.DeviceOrientationEvent) {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      // iOS 13+ requires permission request
      document.body.addEventListener(
        "click",
        () => {
          DeviceOrientationEvent.requestPermission()
            .then((permissionState) => {
              if (permissionState === "granted") {
                window.addEventListener("deviceorientation", handleOrientation);
                console.log("iOS orientation permission granted");
              } else {
                console.error("Orientation permission denied");
                showError("Please allow access to device orientation");
              }
            })
            .catch(console.error);
        },
        { once: true }
      );
    } else {
      // Non-iOS devices
      window.addEventListener("deviceorientation", handleOrientation);
      console.log("Added orientation listener for non-iOS device");
    }
  } else {
    console.warn("Device orientation not supported");
  }

  // Get user location with more robust error handling
  if (navigator.geolocation) {
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("Initial position acquired");
        setCurrentPosition(position);

        // Start continuous position tracking
        positionWatchId = navigator.geolocation.watchPosition(
          setCurrentPosition,
          handleLocationError,
          options
        );

        console.log("Position watching started");
      },
      handleLocationError,
      options
    );
  } else {
    console.error("Geolocation not supported");
    showError("Your device doesn't support geolocation");
  }
}

// Set current position from geolocation data
function setCurrentPosition(position) {
  current.latitude = position.coords.latitude;
  current.longitude = position.coords.longitude;

  // Log position updates occasionally
  if (Math.random() < 0.1) {
    // 10% chance to log
    console.log("Position updated:", current);
  }

  // Create/update AR entities after position is known
  if (destination.latitude && destination.longitude) {
    createDestinationMarker(destination.latitude, destination.longitude);
  }
}

// Handle geolocation errors
function handleLocationError(error) {
  let errorMessage = "Unknown location error";

  switch (error.code) {
    case error.PERMISSION_DENIED:
      errorMessage = "Location permission denied";
      break;
    case error.POSITION_UNAVAILABLE:
      errorMessage = "Location information unavailable";
      break;
    case error.TIMEOUT:
      errorMessage = "Location request timed out";
      break;
  }

  console.error(`Geolocation error (${error.code}):`, errorMessage);
  showError(errorMessage);
}

// Handle device orientation data
function handleOrientation(event) {
  // Set flag that we have orientation support
  hasOrientationSupport = true;

  // Get raw device heading (direction device is pointing)
  let deviceHeading;

  // iOS devices
  if (typeof event.webkitCompassHeading === "number") {
    deviceHeading = event.webkitCompassHeading;
    // Log occasionally to avoid console flood
    if (Math.random() < 0.01)
      console.log("iOS compass:", deviceHeading.toFixed(1));
  }
  // Android devices
  else if (typeof event.alpha === "number") {
    deviceHeading = 360 - event.alpha;
    // Log occasionally
    if (Math.random() < 0.01)
      console.log("Android compass:", deviceHeading.toFixed(1));
  }
  // No valid data
  else {
    return;
  }

  // Apply smoothing to reduce jitter
  if (smoothedHeading === null) {
    smoothedHeading = deviceHeading;
  } else {
    // Calculate difference between current and previous heading
    let diff = deviceHeading - smoothedHeading;

    // Handle the 0/360 edge case
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    // Apply different smoothing based on magnitude of change
    const filterFactor = Math.abs(diff) > 20 ? 0.1 : 0.3;
    smoothedHeading = (smoothedHeading + diff * filterFactor) % 360;
    if (smoothedHeading < 0) smoothedHeading += 360;
  }

  // Calculate bearing to destination
  bearing = calculateBearing();
}

// Calculate bearing between current position and destination
function calculateBearing() {
  if (
    !current.latitude ||
    !current.longitude ||
    !destination.latitude ||
    !destination.longitude
  ) {
    return 0;
  }

  const lat1 = toRadians(current.latitude);
  const lon1 = toRadians(current.longitude);
  const lat2 = toRadians(destination.latitude);
  const lon2 = toRadians(destination.longitude);

  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

  let bearing = Math.atan2(y, x);
  bearing = toDegrees(bearing);
  bearing = (bearing + 360) % 360;

  return bearing;
}

// Calculate direction from camera to AR entity
function calculateARDirection() {
  const arEntity = document.getElementById("destinationMarker");
  if (!arEntity || !arEntityLoaded || !hasOrientationSupport) {
    // Fall back to GPS-based direction if AR entity isn't available
    return calculateGPSDirection();
  }

  try {
    // Get the AR entity's world position
    const scene = document.querySelector("a-scene");
    if (!scene || !scene.object3D) {
      console.warn("A-Frame scene not fully initialized");
      return calculateGPSDirection();
    }

    // Get camera and marker objects
    const camera = document.querySelector("[camera]");
    if (!camera || !camera.object3D) {
      console.warn("Camera not found in scene");
      return calculateGPSDirection();
    }

    // Get world positions (3D coordinates in the scene)
    const worldPos = new THREE.Vector3();
    arEntity.object3D.getWorldPosition(worldPos);

    // Get camera position and direction
    const camPos = new THREE.Vector3();
    camera.object3D.getWorldPosition(camPos);

    // Get direction from camera to AR entity
    const directionVector = new THREE.Vector3().subVectors(worldPos, camPos);

    // Project onto XZ plane (ignore Y/height difference)
    directionVector.y = 0;
    directionVector.normalize();

    // Get camera forward vector (where the camera is looking)
    const camForward = new THREE.Vector3(0, 0, -1);
    camForward.applyQuaternion(camera.object3D.quaternion);
    camForward.y = 0;
    camForward.normalize();

    // Calculate angle between the direction vector and camera forward
    const angle =
      Math.atan2(
        directionVector.x * camForward.z - directionVector.z * camForward.x,
        directionVector.x * camForward.x + directionVector.z * camForward.z
      ) *
      (180 / Math.PI);

    // Log occasionally (not every frame)
    if (Math.random() < 0.01) {
      // Log approximately 1% of calculations
      console.log("AR-based direction:", angle.toFixed(1) + "°");
    }

    return angle;
  } catch (e) {
    console.warn("Error calculating AR direction:", e);
    return calculateGPSDirection();
  }
}

// Replace calculateGPSDirection with this version:
function calculateGPSDirection() {
  if (smoothedHeading !== null) {
    return smoothedHeading;
  }

  // Fallback to 0 if no heading data
  return 0;
}

// Update UI function with smooth compass transition across 0°
function updateUI() {
  const arrow = document.querySelector(".arrow");

  if (arrow) {
    // Calculate direction based on AR or GPS
    let directionAngle;

    if (arEntityLoaded) {
      // If AR entity is loaded, use AR-based direction
      directionAngle = calculateARDirection();
    } else {
      // Otherwise use GPS-based calculation
      directionAngle = calculateGPSDirection();
    }

    // IMPORTANT: Apply a counter-rotation by inverting the angle
    let compassAngle = (360 - directionAngle) % 360;

    // Store the previous angle for comparison
    if (typeof window.prevCompassAngle === "undefined") {
      window.prevCompassAngle = compassAngle;
    }

    // Check for the 0/360 boundary crossing and choose the shorter path
    const diff = compassAngle - window.prevCompassAngle;

    // If the difference is more than 180 degrees, we crossed the boundary
    if (Math.abs(diff) > 180) {
      // If the new angle is near 0, use 360 for smoother animation
      if (compassAngle < 180) {
        compassAngle += 360;
      }
      // If the new angle is near 360, use negative angle for smoother animation
      else if (compassAngle > 180) {
        compassAngle -= 360;
      }
    }

    // Update the global direction variable for other functions to use
    direction = compassAngle % 360; // Keep the normalized version for other functions

    // Apply smoother transition for stability
    arrow.style.transition = "transform 0.3s ease-out";

    // Use the potentially unnormalized angle for rotation to ensure smooth animation
    arrow.style.transform = `translate(-50%, -50%) rotate(${compassAngle}deg)`;

    // Debug log occasionally - shows both original and processed angle
    if (Math.random() < 0.01) {
      console.log(
        "Arrow direction - Raw:",
        directionAngle.toFixed(1) + "°",
        "Counter-rotated:",
        (compassAngle % 360).toFixed(1) + "°",
        "Animation angle:",
        compassAngle.toFixed(1) + "°"
      );
    }

    // Save the current angle for the next frame
    window.prevCompassAngle = compassAngle;
  }

  // Continue updating
  requestAnimationFrame(updateUI);
}

// Create AR marker at destination
function createDestinationMarker(lat, lng) {
  // Remove existing marker if it exists
  const existingMarker = document.getElementById("destinationMarker");
  if (existingMarker) {
    existingMarker.parentNode.removeChild(existingMarker);
    console.log("Removed existing destination marker");
  }

  console.log("Creating destination marker at:", lat, lng);

  // Get AR scene
  const scene = document.querySelector("a-scene");

  if (!scene) {
    console.error("A-Frame scene not found");
    return;
  }

  try {
    // Create entity for destination marker
    const entity = document.createElement("a-entity");
    entity.setAttribute("id", "destinationMarker");

    // Try to load the model
    entity.addEventListener("model-error", function () {
      console.error("Failed to load 3D model, using fallback");
      // Create a fallback box
      this.removeAttribute("gltf-model");
      this.setAttribute(
        "geometry",
        "primitive: box; width: 1; height: 1; depth: 1"
      );
      this.setAttribute("material", "color: red");
    });

    // Set model and attributes
    entity.setAttribute("gltf-model", "./static/3dModels/GLB/location3.glb");
    entity.setAttribute("scale", "1 1 1");
    entity.setAttribute(
      "gps-projected-entity-place",
      `latitude: ${lat}; longitude: ${lng}`
    );
    entity.setAttribute("animation-mixer", "");

    // Add a loaded event to know when the AR is ready
    entity.addEventListener("loaded", function () {
      console.log(
        "AR marker loaded successfully - arrow will now track AR position"
      );
      arEntityLoaded = true;
    });

    // Add to scene
    scene.appendChild(entity);

    console.log("Destination marker created successfully");
  } catch (error) {
    console.error("Failed to create destination marker:", error);
  }
}

// Calculate and update distance display
function updateDistanceDisplay() {
  // Skip if we don't have valid coordinates
  if (
    !current.latitude ||
    !current.longitude ||
    !destination.latitude ||
    !destination.longitude
  ) {
    console.log("Missing coordinates for distance calculation");
    return;
  }

  // Calculate distance using Haversine formula
  const R = 6371; // Earth radius in km
  const lat1 = toRadians(current.latitude);
  const lon1 = toRadians(current.longitude);
  const lat2 = toRadians(destination.latitude);
  const lon2 = toRadians(destination.longitude);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  distance = R * c * 1000; // Convert to meters

  // Log distance updates occasionally
  if (Math.random() < 0.1) {
    // 10% chance to log
    console.log(`Distance to destination: ${Math.floor(distance)} meters`);
  }

  // Update UI with distance
  const distanceElement = document.getElementById("distanceFromTarget");
  if (distanceElement) {
    if (distance < 1000) {
      distanceElement.textContent = `${Math.floor(
        distance
      )}m to your booked car!`;
    } else {
      distanceElement.textContent = `${(distance / 1000).toFixed(
        1
      )}km to your booked car!`;
    }
  }

  // Show modal when close to destination
  if (distance < MODAL_TRIGGER_DISTANCE && !isViewed) {
    console.log(
      `Within ${MODAL_TRIGGER_DISTANCE} meters of destination, showing modal`
    );
    showDestinationModal();
    isViewed = true;
  }
}

// Updated fetchCarData function to use full car_type for lookup
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
      return;
    }
    
    // 2. Extract booking data
    const bookingData = bookingSnapshot.data();
    console.log("📋 Booking data retrieved:", bookingData);
    
    // 3. Get car_id and car_type from the booking
    const carId = bookingData.car_id || null;
    const carType = bookingData.car_type || null;
    
    if (!carType || !carId) {
      console.warn("⚠️ Missing car_type or car_id in booking:", { carId, carType });
      return;
    }
    
    console.log("🚗 Car info from booking:", { carId, carType });
    
    // Save to global variables
    window.carType = carType;
    window.carId = carId;
    
    // 4. Extract color for display purposes only
    let carColor = "";
    
    if (carType.includes('_')) {
      const parts = carType.split('_');
      carColor = parts[1] || "";
      
      if (carColor) {
        carColor = carColor.charAt(0).toUpperCase() + carColor.slice(1);
      }
    }
    
    // 5. Get car model name from car_models collection using full carType
    try {
      console.log("🔍 Fetching car model document for car_type:", carType);
      const modelDocRef = doc(db, "car_models", carType); // Using full carType here
      const modelDoc = await getDoc(modelDocRef);
      
      if (modelDoc.exists()) {
        const modelData = modelDoc.data();
        console.log("📋 Car model data retrieved:", modelData);
        
        // Get the "name" field from the document
        if (modelData.name) {
          // Store the name in a global variable
          window.modelName = modelData.name;
          console.log("✅ Found model name:", window.modelName);
          
          // Format full model name with color
          if (carColor) {
            window.carModelName = `${window.modelName} (${carColor})`;
          } else {
            window.carModelName = window.modelName;
          }
          
          console.log("🚗 Final formatted car model name:", window.carModelName);
        } else {
          console.warn("⚠️ No 'name' field found in car_models document");
          fallbackToBaseModel(carType, carColor);
        }
      } else {
        console.warn("⚠️ Car model document not found for car_type:", carType);
        fallbackToBaseModel(carType, carColor);
      }
    } catch (modelError) {
      console.error("❌ Error fetching car model:", modelError);
      console.error("Error details:", modelError.message);
      fallbackToBaseModel(carType, carColor);
    }
    
    // 6. Get license plate and directions from cars collection using car_id
    try {
      console.log("🔍 Fetching car document for ID:", carId);
      const carDocRef = doc(db, "cars", carId);
      const carDoc = await getDoc(carDocRef);
      
      if (carDoc.exists()) {
        const carData = carDoc.data();
        console.log("📋 Car document data:", carData);
        
        // Get license plate
        window.carLicensePlate = carData.license_plate || "Unknown";
        console.log("🔢 License plate:", window.carLicensePlate);
        
        // Get directions
        window.carDirections = carData.directions || "Follow the arrow to reach your car.";
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
    
    // 7. Update the modal if it's already visible
    const modal = document.getElementById("destinationModal");
    if (modal && modal.style && modal.style.display === "flex") {
      updateDestinationModal();
    }
    
  } catch (error) {
    console.error("❌ Error in fetchCarData:", error);
  }
}

// Helper function to try base model if full carType lookup fails
async function fallbackToBaseModel(carType, carColor) {
  try {
    // Extract base model name
    const baseModelName = carType.split('_')[0];
    
    console.log("🔄 Trying fallback to base model:", baseModelName);
    const baseModelDocRef = doc(db, "car_models", baseModelName);
    const baseModelDoc = await getDoc(baseModelDocRef);
    
    if (baseModelDoc.exists()) {
      const modelData = baseModelDoc.data();
      
      if (modelData.name) {
        window.modelName = modelData.name;
        
        if (carColor) {
          window.carModelName = `${window.modelName} (${carColor})`;
        } else {
          window.carModelName = window.modelName;
        }
        
        console.log("✅ Found model name from base model:", window.carModelName);
        return;
      }
    }
    
    // If we get here, the fallback failed too
    window.carModelName = carType.charAt(0).toUpperCase() + carType.slice(1);
    console.log("⚠️ Using formatted car_type as model name:", window.carModelName);
    
  } catch (error) {
    console.error("❌ Error in fallback lookup:", error);
    window.carModelName = carType.charAt(0).toUpperCase() + carType.slice(1);
  }
}

// Update destination modal with car information
function updateDestinationModal() {
  console.log("Updating destination modal");

  // Update car image
  const carImage = document.getElementById("carImage");
  if (carImage) {
    console.log("Updating car image");
    // Set default image first
    carImage.src = "../static/images/car_images/default.png";

    // Try to load specific car image
    if (window.carType) {
      const carImagePath = `../static/images/car_images/${window.carType}.png`;
      console.log("Trying to load car image:", carImagePath);

      const testImg = new Image();
      testImg.onload = function () {
        carImage.src = carImagePath;
        console.log("Successfully loaded car image");
      };

      testImg.onerror = function () {
        console.warn("Failed to load car image, using default");
      };

      testImg.src = carImagePath;
    }
  }

  // Update modal title
  const modalTitle = document.getElementById("modalTitle");
  if (modalTitle) {
    modalTitle.textContent =
      "You are almost arriving, here's a recap of your car information:";
  }

  // Update license plate
  const licensePlateElement = document.getElementById("carLicensePlate");
  if (licensePlateElement) {
    console.log("Setting license plate with:", window.carLicensePlate);
    licensePlateElement.textContent = `License plate: ${
      window.carLicensePlate || "Unknown"
    }`;
  } else {
    console.error("License plate element not found");
  }

  // Update car model
  const carModelElement = document.getElementById("carModelName");
  if (carModelElement) {
    console.log("Setting car model with:", window.carModelName);
    carModelElement.textContent = `Car model: ${
      window.carModelName || "Unknown"
    }`;
  } else {
    console.error("Car model element not found");
  }

  // Update directions label
  const directionsLabel = document.getElementById("directionsLabel");
  if (directionsLabel) {
    directionsLabel.textContent =
      "And here is the direction to the booked car:";
  }

  // Update directions text
  const directionsText = document.getElementById("directionsText");
  if (directionsText) {
    directionsText.textContent =
      window.carDirections || "Follow the arrow to reach your car.";
  }
}

// Show destination modal
function showDestinationModal() {
    console.log("Showing destination modal");
    
    const modal = document.getElementById("destinationModal");
    if (!modal) {
        console.error("Modal element not found!");
        return;
    }
    
    // Lock the background scrolling
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Update modal content
    updateDestinationModal();
    
    // Show the modal with flex display
    modal.style.display = "flex";
    
    // Force a redraw to ensure the modal takes up the full screen
    modal.offsetHeight;
    
    // Add click handler to close modal
    const closeOnClick = function() {
        modal.style.display = "none";
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
        modal.removeEventListener('click', closeOnClick);
    };
    
    modal.addEventListener('click', closeOnClick);
}

// Helper function to load car image with fallbacks
function loadCarImageWithFallbacks(imgElement, pathsArray, currentIndex = 0) {
  if (currentIndex >= pathsArray.length) {
    console.warn("All image paths failed, using default");
    imgElement.src = "../static/images/car_images/default.png";
    return;
  }

  const currentPath = pathsArray[currentIndex];
  console.log(`Trying to load image from: ${currentPath}`);

  // Create a temporary image to test loading
  const testImg = new Image();

  testImg.onload = function () {
    console.log(`Successfully loaded: ${currentPath}`);
    imgElement.src = currentPath;
  };

  testImg.onerror = function () {
    console.warn(`Failed to load: ${currentPath}, trying next option...`);
    loadCarImageWithFallbacks(imgElement, pathsArray, currentIndex + 1);
  };

  testImg.src = currentPath;
}

// Helper function to convert degrees to radians
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Helper function to convert radians to degrees
function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

// Show error message to user
function showError(message) {
  const errorElement = document.getElementById("error-message");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";

    // Hide after 5 seconds
    setTimeout(() => {
      errorElement.style.display = "none";
    }, 5000);
  } else {
    console.error("Error:", message);
    alert(message); // Fallback to alert if error element not found
  }
}

// Show loading screen while AR content loads
function showLoadingScreen() {
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen) {
    loadingScreen.style.display = "flex";

    // Hide loading screen after a timeout or when AR content is ready
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 5000);
  }
}

// Add debugging helper (only in development)
function addDebugInfo() {
  if (
    window.location.hostname !== "localhost" &&
    !window.location.hostname.includes("127.0.0.1")
  ) {
    return; // Only show debug in development
  }

  // Create debug element
  const debugElement = document.createElement("div");
  debugElement.id = "debug-info";
  Object.assign(debugElement.style, {
    position: "fixed",
    top: "10px",
    left: "10px",
    backgroundColor: "rgba(0,0,0,0.7)",
    color: "white",
    padding: "10px",
    borderRadius: "5px",
    fontSize: "12px",
    zIndex: "9999",
    maxWidth: "80%",
  });

  document.body.appendChild(debugElement);

  // Update debug info every 500ms
  setInterval(() => {
    debugElement.innerHTML = `
            <div><b>Current:</b> ${current.latitude?.toFixed(6) || "N/A"}, ${
      current.longitude?.toFixed(6) || "N/A"
    }</div>
            <div><b>Target:</b> ${target.latitude?.toFixed(6) || "N/A"}, ${
      target.longitude?.toFixed(6) || "N/A"
    }</div>
            <div><b>Distance:</b> ${Math.floor(distance) || "N/A"}m</div>
            <div><b>Heading:</b> ${smoothedHeading?.toFixed(1) || "N/A"}°</div>
            <div><b>Direction:</b> ${direction?.toFixed(1) || "N/A"}°</div>
            <div><b>AR Entity:</b> ${
              arEntityLoaded ? "Loaded" : "Not loaded"
            }</div>
            <div><b>Car:</b> ${window.carModelName || "N/A"}</div>
        `;
  }, 500);
}

// Add this function to your index.js file
function initMapButton() {
  const mapDot = document.getElementById("mapDot");

  if (mapDot) {
    console.log("Setting up map button click handler");

    mapDot.addEventListener("click", function (event) {
      event.stopPropagation(); // Prevent other click handlers from firing

      // Open Google Maps with the destination coordinates
      if (destination.latitude && destination.longitude) {
        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}&travelmode=walking`;
        window.open(googleMapsUrl, "_blank");
        console.log("Opening Google Maps navigation");
      } else {
        console.error("No destination coordinates available for navigation");
        showError("Navigation coordinates not available");
      }
    });

    // Make it visually clickable
    mapDot.style.cursor = "pointer";
  } else {
    console.warn("Map button element not found");
  }
}

// Initialize app when page loads
document.addEventListener("DOMContentLoaded", function () {
  console.log("AR Wayfinding app initializing...");

  // Start AR initialization
  initAR();

  // Add debug info in development
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname.includes("127.0.0.1")
  ) {
    addDebugInfo();
  }
});
