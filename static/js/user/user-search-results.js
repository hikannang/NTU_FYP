// user-search-results.js
import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let userId;
let userPosition;
let map;
let markers = [];
let carResults = [];
let searchParams;
let originalResults = [];

// DOM Elements
const loadingIndicator = document.getElementById("loading-indicator");
const resultsContainer = document.getElementById("results-container");
const errorMessage = document.getElementById("error-message");
const carListContainer = document.getElementById("car-list");
const filtersContainer = document.getElementById("filters-container");
const searchSummary = document.getElementById("search-summary");
const noResultsMessage = document.getElementById("no-results");
const sortSelect = document.getElementById("sort-select");
const filterToggle = document.getElementById("filter-toggle");
const viewToggle = document.getElementById("view-toggle");
const mapViewButton = document.getElementById("map-view-btn");
const listViewButton = document.getElementById("list-view-btn");
const carTypesContainer = document.getElementById("car-type-filters");
const mapContainer = document.getElementById("map-container");

// Initialize the page
document.addEventListener("DOMContentLoaded", async () => {
  // Load header and footer
  document.getElementById("header").innerHTML = await fetch(
    "../static/headerFooter/user-header.html"
  ).then((response) => response.text());
  document.getElementById("footer").innerHTML = await fetch(
    "../static/headerFooter/user-footer.html"
  ).then((response) => response.text());

  // Setup logout button
  setupLogoutButton();

  // Check authentication
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      userId = user.uid;

      // Get search parameters from session storage
      const storedParams = sessionStorage.getItem("carSearchParams");
      userPosition = sessionStorage.getItem("userMapPosition")
        ? JSON.parse(sessionStorage.getItem("userMapPosition"))
        : null;

      if (!storedParams) {
        showError("No search parameters found. Please try searching again.");
        setTimeout(() => {
          window.location.href = "user-dashboard.html";
        }, 2000);
        return;
      }

      searchParams = JSON.parse(storedParams);
      updateSearchSummary(searchParams);

      // Show loading state
      showLoading(true);

      // Initialize search filters
      initializeFilters();

      // Load car search results
      await loadSearchResults();

      // Setup event listeners
      setupEventListeners();
    } else {
      // Redirect to login if not authenticated
      window.location.href = "../index.html";
    }
  });
  // Get references to elements
  const filterToggle = document.getElementById("filter-toggle");
  const filtersPanel = document.querySelector(".filters-panel");
  const applyFilterBtn = document.getElementById("apply-filter");

  if (filterToggle && filtersPanel) {
    // Toggle filters panel when the button is clicked
    filterToggle.addEventListener("click", function () {
      filtersPanel.classList.toggle("show-filters");

      // Also toggle visibility of apply button
      if (applyFilterBtn) {
        if (filtersPanel.classList.contains("show-filters")) {
          applyFilterBtn.style.display = "block"; // Show apply button when filters are visible
        } else {
          applyFilterBtn.style.display = "none"; // Hide apply button when filters are hidden
        }
      }

      // Change icon based on state
      const icon = filterToggle.querySelector("i");
      if (icon) {
        if (filtersPanel.classList.contains("show-filters")) {
          icon.className = "bi bi-x-lg"; // Change to X icon when filters are shown
        } else {
          icon.className = "bi bi-sliders"; // Change back to sliders icon when closed
        }
      }
    });

    // Close filters and hide apply button when "Apply" is clicked
    if (applyFilterBtn) {
      applyFilterBtn.addEventListener("click", function () {
        filtersPanel.classList.remove("show-filters");
        applyFilterBtn.style.display = "none"; // Hide apply button

        // Change icon back
        const icon = filterToggle.querySelector("i");
        if (icon) {
          icon.className = "bi bi-sliders";
        }

        // Apply filters
        filterResults();
      });
    }
  }
});

// Setup logout button
function setupLogoutButton() {
  setTimeout(() => {
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
      logoutButton.addEventListener("click", async (event) => {
        event.preventDefault();
        try {
          await signOut(auth);
          window.location.href = "../index.html";
        } catch (error) {
          console.error("Error during logout:", error);
          alert("Logout failed: " + error.message);
        }
      });
    }
  }, 300);
}

// Update search summary display with enhanced UI structure
function updateSearchSummary(params) {
  if (!searchSummary) return;

  // Format date for display
  const date = new Date(params.pickupDate);
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Create the summary text
  const timeString = params.formattedTime;
  const duration = calculateDurationText(
    params.durationDays,
    params.durationHours,
    params.durationMinutes
  );

  searchSummary.innerHTML = `
    <div class="summary-container">
      <div class="search-details">
        <div class="location-time">
          <h1><i class="bi bi-geo-alt"></i> ${params.location}</h1>
          <div class="search-time"><i class="bi bi-calendar-event"></i> ${formattedDate} at ${timeString} · ${duration}</div>
          
          <div class="search-stats">
            <div class="stat-item">
              <i class="bi bi-clock"></i>
              <span>${duration}</span>
            </div>
            <div class="stat-item">
              <i class="bi bi-calendar-check"></i>
              <span>${formattedDate}</span>
            </div>
          </div>
        </div>
        
        <a href="user-dashboard.html" class="secondary-btn">
          <i class="bi bi-pencil"></i> Modify Search
        </a>
      </div>
    </div>
  `;
}

