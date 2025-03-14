// admin-addCars.js - Part 1
import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let map;
let marker;
let geocoder;
let allCarModels = {};
let currentUser = null;
let mapInitialized = false;

// DOM Elements
const loadingOverlay = document.getElementById("loading-overlay");
const formContainer = document.getElementById("form-container");
const errorContainer = document.getElementById("error-container");
const addCarForm = document.getElementById("add-car-form");
const carModelSelect = document.getElementById("car-model");
const carColorSelect = document.getElementById("car-color");
const carLicensePlate = document.getElementById("license-plate");
const carAddress = document.getElementById("car-address");
const carDirections = document.getElementById("car-directions");
const carLatitude = document.getElementById("car-latitude");
const carLongitude = document.getElementById("car-longitude");
const searchAddressBtn = document.getElementById("search-address-btn");
const useCurrentLocationBtn = document.getElementById(
  "use-current-location-btn"
);
const mapContainer = document.getElementById("map-container");
const carStatus = document.getElementById("car-status");
const serviceDue = document.getElementById("service-due");
const insuranceExpiry = document.getElementById("insurance-expiry");
const submitButton = document.getElementById("submit-button");
const cancelButton = document.getElementById("cancel-button");
// Summary card elements
const summarySection = document.getElementById("summary-section");
const summaryFuelType = document.getElementById("summary-fuel-type");
const summarySeating = document.getElementById("summary-seating");
const summaryLargeLuggage = document.getElementById("summary-large-luggage");
const summarySmallLuggage = document.getElementById("summary-small-luggage");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Add Car page loading");

  try {
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Verify admin status
          const userDoc = await getDoc(doc(db, "users", user.uid));

          if (userDoc.exists() && userDoc.data().role === "admin") {
            currentUser = {
              uid: user.uid,
              ...userDoc.data(),
            };

            console.log("Admin authenticated:", currentUser.email);

            // Initialize form
            await initializeForm();
          } else {
            console.error("User is not an admin");
            showError("You don't have permission to access this page");
            setTimeout(() => {
              window.location.href = "../index.html";
            }, 2000);
          }
        } catch (error) {
          console.error("Authentication error:", error);
          showError("Failed to verify admin permissions");
        }
      } else {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
      }
    });

    // Setup form handlers
    setupFormHandlers();
  } catch (error) {
    console.error("Initialization error:", error);
    showError(`Error initializing page: ${error.message}`);
  }

  // Google Maps init function to be called by the API
  window.initMap = function () {
    console.log("Google Maps API callback received");

    // If DOM is not ready yet, set a timeout
    if (
      document.readyState !== "complete" &&
      document.readyState !== "interactive"
    ) {
      console.log("DOM not ready, setting timeout for map initialization");
      setTimeout(window.initMap, 500);
      return;
    }

    // Check if map container is ready
    if (!mapContainer) {
      console.log("Map container not found, setting timeout");
      setTimeout(window.initMap, 500);
      return;
    }

    // Check if map is already initialized
    if (mapInitialized) {
      console.log("Map already initialized, skipping");
      return;
    }

    // If all conditions are met, initialize the map
    console.log("Initializing map from Google callback");
    initializeMap();
    mapInitialized = true;

    // Check map state after initialization
    setTimeout(checkMapContainer, 500);
  };
});

// Initialize form
async function initializeForm() {
  showLoading(true);

  try {
    // Set default dates
    setDefaultDates();

    // Load car models
    await loadCarModels();

    // Initialize Google Maps (will be called by API callback)

    // Show form
    showLoading(false);
  } catch (error) {
    console.error("Error initializing form:", error);
    showError(`Failed to initialize form: ${error.message}`);
  }
}

// Set default dates for service and insurance
function setDefaultDates() {
  // Set service due to 6 months from now
  const sixMonthsFromNow = new Date();
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
  serviceDue.value = formatDateForInput(sixMonthsFromNow);

  // Set insurance expiry to 1 year from now
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  insuranceExpiry.value = formatDateForInput(oneYearFromNow);
}

