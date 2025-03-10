// user-dashboard.js
import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let userId;
let userPosition = null;
let map;
let markers = [];
let nearbyCarsList = [];

// Initialize the page
document.addEventListener("DOMContentLoaded", async () => {
  // Check if logout was requested
  if (sessionStorage.getItem("performLogout") === "true") {
    sessionStorage.removeItem("performLogout");
    try {
      await signOut(auth);
      alert("You have been logged out.");
      window.location.href = "../index.html";
      return; // Exit early
    } catch (error) {
      console.error("Error during logout:", error);
      alert("Logout failed: " + error.message);
    }
  }

  // Load header and footer
  document.getElementById("header").innerHTML = await fetch(
    "../static/headerFooter/user-header.html"
  ).then((response) => response.text());
  document.getElementById("footer").innerHTML = await fetch(
    "../static/headerFooter/user-footer.html"
  ).then((response) => response.text());

  // Check authentication
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      userId = user.uid;
      await loadUserData(userId);
      setDefaultDateTime();
      initializeSearch();
      loadNearbyCars();
      await loadActiveBookings(userId);
    } else {
      // User is signed out, redirect to login
      window.location.href = "../index.html";
    }
  });

  // Event listeners
  document.getElementById("search-btn").addEventListener("click", searchCars);
  document
    .getElementById("current-location-btn")
    .addEventListener("click", getCurrentLocation);
  document
    .getElementById("car-type-filter")
    .addEventListener("change", filterNearbyCars);

  // Setup logout functionality after header is loaded
  setupLogoutButton();
});