// Format duration text
function calculateDurationText(days, hours, minutes) {
  let durationText = "";

  if (parseInt(days) > 0) {
    durationText += `${days} day${parseInt(days) > 1 ? "s" : ""} `;
  }

  if (parseInt(hours) > 0) {
    durationText += `${hours} hour${parseInt(hours) > 1 ? "s" : ""} `;
  }

  if (parseInt(minutes) > 0) {
    durationText += `${minutes} minute${parseInt(minutes) > 1 ? "s" : ""}`;
  }

  return durationText.trim() || "0 minutes";
}

// Initialize search filters
function initializeFilters() {
  // Car type filters from database
  populateCarTypeFilters();

  // Add fuel type filters
  populateFuelTypeFilters();

  // Add seating capacity filters
  populateSeatingFilters();
}

// Populate car type filter checkboxes
async function populateCarTypeFilters() {
  if (!carTypesContainer) return;

  try {
    carTypesContainer.innerHTML = ""; // Clear existing filters

    // First get all model data from car_models collection
    const modelsRef = collection(db, "car_models");
    const modelsSnapshot = await getDocs(modelsRef);

    if (modelsSnapshot.empty) {
      console.log("No car models found in database");
      return;
    }

    // Create a map of model IDs to their proper names
    const modelNames = {};
    modelsSnapshot.forEach((doc) => {
      // CHANGED: Focus only on the 'name' field from car_models
      const modelData = doc.data();
      if (modelData.name) {
        modelNames[doc.id.split("_")[0]] = modelData.name;
      } else {
        // Only if name doesn't exist, use fallbacks
        modelNames[doc.id.spilt("_")[0]] =
          modelData.model_name || modelData.display_name || doc.id;
      }
    });

    console.log("Loaded car model names:", modelNames);

    // Create a unique set of base model IDs from available cars
const modelIds = new Set();
const modelDisplayNames = {}; // Track display names for each base model ID

// If we've already loaded cars, use those to determine available models
if (originalResults && originalResults.length > 0) {
  originalResults.forEach((car) => {
    if (car.car_type) {
      // Extract the base model ID (before the underscore)
      const baseModelId = car.car_type.split("_")[0];
      modelIds.add(baseModelId);
      
      // Store the full car_type for reference
      if (!modelDisplayNames[baseModelId]) {
        // Look for this base model in our loaded model names
        if (modelNames[baseModelId]) {
          modelDisplayNames[baseModelId] = modelNames[baseModelId];
        }
        // If exact match not found, try to find a variant
        else {
          for (const key in modelNames) {
            if (key === baseModelId || key.startsWith(baseModelId + '_')) {
              modelDisplayNames[baseModelId] = modelNames[key];
              break;
            }
          }
        }
      }
    }
  });
}
// Otherwise, query the cars collection to get model types
else {
  const carsRef = collection(db, "cars");
  const carsSnapshot = await getDocs(carsRef);

  carsSnapshot.forEach((doc) => {
    const carData = doc.data();
    if (carData.car_type) {
      // Extract the base model ID (before the underscore)
      const baseModelId = carData.car_type.split("_")[0];
      modelIds.add(baseModelId);
      
      // Store the full car_type for reference
      if (!modelDisplayNames[baseModelId]) {
        // Look for this base model in our loaded model names
        if (modelNames[baseModelId]) {
          modelDisplayNames[baseModelId] = modelNames[baseModelId];
        }
        // If exact match not found, try to find a variant
        else {
          for (const key in modelNames) {
            if (key === baseModelId || key.startsWith(baseModelId + '_')) {
              modelDisplayNames[baseModelId] = modelNames[key];
              break;
            }
          }
        }
      }
    }
  });
}

console.log("Combined model IDs:", Array.from(modelIds));
console.log("Display names for models:", modelDisplayNames);


    // Create filter checkboxes for each model using names from our map
    Array.from(modelIds)
      .sort()
      .forEach((modelId) => {
        // Simply use the name from our already loaded modelNames map
        // This map already has the correct full names from the database
        const model_ID= modelId;
        const displayName = modelNames[modelId] || modelId;

        console.log(
          `Creating filter for ${modelId} with display name "${displayName} and model id ${model_ID}"`
        );

        const filterItem = document.createElement("div");
        filterItem.className = "filter-item";
        filterItem.innerHTML = `
    <input type="checkbox" id="type-${modelId}" class="car-type-filter" value="${modelId}">
    <label for="type-${modelId}">${displayName}</label>
  `;
        carTypesContainer.appendChild(filterItem);
      });

    console.log(`Generated ${modelIds.size} car type filters`);
  } catch (error) {
    console.error("Error populating car type filters:", error);
  }
}

