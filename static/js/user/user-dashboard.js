import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Debug mode flag
const DEBUG = false;

// Log function that only logs when in debug mode
function debugLog(...args) {
  if (DEBUG) {
    console.log("[Dashboard]", ...args);
  }
}

// Global variables
let userId = null;
let userData = null;
let map = null;
let mapInitialized = false;
let markers = [];
let activeCars = [];
let locationSearchInput = null;
let autocomplete = null;
let userLocation = null;
let searchRadius = 10; // Default search radius in km
let autocompleteListener = null;
let dateTimeCache = null;
let preventAutoSearch = false;
let maxCarsToDisplay = 10;
let directionsService = null;
let directionsRenderer = null;
let activeInfoWindow = null;
let selectedStartDate = null;
let selectedEndDate = null;
let selectedStartTime = null;
let selectedEndTime = null;
let selectedCarType = null;
let carTypeFilters = []; // Store selected car type filters

// DOM elements
let searchForm = null;
let startDateInput = null;
let startTimeSelect = null;
let endDateInput = null;
let endTimeSelect = null;
let nearbyVehiclesContainer = null;
let vehiclesGrid = null;
let skeletonCards = null;
let activeBookingsContainer = null;
let locationError = null;
let noResultsMessage = null;
let searchSpinner = null;
let carTypeFilter = null;
let searchRadiusRange = null;
let radiusValueDisplay = null;
let timeHints = null;

// Initialize the app
document.addEventListener("DOMContentLoaded", async function () {
  debugLog("Document loaded, initializing dashboard");

  try {
    // Initialize DOM elements
    initializeDOMElements();

    // Check authentication state
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        userId = user.uid;
        await loadUserData(userId);
        
        // Update user info in header and greeting
        if (window.updateUserInfo) {
          window.updateUserInfo(userData);
        }
        
        // Set default date time values from either URL params or current time
        setInitialDateTime();
        
        // Initialize search form with autocomplete
        initializeSearch();
        
        // Initialize map if container exists
        await initializeMap();
        
        // Load active bookings
        await loadActiveBookings(userId);
        
        // Initialize car type filters
        initializeFilters();
        
        // Setup event listeners for user interactions
        setupEventListeners();
        
        // Show welcome message based on time of day and user data
        showWelcomeMessage();
        
        // Hide loading spinner
        hideLoadingSpinner();
      } else {
        // User is not logged in, redirect to login page
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("Error initializing dashboard:", error);
    showErrorMessage("Something went wrong while loading the dashboard");
  }
});

// Load user data from Firestore
async function loadUserData(userId) {
  try {
    debugLog("Loading user data for:", userId);
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (userDoc.exists()) {
      userData = {
        id: userId,
        ...userDoc.data(),
      };
      
      debugLog("User data loaded:", userData);
    } else {
      console.error("No user document found for ID:", userId);
      showErrorMessage("User profile not found");
    }
  } catch (error) {
    console.error("Error loading user data:", error);
    showErrorMessage("Failed to load your profile data");
  }
}

// Initialize DOM elements
function initializeDOMElements() {
  searchForm = document.getElementById("search-form");
  startDateInput = document.getElementById("start-date");
  startTimeSelect = document.getElementById("start-time");
  endDateInput = document.getElementById("end-date");
  endTimeSelect = document.getElementById("end-time");
  locationSearchInput = document.getElementById("location-search");
  nearbyVehiclesContainer = document.getElementById("nearby-vehicles");
  vehiclesGrid = document.getElementById("vehicles-grid");
  skeletonCards = document.getElementsByClassName("skeleton-card");
  activeBookingsContainer = document.getElementById("active-bookings");
  locationError = document.getElementById("location-error");
  noResultsMessage = document.getElementById("no-results");
  searchSpinner = document.getElementById("search-spinner");
  carTypeFilter = document.getElementById("car-type-filter");
  searchRadiusRange = document.getElementById("search-radius");
  radiusValueDisplay = document.getElementById("radius-value");
  timeHints = document.getElementById("time-hints");
}

