import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let map;
let marker;
let geocoder;
let carId;
let allCarModels = {};
let currentUser = null;

// DOM Elements
const loadingOverlay = document.getElementById("loading-overlay");
const formContainer = document.getElementById("form-container");
const errorContainer = document.getElementById("error-container");
const editCarForm = document.getElementById("edit-car-form");
const carModelSelect = document.getElementById("car-model");
const carColorSelect = document.getElementById("car-color");
const carLicensePlate = document.getElementById("license-plate");
const carAddress = document.getElementById("car-address");
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
const deleteButton = document.getElementById("delete-car-btn");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Edit Car page loading");

  try {
    // Get car ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    carId = urlParams.get("id");

    if (!carId) {
      throw new Error("No car ID provided in URL");
    }

    console.log(`Editing car with ID: ${carId}`);

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

            // Initialize page content
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
});

// Initialize form with data
async function initializeForm() {
  showLoading(true);

  try {
    // Load car models first
    await loadCarModels();

    // Then load car data
    await loadCarData();

    // Initialize Google Maps
    initializeMap();

    // Show form
    showLoading(false);
  } catch (error) {
    console.error("Error initializing form:", error);
    showError(`Failed to load car data: ${error.message}`);
  }
}

// Load all car models from Firestore
async function loadCarModels() {
  try {
    console.log("Loading car models");

    const carModelsSnapshot = await getDocs(collection(db, "car_models"));

    if (!carModelsSnapshot.empty) {
      // Clear car model select options
      carModelSelect.innerHTML =
        '<option value="" disabled>Select a car model</option>';

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

// Load car data from Firestore
async function loadCarData() {
  try {
    console.log(`Loading car data for ID: ${carId}`);

    const carDoc = await getDoc(doc(db, "cars", carId));

    if (!carDoc.exists()) {
      throw new Error(`Car with ID ${carId} not found`);
    }

    const car = carDoc.data();
    console.log("Car data loaded:", car);

    // Populate form with car data
    populateForm(car);

    return car;
  } catch (error) {
    console.error("Error loading car data:", error);
    throw error;
  }
}

// Populate form with car data
function populateForm(car) {
  // Set car model
  if (car.car_type) {
    carModelSelect.value = car.car_type;
    updateColorOptions(car.car_type, car.car_color);
  }

  // Set license plate
  if (car.license_plate) {
    carLicensePlate.value = car.license_plate;
  }

  // Set address
  if (car.address) {
    carAddress.value = car.address;
  }

  // Set coordinates
  if (car.current_location) {
    if (car.current_location.latitude) {
      carLatitude.value = car.current_location.latitude;
    }
    if (car.current_location.longitude) {
      carLongitude.value = car.current_location.longitude;
    }
  }

  // Set status
  if (car.status) {
    carStatus.value = car.status;
  }

  // Set service due date
  if (car.service_due) {
    const serviceDueDate = car.service_due.toDate
      ? car.service_due.toDate()
      : new Date(car.service_due.seconds * 1000);

    serviceDue.value = formatDateForInput(serviceDueDate);
  }

  // Set insurance expiry date
  if (car.insurance_expiry) {
    const insuranceExpiryDate = car.insurance_expiry.toDate
      ? car.insurance_expiry.toDate()
      : new Date(car.insurance_expiry.seconds * 1000);

    insuranceExpiry.value = formatDateForInput(insuranceExpiryDate);
  }
}

// Format date for input field (YYYY-MM-DD)
function formatDateForInput(date) {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Update color options based on selected model
function updateColorOptions(modelId, selectedColor = null) {
  // Clear existing options
  carColorSelect.innerHTML =
    '<option value="" disabled>Select a color</option>';

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

    // Set selected color if provided
    if (selectedColor) {
      carColorSelect.value = selectedColor;
    }
  }
}

// Initialize Google Maps
function initializeMap() {
  try {
    console.log("Initializing Google Maps");
    
    // Get coordinates from form
    const lat = parseFloat(carLatitude.value) || 1.3521; // Default to Singapore
    const lng = parseFloat(carLongitude.value) || 103.8198;
    
    // Initialize map
    map = new google.maps.Map(mapContainer, {
      center: { lat, lng },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true
    });
    
    // Initialize geocoder
    geocoder = new google.maps.Geocoder();
    
    // Add marker at current location
    marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      draggable: true,
      animation: google.maps.Animation.DROP,
      title: "Car Location"
    });
    
    // Update coordinates when marker is dragged
    google.maps.event.addListener(marker, "dragend", function() {
      const position = marker.getPosition();
      carLatitude.value = position.lat();
      carLongitude.value = position.lng();
      
      // Get address from coordinates
      geocodePosition(position);
    });
    
    // Add click event to map
    google.maps.event.addListener(map, "click", function(event) {
      marker.setPosition(event.latLng);
      carLatitude.value = event.latLng.lat();
      carLongitude.value = event.latLng.lng();
      
      // Get address from coordinates
      geocodePosition(event.latLng);
    });
    
    console.log("Google Maps initialized");
  } catch (error) {
    console.error("Error initializing Google Maps:", error);
    showError("Failed to initialize map. You can still edit car details without the map.");
  }
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
  
  geocoder.geocode({ address }, (results, status) => {
    if (status === "OK" && results[0]) {
      const location = results[0].geometry.location;
      
      // Update map
      map.setCenter(location);
      marker.setPosition(location);
      
      // Update form fields
      carLatitude.value = location.lat();
      carLongitude.value = location.lng();
      
      showMessage("Location found", "success");
    } else {
      console.warn("Geocode failed:", status);
      showMessage("Couldn't find that address. Please try again.", "error");
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
        carLatitude.value = lat;
        carLongitude.value = lng;
        
        // Get address from coordinates
        geocodePosition(new google.maps.LatLng(lat, lng));
        
        showMessage("Current location set", "success");
      },
      (error) => {
        console.error("Geolocation error:", error);
        showMessage("Couldn't get your location. Please enable location services.", "error");
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
    carModelSelect.addEventListener('change', (e) => {
      updateColorOptions(e.target.value);
    });
  }
  
  // Address search button
  if (searchAddressBtn) {
    searchAddressBtn.addEventListener('click', (e) => {
      e.preventDefault();
      searchAddress();
    });
  }
  
  // Use current location button
  if (useCurrentLocationBtn) {
    useCurrentLocationBtn.addEventListener('click', (e) => {
      e.preventDefault();
      useCurrentLocation();
    });
  }
  
  // Manual coordinate input events
  if (carLatitude && carLongitude) {
    const updateMarkerFromCoords = () => {
      const lat = parseFloat(carLatitude.value);
      const lng = parseFloat(carLongitude.value);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        const position = new google.maps.LatLng(lat, lng);
        marker.setPosition(position);
        map.setCenter(position);
      }
    };
    
    carLatitude.addEventListener('change', updateMarkerFromCoords);
    carLongitude.addEventListener('change', updateMarkerFromCoords);
  }
  
  // Form submit event
  if (editCarForm) {
    editCarForm.addEventListener('submit', handleFormSubmit);
  }
  
  // Cancel button event
  if (cancelButton) {
    cancelButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to cancel? Any changes will be lost.')) {
        window.location.href = 'admin-cars.html';
      }
    });
  }
  
  // Delete button event
  if (deleteButton) {
    deleteButton.addEventListener('click', (e) => {
      e.preventDefault();
      confirmDeleteCar();
    });
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
    const latValue = parseFloat(carLatitude.value.trim());
    const lngValue = parseFloat(carLongitude.value.trim());
    const statusValue = carStatus.value;
    const serviceDueValue = new Date(serviceDue.value);
    const insuranceExpiryValue = new Date(insuranceExpiry.value);
    
    // Form validation
    if (!carTypeValue) {
      throw new Error('Please select a car model');
    }
    
    if (!licensePlateValue) {
      throw new Error('Please enter a license plate number');
    }
    
    if (!addressValue) {
      throw new Error('Please enter a car location address');
    }
    
    if (isNaN(latValue) || isNaN(lngValue)) {
      throw new Error('Please enter valid coordinates');
    }
    
    if (!statusValue) {
      throw new Error('Please select a car status');
    }
    
    if (isNaN(serviceDueValue.getTime())) {
      throw new Error('Please enter a valid service due date');
    }
    
    if (isNaN(insuranceExpiryValue.getTime())) {
      throw new Error('Please enter a valid insurance expiry date');
    }
    
    // Get additional data from car model
    const modelData = allCarModels[carTypeValue] || {};
    
    // Create car update object
    const carUpdate = {
      car_type: carTypeValue,
      car_color: carColorValue,
      license_plate: licensePlateValue,
      address: addressValue,
      current_location: {
        latitude: latValue,
        longitude: lngValue,
      },
      status: statusValue,
      service_due: serviceDueValue,
      insurance_expiry: insuranceExpiryValue,
      updated_at: serverTimestamp(),
      updated_by: currentUser?.uid || 'unknown'
    };
    
    // Add model-specific data if available
    if (modelData.fuel_type) {
      carUpdate.fuel_type = modelData.fuel_type;
    }
    
    if (modelData.seating_capacity) {
      carUpdate.seating_capacity = parseInt(modelData.seating_capacity);
    }
    
    if (modelData.large_luggage) {
      carUpdate.large_luggage = parseInt(modelData.large_luggage);
    }
    
    if (modelData.small_luggage) {
      carUpdate.small_luggage = parseInt(modelData.small_luggage);
    }
    
    console.log("Updating car with data:", carUpdate);
    
    // Update car in Firestore
    await updateDoc(doc(db, 'cars', carId), carUpdate);
    
    showMessage("Car updated successfully!", "success");
    
    // Redirect back to cars page after short delay
    setTimeout(() => {
      window.location.href = 'admin-cars.html';
    }, 1500);
    
  } catch (error) {
    console.error("Error updating car:", error);
    showMessage(error.message, "error");
    showLoading(false);
  }
}

// Confirm car deletion
function confirmDeleteCar() {
  if (confirm("Are you sure you want to delete this car? This action cannot be undone.")) {
    deleteCar();
  }
}

// Delete car
async function deleteCar() {
  try {
    showLoading(true);
    
    await deleteDoc(doc(db, 'cars', carId));
    
    showMessage("Car deleted successfully!", "success");
    
    // Redirect back to cars page after short delay
    setTimeout(() => {
      window.location.href = 'admin-cars.html';
    }, 1500);
    
  } catch (error) {
    console.error("Error deleting car:", error);
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

// Initialize Google Maps API after the page loads
window.initMap = initializeMap;