// Add this function to populate fuel type filters
function populateFuelTypeFilters() {
  const fuelTypesContainer = document.getElementById("fuel-type-filters");
  if (!fuelTypesContainer) return;

  // Fuel types from your database
  const fuelTypes = ["Petrol", "Electric"];

  fuelTypes.forEach((type) => {
    const filterItem = document.createElement("div");
    filterItem.className = "filter-item";
    filterItem.innerHTML = `
            <input type="checkbox" id="fuel-${type.toLowerCase()}" class="fuel-type-filter" value="${type.toLowerCase()}">
            <label for="fuel-${type.toLowerCase()}">${type}</label>
        `;
    fuelTypesContainer.appendChild(filterItem);
  });
}

// Add this function to populate seating capacity filters
function populateSeatingFilters() {
  const seatingContainer = document.getElementById("seating-filters");
  if (!seatingContainer) return;

  // Common seating capacities
  const seatingOptions = [5, 7];

  seatingOptions.forEach((capacity) => {
    const filterItem = document.createElement("div");
    filterItem.className = "filter-item";
    filterItem.innerHTML = `
            <input type="checkbox" id="seats-${capacity}" class="seating-filter" value="${capacity}">
            <label for="seats-${capacity}">${capacity} seats</label>
        `;
    seatingContainer.appendChild(filterItem);
  });
}

// Load search results
async function loadSearchResults() {
  try {
    showLoading(true);

    // Debug database first to verify cars data
    await debugDatabaseAndMap();

    // Get all cars
    const carsSnapshot = await getDocs(collection(db, "cars"));

    if (carsSnapshot.empty) {
      showNoResults();
      return;
    }

    console.log(`Found ${carsSnapshot.size} total cars in database`);

    // Process car data
    carResults = [];

    // Create date objects from search parameters
    const requestedStart = new Date(searchParams.startDateTime);
    const requestedEnd = new Date(searchParams.endDateTime);

    // Track processing stats
    let availableCount = 0;
    let locationValidCount = 0;
    let bookingAvailableCount = 0;

    for (const carDoc of carsSnapshot.docs) {
      const carData = carDoc.data();
      console.log(`Processing car ${carDoc.id}:`, carData);

      // Skip if car is not available (case-insensitive check)
      if (!carData.status || carData.status.toLowerCase() !== "available") {
        console.log(
          `Car ${carDoc.id} status is not available: ${carData.status}`
        );
        continue;
      }
      availableCount++;

      // Check if car has valid location data
      if (
        !carData.current_location ||
        typeof carData.current_location.latitude !== "number" ||
        typeof carData.current_location.longitude !== "number"
      ) {
        console.log(
          `Car ${carDoc.id} has invalid location data:`,
          carData.current_location
        );
        continue;
      }
      locationValidCount++;

      // Check if car is available during the requested time
      const isAvailable = await isCarAvailableForBooking(
        carDoc.id,
        requestedStart,
        requestedEnd
      );

      if (!isAvailable) {
        console.log(`Car ${carDoc.id} is not available during requested time`);
        continue;
      }
      bookingAvailableCount++;

      // Parse car_type to extract make, model, color
      const carTypeInfo = parseCarType(carData.car_type || "");

      // Calculate distance if user position is available
      let distance = null;
      if (userPosition && userPosition.lat && userPosition.lng) {
        distance = calculateDistance(
          userPosition.lat,
          userPosition.lng,
          carData.current_location.latitude,
          carData.current_location.longitude
        );
        console.log(
          `Car ${carDoc.id} is ${distance.toFixed(2)}km away from user`
        );
      } else {
        console.log(
          `Car ${carDoc.id}: Cannot calculate distance (no user position)`
        );
      }

      // Add default price if not available
      const hourlyRate = carData.price_per_hour || 15; // Default to $15/hour

      // Calculate total price for the booking
      const totalHours = searchParams.totalDurationMinutes / 60;
      const totalPrice = hourlyRate * totalHours;

      // Add to results with enhanced data
      carResults.push({
        id: carDoc.id,
        ...carData,
        make: carTypeInfo.make,
        modelName: carTypeInfo.model,
        color: carTypeInfo.color,
        image: `../static/images/car_images/${carData.car_type || "car"}.png`,
        distance: distance, // Store as numeric value for sorting
        totalPrice: totalPrice,
        price_per_hour: hourlyRate,
        // Include features for filtering
        features: {
          seating: carData.seating_capacity || 5,
          fuel: carData.fuel_type || "Petrol",
        },
      });

      console.log(`Added car ${carDoc.id} to results`);
    }

    console.log(
      `Processing summary: ${availableCount} available, ${locationValidCount} with valid location, ${bookingAvailableCount} available during requested time`
    );

    // Store original results for filtering
    originalResults = [...carResults];

    // Apply initial sort by distance
    if (sortSelect) {
      sortSelect.value = "distance"; // Set default sort to distance
    }
    sortResults(); // Sort results before displaying

    // Initialize map after a small delay to ensure DOM is ready
    setTimeout(() => {
      initializeMap();
    }, 300);
  } catch (error) {
    console.error("Error loading search results:", error);
    showError("Failed to load search results. Please try again.");
  } finally {
    showLoading(false);
  }
}