// Format date for input field (YYYY-MM-DD)
function formatDateForInput(date) {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Load all car models from Firestore
async function loadCarModels() {
  try {
    console.log("Loading car models");

    const carModelsSnapshot = await getDocs(collection(db, "car_models"));

    // Add this inside your loadCarModels function where you process each model
    carModelsSnapshot.forEach((doc) => {
      const model = doc.data();
      const modelId = doc.id;

      // Log model data for debugging
      console.log(`Model ${modelId} data:`, {
        name: model.name,
        fuel_type: model.fuel_type,
        seating_capacity: model.seating_capacity,
        large_luggage: model.large_luggage,
        small_luggage: model.small_luggage,
      });

      // Store model data for later use
      allCarModels[modelId] = model;

      // Add option to select
      const option = document.createElement("option");
      option.value = modelId;
      option.textContent = model.name || modelId;
      carModelSelect.appendChild(option);
    });

    if (!carModelsSnapshot.empty) {
      // Clear car model select options
      carModelSelect.innerHTML =
        '<option value="" disabled selected>Select a car model</option>';

      carModelsSnapshot.forEach((doc) => {
        const model = doc.data();
        const modelId = doc.id;

        // Store model data for later use
        allCarModels[modelId] = model;

        // Add option to select
        const option = document.createElement("option");
        option.value = modelId;
        option.textContent = model.name || modelId;
        carModelSelect.appendChild(option);
      });

      console.log(`Loaded ${Object.keys(allCarModels).length} car models`);
    } else {
      console.warn("No car models found in database");
      carModelSelect.innerHTML =
        '<option value="" disabled>No car models available</option>';
    }
  } catch (error) {
    console.error("Error loading car models:", error);
    throw error;
  }
}

// Update color options based on selected model
function updateColorOptions(modelId) {
  // Clear existing options
  carColorSelect.innerHTML =
    '<option value="" disabled selected>Select a color</option>';

  if (modelId && allCarModels[modelId]) {
    const model = allCarModels[modelId];

    // If model has specific colors
    if (
      model.colors &&
      Array.isArray(model.colors) &&
      model.colors.length > 0
    ) {
      model.colors.forEach((color) => {
        const option = document.createElement("option");
        option.value = color;
        option.textContent = color.charAt(0).toUpperCase() + color.slice(1);
        carColorSelect.appendChild(option);
      });
    }
    // If model has a single color
    else if (model.color) {
      const option = document.createElement("option");
      option.value = model.color;
      option.textContent =
        model.color.charAt(0).toUpperCase() + model.color.slice(1);
      carColorSelect.appendChild(option);
    }
    // Default colors
    else {
      const defaultColors = ["White", "Black", "Silver", "Blue", "Red"];
      defaultColors.forEach((color) => {
        const option = document.createElement("option");
        option.value = color.toLowerCase();
        option.textContent = color;
        carColorSelect.appendChild(option);
      });
    }
  }
}

// Initialize Google Maps with Places Autocomplete
function initializeMap() {
  try {
    console.log("Initializing Google Maps");

    // Check if Google Maps is loaded
    if (typeof google === "undefined" || !google.maps) {
      console.error("Google Maps API is not loaded");
      return;
    }

    // Check if map container exists
    if (!mapContainer) {
      console.error("Map container not found!");
      return;
    }

    // Log container dimensions
    console.log(
      "Map container dimensions:",
      mapContainer.clientWidth,
      "x",
      mapContainer.clientHeight
    );

    // Ensure container is visible and has dimensions
    if (mapContainer.clientWidth === 0 || mapContainer.clientHeight === 0) {
      console.error("Map container has zero dimensions, can't initialize map");
      return;
    }

    // Default to Singapore if no coordinates
    const lat = parseFloat(carLatitude.value) || 1.3521;
    const lng = parseFloat(carLongitude.value) || 103.8198;

    console.log(`Setting up map with coordinates: ${lat}, ${lng}`);

    // Initialize map
    map = new google.maps.Map(mapContainer, {
      center: { lat, lng },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    });

    // Initialize geocoder
    geocoder = new google.maps.Geocoder();

    // Add marker at current location
    marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      draggable: true,
      animation: google.maps.Animation.DROP,
      title: "Car Location",
    });

    // Add event listener to map idle event
    google.maps.event.addListenerOnce(map, "idle", function () {
      console.log("Map is fully loaded and idle");
    });

    // Set up Places Autocomplete
    const addressInput = document.getElementById("car-address");
    if (addressInput) {
      try {
        console.log("Setting up Places Autocomplete");
        const autocomplete = new google.maps.places.Autocomplete(addressInput);

        // Bias the autocomplete results to the map's viewport
        autocomplete.bindTo("bounds", map);

        // Add listener for place changes
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();

          if (!place.geometry || !place.geometry.location) {
            // User entered the name of a place that was not suggested
            console.warn(
              "No details available for input: '" + place.name + "'"
            );
            return;
          }

          // Update map with selected place
          if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
          } else {
            map.setCenter(place.geometry.location);
            map.setZoom(17);
          }

          // Update marker
          marker.setPosition(place.geometry.location);

          // Update form values
          carAddress.value = place.formatted_address;
          carLatitude.value = formatCoordinate(place.geometry.location.lat());
          carLongitude.value = formatCoordinate(place.geometry.location.lng());

          console.log(`Place selected: ${place.formatted_address}`);
        });
        console.log("Places Autocomplete setup complete");
      } catch (error) {
        console.error("Error setting up Places Autocomplete:", error);
      }
    } else {
      console.error("Address input element not found");
    }

    // Update coordinates when marker is dragged
    google.maps.event.addListener(marker, "dragend", function () {
      const position = marker.getPosition();
      carLatitude.value = formatCoordinate(position.lat());
      carLongitude.value = formatCoordinate(position.lng());

      // Get address from coordinates
      geocodePosition(position);
    });

    // Add click event to map
    google.maps.event.addListener(map, "click", function (event) {
      marker.setPosition(event.latLng);
      carLatitude.value = formatCoordinate(event.latLng.lat());
      carLongitude.value = formatCoordinate(event.latLng.lng());

      // Get address from coordinates
      geocodePosition(event.latLng);
    });

    console.log("Google Maps initialized successfully");
  } catch (error) {
    console.error("Error initializing Google Maps:", error);
  }
}

