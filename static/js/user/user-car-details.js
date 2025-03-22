// user-car-details.js
import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize global variables
let userId;
let carId;
let carData;
let map;
let marker;
let hourlyRate = 15.0; // Default price
let searchParams; // To store parameters passed from dashboard

// DOM Elements
const loadingIndicator = document.getElementById("loading-indicator");
const errorMessage = document.getElementById("error-message");
const contentContainer = document.getElementById("car-details-content");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Car details page loaded");

  try {
    // Load header and footer
    await loadHeaderFooter();

    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          userId = user.uid;
          console.log("User authenticated:", userId);

          // Get car ID from URL
          const urlParams = new URLSearchParams(window.location.search);
          carId = urlParams.get("id");
          console.log("Car ID from URL:", carId);

          if (!carId) {
            showError("No car specified. Please go back and select a car.");
            return;
          }

          // Show loading state
          showLoading(true);

          // Load car details
          await loadCarDetails();

          // Initialize date and time pickers
          initializeDateTimePickers();

          // Import search parameters from dashboard
          importDashboardSearchParams();

          // Update booking summary initial calculation
          await updateBookingSummary();

          // Check initial availability
          await updateAvailabilityStatus();

          // Set up event listeners
          setupEventListeners();

          // Hide loading indicator
          showLoading(false);
        } catch (error) {
          console.error("Error initializing car details page:", error);
          showError("Failed to load car details: " + error.message);
        }
      } else {
        // Redirect to login if not authenticated
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("Initialization error:", error);
    showError("An error occurred while loading the page.");
  }
});

// Load header and footer with better error handling
async function loadHeaderFooter() {
  try {
    const headerResponse = await fetch(
      "../static/headerFooter/user-header.html"
    );
    if (!headerResponse.ok)
      throw new Error(`Failed to load header: ${headerResponse.status}`);
    document.getElementById("header").innerHTML = await headerResponse.text();

    const footerResponse = await fetch(
      "../static/headerFooter/user-footer.html"
    );
    if (!footerResponse.ok)
      throw new Error(`Failed to load footer: ${footerResponse.status}`);
    document.getElementById("footer").innerHTML = await footerResponse.text();

    // Setup logout button
    setupLogoutButton();
  } catch (error) {
    console.error("Error loading header/footer:", error);
    // Don't fail completely, just log the error
  }
}

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

// Show/hide loading state
function showLoading(isLoading) {
  if (loadingIndicator) {
    loadingIndicator.style.display = isLoading ? "flex" : "none";
  }

  if (contentContainer) {
    contentContainer.style.display = isLoading ? "none" : "block";
  }
}

// Show error message
function showError(message) {
  console.error(message);

  if (errorMessage) {
    const errorText = errorMessage.querySelector("p") || errorMessage;
    if (errorText) errorText.textContent = message;
    errorMessage.style.display = "block";
  }

  if (loadingIndicator) {
    loadingIndicator.style.display = "none";
  }

  if (contentContainer) {
    contentContainer.style.display = "none";
  }
}