// Set initial date time values from URL params or current time
function setInitialDateTime() {
  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const hasDateParams = urlParams.has("startDate") && urlParams.has("endDate");
  const hasTimeParams = urlParams.has("startTime") && urlParams.has("endTime");
  
  // Get current date and time
  const now = new Date();
  const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
  const currentDateTime = new Date(now);
  
  // Adjust to next 15-minute interval
  if (roundedMinutes === 60) {
    currentDateTime.setHours(currentDateTime.getHours() + 1);
    currentDateTime.setMinutes(0);
  } else {
    currentDateTime.setMinutes(roundedMinutes);
  }
  
  // Set seconds and milliseconds to zero
  currentDateTime.setSeconds(0);
  currentDateTime.setMilliseconds(0);
  
  // Format dates for inputs
  const startDateTime = new Date(currentDateTime);
  const endDateTime = new Date(currentDateTime);
  endDateTime.setHours(endDateTime.getHours() + 2); // Default rental duration is 2 hours
  
  // Use URL params if available, otherwise use calculated times
  if (hasDateParams && hasTimeParams) {
    const startDate = urlParams.get("startDate");
    const startTime = urlParams.get("startTime");
    const endDate = urlParams.get("endDate");
    const endTime = urlParams.get("endTime");
    
    startDateInput.value = startDate;
    startTimeSelect.value = startTime;
    endDateInput.value = endDate;
    endTimeSelect.value = endTime;
    
    // Set global variables for later use
    selectedStartDate = startDate;
    selectedEndDate = endDate;
    selectedStartTime = startTime;
    selectedEndTime = endTime;
    
    // Cache for comparison
    dateTimeCache = {
      startDate,
      startTime,
      endDate,
      endTime,
    };
  } else {
    // Format date as YYYY-MM-DD
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    
    // Format time as HH:MM
    const formatTime = (date) => {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${hours}:${minutes}`;
    };
    
    startDateInput.value = formatDate(startDateTime);
    startTimeSelect.value = formatTime(startDateTime);
    endDateInput.value = formatDate(endDateTime);
    endTimeSelect.value = formatTime(endDateTime);
    
    // Set global variables
    selectedStartDate = formatDate(startDateTime);
    selectedEndDate = formatDate(endDateTime);
    selectedStartTime = formatTime(startDateTime);
    selectedEndTime = formatTime(endDateTime);
    
    // Cache for comparison
    dateTimeCache = {
      startDate: formatDate(startDateTime),
      startTime: formatTime(startDateTime),
      endDate: formatDate(endDateTime),
      endTime: formatTime(endDateTime),
    };
  }
  
  // Check if location is in URL params
  if (urlParams.has("location") && locationSearchInput) {
    locationSearchInput.value = urlParams.get("location");
  }
  
  // Check for car type filter
  if (urlParams.has("carType") && carTypeFilter) {
    selectedCarType = urlParams.get("carType");
    carTypeFilter.value = selectedCarType;
  }
  
  debugLog("Initial date/time set:", {
    startDate: startDateInput.value,
    startTime: startTimeSelect.value,
    endDate: endDateInput.value,
    endTime: endTimeSelect.value,
  });
}

// Initialize Google Maps
async function initializeMap() {
  try {
    if (!mapInitialized) {
      debugLog("Initializing map");
      const mapElement = document.getElementById("map");
      
      if (!mapElement) {
        debugLog("Map element not found");
        return;
      }
      
      const mapOptions = {
        center: { lat: 1.3521, lng: 103.8198 }, // Singapore default
        zoom: 12,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "transit",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          }
        ],
      };
      
      map = new google.maps.Map(mapElement, mapOptions);
      directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: "#1e88e5",
          strokeWeight: 5,
          strokeOpacity: 0.7,
        },
      });
      
      mapInitialized = true;
      debugLog("Map initialized");
      
      // Try to get user's current location after map is initialized
      getUserCurrentLocation();
    }
  } catch (error) {
    console.error("Error initializing map:", error);
    showErrorMessage("Failed to load the map");
  }
}

// Initialize search functionality with location autocomplete
function initializeSearch() {
  if (!locationSearchInput) return;

  debugLog("Initializing search with autocomplete");
  
  // Setup Google Places Autocomplete
  autocomplete = new google.maps.places.Autocomplete(locationSearchInput, {
    types: ["geocode"],
    componentRestrictions: { country: "sg" }, // Restrict to Singapore
    fields: ["address_components", "geometry", "formatted_address", "place_id"],
  });
  
  // Add listener for place selection
  autocompleteListener = autocomplete.addListener("place_changed", function () {
    const place = autocomplete.getPlace();
    if (!place.geometry) {
      locationError.textContent = "Please select a valid location from the dropdown";
      locationError.style.display = "block";
      return;
    }
    
    locationError.style.display = "none";
    userLocation = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      address: place.formatted_address,
    };
    
    // Update map center and add marker for selected location
    if (map && mapInitialized) {
      map.setCenter(userLocation);
      map.setZoom(14);
      
      // Clear existing user location marker
      markers = markers.filter(marker => {
        if (marker.isUserLocation) {
          marker.setMap(null);
          return false;
        }
        return true;
      });
      
      // Add new marker for user location
      const userMarker = new google.maps.Marker({
        position: userLocation,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#FFFFFF",
          strokeWeight: 2,
          scale: 7,
        },
        title: "Your Location",
        isUserLocation: true,
        zIndex: 999,
      });
      
      markers.push(userMarker);
      
      // Add pulse animation to user location
      addPulseEffect(userMarker);
      
      // Search for nearby cars if we have the required info
      if (!preventAutoSearch) {
        searchCars();
      }
    }
  });
  
  // Initialize time selectors with 15-minute intervals
  populateTimeSelectors();
}

// Initialize filters for car type
function initializeFilters() {
  if (!carTypeFilter) return;
  
  // Load car types from Firestore for filter
  loadCarTypesForFilter();
  
  // Set up filter change handler
  carTypeFilter.addEventListener("change", function() {
    selectedCarType = this.value;
    filterDisplayedCars();
  });
  
  // Set up search radius slider
  if (searchRadiusRange && radiusValueDisplay) {
    searchRadiusRange.value = searchRadius;
    radiusValueDisplay.textContent = searchRadius;
    
    searchRadiusRange.addEventListener("input", function() {
      searchRadius = parseInt(this.value);
      radiusValueDisplay.textContent = searchRadius;
      
      // If we already have cars loaded, update the display
      if (activeCars.length > 0 && userLocation) {
        filterDisplayedCars();
      }
    });
  }
}

// Set up event listeners
function setupEventListeners() {
  // Search form submission
  if (searchForm) {
    searchForm.addEventListener("submit", function(e) {
      e.preventDefault();
      searchCars();
    });
  }
  
  // Get current location button
  const currentLocationBtn = document.getElementById("current-location-btn");
  if (currentLocationBtn) {
    currentLocationBtn.addEventListener("click", getUserCurrentLocation);
  }
  
  // Time inputs change events
  const timeInputs = [startDateInput, startTimeSelect, endDateInput, endTimeSelect];
  timeInputs.forEach(input => {
    if (input) {
      input.addEventListener("change", function() {
        validateTimeSelections();
        updateTimeHints();
      });
    }
  });
  
  // Vehicle grid click events for selecting cars
  if (vehiclesGrid) {
    vehiclesGrid.addEventListener("click", function(e) {
      const carCard = e.target.closest(".car-card");
      if (carCard) {
        const carId = carCard.dataset.carId;
        if (carId) {
          selectCar(carId);
        }
      }
    });
  }
}

// Get user's current location
function getUserCurrentLocation() {
  const locationBtn = document.getElementById("current-location-btn");
  
  if (locationBtn) {
    locationBtn.disabled = true;
    locationBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Locating...';
  }
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latlng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        
        userLocation = {
          lat: latlng.lat,
          lng: latlng.lng,
        };
        
        try {
          // Get address from coordinates using Geocoding API
          const geocoder = new google.maps.Geocoder();
          const result = await new Promise((resolve, reject) => {
            geocoder.geocode({ location: latlng }, (results, status) => {
              if (status === "OK" && results[0]) {
                resolve(results[0]);
              } else {
                reject(new Error(`Geocoder failed with status: ${status}`));
              }
            });
          });
          
          userLocation.address = result.formatted_address;
          if (locationSearchInput) {
            locationSearchInput.value = result.formatted_address;
          }
          
          // Update map and search for cars
          if (map && mapInitialized) {
            map.setCenter(userLocation);
            map.setZoom(14);
            
            // Clear existing user location marker
            markers = markers.filter(marker => {
              if (marker.isUserLocation) {
                marker.setMap(null);
                return false;
              }
              return true;
            });
            
            // Add new marker for user location
            const userMarker = new google.maps.Marker({
              position: userLocation,
              map: map,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: "#4285F4",
                fillOpacity: 1,
                strokeColor: "#FFFFFF",
                strokeWeight: 2,
                scale: 7,
              },
              title: "Your Location",
              isUserLocation: true,
              zIndex: 999,
            });
            
            markers.push(userMarker);
            
            // Add pulse animation to user location
            addPulseEffect(userMarker);
            
            // Search for cars near location
            searchCars();
          }
        } catch (error) {
          console.error("Geocoding error:", error);
          showErrorMessage("Could not determine address from location");
        } finally {
          // Reset location button
          if (locationBtn) {
            locationBtn.disabled = false;
            locationBtn.innerHTML = '<i class="bi bi-geo-alt"></i> Current Location';
          }
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        let errorMsg;
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = "Location access was denied. Please enable location services.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = "Location information is unavailable.";
            break;
          case error.TIMEOUT:
            errorMsg = "Location request timed out.";
            break;
          default:
            errorMsg = "An unknown error occurred.";
        }
        
        showErrorMessage(errorMsg);
        
        // Reset location button
        if (locationBtn) {
          locationBtn.disabled = false;
          locationBtn.innerHTML = '<i class="bi bi-geo-alt"></i> Current Location';
        }
      }
    );
  } else {
    showErrorMessage("Geolocation is not supported by this browser");
    
    // Reset location button
    if (locationBtn) {
      locationBtn.disabled = false;
      locationBtn.innerHTML = '<i class="bi bi-geo-alt"></i> Current Location';
    }
  }
}

// Search for cars based on current criteria
async function searchCars() {
  if (!userLocation) {
    showErrorMessage("Please select a location first");
    return;
  }
  
  try {
    // Update states and UI
    showLoadingState();
    
    // Get selected dates and times
    selectedStartDate = startDateInput.value;
    selectedStartTime = startTimeSelect.value;
    selectedEndDate = endDateInput.value;
    selectedEndTime = endTimeSelect.value;
    
    // Validate time selections
    if (!validateTimeSelections()) {
      hideLoadingState();
      return;
    }
    
    // Update URL parameters for sharing/bookmarking
    updateURLParameters();
    
    // Fetch available cars from Firestore
    const cars = await fetchAvailableCars();
    
    // Process and display the cars
    processCarsData(cars);
    
    // Hide loading state
    hideLoadingState();
  } catch (error) {
    console.error("Error searching cars:", error);
    showErrorMessage("Failed to search for available vehicles");
    hideLoadingState();
  }
}

// Fetch available cars from Firestore
async function fetchAvailableCars() {
  try {
    debugLog("Fetching available cars");
    
    // Start with all cars
    const carsRef = collection(db, "cars");
    const carsSnapshot = await getDocs(carsRef);
    
    if (carsSnapshot.empty) {
      debugLog("No cars found in database");
      return [];
    }
    
    // Process all cars and filter by availability later
    const allCars = [];
    carsSnapshot.forEach(doc => {
      const carData = {
        id: doc.id,
        ...doc.data(),
      };
      
      // Calculate distance from user location
      if (userLocation && carData.current_location) {
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          carData.current_location.latitude || carData.current_location.lat,
          carData.current_location.longitude || carData.current_location.lng
        );
        carData.distance = distance;
      } else {
        carData.distance = 999; // Far away by default
      }
      
      allCars.push(carData);
    });
    
    debugLog(`Found ${allCars.length} cars in database`);
    
    // Now check availability for the time period
    const availableCars = await checkCarsAvailability(allCars);
    
    // Sort by distance
    availableCars.sort((a, b) => a.distance - b.distance);
    
    debugLog(`Found ${availableCars.length} available cars`);
    
    return availableCars;
  } catch (error) {
    console.error("Error fetching cars:", error);
    throw new Error("Failed to load available cars");
  }
}

// Check availability of cars for the selected time period
async function checkCarsAvailability(cars) {
  try {
    // Create start and end timestamps
    const startTimestamp = createTimestamp(selectedStartDate, selectedStartTime);
    const endTimestamp = createTimestamp(selectedEndDate, selectedEndTime);
    
    // Check each car's availability
    const availableCars = [];
    
    for (const car of cars) {
      // Check if car is within search radius
      if (car.distance > searchRadius) {
        continue;
      }
      
      // Check if car matches selected type filter
      if (selectedCarType && selectedCarType !== "all") {
        if (car.car_type !== selectedCarType) {
          continue;
        }
      }
      
      // Check car's booking schedule
      const isAvailable = await isCarAvailable(car.id, startTimestamp, endTimestamp);
      
      if (isAvailable) {
        availableCars.push(car);
        
        // Stop after reaching max display limit
        if (availableCars.length >= maxCarsToDisplay) {
          break;
        }
      }
    }
    
    return availableCars;
  } catch (error) {
    console.error("Error checking car availability:", error);
    throw new Error("Failed to check car availability");
  }
}

// Check if a car is available for the specified time period
async function isCarAvailable(carId, startTimestamp, endTimestamp) {
  try {
    const timesheetRef = collection(db, "timesheets", carId, "bookings");
    const q = query(
      timesheetRef,
      where("start_time", "<=", endTimestamp),
      where("end_time", ">=", startTimestamp)
    );
    
    const bookingsSnapshot = await getDocs(q);
    
    // Car is available if no conflicting bookings exist
    return bookingsSnapshot.empty;
  } catch (error) {
    console.error(`Error checking availability for car ${carId}:`, error);
    return false; // Assume unavailable on error
  }
}

// Process and display cars data
function processCarsData(cars) {
  // Store active cars globally
  activeCars = cars;
  
  // Clear existing markers
  clearCarMarkers();
  
  // Update UI with results
  updateCarDisplay(cars);
  
  // Update map with markers
  updateMapMarkers(cars);
  
  // Show or hide containers based on results
  nearbyVehiclesContainer.style.display = cars.length > 0 ? "block" : "none";
  noResultsMessage.style.display = cars.length === 0 ? "block" : "none";
}

// Load active bookings for the user
async function loadActiveBookings(userId) {
  if (!activeBookingsContainer) return;
  
  try {
    debugLog("Loading active bookings");
    
    // Show loading state
    activeBookingsContainer.innerHTML = `
      <div class="bookings-loading">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p>Loading your bookings...</p>
      </div>
    `;
    
    const now = new Date();
    const currentTimestamp = Timestamp.fromDate(now);
    
    // Query user's active bookings
    const bookingsRef = collection(db, "users", userId, "bookings");
    const q = query(
      bookingsRef,
      where("end_time", ">=", currentTimestamp),
      orderBy("end_time"),
      limit(3)
    );
    
    const bookingsSnapshot = await getDocs(q);
    
    if (bookingsSnapshot.empty) {
      activeBookingsContainer.innerHTML = `
        <div class="no-bookings">
          <img src="../static/images/no-bookings.svg" alt="No bookings" class="no-bookings-img">
          <p>You don't have any upcoming bookings</p>
          <p class="text-muted">Search for available cars to make a new booking</p>
        </div>
      `;
      return;
    }
    
    // Render the active bookings
    let bookingsHTML = `
      <h3>Your Upcoming Bookings</h3>
      <div class="booking-cards">
    `;
    
    const promises = [];
    bookingsSnapshot.forEach(doc => {
      const booking = {
        id: doc.id,
        ...doc.data(),
      };
      
      // Fetch car details if needed
      promises.push(
        getDoc(doc(db, "cars", booking.car_id))
          .then(carDoc => {
            if (carDoc.exists()) {
              booking.car = {
                id: carDoc.id,
                ...carDoc.data(),
              };
            }
            return booking;
          })
      );
    });
    
    const bookingsWithCars = await Promise.all(promises);
    
    bookingsWithCars.forEach(booking => {
      const startDate = booking.start_time instanceof Timestamp ? 
        booking.start_time.toDate() : new Date(booking.start_time);
      
      const endDate = booking.end_time instanceof Timestamp ?
        booking.end_time.toDate() : new Date(booking.end_time);
      
      const formattedStartDate = formatDateForDisplay(startDate);
      const formattedStartTime = formatTimeForDisplay(startDate);
      const formattedEndTime = formatTimeForDisplay(endDate);
      
      const carName = booking.car ? 
        (booking.car.display_name || booking.car.car_type) : "Unknown Car";
      
      const carImage = booking.car && booking.car.image_url ? 
        booking.car.image_url : "../static/images/car-placeholder.jpg";
      
      bookingsHTML += `
        <div class="booking-card">
          <div class="booking-image">
            <img src="${carImage}" alt="${carName}">
          </div>
          <div class="booking-details">
            <h4>${carName}</h4>
            <div class="booking-date">${formattedStartDate}</div>
            <div class="booking-time">${formattedStartTime} - ${formattedEndTime}</div>
            <div class="booking-status ${booking.status}">${booking.status}</div>
          </div>
          <a href="user-booking-detail.html?id=${booking.id}" class="btn btn-primary booking-view-btn">View Details</a>
        </div>
      `;
    });
    
    bookingsHTML += `
      </div>
      <a href="user-bookings.html" class="view-all-bookings">View all bookings <i class="bi bi-arrow-right"></i></a>
    `;
    
    activeBookingsContainer.innerHTML = bookingsHTML;
  } catch (error) {
    console.error("Error loading active bookings:", error);
    activeBookingsContainer.innerHTML = `
      <div class="error-message">
        <i class="bi bi-exclamation-circle"></i>
        <p>Failed to load your bookings. Please try again later.</p>
      </div>
    `;
  }
}

// Helper functions

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Format functions
function formatDateForDisplay(date) {
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatTimeForDisplay(date) {
  const options = { hour: 'numeric', minute: '2-digit', hour12: true };
  return date.toLocaleTimeString('en-US', options);
}

function createTimestamp(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(num => parseInt(num));
  const [hours, minutes] = timeStr.split(':').map(num => parseInt(num));
  const date = new Date(year, month - 1, day, hours, minutes);
  return Timestamp.fromDate(date);
}

// UI helper functions
function showLoadingState() {
  if (searchSpinner) searchSpinner.style.display = "flex";
  if (vehiclesGrid) vehiclesGrid.innerHTML = getSkeletonHTML();
}

function hideLoadingState() {
  if (searchSpinner) searchSpinner.style.display = "none";
}

function getSkeletonHTML() {
  return `
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton-title"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-button"></div>
      </div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton-title"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-button"></div>
      </div>
    </div>
  `;
}

function showErrorMessage(message) {
  const errorToast = document.getElementById("error-toast") || createErrorToast();
  const errorContent = errorToast.querySelector(".toast-body") || errorToast;
  errorContent.textContent = message;
  
  errorToast.classList.add("show");
  setTimeout(() => {
    errorToast.classList.remove("show");
  }, 5000);
}

function createErrorToast() {
  const toast = document.createElement("div");
  toast.id = "error-toast";
  toast.className = "toast";
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <div class="toast-header">
      <strong class="me-auto">Error</strong>
      <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body"></div>
  `;
  document.body.appendChild(toast);
  
  const closeBtn = toast.querySelector(".btn-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => toast.classList.remove("show"));
  }
  
  return toast;
}

// Show welcome message based on time of day
function showWelcomeMessage() {
  const welcomeMessage = document.getElementById("welcome-message");
  if (!welcomeMessage || !userData) return;
  
  const hour = new Date().getHours();
  let greeting = "Welcome back";
  
  if (hour >= 0 && hour < 12) {
    greeting = "Good morning";
  } else if (hour >= 12 && hour < 18) {
    greeting = "Good afternoon";
  } else {
    greeting = "Good evening";
  }
  
  welcomeMessage.textContent = `${greeting}, ${userData.firstName || "there"}!`;
}

// Export necessary functions
export { 
  loadUserData, 
  getUserCurrentLocation, 
  searchCars,
  showErrorMessage 
};