// Setup logout button
function setupLogoutButton() {
  setTimeout(() => {
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) {
      console.log("Logout button found, attaching event listener");
      logoutButton.addEventListener("click", async (event) => {
        event.preventDefault();
        console.log("Logout button clicked");
        try {
          await signOut(auth);
          console.log("User signed out successfully");
          window.location.href = "../index.html";
        } catch (error) {
          console.error("Error during logout:", error);
          alert("Logout failed: " + error.message);
        }
      });
    } else {
      console.log("Logout button not found. It might not be in the DOM yet.");
      // Try again after a short delay to ensure the header has loaded
      setTimeout(() => {
        const retryLogoutButton = document.getElementById("logout-button");
        if (retryLogoutButton) {
          console.log("Logout button found after delay");
          retryLogoutButton.addEventListener("click", async (event) => {
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
      }, 500);
    }
  }, 300);
}

// Set default date and time (current time rounded to next 15-minute interval)
function setDefaultDateTime() {
  console.log("Setting default date and time");

  const dateInput = document.getElementById("pickup-date");
  const hoursSelect = document.getElementById("pickup-time-hours");
  const minutesSelect = document.getElementById("pickup-time-minutes");

  // Set default date to today
  const today = new Date();
  const formattedDate = today.toISOString().split("T")[0];
  if (dateInput) {
    dateInput.value = formattedDate;
    dateInput.min = formattedDate; // Can't pick dates in the past

    // Update time when date changes
    dateInput.addEventListener("change", updateTimeOptions);
  }

  // Initialize time options right away
  updateTimeOptions();

  // Update time options based on current date
  function updateTimeOptions() {
    // Clear existing options
    if (hoursSelect) hoursSelect.innerHTML = "";
    if (minutesSelect) minutesSelect.innerHTML = "";

    const now = new Date();
    const isToday =
      dateInput && dateInput.value === now.toISOString().split("T")[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Round up to nearest 15 minutes
    const roundedMinute = Math.ceil(currentMinute / 15) * 15;
    const adjustedHour = isToday
      ? roundedMinute === 60
        ? currentHour + 1
        : currentHour
      : 0;
    const adjustedMinute = roundedMinute === 60 ? 0 : roundedMinute;

    // Add hours options
    if (hoursSelect) {
      for (let i = 0; i < 24; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.text = i.toString().padStart(2, "0");

        // Disable past hours if today
        if (isToday && i < adjustedHour) {
          option.disabled = true;
        }

        hoursSelect.appendChild(option);
      }

      // Try to select current/next hour if today
      if (isToday) {
        // Find first non-disabled option
        const availableOption = [...hoursSelect.options].find(
          (opt) => !opt.disabled
        );
        if (availableOption) {
          hoursSelect.value = availableOption.value;
        } else {
          hoursSelect.value = "0"; // Fallback
        }
      } else {
        hoursSelect.value = "9"; // Default to 9 AM for future dates
      }

      // Add change listener
      hoursSelect.addEventListener("change", updateMinuteOptions);
    }

    // Initial update of minute options
    updateMinuteOptions();
  }

  function updateMinuteOptions() {
    if (!minutesSelect || !hoursSelect) return;

    // Clear existing options
    minutesSelect.innerHTML = "";

    const now = new Date();
    const isToday =
      dateInput && dateInput.value === now.toISOString().split("T")[0];
    const selectedHour = parseInt(hoursSelect.value);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Available minute intervals
    const minuteIntervals = [0, 15, 30, 45];

    minuteIntervals.forEach((interval) => {
      const option = document.createElement("option");
      option.value = interval;
      option.text = interval.toString().padStart(2, "0");

      // Disable past times if on current hour and today
      if (
        isToday &&
        selectedHour === currentHour &&
        interval < Math.ceil(currentMinute / 15) * 15
      ) {
        option.disabled = true;
      }

      minutesSelect.appendChild(option);
    });

    // Select first non-disabled option
    const availableOption = [...minutesSelect.options].find(
      (opt) => !opt.disabled
    );
    if (availableOption) {
      minutesSelect.value = availableOption.value;
    } else if (minutesSelect.options.length > 0) {
      minutesSelect.value = minutesSelect.options[0].value; // Fallback
    }
  }
}

// Replace your existing initializeTimeSelectors function with this version
function initializeTimeSelectors(currentHour, currentMinute) {
  console.log("Initializing time selectors with:", {
    currentHour,
    currentMinute,
  });

  const hoursSelect = document.getElementById("pickup-time-hours");
  const minutesSelect = document.getElementById("pickup-time-minutes");

  if (!hoursSelect || !minutesSelect) {
    console.error("Time selectors not found in the DOM");
    return;
  }

  // Clear existing options
  hoursSelect.innerHTML = "";

  // Add hours
  for (let i = 0; i < 24; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = i.toString().padStart(2, "0");

    // If today, disable hours that have already passed
    if (isToday() && i < currentHour) {
      option.disabled = true;
    }

    hoursSelect.appendChild(option);
  }

  // Set current hour if available and valid
  if (currentHour !== null && currentHour >= 0 && currentHour < 24) {
    hoursSelect.value = currentHour;
  }

  // Update minutes options based on selected hour
  updateMinutesOptions(minutesSelect, parseInt(hoursSelect.value));

  // Set up event listener for hour change
  hoursSelect.addEventListener("change", () => {
    updateMinutesOptions(minutesSelect, parseInt(hoursSelect.value));
  });
}

// Replace your updateMinutesOptions function with this version
function updateMinutesOptions(minutesSelect, selectedHour) {
  console.log("Updating minutes options for hour:", selectedHour);

  if (!minutesSelect) {
    console.error("Minutes select element not found");
    return;
  }

  // Clear existing options
  minutesSelect.innerHTML = "";

  // Get current time if today
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Minute intervals (0, 15, 30, 45)
  const minuteIntervals = [0, 15, 30, 45];

  minuteIntervals.forEach((minute) => {
    // If today and selected hour is current hour, disable minutes that have passed
    const shouldDisable =
      isToday() && selectedHour === currentHour && minute <= currentMinute;

    const option = document.createElement("option");
    option.value = minute;
    option.textContent = minute.toString().padStart(2, "0");
    option.disabled = shouldDisable;

    minutesSelect.appendChild(option);
  });

  // Select first non-disabled option
  const firstValidOption = [...minutesSelect.options].find(
    (option) => !option.disabled
  );
  if (firstValidOption) {
    minutesSelect.value = firstValidOption.value;
  }
}

// Helper function to check if the selected date is today
function isToday() {
  const today = new Date().toISOString().split("T")[0];
  const selectedDate = document.getElementById("pickup-date")?.value;
  return selectedDate === today;
}

// Modify the updateTimeBasedOnDate function to handle date changes
function updateTimeBasedOnDate() {
  console.log("Updating time options based on date");

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const roundedMinute = Math.ceil(currentMinute / 15) * 15;
  const adjustedHour = roundedMinute === 60 ? currentHour + 1 : currentHour;
  const adjustedMinute = roundedMinute === 60 ? 0 : roundedMinute;

  initializeTimeSelectors(
    isToday() ? adjustedHour : 0,
    isToday() ? adjustedMinute : 0
  );
}

// Load user data
async function loadUserData(userId) {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));

    if (userDoc.exists()) {
      const userData = userDoc.data();

      // Update user name display
      const userNameElement = document.getElementById("user-name");
      if (userNameElement) {
        userNameElement.textContent = userData.firstName || "User";
      }
    }
  } catch (error) {
    console.error("Error loading user data:", error);
  }
}