// Check if car is available during requested time
async function isCarAvailableForBooking(carId, requestedStart, requestedEnd) {
  try {
    // Get existing bookings for this car
    const bookingsRef = collection(db, "timesheets", carId, "bookings");
    const bookingsQuery = query(
      bookingsRef,
      where("status", "!=", "cancelled")
    );

    const bookingsSnapshot = await getDocs(bookingsQuery);

    if (bookingsSnapshot.empty) {
      return true; // No bookings, so it's available
    }

    // Check for conflicts with the requested time
    for (const bookingDoc of bookingsSnapshot.docs) {
      const booking = bookingDoc.data();
      const bookingStart = new Date(booking.start_time.seconds * 1000);
      const bookingEnd = new Date(booking.end_time.seconds * 1000);

      // Add buffer time (15 minutes) before and after each booking
      const bufferedStart = new Date(bookingStart.getTime() - 15 * 60000);
      const bufferedEnd = new Date(bookingEnd.getTime() + 15 * 60000);

      // Check for overlap
      if (
        (requestedStart >= bufferedStart && requestedStart <= bufferedEnd) ||
        (requestedEnd >= bufferedStart && requestedEnd <= bufferedEnd) ||
        (requestedStart <= bufferedStart && requestedEnd >= bufferedEnd)
      ) {
        return false; // Conflict found
      }
    }

    return true; // No conflicts, car is available
  } catch (error) {
    console.error(`Error checking availability for car ${carId}:`, error);
    return false; // Assume not available on error
  }
}