// Function to manually initialize Google Maps if the callback doesn't work
function tryInitializeMap() {
  console.log("Attempting manual map initialization");

  // Check if Google Maps API is loaded
  if (typeof google === "undefined" || !google.maps) {
    console.error("Google Maps API not loaded yet. Will retry in 1 second.");
    setTimeout(tryInitializeMap, 1000);
    return;
  }

  // Check if map container exists and is visible
  if (!mapContainer) {
    console.error("Map container element not found!");
    return;
  }

  // Check if map is already initialized
  if (map) {
    console.log("Map already initialized");
    return;
  }

  try {
    console.log("Manually initializing map");

    // Initialize map
    initializeMap();

    console.log("Manual map initialization complete");
  } catch (error) {
    console.error("Error in manual map initialization:", error);
  }
}

// Call this function after a delay to ensure DOM is fully loaded
setTimeout(tryInitializeMap, 1500);

// Format coordinate to 15 decimal places
function formatCoordinate(value) {
  if (value === null || value === undefined || isNaN(value)) return "";
  return value.toFixed(15);
}

// Geocode position to get address
function geocodePosition(position) {
  geocoder.geocode({ location: position }, (results, status) => {
    if (status === "OK" && results[0]) {
      carAddress.value = results[0].formatted_address;
    } else {
      console.warn("Geocode failed:", status);
    }
  });
}