// Load active bookings
async function loadActiveBookings(userId) {
  try {
    // Get references to DOM elements
    const bookingsContainer = document.getElementById("active-bookings-list");
    if (!bookingsContainer) return;

    // Show loading state
    bookingsContainer.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Loading your bookings...</p></div>';

    // Get current timestamp
    const now = new Date();

    // Query for active and upcoming bookings across all cars
    const allBookings = [];

    // Fetch all cars first
    const carsSnapshot = await getDocs(collection(db, "cars"));

    // Get bookings for each car
    const bookingPromises = carsSnapshot.docs.map(async (carDoc) => {
      const carId = carDoc.id;

      // Query for bookings for this car
      const bookingsRef = collection(db, "timesheets", carId, "bookings");
      const bookingsQuery = query(
        bookingsRef,
        where("user_id", "==", userId),
        where("status", "in", ["active", "upcoming"]),
        where("end_time", ">=", now)
      );

      const carBookingsSnapshot = await getDocs(bookingsQuery);
      return Promise.all(
        carBookingsSnapshot.docs.map(async (bookingDoc) => {
          const bookingData = bookingDoc.data();
          return {
            id: bookingDoc.id,
            carId: carId,
            ...bookingData,
          };
        })
      );
    });

    // Wait for all booking promises to resolve
    const bookingsArrays = await Promise.all(bookingPromises);

    // Flatten the arrays into a single bookings array
    const bookings = bookingsArrays.flat();

    // Get reference to the active bookings container
    const activeBookingsContainer = document.getElementById(
      "active-bookings-container"
    );

    // If no active bookings were found
    if (bookings.length === 0) {
      activeBookingsContainer.innerHTML = "";
      activeBookingsContainer.appendChild(createNoBookingsMessage());
      return;
    }

    // Sort bookings by start time
    bookings.sort((a, b) => {
      return a.start_time.seconds - b.start_time.seconds;
    });

    // Clear the container
    activeBookingsContainer.innerHTML = "";

    // Create and append booking elements
    for (const booking of bookings) {
      // Get car details for this booking
      const carDetails = await getCarDetails(booking.carId);

      // Create booking element
      const bookingElement = createBookingElement({
        ...booking,
        car: carDetails,
      });

      // Append to container
      activeBookingsContainer.appendChild(bookingElement);
    }
  } catch (error) {
    console.error("Error loading active bookings:", error);

    // Get reference to the active bookings container
    const activeBookingsContainer = document.getElementById(
      "active-bookings-container"
    );

    // Show error state
    activeBookingsContainer.innerHTML = `
                        <div class="error-state">
                            <i class="bi bi-exclamation-triangle"></i>
                            <p>Failed to load your bookings. Please try again.</p>
                        </div>
                    `;
  }
}

// Create booking card element
function createBookingElement(booking) {
  // Create booking card container
  const bookingCard = document.createElement("div");
  bookingCard.className = "booking-card";

  // Determine booking status class
  let statusClass = "status-upcoming";
  let statusText = "Upcoming";

  if (booking.status === "active") {
    statusClass = "status-ongoing";
    statusText = "In Progress";
  }

  // Format dates and times
  const startDate = new Date(booking.start_time.seconds * 1000);
  const endDate = new Date(booking.end_time.seconds * 1000);

  const formattedStartDate = startDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const formattedStartTime = startDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const formattedEndTime = endDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Calculate time remaining for ongoing bookings
  let timeRemainingDisplay = "";
  if (booking.status === "active") {
    const now = new Date();
    const timeRemaining = endDate - now;

    if (timeRemaining > 0) {
      const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor(
        (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
      );
      timeRemainingDisplay = `${hoursRemaining}h ${minutesRemaining}m remaining`;
    } else {
      timeRemainingDisplay = "Ending soon";
    }
  }

  // Get car info with fallbacks
  const carInfo = booking.car || {};
  const carImage =
    carInfo.image || "../static/assets/images/car-placeholder.jpg";
  const carAddress = carInfo.address || "Location not available";

  // Create the card content
  bookingCard.innerHTML = `
                    <div class="booking-status ${statusClass}">
                        <div class="status-dot"></div>
                        <div class="status-text">${statusText}</div>
                        ${
                          timeRemainingDisplay
                            ? `<div class="time-remaining">${timeRemainingDisplay}</div>`
                            : ""
                        }
                    </div>
                    <div class="booking-content">
                        <div class="car-image">
                            <img src="${carImage}" alt="Car" onerror="this.src='../static/assets/images/car-placeholder.jpg';">
                        </div>
                        <div class="booking-details">
                            <h3 class="booking-title">${carInfo.make || ""} ${
    carInfo.modelName || "Car"
  }</h3>
                            <div class="booking-meta">
                                <div class="booking-time">
                                    <i class="bi bi-calendar-event"></i>
                                    <div>
                                        <div>${formattedStartDate}</div>
                                        <div>${formattedStartTime} - ${formattedEndTime}</div>
                                    </div>
                                </div>
                                <div class="booking-location">
                                    <i class="bi bi-geo-alt"></i>
                                    <span>${carAddress}</span>
                                </div>
                            </div>
                            <div class="booking-action">
                                <a href="user-booking-details.html?id=${
                                  booking.id
                                }&carId=${
    booking.carId
  }" class="primary-btn sm">
                                    View Details <i class="bi bi-arrow-right"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                `;

  return bookingCard;
}

// Create no bookings message
function createNoBookingsMessage() {
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.innerHTML = `
                    <i class="bi bi-calendar-x"></i>
                    <p>You don't have any active bookings</p>
                    <button class="primary-btn" onclick="window.location.href='#quick-search'">
                        <i class="bi bi-search"></i> Find a Car
                    </button>
                `;
  return emptyState;
}

// Get car details
async function getCarDetails(carId) {
  try {
    const carDoc = await getDoc(doc(db, "cars", carId));
    if (carDoc.exists()) {
      const carData = carDoc.data();

      // Parse car type to extract make and model
      const parsedCarType = parseCarType(carData.car_type || "");

      return {
        id: carId,
        ...carData,
        make: parsedCarType.make,
        modelName: parsedCarType.model,
        image: `../static/images/car_images/${carData.car_type || "car"}.png`,
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting car details:", error);
    return null;
  }
}

// Initialize search functionality
function initializeSearch() {
  // Initialize Google Places Autocomplete
  const input = document.getElementById("location-input");
  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "sg" },
    fields: ["address_components", "geometry", "name"],
    types: ["geocode"],
  });

  // Prevent form submission on Enter key
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  });

  // Store location when place is selected
  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();

    if (!place.geometry) {
      input.placeholder = "Enter a location";
      return;
    }

    // Store the selected position
    userPosition = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };

    // Center map on the selected location and update nearby cars
    if (map) {
      map.setCenter(userPosition);
      loadNearbyCars();
    }
  });

  // Setup form validation
  setupFormValidation();
}