// Display search results with async card creation
async function displayResults() {
  if (!carListContainer) return;

  if (carResults.length === 0) {
    showNoResults();
    return;
  }

  // Clear container
  carListContainer.innerHTML = "";

  // Show results count
  if (noResultsMessage) {
    noResultsMessage.style.display = "none";
  }

  // Create loading placeholders
  const placeholderHtml = `
    <div class="car-card loading-placeholder">
      <div class="placeholder-image"></div>
      <div class="placeholder-content">
        <div class="placeholder-text"></div>
        <div class="placeholder-text small"></div>
        <div class="placeholder-text small"></div>
        <div class="placeholder-button"></div>
      </div>
    </div>
  `.repeat(Math.min(5, carResults.length));

  carListContainer.innerHTML = placeholderHtml;

  // Process each car with a small delay between each to prevent UI freezing
  for (let i = 0; i < carResults.length; i++) {
    const car = carResults[i];
    try {
      const carCard = await createCarCard(car);

      // Replace placeholder or append to container
      if (i < 5) {
        const placeholder = carListContainer.children[i];
        if (placeholder) {
          carListContainer.replaceChild(carCard, placeholder);
        } else {
          carListContainer.appendChild(carCard);
        }
      } else {
        carListContainer.appendChild(carCard);
      }
    } catch (error) {
      console.error(`Error creating card for car ${car.id}:`, error);

      // Create a basic fallback card if there's an error
      const fallbackCard = document.createElement("div");
      fallbackCard.className = "car-card";
      fallbackCard.innerHTML = `
        <div class="car-image">
          <img src="../static/images/assets/car-placeholder.jpg" alt="Car">
        </div>
        <div class="card-content">
          <div class="car-header">
            <h3>${car.car_type || "Car"}</h3>
          </div>
          <a href="user-car-details.html?id=${car.id}" class="view-details-btn">
            View Details
          </a>
        </div>
      `;
      carListContainer.appendChild(fallbackCard);
    }

    // Small delay to keep UI responsive
    if (i % 3 === 2 && i < carResults.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  // Update result count
  updateResultCount();
}

async function getCarModelName(carType) {
  console.group(`Getting model name for full car_type: "${carType}"`);

  try {
    if (!carType) {
      console.log("No car_type provided");
      console.groupEnd();
      return "Unknown Car";
    }

    // USE THE FULL CAR_TYPE as the document ID
    console.log(`Looking up document using FULL car_type: "${carType}"`);
    const modelDocRef = doc(db, "car_models", carType);
    const modelDoc = await getDoc(modelDocRef);

    if (modelDoc.exists()) {
      console.log(`✅ Document exists for full car_type: "${carType}"`);
      const modelData = modelDoc.data();
      console.log(`Document data:`, modelData);

      // Get the exact name value from the document
      if (modelData.name) {
        console.log(`✅ Found name field: "${modelData.name}"`);
        console.groupEnd();
        return modelData.name;
      } else {
        console.log(`❌ Document exists but has no 'name' field`);
      }
    } else {
      console.log(`❌ No document found for full car_type: "${carType}"`);

      // Try with just the base model as a fallback
      const baseModelName = carType.split("_")[0];
      console.log(`Trying fallback with base model name: "${baseModelName}"`);

      const baseModelDocRef = doc(db, "car_models", baseModelName);
      const baseModelDoc = await getDoc(baseModelDocRef);

      if (baseModelDoc.exists()) {
        console.log(`✅ Found document for base model: "${baseModelName}"`);
        const baseModelData = baseModelDoc.data();

        if (baseModelData.name) {
          console.log(
            `✅ Found name in base model document: "${baseModelData.name}"`
          );
          console.groupEnd();
          return baseModelData.name;
        }
      } else {
        console.log(`❌ No document found for base model: "${baseModelName}"`);
      }
    }

    // If we get here, we couldn't find a name in the database
    console.log(`Using fallback: displaying car_type`);
    console.groupEnd();
    return carType;
  } catch (error) {
    console.error(`Error getting car model name:`, error);
    console.groupEnd();
    return carType || "Unknown Car";
  }
}

// Create car card element with database model name
async function createCarCard(car) {
  const card = document.createElement("div");
  card.className = "car-card";
  card.dataset.type = car.car_type
    ? car.car_type.split("_")[0].toLowerCase()
    : "unknown";

  // Get the model name from database
  let carName = "Unknown Car";
  try {
    carName = await getCarModelName(car.car_type || "");
  } catch (error) {
    console.error(`Error getting model name for ${car.id}:`, error);
    carName =
      `${car.make || ""} ${car.modelName || ""}`.trim() || "Unknown Car";
  }

  // Format price display
  const hourlyPrice = car.price_per_hour
    ? `$${car.price_per_hour.toFixed(2)}/hour`
    : "Price not available";
  const totalPrice = car.totalPrice
    ? `$${car.totalPrice.toFixed(2)}`
    : "Price not available";

  // Format distance display
  let distanceDisplay = "";
  if (car.distance !== null) {
    distanceDisplay = `<span class="distance"><i class="bi bi-geo-alt"></i> ${car.distance.toFixed(
      1
    )} km away</span>`;
  }

  // Prepare feature badges
  const fuelIcon =
    car.fuel_type === "Electric"
      ? '<i class="bi bi-lightning-charge"></i>'
      : '<i class="bi bi-fuel-pump"></i>';

  const features = `
        <div class="car-features">
            <span><i class="bi bi-people"></i> ${
              car.seating_capacity || "5"
            } seats</span>
            <span>${fuelIcon} ${car.fuel_type || "Petrol"}</span>
            ${
              car.color
                ? `<span><i class="bi bi-palette"></i> ${car.color}</span>`
                : ""
            }
        </div>
    `;

  // Create card content with enhanced design
  card.innerHTML = `
        <div class="car-image">
            <img src="${car.image}" alt="${carName}" 
                 onerror="this.src='../static/images/assets/car-placeholder.jpg'">
        </div>
        <div class="card-content">
            <div class="car-info">
                <div class="car-header">
                    <h3>${carName}</h3>
                </div>
                ${features}
                ${distanceDisplay}
                <p class="address"><i class="bi bi-pin-map"></i> ${
                  car.address || "Location not available"
                }</p>
            </div>
            <div class="car-price-section">
                <div class="price-details">
                    <span class="price-rate">${hourlyPrice}</span>
                    <span class="total-price">Total: ${totalPrice}</span>
                </div>
                <a href="user-car-details.html?id=${
                  car.id
                }" class="view-details-btn">
                    View Details
                </a>
            </div>
        </div>
    `;

  return card;
}
// Initialize Google Map
function initializeMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement) {
    console.error("Map element not found");
    return;
  }

  // Force map dimensions to ensure visibility
  mapElement.style.height = "80vh";
  mapElement.style.minHeight = "400px";
  mapElement.style.width = "100%";

  if (!window.google || !window.google.maps) {
    console.error("Google Maps API not loaded!");
    mapElement.innerHTML =
      '<div class="map-error"><p>Map could not be loaded. Please refresh the page.</p></div>';
    return;
  }

  try {
    // Default center (Singapore)
    let mapCenter = { lat: 1.3521, lng: 103.8198 };

    // Use user position or first car position if available
    if (userPosition && userPosition.lat && userPosition.lng) {
      mapCenter = userPosition;
    } else if (carResults.length > 0 && carResults[0].current_location) {
      mapCenter = {
        lat: carResults[0].current_location.latitude,
        lng: carResults[0].current_location.longitude,
      };
    }

    // Create map with enhanced styling
    map = new google.maps.Map(mapElement, {
      center: mapCenter,
      zoom: 14,
      mapTypeControl: false,
      fullscreenControl: true,
      streetViewControl: true,
      styles: [
        // Subtle styling to match your app's color scheme
        {
          featureType: "poi",
          elementType: "labels.icon",
          stylers: [{ visibility: "off" }],
        },
        {
          featureType: "transit",
          elementType: "labels.icon",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    // Clear existing markers
    clearMarkers();

    // Add markers with a slight delay to ensure map is ready
    setTimeout(() => addMapMarkers(), 300);
  } catch (error) {
    console.error("Error initializing map:", error);
    mapElement.innerHTML =
      '<div class="map-error"><p>Error loading map. Please try again later.</p></div>';
  }
}

// Add markers to map
function addMapMarkers() {
  if (!map) return;

  // Clear existing markers
  clearMarkers();

  // Create bounds for map
  const bounds = new google.maps.LatLngBounds();

  // Add user position marker if available with custom icon
  if (userPosition && userPosition.lat && userPosition.lng) {
    try {
      const userMarker = new google.maps.Marker({
        position: userPosition,
        map: map,
        icon: {
          url: "../static/images/assets/user-marker.png",
          scaledSize: new google.maps.Size(32, 32),
        },
        title: "Your location",
        zIndex: 1000,
        animation: google.maps.Animation.DROP,
      });

      markers.push(userMarker);
      bounds.extend(userPosition);
    } catch (e) {
      console.error("Error adding user marker:", e);
    }
  }

  // Add car markers
  carResults.forEach(async (car) => {
    if (car.current_location) {
      const position = {
        lat: car.current_location.latitude,
        lng: car.current_location.longitude,
      };

      try {
        // Get just the model name from database
        let carName = "Unknown Car";
        try {
          carName = await getCarModelName(car.car_type || "");
          console.log(`Got car name for marker: ${carName}`);
        } catch (error) {
          console.error(`Error getting car name for ${car.id}:`, error);
          carName =
            `${car.make || ""} ${car.modelName || ""}`.trim() || "Unknown Car";
        }

        // Create custom icon based on car type
        const iconUrl = car.car_type?.toLowerCase().includes("tesla")
          ? "../static/images/assets/electric-car-marker.png"
          : "../static/images/assets/car-marker.png";

        const marker = new google.maps.Marker({
          position: position,
          map: map,
          title: carName, // Just use the database model name
          icon: {
            url: iconUrl,
            scaledSize: new google.maps.Size(32, 32),
          },
          animation: google.maps.Animation.DROP,
        });

        // Enhanced info window with more details and styling
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div class="map-info-window">
              <div class="info-header">
                <h4>${carName}</h4> <!-- Just use the database model name -->
                <span class="info-type">${
                  car.car_type?.split("_")[0] || "Car"
                }</span>
              </div>
              <div class="info-details">
                <p>${car.address || "Location not available"}</p>
                <div class="info-features">
                  <span><i class="bi bi-people"></i> ${
                    car.seating_capacity || "5"
                  }</span>
                  <span><i class="bi bi-fuel-pump"></i> ${
                    car.fuel_type || "Petrol"
                  }</span>
                </div>
                <p class="info-price">$${
                  car.price_per_hour ? car.price_per_hour.toFixed(2) : "0.00"
                }/hour</p>
              </div>
              <a href="user-car-details.html?id=${
                car.id
              }" class="info-window-btn">View Details</a>
            </div>
          `,
          maxWidth: 300,
        });

        marker.addListener("click", () => {
          // Close all other info windows first
          markers.forEach((m) => {
            if (m.infoWindow) m.infoWindow.close();
          });

          // Open this info window
          infoWindow.open(map, marker);
          marker.infoWindow = infoWindow;
        });

        // Store the info window with the marker for later reference
        marker.infoWindow = infoWindow;

        markers.push(marker);
        bounds.extend(position);
      } catch (error) {
        console.error(`Error creating marker for car ${car.id}:`, error);
      }
    }
  });

  // Fit map to bounds if we have markers
  if (markers.length > 0) {
    map.fitBounds(bounds);

    // Don't zoom in too far
    google.maps.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 15) map.setZoom(15);
    });
  }
}

// Helper function to clear markers
function clearMarkers() {
  if (markers.length > 0) {
    markers.forEach((marker) => marker.setMap(null));
    markers = [];
  }
}

// Setup event listeners
function setupEventListeners() {
  // Sort dropdown
  if (sortSelect) {
    // Set default sort to distance
    sortSelect.value = "distance";

    sortSelect.addEventListener("change", () => {
      console.log("Sort changed to:", sortSelect.value);
      sortResults();
    });
  }

  // Filter toggle button
  if (filterToggle) {
    filterToggle.addEventListener("click", () => {
      filtersContainer.classList.toggle("show-filters");

      // Update button icon
      const icon = filterToggle.querySelector("i");
      if (filtersContainer.classList.contains("show-filters")) {
        icon.classList.remove("bi-sliders");
        icon.classList.add("bi-x-lg");
      } else {
        icon.classList.remove("bi-x-lg");
        icon.classList.add("bi-sliders");
      }
    });
  }

  // View toggle buttons
  if (mapViewButton && listViewButton) {
    mapViewButton.addEventListener("click", () => {
      showMapView();
      mapViewButton.classList.add("active");
      listViewButton.classList.remove("active");
    });

    listViewButton.addEventListener("click", () => {
      showListView();
      listViewButton.classList.add("active");
      mapViewButton.classList.remove("active");
    });
  }

  // Car type filter checkboxes
  document.querySelectorAll(".car-type-filter").forEach((filter) => {
    filter.addEventListener("change", filterResults);
  });

  // Fuel type filter checkboxes
  document.querySelectorAll(".fuel-type-filter").forEach((filter) => {
    filter.addEventListener("change", filterResults);
  });

  // Seating filter checkboxes
  document.querySelectorAll(".seating-filter").forEach((filter) => {
    filter.addEventListener("change", filterResults);
  });

  // Apply filter button
  const applyFilterBtn = document.getElementById("apply-filter");
  if (applyFilterBtn) {
    applyFilterBtn.addEventListener("click", filterResults);
  }

  // Clear filter button
  const clearFilterBtn = document.getElementById("clear-filter");
  if (clearFilterBtn) {
    clearFilterBtn.addEventListener("click", clearFilters);
  }

  // Modify search button
  const modifySearchBtn = document.getElementById("modify-search-btn");
  if (modifySearchBtn) {
    modifySearchBtn.addEventListener("click", () => {
      window.location.href = "user-dashboard.html";
    });
  }
}

// Sort results
function sortResults() {
  if (!sortSelect || !carResults.length) return;

  const sortValue = sortSelect.value;
  console.log("Sorting by:", sortValue);

  switch (sortValue) {
    case "price-asc":
      carResults.sort(
        (a, b) => (a.price_per_hour || 0) - (b.price_per_hour || 0)
      );
      break;
    case "price-desc":
      carResults.sort(
        (a, b) => (b.price_per_hour || 0) - (a.price_per_hour || 0)
      );
      break;
    case "distance":
      // Improved distance sorting - handle null/undefined values
      carResults.sort((a, b) => {
        // If either car has no distance, place it at the end
        if (a.distance === null || a.distance === undefined) return 1;
        if (b.distance === null || b.distance === undefined) return -1;

        // Otherwise sort by distance (closest first)
        return parseFloat(a.distance) - parseFloat(b.distance);
      });

      // Debug log to verify sorting
      console.log(
        "Sorted by distance:",
        carResults.map((car) => ({
          id: car.id,
          car_type: car.car_type,
          distance: car.distance ? car.distance.toFixed(2) + " km" : "unknown",
        }))
      );
      break;
    case "name-asc":
      carResults.sort((a, b) =>
        `${a.make} ${a.modelName}`.localeCompare(`${b.make} ${b.modelName}`)
      );
      break;
    default:
      // Default to distance sorting when no sort value specified
      carResults.sort((a, b) => {
        if (a.distance === null || a.distance === undefined) return 1;
        if (b.distance === null || b.distance === undefined) return -1;
        return parseFloat(a.distance) - parseFloat(b.distance);
      });
      break;
  }

  // Display sorted results
  displayResults();
}

// Filter results
function filterResults() {
  // Reset to original results
  carResults = [...originalResults];

  // Apply car type filters
  const selectedTypes = [];
  const typeCheckboxes = document.querySelectorAll(".car-type-filter:checked");
  typeCheckboxes.forEach((checkbox) => selectedTypes.push(checkbox.value));

  if (selectedTypes.length > 0) {
    carResults = carResults.filter((car) => {
      const baseCarType = car.car_type
        ? car.car_type.split("_")[0].toLowerCase()
        : "";
      return selectedTypes.some((type) =>
        baseCarType.includes(type.toLowerCase())
      );
    });
  }

  // Apply fuel type filters
  const selectedFuelTypes = [];
  const fuelCheckboxes = document.querySelectorAll(".fuel-type-filter:checked");
  fuelCheckboxes.forEach((checkbox) => selectedFuelTypes.push(checkbox.value));

  if (selectedFuelTypes.length > 0) {
    carResults = carResults.filter((car) => {
      const fuelType = car.fuel_type ? car.fuel_type.toLowerCase() : "petrol";
      return selectedFuelTypes.includes(fuelType);
    });
  }

  // Apply seating capacity filters
  const selectedSeating = [];
  const seatingCheckboxes = document.querySelectorAll(
    ".seating-filter:checked"
  );
  seatingCheckboxes.forEach((checkbox) =>
    selectedSeating.push(parseInt(checkbox.value))
  );

  if (selectedSeating.length > 0) {
    carResults = carResults.filter((car) => {
      const seatingCapacity = car.seating_capacity || 5;
      return selectedSeating.includes(seatingCapacity);
    });
  }

  // Update display
  displayResults();

  // Update map markers
  addMapMarkers();

  // Close filters on mobile after applying
  if (window.innerWidth < 768) {
    filtersContainer.classList.remove("show-filters");
    if (filterToggle && filterToggle.querySelector("i")) {
      filterToggle.querySelector("i").classList.remove("bi-x-lg");
      filterToggle.querySelector("i").classList.add("bi-sliders");
    }
  }
}

// Update the result count display
function updateResultCount() {
  const countElement = document.getElementById("result-count");
  if (countElement) {
    const count = carResults.length;
    countElement.textContent = `${count} ${count === 1 ? "car" : "cars"} found`;
  }
}

// Clear all filters
function clearFilters() {
  // Reset car type checkboxes
  document.querySelectorAll(".car-type-filter").forEach((checkbox) => {
    checkbox.checked = false;
  });

  // Reset fuel type checkboxes
  document.querySelectorAll(".fuel-type-filter").forEach((checkbox) => {
    checkbox.checked = false;
  });

  // Reset seating checkboxes
  document.querySelectorAll(".seating-filter").forEach((checkbox) => {
    checkbox.checked = false;
  });

  // Reset results to original
  carResults = [...originalResults];
  displayResults();
  addMapMarkers();

  // Update count
  updateResultCount();
}

// Switch to map view
function showMapView() {
  if (mapContainer) mapContainer.style.display = "block";
  if (carListContainer) carListContainer.style.display = "none";

  // Refresh map size (needed when map was hidden)
  if (map) {
    google.maps.event.trigger(map, "resize");

    // Recenter map
    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((marker) => {
        if (marker.getPosition) {
          bounds.extend(marker.getPosition());
        }
      });
      map.fitBounds(bounds);

      // Don't zoom in too far
      if (map.getZoom() > 15) map.setZoom(15);
    }
  }

  // Update view toggle buttons
  if (listViewButton) listViewButton.classList.remove("active");
  if (mapViewButton) mapViewButton.classList.add("active");

  // Remember view preference
  sessionStorage.setItem("preferredView", "map");
}

// Switch to list view
function showListView() {
  if (mapContainer) mapContainer.style.display = "none";
  if (carListContainer) carListContainer.style.display = "block";

  // Update view toggle buttons
  if (mapViewButton) mapViewButton.classList.remove("active");
  if (listViewButton) listViewButton.classList.add("active");

  // Remember view preference
  sessionStorage.setItem("preferredView", "list");
}

// Show loading indicator
function showLoading(isLoading) {
  if (loadingIndicator) {
    loadingIndicator.style.display = isLoading ? "flex" : "none";
  }

  if (resultsContainer) {
    resultsContainer.style.display = isLoading ? "none" : "block";
  }
}

// Show error message
function showError(message) {
  if (errorMessage) {
    const errorText = errorMessage.querySelector("p") || errorMessage;
    if (errorText) errorText.textContent = message;
    errorMessage.style.display = "flex";
  }

  if (loadingIndicator) {
    loadingIndicator.style.display = "none";
  }

  if (resultsContainer) {
    resultsContainer.style.display = "none";
  }
}

// Show no results message
function showNoResults() {
  if (noResultsMessage) {
    noResultsMessage.style.display = "flex";
  }

  if (carListContainer) {
    carListContainer.innerHTML = "";
  }

  updateResultCount();
}

// Calculate distance between two points (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
}

// Convert degrees to radians
function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// Helper function to parse car_type
function parseCarType(carType) {
  // Default values
  let make = "Unknown";
  let model = "Car";
  let color = "";

  // Parse car_type (e.g., "modely_white" -> "Tesla", "Model Y", "White")
  if (carType) {
    // Handle known car types
    if (carType.toLowerCase().includes("model")) {
      make = "Tesla";

      if (carType.toLowerCase().includes("modely")) {
        model = "Model Y";
      } else if (carType.toLowerCase().includes("model3")) {
        model = "Model 3";
      } else if (carType.toLowerCase().includes("models")) {
        model = "Model S";
      } else if (carType.toLowerCase().includes("modelx")) {
        model = "Model X";
      }
    } else if (carType.toLowerCase().includes("vezel")) {
      make = "Honda";
      model = "Vezel";
    }

    // Extract color if present
    if (carType.toLowerCase().includes("white")) {
      color = "White";
    } else if (carType.toLowerCase().includes("black")) {
      color = "Black";
    } else if (carType.toLowerCase().includes("red")) {
      color = "Red";
    } else if (carType.toLowerCase().includes("blue")) {
      color = "Blue";
    }
  }

  return { make, model, color };
}

// Add debugging function
async function debugDatabaseAndMap() {
  console.log("===== DEBUGGING DATABASE AND MAP =====");

  try {
    // Check cars in database
    const carsRef = collection(db, "cars");
    const carsSnapshot = await getDocs(carsRef);

    console.log(`Found ${carsSnapshot.size} total cars in database`);

    if (carsSnapshot.size > 0) {
      // Sample and analyze the first car
      const firstCar = carsSnapshot.docs[0].data();
      console.log("Sample car data:", firstCar);

      // Check critical properties
      console.log("Status:", firstCar.status);
      console.log("Current location:", firstCar.current_location);
      if (firstCar.current_location) {
        console.log(
          "Latitude type:",
          typeof firstCar.current_location.latitude
        );
        console.log(
          "Longitude type:",
          typeof firstCar.current_location.longitude
        );
      }
      console.log("Car type:", firstCar.car_type);
    }

    // Check map element
    const mapEl = document.getElementById("map");
    if (mapEl) {
      console.log("Map element dimensions:", {
        offsetWidth: mapEl.offsetWidth,
        offsetHeight: mapEl.offsetHeight,
        style: mapEl.style.cssText,
      });
    } else {
      console.error("Map element not found!");
    }

    console.log("===== END DEBUG =====");
  } catch (e) {
    console.error("Debug error:", e);
  }
}
