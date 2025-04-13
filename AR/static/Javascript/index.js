// Import Firebase services
import { db } from "../../../static/js/common/firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  getDocs,
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
const MODAL_TRIGGER_DISTANCE = 200; // Show modal when within 200 meters

// Initialize AR experience
function initAR() {
  console.log("Initializing AR experience");

  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const targetLat = parseFloat(urlParams.get("lat"));
  const targetLng = parseFloat(urlParams.get("lng"));
  const bookingId = urlParams.get("booking");

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
  } else {
    console.error("No valid coordinates in URL parameters");
    showError("Missing or invalid location coordinates");
  }

  // Fetch car data if booking ID is provided
  if (bookingId) {
    fetchCarData(bookingId);
  } else {
    console.warn("No booking ID provided");
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

// Calculate GPS-based direction
function calculateGPSDirection() {
  // Calculate based on compass heading and bearing to target
  if (smoothedHeading !== null) {
    // Get bearing to target (from current GPS to target GPS)
    const bearingToTarget = calculateBearing();

    // Calculate direction (difference between bearing and heading)
    let directionAngle = bearingToTarget - smoothedHeading;

    // Normalize to 0-360
    if (directionAngle < 0) {
      directionAngle += 360;
    }

    // Log occasionally
    if (Math.random() < 0.01) {
      console.log(
        "GPS-based direction:",
        directionAngle.toFixed(1) + "°",
        "(Heading:",
        smoothedHeading.toFixed(1) + "°",
        "Bearing:",
        bearingToTarget.toFixed(1) + "°)"
      );
    }

    return directionAngle;
  }

  // Fallback to 0 if no heading data
  return 0;
}

// Update UI to show arrow direction - with reversed rotation
function updateUI() {
  const arrow = document.querySelector(".arrow");

  if (arrow) {
    // Calculate direction - prefer AR-based direction when available
    const directionAngle = calculateARDirection();

    // Update the global direction variable for other functions to use
    direction = directionAngle;

    // IMPORTANT: Reverse the angle by adding 180 degrees
    // This makes the arrow point in the opposite direction
    const reversedAngle = (directionAngle + 180) % 360;

    // Apply smoother transition for stability
    arrow.style.transition = "transform 0.3s ease-out";

    // Rotate the arrow with reversed angle
    arrow.style.transform = `translate(-50%, -50%) rotate(${reversedAngle}deg)`;

    // Debug log occasionally (every ~100 frames)
    if (Math.random() < 0.01) {
      console.log(
        "Arrow direction: Original =",
        directionAngle.toFixed(1) + "°",
        "Reversed =",
        reversedAngle.toFixed(1) + "°"
      );
    }
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

// Fetch car data from booking ID
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
        carDirections =
          "The car is located in parking lot B, spot 42. It's a white Honda Vezel.";
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

    if (carType.includes("_")) {
      const parts = carType.split("_");
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
        console.log("📋 Car model data:", modelData);

        if (modelData.name) {
          modelName = modelData.name;
          console.log("✅ Found model name:", modelName);
        } else {
          console.warn("⚠️ No 'name' field in model document");

          // Try alternative field names that might contain the model name
          const possibleNameFields = [
            "displayName",
            "display_name",
            "model_name",
            "make_model",
          ];

          for (const field of possibleNameFields) {
            if (modelData[field]) {
              modelName = modelData[field];
              console.log(
                `✅ Found name in alternate field '${field}':`,
                modelName
              );
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
            modelsSnapshot.forEach((doc) => {
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
      window.carModelName =
        baseModelName.charAt(0).toUpperCase() + baseModelName.slice(1);
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
          carDirections =
            carData.directions || "Follow the arrow to reach your car.";
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
    if (document.getElementById("destinationModal")?.style.display === "flex") {
      updateAdditionalCarInfo();
    }
  } catch (error) {
    console.error("❌ Error in fetchCarData:", error);
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
  document.body.style.overflow = "hidden";

  // Update car image
  const carImage = document.getElementById("carImage");
  if (carImage) {
    console.log("Updating car image");
    // Set default image first
    carImage.src = "../static/images/car_images/default.png";

    if (window.carType) {
      console.log("Loading car image for type:", window.carType);
      loadCarImageWithFallbacks(carImage, [
        `../static/images/car_images/${window.carType}.png`,
        `../static/images/car_images/${window.carType.split("_")[0]}.png`,
        `../static/images/car_models/${window.carType}.png`,
        `../static/images/cars/${window.carType}.png`,
        "../static/images/car_images/default.png",
      ]);
    }
  }

  // Update directions text
  const directionsText = document.getElementById("directionsText");
  if (directionsText) {
    directionsText.textContent =
      window.carDirections || "Follow the arrow to reach your car.";
  }

  // Update additional car info
  updateAdditionalCarInfo();

  // Show the modal
  modal.style.display = "flex";

  // Add click handler to close modal
  modal.addEventListener("click", function () {
    modal.style.display = "none";
    document.body.style.overflow = "auto"; // Unlock scrolling
  });
}

// Update additional car information in the modal
function updateAdditionalCarInfo() {
  // Add license plate info
  const licensePlateElement = document.getElementById("carLicensePlate");
  if (licensePlateElement) {
    if (window.carLicensePlate) {
      licensePlateElement.textContent = window.carLicensePlate;
      licensePlateElement.classList.remove("loading");
    } else {
      licensePlateElement.textContent = "Loading...";
      licensePlateElement.classList.add("loading");
    }
  }

  // Add car model info
  const carModelElement = document.getElementById("carModelName");
  if (carModelElement) {
    if (window.carModelName) {
      carModelElement.textContent = window.carModelName;
      carModelElement.classList.remove("loading");
    } else {
      carModelElement.textContent = "Loading...";
      carModelElement.classList.add("loading");
    }
  }
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