// Setup validation for the search form
function setupFormValidation() {
  // Get form elements
  const searchForm = document.querySelector(".search-form");
  const locationInput = document.getElementById("location-input");
  const pickupDate = document.getElementById("pickup-date");
  const pickupTimeHours = document.getElementById("pickup-time-hours");
  const pickupTimeMinutes = document.getElementById("pickup-time-minutes");
  const durationDays = document.getElementById("duration-days");
  const durationHours = document.getElementById("duration-hours");
  const durationMinutes = document.getElementById("duration-minutes");

  // Add event listeners for input validation
  [durationDays, durationHours, durationMinutes].forEach((input) => {
    input.addEventListener("change", () => {
      const totalMinutes =
        parseInt(durationDays.value) * 24 * 60 +
        parseInt(durationHours.value) * 60 +
        parseInt(durationMinutes.value);

      if (totalMinutes <= 0) {
        alert("Please select a duration greater than 0 minutes.");
        durationHours.value = "1"; // Default to 1 hour
      }
    });
  });

  // Update time options when date changes
  pickupDate.addEventListener("change", updateTimeBasedOnDate);

  // Relate minutes options to the selected hour
  pickupTimeHours.addEventListener("change", () => {
    updateMinutesOptions(pickupTimeMinutes, pickupTimeHours.value);
  });
}

// Search for cars based on the form inputs
function searchCars() {
  const locationInput = document.getElementById("location-input").value;
  const pickupDate = document.getElementById("pickup-date").value;
  const pickupHours = document.getElementById("pickup-time-hours").value;
  const pickupMinutes = document.getElementById("pickup-time-minutes").value;
  const durationDays = document.getElementById("duration-days").value;
  const durationHours = document.getElementById("duration-hours").value;
  const durationMinutes = document.getElementById("duration-minutes").value;

  if (!locationInput || !pickupDate) {
    alert("Please fill in all required fields to search for cars.");
    return;
  }

  // Calculate total duration in minutes
  const totalDuration =
    parseInt(durationDays) * 24 * 60 +
    parseInt(durationHours) * 60 +
    parseInt(durationMinutes);

  if (totalDuration <= 0) {
    alert("Please select a valid duration.");
    return;
  }

  // Format time for storage
  const formattedTime = `${pickupHours
    .toString()
    .padStart(2, "0")}:${pickupMinutes.toString().padStart(2, "0")}`;

  // Calculate start and end times for booking
  const startDateTime = new Date(`${pickupDate}T${formattedTime}`);
  const endDateTime = new Date(startDateTime.getTime() + totalDuration * 60000);

  // Store search parameters in session storage
  const searchParams = {
    location: locationInput,
    pickupDate,
    pickupHours,
    pickupMinutes,
    formattedTime,
    durationDays,
    durationHours,
    durationMinutes,
    totalDurationMinutes: totalDuration,
    startDateTime: startDateTime.toISOString(),
    endDateTime: endDateTime.toISOString(),
  };

  sessionStorage.setItem("carSearchParams", JSON.stringify(searchParams));

  // If we have user position from the map, store that too
  if (userPosition) {
    sessionStorage.setItem("userMapPosition", JSON.stringify(userPosition));
  }

  // Navigate to search results page
  window.location.href = "user-search-results.html";
}