// Search for address and update map
function searchAddress() {
  const address = carAddress.value.trim();

  if (!address) {
    showMessage("Please enter an address to search", "warning");
    return;
  }

  showMessage("Searching for address...", "info");

  geocoder.geocode({ address }, (results, status) => {
    if (status === "OK" && results[0]) {
      const location = results[0].geometry.location;

      // Update map
      map.setCenter(location);
      map.setZoom(16);
      marker.setPosition(location);

      // Update form fields
      carLatitude.value = formatCoordinate(location.lat());
      carLongitude.value = formatCoordinate(location.lng());
      carAddress.value = results[0].formatted_address;

      showMessage("Location found", "success");
    } else {
      console.warn("Geocode failed:", status);
      showMessage(
        "Could not find that address. Please try again or use the map to select a location.",
        "error"
      );
    }
  });
}

// Use current location
function useCurrentLocation() {
  if (navigator.geolocation) {
    showMessage("Getting your location...", "info");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Update map
        map.setCenter({ lat, lng });
        marker.setPosition({ lat, lng });

        // Update form fields
        carLatitude.value = formatCoordinate(lat);
        carLongitude.value = formatCoordinate(lng);

        // Get address from coordinates
        geocodePosition(new google.maps.LatLng(lat, lng));

        showMessage("Current location set", "success");
      },
      (error) => {
        console.error("Geolocation error:", error);
        showMessage(
          "Could not get your location. Please enable location services.",
          "error"
        );
      },
      { enableHighAccuracy: true }
    );
  } else {
    showMessage("Geolocation is not supported by this browser", "error");
  }
}

// Setup form event handlers
function setupFormHandlers() {
  // Car model change event
  if (carModelSelect) {
    carModelSelect.addEventListener("change", (e) => {
      const selectedModelId = e.target.value;
      updateColorOptions(selectedModelId);
      // Call with slight delay to ensure color options are updated first
      setTimeout(() => {
        updateSummaryCard(selectedModelId);
      }, 50);
    });
  }

  // Updated event listener for search button
  if (searchAddressBtn) {
    searchAddressBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Search button clicked");
      searchAddress();
    });
  }

  // Use current location button
  if (useCurrentLocationBtn) {
    useCurrentLocationBtn.addEventListener("click", (e) => {
      e.preventDefault();
      useCurrentLocation();
    });
  }

  // Form submit event
  if (addCarForm) {
    addCarForm.addEventListener("submit", handleFormSubmit);
  }

  // Cancel button event
  if (cancelButton) {
    cancelButton.addEventListener("click", (e) => {
      e.preventDefault();
      if (
        confirm(
          "Are you sure you want to cancel? Any entered data will be lost."
        )
      ) {
        window.location.href = "admin-cars.html";
      }
    });
  }
}