// Load car details from Firestore
async function loadCarDetails() {
  try {
    console.log("Loading car details for ID:", carId);

    // Get car document
    const carDoc = await getDoc(doc(db, "cars", carId));

    if (!carDoc.exists()) {
      console.error("Car not found in database");
      throw new Error("Car not found. It may have been removed.");
    }

    // Store car data
    carData = carDoc.data();
    carData.id = carId;
    console.log("Car data loaded:", carData);

    // Parse car type for better display
    const carInfo = parseCarType(carData.car_type || "");
    carData.make = carInfo.make;
    carData.model = carInfo.model;
    carData.color = carInfo.color;

    // Update price if available in car data
    if (carData.price_per_hour) {
      hourlyRate = parseFloat(carData.price_per_hour);
    }

    // Update UI with car details
    updateCarDetailsUI();

    // Initialize map if car has location
    if (carData.current_location) {
      setTimeout(() => initMap(), 500);
    }

    return carData;
  } catch (error) {
    console.error("Error loading car details:", error);
    throw error;
  }
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

// Update UI with car details
function updateCarDetailsUI() {
  // Get car plate element and display it prominently
  const carPlateElement = document.getElementById("car-plate");
  if (carPlateElement) {
    // Use the correct field name: license_plate
    carPlateElement.textContent = carData.license_plate || "PLATE NA";
  }

  // Get car name element
  const carNameElement = document.getElementById("car-name");
  if (carNameElement) {
    carNameElement.textContent = `${carData.make} ${carData.model}`;
  }

  // Get car type badge element
  const carTypeBadge = document.getElementById("car-type");
  if (carTypeBadge) {
    carTypeBadge.textContent = carData.car_type?.split("_")[0] || "Car";
  }

  // Set car image based on type with fallback paths
  const carImageElement = document.getElementById("car-main-image");
  if (carImageElement) {
    // Try to load the car image with various path options
    carImageElement.src = `../static/images/car_images/${
      carData.car_type || "car"
    }.png`;
    carImageElement.onerror = () => {
      // First fallback
      carImageElement.src = `../static/images/assets/${
        carData.car_type || "car"
      }.png`;
      carImageElement.onerror = () => {
        // Second fallback
        carImageElement.src = "../static/images/assets/car-placeholder.jpg";
      };
    };
  }

  // Set car address
  const carAddressElement = document.getElementById("car-address");
  if (carAddressElement) {
    carAddressElement.textContent = carData.address || "Location not available";
  }

  // Set car color
  const carColorElement = document.getElementById("car-color");
  if (carColorElement) {
    carColorElement.textContent = carData.color || "Not specified";
  }

  // Set car seats
  const carSeatsElement = document.getElementById("car-seats");
  if (carSeatsElement) {
    carSeatsElement.textContent = carData.seating_capacity || "5";
  }

  // Set car fuel type
  const carFuelElement = document.getElementById("car-fuel");
  if (carFuelElement) {
    carFuelElement.textContent = carData.fuel_type || "Not specified";
  }

  // Set small luggage capacity
  const smallLuggageElement = document.getElementById("small-luggage");
  if (smallLuggageElement) {
    smallLuggageElement.textContent = carData.small_luggage || "0";
  }

  // Set big luggage capacity
  const bigLuggage = document.getElementById("big-luggage");
  if (bigLuggage) {
    // Changed from big_luggage to large_luggage to match database
    bigLuggage.textContent =
      carData.large_luggage !== undefined
        ? carData.large_luggage.toString()
        : "0";
  }

  // Set price
  const carPriceElement = document.getElementById("car-price");
  if (carPriceElement) {
    carPriceElement.textContent = hourlyRate.toFixed(2);
  }

  const summaryTotalElement = document.getElementById("summary-total");
  if (summaryTotalElement) {
    summaryTotalElement.textContent = hourlyRate.toFixed(2);
  }

  // Disable booking button if car not available
  const bookNowBtn = document.getElementById("book-now-btn");
  const proceedBookingBtn = document.getElementById("proceed-booking-btn");

  if ((bookNowBtn || proceedBookingBtn) && carData.status !== "available") {
    if (bookNowBtn) {
      bookNowBtn.disabled = true;
      bookNowBtn.textContent = "Not Available";
      bookNowBtn.classList.add("disabled-btn");
    }

    if (proceedBookingBtn) {
      proceedBookingBtn.disabled = true;
      proceedBookingBtn.textContent = "Car Not Available";
      proceedBookingBtn.classList.add("disabled-btn");
    }
  }

  // Display any additional car features if present
  displayAdditionalFeatures();
}

// Function to display additional features if present in car data
function displayAdditionalFeatures() {
  const featuresContainer = document.getElementById("additional-features");
  if (
    !featuresContainer ||
    !carData.features ||
    !Array.isArray(carData.features) ||
    carData.features.length === 0
  ) {
    return;
  }

  // Clear existing features
  featuresContainer.innerHTML = "";

  // Add each feature
  carData.features.forEach((feature) => {
    const featureItem = document.createElement("div");
    featureItem.className = "feature-item";
    featureItem.innerHTML = `
            <i class="bi bi-check-circle-fill"></i>
            <span>${feature}</span>
        `;
    featuresContainer.appendChild(featureItem);
  });

  // Show the features section
  const featuresSection = document.getElementById("features-section");
  if (featuresSection) {
    featuresSection.style.display = "block";
  }
}

// Import dashboard search parameters and apply to booking form
function importDashboardSearchParams() {
  try {
    // Get search parameters from session storage
    const searchParamsStr = sessionStorage.getItem("carSearchParams");
    if (!searchParamsStr) {
      console.log("No search parameters found in session storage");
      return false;
    }

    // Parse search parameters
    searchParams = JSON.parse(searchParamsStr);
    console.log("Imported search parameters:", searchParams);

    // Apply search parameters to the booking form
    const dateInput = document.getElementById("pickup-date");
    const hoursSelect = document.getElementById("pickup-time-hours");
    const minutesSelect = document.getElementById("pickup-time-minutes");
    const daysSelect = document.getElementById("duration-days");
    const durationHoursSelect = document.getElementById("duration-hours");
    const durationMinutesSelect = document.getElementById("duration-minutes");

    if (dateInput && searchParams.pickupDate) {
      dateInput.value = searchParams.pickupDate;
    }

    // Set time if provided
    if (hoursSelect && minutesSelect && searchParams.formattedTime) {
      const timeParts = searchParams.formattedTime.split(":");
      if (timeParts.length === 2) {
        hoursSelect.value = parseInt(timeParts[0]);

        // Find closest minute option
        const minute = parseInt(timeParts[1]);
        const minuteOptions = [0, 15, 30, 45];
        const closestMinute = minuteOptions.reduce((prev, curr) => {
          return Math.abs(curr - minute) < Math.abs(prev - minute)
            ? curr
            : prev;
        });
        minutesSelect.value = closestMinute;
      }
    }

    // Set duration if provided
    if (daysSelect && typeof searchParams.durationDays !== "undefined") {
      daysSelect.value = searchParams.durationDays;
    }

    if (
      durationHoursSelect &&
      typeof searchParams.durationHours !== "undefined"
    ) {
      durationHoursSelect.value = searchParams.durationHours;
    }

    if (
      durationMinutesSelect &&
      typeof searchParams.durationMinutes !== "undefined"
    ) {
      durationMinutesSelect.value = searchParams.durationMinutes;
    }

    return true;
  } catch (error) {
    console.error("Error importing search parameters:", error);
    return false;
  }
}

// Initialize date and time pickers
function initializeDateTimePickers() {
  try {
    // Set minimum date to today
    const today = new Date();
    const dateString = today.toISOString().split("T")[0];
    const dateInput = document.getElementById("pickup-date");

    if (dateInput) {
      dateInput.min = dateString;
      dateInput.value = dateString;

      // Add change listener to update summary and availability
      dateInput.addEventListener("change", async () => {
        await updateBookingSummary();
        await updateAvailabilityStatus();
      });
    }

    // Initialize time selectors
    initializeTimeSelectors();

    // Initialize duration selectors
    initializeDurationSelectors();
  } catch (error) {
    console.error("Error initializing date and time pickers:", error);
  }
}

// Initialize time selectors with available times
function initializeTimeSelectors() {
  const hoursSelect = document.getElementById("pickup-time-hours");
  const minutesSelect = document.getElementById("pickup-time-minutes");

  if (!hoursSelect || !minutesSelect) return;

  // Clear existing options
  hoursSelect.innerHTML = "";
  minutesSelect.innerHTML = "";

  // Add hours options (0-23)
  for (let i = 0; i < 24; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = i.toString().padStart(2, "0");
    hoursSelect.appendChild(option);
  }

  // Default to current hour rounded up
  const currentHour = new Date().getHours();
  hoursSelect.value = currentHour;

  // Add minutes options (0, 15, 30, 45)
  [0, 15, 30, 45].forEach((minute) => {
    const option = document.createElement("option");
    option.value = minute;
    option.textContent = minute.toString().padStart(2, "0");
    minutesSelect.appendChild(option);
  });

  // Default to next 15-minute interval
  const currentMinute = new Date().getMinutes();
  const roundedMinute = Math.ceil(currentMinute / 15) * 15;
  minutesSelect.value = roundedMinute === 60 ? 0 : roundedMinute;

  // Add change listeners that update summary and check availability
  hoursSelect.addEventListener("change", async () => {
    await updateBookingSummary();
    await updateAvailabilityStatus();
  });

  minutesSelect.addEventListener("change", async () => {
    await updateBookingSummary();
    await updateAvailabilityStatus();
  });
}

// Initialize duration selectors
function initializeDurationSelectors() {
  const daysSelect = document.getElementById("duration-days");
  const hoursSelect = document.getElementById("duration-hours");
  const minutesSelect = document.getElementById("duration-minutes");

  // If days select doesn't have options, populate it
  if (daysSelect && daysSelect.options.length === 0) {
    for (let i = 0; i <= 7; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      daysSelect.appendChild(option);
    }
    daysSelect.value = "0"; // Default to 0 days
  }

  // If hours select doesn't have options, populate it
  if (hoursSelect && hoursSelect.options.length === 0) {
    for (let i = 0; i <= 23; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      hoursSelect.appendChild(option);
    }
    hoursSelect.value = "1"; // Default to 1 hour
  }

  // If minutes select doesn't have options, populate it
  if (minutesSelect && minutesSelect.options.length === 0) {
    [0, 15, 30, 45].forEach((minute) => {
      const option = document.createElement("option");
      option.value = minute;
      option.textContent = minute;
      minutesSelect.appendChild(option);
    });
    minutesSelect.value = "0"; // Default to 0 minutes
  }

  // Add change listeners
  if (daysSelect) {
    daysSelect.addEventListener("change", async () => {
      await updateBookingSummary();
      await updateAvailabilityStatus();
    });
  }

  if (hoursSelect) {
    hoursSelect.addEventListener("change", async () => {
      await updateBookingSummary();
      await updateAvailabilityStatus();
    });
  }

  if (minutesSelect) {
    minutesSelect.addEventListener("change", async () => {
      await updateBookingSummary();
      await updateAvailabilityStatus();
    });
  }
}

// Initialize Google Map
function initMap() {
  if (!carData.current_location) {
    console.warn("Car has no location data");
    return;
  }

  const mapElement = document.getElementById("car-map");
  if (!mapElement) {
    console.error("Map element not found");
    return;
  }

  const carLocation = {
    lat: carData.current_location.latitude,
    lng: carData.current_location.longitude,
  };

  // Create map
  try {
    map = new google.maps.Map(mapElement, {
      center: carLocation,
      zoom: 15,
      mapTypeControl: false,
      fullscreenControl: true,
      streetViewControl: true,
    });

    // Add marker for car with fallback icon
    marker = new google.maps.Marker({
      position: carLocation,
      map: map,
      title: `${carData.make} ${carData.model}`,
      icon: {
        url: "../static/images/assets/car-marker.png",
        scaledSize: new google.maps.Size(32, 32),
      },
      animation: google.maps.Animation.DROP,
    });

    // Add info window
    const infoWindow = new google.maps.InfoWindow({
      content: `
                <div style="padding: 10px; max-width: 200px;">
                    <h4 style="margin-top: 0; margin-bottom: 8px;">${
                      carData.make
                    } ${carData.model}</h4>
                    <p style="margin: 0;">${
                      carData.address || "Location not available"
                    }</p>
                </div>
            `,
    });

    marker.addListener("click", () => {
      infoWindow.open(map, marker);
    });
  } catch (error) {
    console.error("Error initializing map:", error);
  }
}

// Set up event listeners
function setupEventListeners() {
  // Book now button scrolls to booking form
  const bookNowBtn = document.getElementById("book-now-btn");
  if (bookNowBtn) {
    bookNowBtn.addEventListener("click", () => {
      const bookingForm = document.querySelector(".booking-section");
      if (bookingForm) {
        bookingForm.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // Get directions button
  const directionsBtn = document.getElementById("directions-btn");
  if (directionsBtn && carData.current_location) {
    directionsBtn.addEventListener("click", () => {
      const lat = carData.current_location.latitude;
      const lng = carData.current_location.longitude;
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        "_blank"
      );
    });
  }

  // Proceed with booking button
  const proceedBookingBtn = document.getElementById("proceed-booking-btn");
  if (proceedBookingBtn) {
    // Remove any existing event listeners first
    proceedBookingBtn.replaceWith(proceedBookingBtn.cloneNode(true));

    // Get the fresh reference
    const freshBtn = document.getElementById("proceed-booking-btn");

    // Add event listener with explicit event parameter
    freshBtn.addEventListener("click", function (event) {
      event.preventDefault();
      proceedWithBooking(event);
    });

    console.log("Booking button event listener attached");
  }

  console.log("Event listeners set up");
}

// Update booking summary when input changes
async function updateBookingSummary() {
  const dateInput = document.getElementById("pickup-date");
  const hoursSelect = document.getElementById("pickup-time-hours");
  const minutesSelect = document.getElementById("pickup-time-minutes");
  const daysSelect = document.getElementById("duration-days");
  const durationHoursSelect = document.getElementById("duration-hours");
  const durationMinutesSelect = document.getElementById("duration-minutes");

  const summaryStartElement = document.getElementById("summary-start");
  const summaryEndElement = document.getElementById("summary-end");
  const summaryDurationElement = document.getElementById("summary-duration");
  const summaryTotalElement = document.getElementById("summary-total");

  // Get selected values with defaults
  const date = dateInput
    ? dateInput.value
    : new Date().toISOString().split("T")[0];
  const hours = hoursSelect ? parseInt(hoursSelect.value) : 0;
  const minutes = minutesSelect ? parseInt(minutesSelect.value) : 0;
  const days = daysSelect ? parseInt(daysSelect.value) : 0;
  const durationHours = durationHoursSelect
    ? parseInt(durationHoursSelect.value)
    : 1;
  const durationMinutes = durationMinutesSelect
    ? parseInt(durationMinutesSelect.value)
    : 0;

  // Create date objects
  const startDate = new Date(
    `${date}T${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:00`
  );

  // Calculate total duration in minutes
  const totalDurationMinutes =
    days * 24 * 60 + durationHours * 60 + durationMinutes;

  // Calculate end date
  const endDate = new Date(startDate.getTime() + totalDurationMinutes * 60000);

  // Format dates for display
  const options = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  const startFormatted = startDate.toLocaleString("en-US", options);
  const endFormatted = endDate.toLocaleString("en-US", options);

  // Format duration text
  let durationText = "";
  if (days > 0) {
    durationText += `${days} day${days > 1 ? "s" : ""} `;
  }
  if (durationHours > 0) {
    durationText += `${durationHours} hour${durationHours > 1 ? "s" : ""} `;
  }
  if (durationMinutes > 0) {
    durationText += `${durationMinutes} minute${
      durationMinutes > 1 ? "s" : ""
    }`;
  }
  durationText = durationText.trim() || "0 minutes";

  // Calculate total price
  const totalHours = totalDurationMinutes / 60;
  const totalPrice = hourlyRate * totalHours;

  // Update summary elements
  if (summaryStartElement) summaryStartElement.textContent = startFormatted;
  if (summaryEndElement) summaryEndElement.textContent = endFormatted;
  if (summaryDurationElement) summaryDurationElement.textContent = durationText;
  if (summaryTotalElement)
    summaryTotalElement.textContent = totalPrice.toFixed(2);
}

// Check availability against timesheet
async function checkAvailability() {
  try {
    // Get selected date and time
    const dateInput = document.getElementById("pickup-date");
    const hoursSelect = document.getElementById("pickup-time-hours");
    const minutesSelect = document.getElementById("pickup-time-minutes");
    const daysSelect = document.getElementById("duration-days");
    const durationHoursSelect = document.getElementById("duration-hours");
    const durationMinutesSelect = document.getElementById("duration-minutes");

    if (!dateInput || !hoursSelect || !minutesSelect) {
      console.error("Missing form elements");
      return { available: false, error: "Missing form elements" };
    }

    // Get selected values
    const date = dateInput.value;
    const hours = parseInt(hoursSelect.value);
    const minutes = parseInt(minutesSelect.value);
    const days = daysSelect ? parseInt(daysSelect.value) : 0;
    const durationHours = durationHoursSelect
      ? parseInt(durationHoursSelect.value)
      : 1;
    const durationMinutes = durationMinutesSelect
      ? parseInt(durationMinutesSelect.value)
      : 0;

    // Calculate total duration in minutes
    const totalDurationMinutes =
      days * 24 * 60 + durationHours * 60 + durationMinutes;

    if (totalDurationMinutes <= 0) {
      return { available: false, error: "Please select a valid duration" };
    }

    // Create date objects
    const startDateTime = new Date(
      `${date}T${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:00`
    );
    const endDateTime = new Date(
      startDateTime.getTime() + totalDurationMinutes * 60000
    );

    // Check if start time is in the past
    const now = new Date();
    if (startDateTime < now) {
      return {
        available: false,
        error: "Please select a pickup time in the future",
      };
    }

    // Check for conflicts with existing bookings
    const bookingsRef = collection(db, "timesheets", carId, "bookings");
    const bookingsSnapshot = await getDocs(bookingsRef);

    if (bookingsSnapshot.empty) {
      return { available: true }; // No bookings, so it's available
    }

    // Get all bookings
    const bookings = [];
    bookingsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status !== "cancelled") {
        bookings.push({
          id: doc.id,
          ...data,
          start: data.start_time.toDate
            ? data.start_time.toDate()
            : new Date(data.start_time.seconds * 1000),
          end: data.end_time.toDate
            ? data.end_time.toDate()
            : new Date(data.end_time.seconds * 1000),
        });
      }
    });

    // Sort bookings by start time
    bookings.sort((a, b) => a.start - b.start);

    // Check for conflicts with buffers
    for (const booking of bookings) {
      // Add buffer times (15 minutes before and after)
      const bookingStartMinus15 = new Date(
        booking.start.getTime() - 15 * 60000
      );
      const bookingEndPlus15 = new Date(booking.end.getTime() + 15 * 60000);

      // Check if our booking would go into the next booking's buffer time
      if (startDateTime < booking.start && endDateTime > bookingStartMinus15) {
        return {
          available: false,
          error: "Your booking would overlap with buffer time",
          conflictStart: booking.start,
          conflictEnd: booking.end,
        };
      }

      // Check if our booking would start within the previous booking's buffer time
      if (startDateTime < bookingEndPlus15 && startDateTime > booking.start) {
        return {
          available: false,
          error: "Your booking would start too soon after another booking",
          conflictStart: booking.start,
          conflictEnd: booking.end,
        };
      }

      // Check for direct overlap
      if (
        (startDateTime >= booking.start && startDateTime < booking.end) ||
        (endDateTime > booking.start && endDateTime <= booking.end) ||
        (startDateTime <= booking.start && endDateTime >= booking.end)
      ) {
        return {
          available: false,
          error: "Car already booked during this time",
          conflictStart: booking.start,
          conflictEnd: booking.end,
        };
      }
    }

    return { available: true };
  } catch (error) {
    console.error("Error checking availability:", error);
    return { available: false, error: error.message };
  }
}

// Update availability status in UI
async function updateAvailabilityStatus() {
  const availabilityIndicator = document.getElementById("availability-status");
  const bookButton = document.getElementById("proceed-booking-btn");

  if (!availabilityIndicator || !bookButton) return;

  try {
    // Show checking status
    availabilityIndicator.textContent = "Checking availability...";
    availabilityIndicator.className = "status checking";

    // Check availability
    const availabilityResult = await checkAvailability();

    if (availabilityResult.available) {
      // Car is available
      availabilityIndicator.textContent = "Available for booking";
      availabilityIndicator.className = "status available";
      bookButton.disabled = false;
    } else {
      // Car is not available
      let message =
        availabilityResult.error || "Not available for selected time";

      // Add conflict time information if available
      if (availabilityResult.conflictStart && availabilityResult.conflictEnd) {
        const formatOptions = {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        };

        const conflictStart = availabilityResult.conflictStart.toLocaleString(
          "en-US",
          formatOptions
        );
        const conflictEnd = availabilityResult.conflictEnd.toLocaleString(
          "en-US",
          formatOptions
        );

        message += ` (Conflict: ${conflictStart} to ${conflictEnd})`;
      }

      availabilityIndicator.textContent = message;
      availabilityIndicator.className = "status unavailable";
      bookButton.disabled = true;
    }
  } catch (error) {
    console.error("Error updating availability status:", error);
    availabilityIndicator.textContent = "Error checking availability";
    availabilityIndicator.className = "status error";
    bookButton.disabled = true;
  }
}

// Handle booking submission
async function proceedWithBooking(event) {
  // Prevent any default behavior
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  console.log("Booking process started");

  // Visual feedback - disable button
  const proceedButton = document.getElementById("proceed-booking-btn");
  if (proceedButton) {
    proceedButton.disabled = true;
    proceedButton.textContent = "Processing...";
  }

  try {
    // Double check availability one more time
    const availabilityResult = await checkAvailability();
    if (!availabilityResult.available) {
      alert(
        availabilityResult.error || "Car is not available for the selected time"
      );
      if (proceedButton) {
        proceedButton.disabled = false;
        proceedButton.textContent = "Proceed with Booking";
      }
      return false;
    }

    const dateInput = document.getElementById("pickup-date");
    const hoursSelect = document.getElementById("pickup-time-hours");
    const minutesSelect = document.getElementById("pickup-time-minutes");
    const daysSelect = document.getElementById("duration-days");
    const durationHoursSelect = document.getElementById("duration-hours");
    const durationMinutesSelect = document.getElementById("duration-minutes");

    if (!dateInput || !hoursSelect || !minutesSelect) {
      alert("Please complete all booking information");
      if (proceedButton) {
        proceedButton.disabled = false;
        proceedButton.textContent = "Proceed with Booking";
      }
      return false;
    }

    // Get selected values
    const date = dateInput.value;
    const hours = parseInt(hoursSelect.value);
    const minutes = parseInt(minutesSelect.value);
    const days = daysSelect ? parseInt(daysSelect.value) : 0;
    const durationHours = durationHoursSelect
      ? parseInt(durationHoursSelect.value)
      : 1;
    const durationMinutes = durationMinutesSelect
      ? parseInt(durationMinutesSelect.value)
      : 0;

    // Calculate total duration in minutes
    const totalDurationMinutes =
      days * 24 * 60 + durationHours * 60 + durationMinutes;

    if (totalDurationMinutes <= 0) {
      alert("Please select a valid duration");
      if (proceedButton) {
        proceedButton.disabled = false;
        proceedButton.textContent = "Proceed with Booking";
      }
      return false;
    }

    // Create date objects
    const startDateTime = new Date(
      `${date}T${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:00`
    );
    const endDateTime = new Date(
      startDateTime.getTime() + totalDurationMinutes * 60000
    );

    // Check if start time is in the past
    const now = new Date();
    if (startDateTime < now) {
      alert("Please select a pickup time in the future");
      if (proceedButton) {
        proceedButton.disabled = false;
        proceedButton.textContent = "Proceed with Booking";
      }
      return false;
    }

    // Calculate total price
    const totalHours = totalDurationMinutes / 60;
    const totalPrice = hourlyRate * totalHours;

    // Store booking details in session storage
    const bookingDetails = {
      carId,
      carType: carData.car_type,
      pickupDate: date,
      pickupTime: `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`,
      durationDays: days,
      durationHours: durationHours,
      durationMinutes: durationMinutes,
      totalDurationMinutes: totalDurationMinutes,
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      hourlyRate,
      totalPrice: totalPrice.toFixed(2),
    };

    console.log("Booking details prepared:", bookingDetails);

    // Save to session storage
    sessionStorage.setItem("bookingDetails", JSON.stringify(bookingDetails));
    console.log("Booking details saved to session storage");

    // Redirect using multiple fallback methods
    console.log("Attempting to navigate to booking confirmation page");

    // Method 1: Direct navigation
    try {
      console.log("Method 1: Direct navigation");
      window.location.href = "user-book-confirmation.html";

      // Method 2: Fallback with timeout
      setTimeout(() => {
        console.log("Method 2: Navigation with window.location.assign");
        window.location.assign("user-book-confirmation.html");

        // Method 3: Second fallback
        setTimeout(() => {
          console.log("Method 3: Navigation with window.open");
          window.open("user-book-confirmation.html", "_self");

          // Method 4: Final fallback - create and click a link
          setTimeout(() => {
            console.log("Method 4: Creating link element");
            const link = document.createElement("a");
            link.href = "user-book-confirmation.html";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Last resort
            alert(
              "Please click OK to continue to the booking confirmation page."
            );
          }, 300);
        }, 300);
      }, 300);
    } catch (navError) {
      console.error("Navigation error:", navError);
      alert(
        "Unable to automatically redirect. Please manually navigate to the booking confirmation page."
      );
    }
  } catch (error) {
    console.error("Error processing booking:", error);
    alert(`Error preparing booking: ${error.message}`);

    // Reset button state
    if (proceedButton) {
      proceedButton.disabled = false;
      proceedButton.textContent = "Proceed with Booking";
    }
  }

  // Return false to prevent any default form submission
  return false;
}