// Get current location
function getCurrentLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Store the user position
        userPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Try to get address from coordinates
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: userPosition }, (results, status) => {
          if (status === "OK" && results[0]) {
            document.getElementById("location-input").value =
              results[0].formatted_address;
          }
        });

        // Center map on user position and load nearby cars
        if (map) {
          map.setCenter(userPosition);
          loadNearbyCars();
        } else {
          loadNearbyCars();
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert(
          "Could not get your location. Please make sure location services are enabled."
        );
      }
    );
  } else {
    alert("Geolocation is not supported by your browser.");
  }
}

// Add this debug function to your code
async function debugDatabaseAndMap() {
  console.log("===== DEBUGGING DATABASE AND MAP =====");

  try {
    // Check if map element exists
    const mapEl = document.getElementById("map");
    console.log("Map element exists:", !!mapEl);
    if (mapEl) {
      console.log("Map dimensions:", {
        offsetWidth: mapEl.offsetWidth,
        offsetHeight: mapEl.offsetHeight,
        style: mapEl.style.cssText,
      });
    }

    // Check if the database has cars
    const carsRef = collection(db, "cars");
    const carsSnapshot = await getDocs(carsRef);

    console.log(`Found ${carsSnapshot.size} total cars in database`);

    // Log each car
    carsSnapshot.docs.forEach((doc, i) => {
      const car = doc.data();
      console.log(`Car ${i + 1} (ID: ${doc.id})`, {
        status: car.status,
        location: car.current_location,
        car_type: car.car_type,
      });

      // Check if car should be displayed
      const shouldShow =
        car.status &&
        car.status.toLowerCase() === "available" &&
        car.current_location &&
        typeof car.current_location.latitude === "number" &&
        typeof car.current_location.longitude === "number";

      console.log(`Should car ${doc.id} show up? ${shouldShow ? "YES" : "NO"}`);
    });

    console.log("===== END DEBUG =====");
  } catch (e) {
    console.error("Debug error:", e);
  }
}