// Ensure we have coordinates from address if needed
async function ensureCoordinates() {
  // If we already have valid coordinates, return them
  const lat = parseFloat(carLatitude.value.trim());
  const lng = parseFloat(carLongitude.value.trim());

  if (!isNaN(lat) && !isNaN(lng)) {
    return { lat, lng };
  }

  // If we have an address but no coordinates, try to geocode
  const address = carAddress.value.trim();
  if (!address) {
    return null; // No address to geocode
  }

  // Show a message
  showMessage("Getting coordinates from address...", "info");

  try {
    // Use a promise wrapper for geocoder
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results[0]) {
          const location = results[0].geometry.location;

          // Set the values in the form
          carLatitude.value = formatCoordinate(location.lat());
          carLongitude.value = formatCoordinate(location.lng());

          resolve({ lat: location.lat(), lng: location.lng() });
        } else {
          console.warn("Geocode failed:", status);
          resolve(null); // Return null but don't reject
        }
      });
    });
  } catch (error) {
    console.error("Error geocoding address:", error);
    return null;
  }
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();

  try {
    showLoading(true);

    // Get form values
    const carTypeValue = carModelSelect.value;
    const carColorValue = carColorSelect.value;
    const licensePlateValue = carLicensePlate.value.trim();
    const addressValue = carAddress.value.trim();
    const directionsValue = carDirections ? carDirections.value.trim() : "";
    const statusValue = carStatus.value;
    const serviceDueValue = new Date(serviceDue.value);
    const insuranceExpiryValue = new Date(insuranceExpiry.value);

    // Form validation
    if (!carTypeValue) {
      throw new Error("Please select a car model");
    }

    if (!licensePlateValue) {
      throw new Error("Please enter a license plate number");
    }

    if (!addressValue) {
      throw new Error("Please enter a car location address");
    }

    if (!statusValue) {
      throw new Error("Please select a car status");
    }

    if (isNaN(serviceDueValue.getTime())) {
      throw new Error("Please enter a valid service due date");
    }

    if (isNaN(insuranceExpiryValue.getTime())) {
      throw new Error("Please enter a valid insurance expiry date");
    }

    // Try to get coordinates from address if they're missing
    let coordinates = null;
    const latValue = parseFloat(carLatitude.value.trim());
    const lngValue = parseFloat(carLongitude.value.trim());

    if (isNaN(latValue) || isNaN(lngValue)) {
      coordinates = await ensureCoordinates();
    } else {
      coordinates = { lat: latValue, lng: lngValue };
    }

    // Get model-specific data
    const modelData = allCarModels[carTypeValue] || {};

    // Create car document
    const carData = {
      car_type: carTypeValue,
      car_color: carColorValue,
      license_plate: licensePlateValue,
      address: addressValue,
      directions: directionsValue,
      status: statusValue,
      service_due: serviceDueValue,
      insurance_expiry: insuranceExpiryValue,
      created_at: serverTimestamp(),
      created_by: currentUser?.uid || "unknown",
      updated_at: serverTimestamp(),
    };

    // Add coordinates if available
    if (coordinates) {
      carData.current_location = {
        latitude: coordinates.lat,
        longitude: coordinates.lng,
      };
    }

    // Add model-specific data if available
    if (modelData.fuel_type) {
      carData.fuel_type = modelData.fuel_type;
    }

    if (modelData.seating_capacity) {
      carData.seating_capacity = parseInt(modelData.seating_capacity);
    }

    if (modelData.large_luggage) {
      carData.large_luggage = parseInt(modelData.large_luggage);
    }

    if (modelData.small_luggage) {
      carData.small_luggage = parseInt(modelData.small_luggage);
    }

    console.log("Adding new car with data:", carData);

    // Add car to Firestore
    const carRef = await addDoc(collection(db, "cars"), carData);

    console.log("Car added successfully with ID:", carRef.id);

    showMessage("Car added successfully!", "success");

    // Redirect back to cars page after short delay
    setTimeout(() => {
      window.location.href = "admin-cars.html";
    }, 1500);
  } catch (error) {
    console.error("Error adding car:", error);
    showMessage(error.message, "error");
    showLoading(false);
  }
}

// Helper functions
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? "flex" : "none";
  }
}

function showError(message) {
  if (errorContainer) {
    errorContainer.textContent = message;
    errorContainer.style.display = "block";
    formContainer.style.display = "none";
  } else {
    alert(message);
  }

  showLoading(false);
}

function showMessage(message, type = "info") {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }

  // Create toast message
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Set toast icon based on type
  let icon = "info-circle";
  if (type === "success") icon = "check-circle";
  if (type === "warning") icon = "exclamation-triangle";
  if (type === "error") icon = "x-circle";

  toast.innerHTML = `
        <i class="bi bi-${icon}"></i>
        <span>${message}</span>
      `;

  // Add toast to container
  toastContainer.appendChild(toast);

  // Show toast
  setTimeout(() => {
    toast.classList.add("show");

    // Auto-hide after delay
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 10);
}

// Check map container
function checkMapContainer() {
  console.log("Map container check:");
  console.log("- Element exists:", !!mapContainer);
  if (mapContainer) {
    console.log(
      "- Size:",
      mapContainer.clientWidth,
      "x",
      mapContainer.clientHeight
    );
    console.log(
      "- Visibility:",
      window.getComputedStyle(mapContainer).visibility
    );
    console.log("- Display:", window.getComputedStyle(mapContainer).display);
  }

  console.log("Google Maps API status:");
  console.log(
    "- google object:",
    typeof google !== "undefined" ? "Loaded" : "Not loaded"
  );
  console.log(
    "- maps object:",
    typeof google !== "undefined" && google.maps ? "Loaded" : "Not loaded"
  );
}

// Update summary card based on selected car model and color
function updateSummaryCard(modelId) {
  // Log for debugging
  console.log("updateSummaryCard called with modelId:", modelId);
  console.log("summarySection element:", summarySection);
  
  // If no model ID or model doesn't exist, hide summary
  if (!modelId || !allCarModels[modelId]) {
    console.log("No model selected or model data not found");
    if (summarySection) {
      summarySection.style.display = "none";
      summarySection.classList.remove("show");
    }
    return;
  }
  
  // Get model data
  const model = allCarModels[modelId];
  console.log("Model data for summary:", model);
  
  // Get selected color
  const selectedColor = carColorSelect ? carColorSelect.value : "";
  console.log("Selected color:", selectedColor);
  
  // Update car image based on model and color
  if (summaryCarImage) {
    // Try to load image based on model_id and color
    let imagePath = `../static/images/car_images/${modelId}`;
    
    if (selectedColor) {
      imagePath += `_${selectedColor}`;
    }
    
    imagePath += ".png";
    console.log("Trying image path:", imagePath);
    
    // Set image with fallback
    summaryCarImage.src = imagePath;
    summaryCarImage.onerror = function() {
      console.log("Color-specific image not found, trying model-only image");
      // If color-specific image fails, try just the model
      this.src = `../static/images/car_images/${modelId}.png`;
      
      // If that fails too, use placeholder
      this.onerror = function() {
        console.log("Model image not found, using placeholder");
        this.src = "../static/images/assets/car-placeholder.jpg";
      };
    };
  }
  
  // Update car name
  if (summaryCarName) {
    let carName = model.name || modelId;
    if (selectedColor) {
      // Capitalize the first letter of the color
      const formattedColor = selectedColor.charAt(0).toUpperCase() + selectedColor.slice(1);
      carName += ` (${formattedColor})`;
    }
    summaryCarName.textContent = carName;
  }
  
  // Update summary values if elements exist
  if (summaryFuelType) {
    summaryFuelType.textContent = model.fuel_type ? 
      (model.fuel_type.charAt(0).toUpperCase() + model.fuel_type.slice(1)) : 
      "Not specified";
  }
  
  if (summarySeating) {
    summarySeating.textContent = model.seating_capacity ? 
      `${model.seating_capacity} seats` : 
      "Not specified";
  }
  
  if (summaryLargeLuggage) {
    summaryLargeLuggage.textContent = model.large_luggage !== undefined ? 
      `${model.large_luggage}` : 
      "Not specified";
  }
  
  if (summarySmallLuggage) {
    summarySmallLuggage.textContent = model.small_luggage !== undefined ? 
      `${model.small_luggage}` : 
      "Not specified";
  }
  
  // Force the summary section to be visible with !important style
  if (summarySection) {
    console.log("Showing summary section");
    summarySection.style.display = "block";
    summarySection.style.visibility = "visible";
    summarySection.style.opacity = "1";
    summarySection.classList.add("show");
    
    // Force a reflow
    void summarySection.offsetHeight;
  }
}

// Debug check after a delay
setTimeout(checkMapContainer, 2000);