// Replace loadNearbyCars with this version
async function loadNearbyCars() {
  console.log("Loading nearby cars...");
  const nearbyCarsContainer = document.getElementById("nearby-cars");

  try {
    // Debug the database first
    await debugDatabaseAndMap();

    // Show loading state
    nearbyCarsContainer.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Finding cars near you...</p></div>';

    // Get all available cars
    const carsSnapshot = await getDocs(collection(db, "cars"));

    if (carsSnapshot.empty) {
      console.log("No cars found in database");
      nearbyCarsContainer.innerHTML =
        '<div class="empty-state"><i class="bi bi-car-front"></i><p>No cars available at the moment</p></div>';
      return;
    }

    console.log(`Found ${carsSnapshot.size} cars in database`);

    // Process cars
    nearbyCarsList = [];
    let availableCount = 0;
    let withLocationCount = 0;

    // Process each car
    for (const carDoc of carsSnapshot.docs) {
      const carData = carDoc.data();
      console.log(`Processing car ${carDoc.id}:`, carData);

      // Check if status is "available" (case-insensitive)
      if (carData.status && carData.status.toLowerCase() === "available") {
        availableCount++;
        console.log(`Car ${carDoc.id} is available`);

        // Check if car has valid location data
        if (
          carData.current_location &&
          typeof carData.current_location.latitude === "number" &&
          typeof carData.current_location.longitude === "number"
        ) {
          withLocationCount++;
          console.log(
            `Car ${carDoc.id} has valid location:`,
            carData.current_location
          );

          // Extract car info from car_type
          const carTypeInfo = parseCarType(carData.car_type || "");

          // Calculate distance if user position is available
          let distance = null;
          if (userPosition) {
            distance = calculateDistance(
              userPosition.lat,
              userPosition.lng,
              carData.current_location.latitude,
              carData.current_location.longitude
            );
          }

          // Add car to display list with required fields
          nearbyCarsList.push({
            id: carDoc.id,
            ...carData,
            make: carTypeInfo.make,
            modelName: carTypeInfo.model,
            image: `../static/assets/images/car_images/${
              carData.car_type || "car"
            }.png`,
            distance: distance,
          });

          console.log(`Added car ${carDoc.id} to display list`);
        } else {
          console.warn(
            `Car ${carDoc.id} missing valid location data:`,
            carData.current_location
          );
        }
      } else {
        console.log(
          `Car ${carDoc.id} is not available. Status: ${carData.status}`
        );
      }
    }

    console.log(`Found ${availableCount} available cars`);
    console.log(`Found ${withLocationCount} available cars with location data`);
    console.log(`Added ${nearbyCarsList.length} cars to display list`);

    // Sort cars by distance if available
    if (nearbyCarsList.some((car) => car.distance !== null)) {
      nearbyCarsList.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    // Clear container
    nearbyCarsContainer.innerHTML = "";

    // If no available cars were found
    if (nearbyCarsList.length === 0) {
      console.log("No available cars with valid location data found");
      nearbyCarsContainer.innerHTML =
        '<div class="empty-state"><i class="bi bi-car-front"></i><p>No available cars found nearby</p></div>';
    } else {
      // Display cars
      nearbyCarsList.forEach((car) => {
        const carElement = createCarElement(car);
        nearbyCarsContainer.appendChild(carElement);
      });

      // Force map to display after a short delay
      setTimeout(() => {
        // Initialize map with car locations
        console.log("Initializing map with", nearbyCarsList.length, "cars");
        initializeMap(nearbyCarsList);
      }, 500);
    }
  } catch (error) {
    console.error("Error loading cars:", error);
    nearbyCarsContainer.innerHTML =
      '<div class="error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load cars. Please try again.</p></div>';
  }
}

// Make sure the map has height
function initializeMap(cars) {
  console.log("Initializing map with cars:", cars);

  // Force map dimensions first
  const mapElement = document.getElementById("map");
  if (!mapElement) {
    console.error("Map element not found");
    return;
  }

  // CRITICAL: Set explicit height
  mapElement.style.height = "400px";
  console.log("Set map height to 400px");

  // Rest of your map initialization code...
  // [Keep the existing initializeMap code, but add the style.height above]
}

// Helper function to parse car_type into make and model
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

// Create car element
function createCarElement(car) {
  const carEl = document.createElement("div");
  carEl.className = "car-card";

  // Get raw car type (without color)
  const baseCarType = car.car_type ? car.car_type.split("_")[0] : "unknown";
  carEl.dataset.type = baseCarType.toLowerCase();

  // Prepare distance display
  let distanceDisplay = "";
  if (car.distance !== null) {
    distanceDisplay = `<span class="car-distance"><i class="bi bi-geo"></i> ${car.distance.toFixed(
      1
    )} km</span>`;
  }

  // Prepare price display
  const priceDisplay = car.price_per_hour
    ? `$${car.price_per_hour.toFixed(2)}/hour`
    : "";

  // Create HTML content
  carEl.innerHTML = `
                    <div class="car-image">
                        <img src="${car.image}" alt="${car.make} ${
    car.modelName
  }" onerror="this.src='../static/assets/images/car-placeholder.jpg';">
                    </div>
                    <div class="car-info">
                        <div class="car-header">
                            <h3>${car.make} ${car.modelName}</h3>
                            <div class="car-type-badge">${
                              baseCarType || "Standard"
                            }</div>
                        </div>
                        <div class="car-meta">
                            ${distanceDisplay}
                            <span class="car-price">${priceDisplay}</span>
                        </div>
                        <p class="car-location">
                            <i class="bi bi-geo-alt"></i> 
                            ${car.address || "Location not available"}
                        </p>
                        <a href="user-car-details.html?id=${
                          car.id
                        }" class="view-details-btn">
                            View Details <i class="bi bi-arrow-right"></i>
                        </a>
                    </div>
                `;

  return carEl;
}

// Modified initializeMap function
function initializeMap(cars) {
  console.log("Initializing map with cars:", cars);

  // Check if the map element exists and is visible
  const mapElement = document.getElementById("map");
  if (!mapElement) {
    console.error("Map element not found");
    return;
  }

  // Force dimensions if needed
  if (mapElement.offsetWidth === 0 || mapElement.offsetHeight === 0) {
    console.log("Map container has zero dimensions. Setting height.");
    mapElement.style.height = "400px";
  }

  // Default center (Singapore)
  let mapCenter = { lat: 1.3521, lng: 103.8198 };

  // Try to use user position or first valid car position
  if (
    userPosition &&
    typeof userPosition.lat === "number" &&
    typeof userPosition.lng === "number"
  ) {
    mapCenter = userPosition;
  } else if (cars && cars.length > 0) {
    // Find first car with valid location
    const carWithLocation = cars.find(
      (car) =>
        car.current_location &&
        typeof car.current_location.latitude === "number" &&
        typeof car.current_location.longitude === "number"
    );

    if (carWithLocation) {
      mapCenter = {
        lat: carWithLocation.current_location.latitude,
        lng: carWithLocation.current_location.longitude,
      };
    }
  }

  // Ensure the map center is valid
  if (
    typeof mapCenter.lat !== "number" ||
    typeof mapCenter.lng !== "number" ||
    isNaN(mapCenter.lat) ||
    isNaN(mapCenter.lng)
  ) {
    console.error("Invalid map center:", mapCenter);
    mapCenter = { lat: 1.3521, lng: 103.8198 }; // Default to Singapore
  }

  console.log("Map center will be:", mapCenter);

  // Clear existing markers if any
  if (markers && markers.length > 0) {
    console.log("Clearing", markers.length, "existing markers");
    markers.forEach((marker) => marker.setMap(null));
  }
  markers = [];

  // Initialize map if not already
  if (!map) {
    console.log("Creating new map instance");
    try {
      map = new google.maps.Map(mapElement, {
        center: mapCenter,
        zoom: 13,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });
      console.log("Map created successfully");
    } catch (error) {
      console.error("Error creating map:", error);
      return;
    }
  } else {
    console.log("Reusing existing map instance");
    map.setCenter(mapCenter);
  }

  // Ensure Google Maps API is fully loaded
  if (!google || !google.maps) {
    console.error("Google Maps API not loaded");
    return;
  }

  // Add user location marker if available
  if (userPosition) {
    console.log("Adding user marker at:", userPosition);
    try {
      const userMarker = new google.maps.Marker({
        position: userPosition,
        map: map,
        title: "Your Location",
        icon: {
          url: "../static/assets/images/user-marker.png",
          scaledSize: new google.maps.Size(32, 32),
        },
        zIndex: 1000, // Keep user marker on top
      });
      markers.push(userMarker);
    } catch (error) {
      console.error("Error adding user marker:", error);
    }
  }

  // Delay adding car markers slightly to ensure map is ready
  setTimeout(() => {
    // Add markers for each car
    console.log("Adding markers for", cars.length, "cars");

    cars.forEach((car, index) => {
      if (
        car.current_location &&
        typeof car.current_location.latitude === "number" &&
        typeof car.current_location.longitude === "number"
      ) {
        const position = {
          lat: car.current_location.latitude,
          lng: car.current_location.longitude,
        };

        console.log(`Adding marker for car ${car.id || index} at:`, position);

        try {
          const marker = new google.maps.Marker({
            position: position,
            map: map,
            title: `${car.make || ""} ${
              car.modelName || car.car_type || "Car"
            }`,
            icon: {
              url: "../static/assets/images/car-marker.png",
              scaledSize: new google.maps.Size(32, 32),
            },
          });

          // Store car ID with marker for filtering
          marker.userData = {
            carId: car.id,
            type: "car",
          };

          // Info window for the marker
          const infoWindow = new google.maps.InfoWindow({
            content: `
                                        <div class="map-info-window">
                                            <h4>${car.make || ""} ${
              car.modelName || car.car_type || "Car"
            }</h4>
                                            <p>${
                                              car.address ||
                                              "Location not available"
                                            }</p>
                                            <a href="user-car-details.html?id=${
                                              car.id
                                            }" class="info-window-link">View Details</a>
                                        </div>
                                    `,
          });

          marker.addListener("click", () => {
            infoWindow.open(map, marker);
          });

          markers.push(marker);
        } catch (error) {
          console.error(
            `Error adding marker for car ${car.id || index}:`,
            error
          );
        }
      } else {
        console.warn(
          `Car ${car.id || index} has invalid location:`,
          car.current_location
        );
      }
    });

    // If we have markers, fit the map to show all of them
    if (markers.length > 0) {
      try {
        const bounds = new google.maps.LatLngBounds();
        markers.forEach((marker) => {
          if (marker.getPosition) {
            bounds.extend(marker.getPosition());
          }
        });

        map.fitBounds(bounds);

        // Limit zoom level
        google.maps.event.addListenerOnce(map, "idle", () => {
          if (map.getZoom() > 15) map.setZoom(15);
        });

        console.log("Map bounds set to show all markers");
      } catch (error) {
        console.error("Error setting map bounds:", error);
      }
    } else {
      console.warn("No markers to show on map");
    }
  }, 500); // Short delay to ensure map is ready
}

// Filter nearby cars by type
function filterNearbyCars() {
  const filterValue = document
    .getElementById("car-type-filter")
    .value.toLowerCase();
  const carCards = document.querySelectorAll("#nearby-cars .car-card");

  carCards.forEach((card) => {
    const cardType = card.dataset.type;

    if (filterValue === "all" || cardType === filterValue) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });

  // Also filter map markers
  if (map && markers.length > 0) {
    // Filter visible cars
    const visibleCars =
      filterValue === "all"
        ? nearbyCarsList
        : nearbyCarsList.filter((car) => {
            const baseCarType = car.car_type
              ? car.car_type.split("_")[0].toLowerCase()
              : "";
            return baseCarType === filterValue;
          });

    // Clear existing markers
    markers.forEach((marker) => marker.setMap(null));
    markers = [];

    // Add user location marker if available
    if (userPosition) {
      const userMarker = new google.maps.Marker({
        position: userPosition,
        map: map,
        title: "Your Location",
        icon: {
          url: "../static/assets/images/user-marker.png",
          scaledSize: new google.maps.Size(32, 32),
        },
        zIndex: 1000,
      });
      markers.push(userMarker);
    }

    // Add markers for filtered cars
    const bounds = new google.maps.LatLngBounds();
    if (userPosition) bounds.extend(userPosition);

    visibleCars.forEach((car) => {
      if (car.current_location) {
        const position = {
          lat: car.current_location.latitude,
          lng: car.current_location.longitude,
        };

        const marker = new google.maps.Marker({
          position: position,
          map: map,
          title: `${car.make} ${car.modelName}`,
          icon: {
            url: "../static/assets/images/car-marker.png",
            scaledSize: new google.maps.Size(32, 32),
          },
        });

        markers.push(marker);

        // Info window for the marker
        const infoWindow = new google.maps.InfoWindow({
          content: `
                                    <div class="map-info-window">
                                        <h4>${car.make} ${car.modelName}</h4>
                                        <p>${
                                          car.address ||
                                          "Location not available"
                                        }</p>
                                        <a href="user-car-details.html?id=${
                                          car.id
                                        }" class="info-window-link">View Details</a>
                                    </div>
                                `,
        });

        marker.addListener("click", () => {
          infoWindow.open(map, marker);
        });

        bounds.extend(position);
      }
    });

    // If we have markers, fit the map to their bounds
    if (markers.length > 1) {
      // More than just the user marker
      map.fitBounds(bounds);
    }
  }
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

// Function to get available booking time slots for a car
async function getAvailableTimeSlots(carId, selectedDate) {
  try {
    // Convert selected date to Date objects for start and end of day
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all bookings for this car on the selected date
    const bookingsRef = collection(db, "timesheets", carId, "bookings");
    const bookingsQuery = query(
      bookingsRef,
      where("start_time", "<=", endOfDay),
      where("end_time", ">=", startOfDay),
      where("status", "!=", "cancelled")
    );

    const bookingsSnapshot = await getDocs(bookingsQuery);

    // Convert bookings to a more manageable format with JS Date objects
    const bookings = bookingsSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          start: new Date(data.start_time.seconds * 1000),
          end: new Date(data.end_time.seconds * 1000),
          status: data.status,
        };
      })
      .sort((a, b) => a.start - b.start); // Sort by start time

    // Current time (rounded up to nearest 15 minutes)
    const now = new Date();
    const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
    now.setMinutes(roundedMinutes);
    now.setSeconds(0);
    now.setMilliseconds(0);

    // Calculate available time slots
    const timeSlots = [];

    // If there are no bookings, the entire day is available (from now if today)
    if (bookings.length === 0) {
      const startTime = startOfDay < now ? new Date(now) : new Date(startOfDay);
      timeSlots.push({
        start: startTime,
        end: new Date(endOfDay),
      });
    } else {
      // Check for slot before first booking
      const firstBookingStart = new Date(
        bookings[0].start.getTime() - 15 * 60000
      ); // 15 mins before first booking
      if (startOfDay < firstBookingStart) {
        const slotStart =
          startOfDay < now ? new Date(now) : new Date(startOfDay);
        if (slotStart < firstBookingStart) {
          timeSlots.push({
            start: slotStart,
            end: firstBookingStart,
          });
        }
      }

      // Check for slots between bookings
      for (let i = 0; i < bookings.length - 1; i++) {
        const currentBookingEnd = new Date(
          bookings[i].end.getTime() + 15 * 60000
        ); // 15 mins after booking ends
        const nextBookingStart = new Date(
          bookings[i + 1].start.getTime() - 15 * 60000
        ); // 15 mins before next booking

        if (currentBookingEnd < nextBookingStart) {
          const slotStart =
            currentBookingEnd < now ? new Date(now) : currentBookingEnd;
          if (slotStart < nextBookingStart) {
            timeSlots.push({
              start: slotStart,
              end: nextBookingStart,
            });
          }
        }
      }

      // Check for slot after last booking
      const lastBookingEnd = new Date(
        bookings[bookings.length - 1].end.getTime() + 15 * 60000
      ); // 15 mins after last booking
      if (lastBookingEnd < endOfDay) {
        const slotStart = lastBookingEnd < now ? new Date(now) : lastBookingEnd;
        timeSlots.push({
          start: slotStart,
          end: new Date(endOfDay),
        });
      }
    }

    return timeSlots;
  } catch (error) {
    console.error("Error getting available time slots:", error);
    return [];
  }
}
