import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  setDoc,
  Timestamp,
  serverTimestamp,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Debug flag - set to true to enable detailed logging
const DEBUG = true;

function debug(...args) {
  if (DEBUG) console.log(...args);
}

debug("ADMIN-BOOKING-CREATE.JS LOADED");

// Global variables
let currentUser = null;
let selectedCar = null;
let selectedUser = null;
let availableCars = [];
let users = [];
let selectedStartTime = null;
let selectedEndTime = null;
let hourlyRate = 15; // Default hourly rate in dollars
let isMaintenanceBooking = false;

// DOM Elements
let carSelectElement = null;
let userSelectElement = null;
let startDateInput = null;
let startTimeHourInput = null;
let startTimeMinuteInput = null;
let endDateInput = null;
let endTimeHourInput = null;
let endTimeMinuteInput = null;
let durationDisplay = null;
let priceDisplay = null;
let priceInput = null;
let statusSelect = null;
let notesInput = null;
let bookingForm = null;
let loadingOverlay = null;
let maintenanceSwitch = null;

// Initialize the page
document.addEventListener("DOMContentLoaded", async function () {
  debug("DOM loaded, initializing admin booking create page");

  try {
    // Load header and footer
    document.getElementById("header").innerHTML = await fetch(
      "../static/headerFooter/admin-header.html"
    ).then((response) => response.text());

    document.getElementById("footer").innerHTML = await fetch(
      "../static/headerFooter/admin-footer.html"
    ).then((response) => response.text());

    // Find and store DOM elements
    carSelectElement = document.getElementById("car-select");
    userSelectElement = document.getElementById("user-select");
    startDateInput = document.getElementById("start-date");
    startTimeHourInput = document.getElementById("start-time-hour");
    startTimeMinuteInput = document.getElementById("start-time-minute");
    endDateInput = document.getElementById("end-date");
    endTimeHourInput = document.getElementById("end-time-hour");
    endTimeMinuteInput = document.getElementById("end-time-minute");
    durationDisplay = document.getElementById("duration-display");
    priceDisplay = document.getElementById("price-display");
    priceInput = document.getElementById("total-price");
    statusSelect = document.getElementById("status-select");
    notesInput = document.getElementById("booking-notes");
    bookingForm = document.getElementById("booking-form");
    loadingOverlay = document.getElementById("loading-overlay");
    maintenanceSwitch = document.getElementById("maintenance-switch");

    // Initialize hour selects
    populateHourSelects();

    // Set default dates
    setDefaultDates();

    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get user document
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (!userDoc.exists()) {
            console.error("User document not found");
            window.location.href = "../index.html";
            return;
          }

          const userData = userDoc.data();
          if (userData.role !== "admin") {
            console.warn("Non-admin user accessing admin page");
            window.location.href = "../user/user-dashboard.html";
            return;
          }

          currentUser = {
            uid: user.uid,
            ...userData,
          };

          debug("Admin authenticated:", currentUser.firstName);

          // Now that user is authenticated, set up the page
          await setupPage();
        } catch (error) {
          console.error("Error loading user data:", error);
          showMessage(
            "Error loading user data. Please try again later.",
            "error"
          );
        }
      } else {
        // Not logged in
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("Error initializing page:", error);
    showMessage(
      "Failed to initialize the page. Please try refreshing.",
      "error"
    );
  }
});

// Set up the page
async function setupPage() {
  debug("Setting up booking create page");

  setLoading(true);

  try {
    // Load cars and users data
    await Promise.all([loadCarsData(), loadUsersData()]);

    // Set up event listeners
    setupEventListeners();

    // Initial calculation of duration and price
    updateDurationAndPrice();

    setLoading(false);
  } catch (error) {
    console.error("Error setting up page:", error);
    showMessage("Failed to load necessary data. Please try again.", "error");
    setLoading(false);
  }
}

// Set default date and time values (today and tomorrow, same time)
function setDefaultDates() {
  // Get current date and add 30 minutes (rounded to next 15-minute mark)
  const now = new Date();
  const roundedMinutes = Math.ceil((now.getMinutes() + 30) / 15) * 15;
  const startDate = new Date(now);
  startDate.setMinutes(roundedMinutes);
  startDate.setSeconds(0);
  startDate.setMilliseconds(0);

  // Default end time is 2 hours after start time
  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + 2);

  // Set start date and time
  startDateInput.value = formatDateForInput(startDate);
  startTimeHourInput.value = String(startDate.getHours()).padStart(2, "0");
  startTimeMinuteInput.value = String(startDate.getMinutes()).padStart(2, "0");

  // Set end date and time
  endDateInput.value = formatDateForInput(endDate);
  endTimeHourInput.value = String(endDate.getHours()).padStart(2, "0");
  endTimeMinuteInput.value = String(endDate.getMinutes()).padStart(2, "0");

  // Store selected times
  selectedStartTime = startDate;
  selectedEndTime = endDate;

  debug("Default dates set:", { start: startDate, end: endDate });
}

// Function to populate hours in the selects
function populateHourSelects() {
  const hourSelects = [startTimeHourInput, endTimeHourInput];

  hourSelects.forEach((select) => {
    if (select) {
      select.innerHTML = ""; // Clear existing options

      // Add hours (00-23)
      for (let i = 0; i < 24; i++) {
        const hour = i.toString().padStart(2, "0");
        const option = document.createElement("option");
        option.value = hour;
        option.textContent = hour;
        select.appendChild(option);
      }
    }
  });
}

// Format date for input field (YYYY-MM-DD)
function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Load cars data from Firestore
async function loadCarsData() {
  debug("Loading cars data");

  try {
    // Get all cars
    const carsQuery = query(collection(db, "cars"), orderBy("car_type"));
    const carsSnapshot = await getDocs(carsQuery);

    if (carsSnapshot.empty) {
      debug("No cars found in database");
      showMessage("No cars found in database", "warning");
      return;
    }

    availableCars = [];
    let options = '<option value="">Select a vehicle</option>';

    carsSnapshot.forEach((doc) => {
      const carData = {
        id: doc.id,
        ...doc.data(),
      };

      availableCars.push(carData);

      // Add to select dropdown
      const displayName = carData.car_type || "Unknown car";
      const licensePlate = carData.license_plate || "No plate";
      options += `<option value="${carData.id}">${displayName} (${licensePlate})</option>`;
    });

    // Update the select element
    if (carSelectElement) {
      carSelectElement.innerHTML = options;
    }

    debug(`Loaded ${availableCars.length} cars`);
  } catch (error) {
    console.error("Error loading cars:", error);
    throw error;
  }
}

// Update the loadUsersData function to include admins and set current admin as default
async function loadUsersData() {
  debug("Loading users data");

  try {
    // Get users (limit to 50 most recently active users)
    const usersQuery = query(
      collection(db, "users"),
      orderBy("last_login", "desc"),
      limit(50)
    );
    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.empty) {
      debug("No users found in database");
      return;
    }

    users = [];
    let options = '<option value="">Select a user</option>';

    // Add current admin at the top
    if (currentUser) {
      users.push(currentUser);
      options += `<option value="${currentUser.uid}" selected>
          ${currentUser.firstName || ""} ${currentUser.lastName || ""} (Admin)
        </option>`;
    }

    usersSnapshot.forEach((doc) => {
      const userData = {
        id: doc.id,
        ...doc.data(),
      };

      // Skip the current admin as we already added them
      if (userData.id === currentUser?.uid) {
        return;
      }

      users.push(userData);

      // Add to select dropdown
      const displayName =
        `${userData.firstName || ""} ${userData.lastName || ""}`.trim() ||
        "User";
      const userRole = userData.role === "admin" ? " (Admin)" : "";
      const email = userData.email || "No email";
      options += `<option value="${userData.id}">${displayName}${userRole} (${email})</option>`;
    });

    // Update the select element
    if (userSelectElement) {
      userSelectElement.innerHTML = options;

      // If current user is admin, set them as selected
      if (currentUser) {
        userSelectElement.value = currentUser.uid;
        handleUserSelection(); // Trigger the selection handler
      }
    }

    debug(`Loaded ${users.length} users`);
  } catch (error) {
    console.error("Error loading users:", error);
    throw error;
  }
}

// Set up event listeners
function setupEventListeners() {
  debug("Setting up event listeners");

  // Maintenance booking switch
  if (maintenanceSwitch) {
    maintenanceSwitch.addEventListener("change", toggleMaintenanceMode);
  }

  // Car select change
  if (carSelectElement) {
    carSelectElement.addEventListener("change", handleCarSelection);
  }

  // User select change
  if (userSelectElement) {
    userSelectElement.addEventListener("change", handleUserSelection);
  }

  // Date and time inputs
  const dateTimeInputs = [
    startDateInput,
    startTimeHourInput,
    startTimeMinuteInput,
    endDateInput,
    endTimeHourInput,
    endTimeMinuteInput,
  ];

  dateTimeInputs.forEach((input) => {
    if (input) {
      input.addEventListener("change", handleDateTimeChange);
    }
  });

  // Form submission
  if (bookingForm) {
    bookingForm.addEventListener("submit", handleFormSubmit);
  }

  // Cancel button
  const cancelBtn = document.getElementById("cancel-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      goBackToBookings();
    });
  }
}

// Helper to get Date object from separate date, hour and minute inputs
function getDateTimeFromSplitInputs(dateInput, hourInput, minuteInput) {
  if (!dateInput.value || !hourInput.value || !minuteInput.value) return null;

  const [year, month, day] = dateInput.value
    .split("-")
    .map((num) => parseInt(num, 10));
  const hours = parseInt(hourInput.value, 10);
  const minutes = parseInt(minuteInput.value, 10);

  // Create new date (month is 0-indexed in JavaScript)
  return new Date(year, month - 1, day, hours, minutes, 0);
}

// Update the toggleMaintenanceMode function to default to admin
function toggleMaintenanceMode() {
  isMaintenanceBooking = maintenanceSwitch.checked;
  debug(`Maintenance booking mode: ${isMaintenanceBooking}`);

  // Update UI based on maintenance mode
  const userSection = document.getElementById("user-section");
  const maintenanceFields = document.getElementById("maintenance-fields");
  const statusContainer = document.getElementById("status-container");

  if (isMaintenanceBooking) {
    // Hide user selection for maintenance bookings
    if (userSection) userSection.style.display = "none";

    // Show maintenance specific fields
    if (maintenanceFields) maintenanceFields.style.display = "block";

    // Update status options for maintenance
    if (statusSelect) {
      statusSelect.innerHTML = `
          <option value="maintenance">Maintenance</option>
          <option value="repair">Repair</option>
        `;
      statusSelect.value = "maintenance";
    }

    // Show status selector
    if (statusContainer) statusContainer.style.display = "block";

    // Hide price display for maintenance
    if (priceDisplay) priceDisplay.style.display = "none";
    if (priceInput) priceInput.value = "0.00";
  } else {
    // Set admin as the default user for regular bookings
    if (userSection) {
      // Still show user section but with admin as default
      userSection.style.display = "block";

      // Set current admin as the user if we have currentUser
      if (currentUser && userSelectElement) {
        userSelectElement.value = currentUser.uid;
        // Trigger the selection change event
        const event = new Event("change");
        userSelectElement.dispatchEvent(event);
      }
    }

    // Hide maintenance specific fields
    if (maintenanceFields) maintenanceFields.style.display = "none";

    // Update status options for regular booking
    if (statusSelect) {
      statusSelect.innerHTML = `
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        `;
      statusSelect.value = "upcoming";
    }

    // Show price display for regular bookings
    if (priceDisplay) priceDisplay.style.display = "block";

    // Recalculate price
    updateDurationAndPrice();
  }
}

// Add or modify handleCarSelection to check availability immediately
function handleCarSelection() {
  const carId = carSelectElement.value;
  debug(`Car selected: ${carId}`);

  selectedCar = availableCars.find((car) => car.id === carId);

  // Update car details display
  const carDetailsElement = document.getElementById("car-details");
  if (carDetailsElement && selectedCar) {
    carDetailsElement.innerHTML = `
        <div class="car-detail"><strong>Model:</strong> ${
          selectedCar.car_type || "N/A"
        }</div>
        <div class="car-detail"><strong>License:</strong> ${
          selectedCar.license_plate || "N/A"
        }</div>
        <div class="car-detail"><strong>Color:</strong> ${
          selectedCar.car_color || "N/A"
        }</div>
      `;
    carDetailsElement.style.display = "block";

    // Check car availability as soon as it's selected
    checkCarAvailability();
  } else if (carDetailsElement) {
    carDetailsElement.style.display = "none";
  }
}

// Handle user selection change
function handleUserSelection() {
  const userId = userSelectElement.value;
  debug(`User selected: ${userId}`);

  selectedUser = users.find((user) => user.id === userId);

  // Update user details display
  const userDetailsElement = document.getElementById("user-details");
  if (userDetailsElement && selectedUser) {
    userDetailsElement.innerHTML = `
      <div class="user-detail"><strong>Name:</strong> ${
        selectedUser.firstName || ""
      } ${selectedUser.lastName || ""}</div>
      <div class="user-detail"><strong>Email:</strong> ${
        selectedUser.email || "N/A"
      }</div>
      <div class="user-detail"><strong>Phone:</strong> ${
        selectedUser.phone || "N/A"
      }</div>
    `;
    userDetailsElement.style.display = "block";
  } else if (userDetailsElement) {
    userDetailsElement.style.display = "none";
  }
}

// Handle date/time input changes
function handleDateTimeChange() {
  // Update selected times
  selectedStartTime = getDateTimeFromSplitInputs(
    startDateInput,
    startTimeHourInput,
    startTimeMinuteInput
  );

  selectedEndTime = getDateTimeFromSplitInputs(
    endDateInput,
    endTimeHourInput,
    endTimeMinuteInput
  );

  // Update duration and price calculations
  updateDurationAndPrice();

  // Check car availability if a car is selected
  if (selectedCar) {
    checkCarAvailability();
  }
}

// Calculate and update duration and price display
function updateDurationAndPrice() {
  if (!selectedStartTime || !selectedEndTime || !durationDisplay) return;

  // Calculate duration in milliseconds
  let durationMs = selectedEndTime - selectedStartTime;

  // Handle negative duration (end before start)
  if (durationMs < 0) {
    durationDisplay.innerHTML = `<i class="bi bi-exclamation-triangle"></i> End time is before start time`;
    if (priceDisplay) {
      priceDisplay.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Invalid duration`;
    }
    return;
  }

  // Convert to hours and minutes
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor(
    (durationMs % (1000 * 60 * 60)) / (1000 * 60)
  );

  // Format duration text
  const durationText =
    durationHours > 0
      ? `${durationHours}h ${durationMinutes}m`
      : `${durationMinutes}m`;

  // Update duration display
  durationDisplay.innerHTML = `<i class="bi bi-clock"></i> Duration: <span class="calc-value">${durationText}</span>`;

  // Skip price calculation for maintenance bookings
  if (isMaintenanceBooking) {
    if (priceInput) priceInput.value = "0.00";
    return;
  }

  // Calculate price (rounded to two decimal places)
  const durationInHours = durationHours + durationMinutes / 60;
  const price = Math.ceil(durationInHours * hourlyRate * 100) / 100;

  // Update price display
  if (priceDisplay) {
    priceDisplay.innerHTML = `<i class="bi bi-tag"></i> Estimated Price: <span class="calc-value">$${price.toFixed(
      2
    )}</span>`;
  }

  // Update price input if it exists
  if (priceInput) {
    priceInput.value = price.toFixed(2);
  }
}

// Check if car is available for the selected time period
async function checkCarAvailability() {
  if (!selectedCar || !selectedStartTime || !selectedEndTime) return;

  debug("Checking car availability");

  try {
    const availabilityMessage = document.getElementById("availability-message");

    // Clear previous message
    if (availabilityMessage) {
      availabilityMessage.innerHTML = "";
      availabilityMessage.className = "";
    }

    // Get bookings for this car in the selected time range
    const bookingsRef = collection(
      db,
      "timesheets",
      selectedCar.id,
      "bookings"
    );
    const bookingsQuery = query(
      bookingsRef,
      where("start_time", "<=", selectedEndTime),
      where("end_time", ">=", selectedStartTime)
    );

    const bookingsSnapshot = await getDocs(bookingsQuery);

    if (!bookingsSnapshot.empty) {
      debug("Car is not available - conflicting bookings found");

      // Show conflict message
      if (availabilityMessage) {
        availabilityMessage.innerHTML = `
          <i class="bi bi-exclamation-triangle"></i> 
          This car is not available during the selected time period.
        `;
        availabilityMessage.className = "error-message";
      }

      return false;
    }

    debug("Car is available");

    // Show available message
    if (availabilityMessage) {
      availabilityMessage.innerHTML = `
        <i class="bi bi-check-circle"></i> 
        Car is available for the selected time period.
      `;
      availabilityMessage.className = "success-message";
    }

    return true;
  } catch (error) {
    console.error("Error checking availability:", error);

    // Show error message
    const availabilityMessage = document.getElementById("availability-message");
    if (availabilityMessage) {
      availabilityMessage.innerHTML = `
        <i class="bi bi-question-circle"></i> 
        Could not check availability. Please try again.
      `;
      availabilityMessage.className = "warning-message";
    }

    return false;
  }
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  debug("Form submitted");

  // Validate form
  if (!validateForm()) {
    return;
  }

  try {
    setLoading(true);

    // Check car availability one more time
    const isAvailable = await checkCarAvailability();
    if (
      !isAvailable &&
      !confirm(
        "This car might not be available for the selected time period. Create booking anyway?"
      )
    ) {
      setLoading(false);
      return;
    }

    // Create booking data
    const bookingData = {
      car_id: selectedCar.id,
      car_type: selectedCar.car_type || "",
      created_at: serverTimestamp(),
      start_time: Timestamp.fromDate(selectedStartTime),
      end_time: Timestamp.fromDate(selectedEndTime),
      status: isMaintenanceBooking ? statusSelect.value : "upcoming",
      updated_at: serverTimestamp(),
    };

    // Add duration in minutes
    const durationMs = selectedEndTime - selectedStartTime;
    bookingData.duration_minutes = Math.round(durationMs / (1000 * 60));

    // For regular bookings, add user ID and price
    if (!isMaintenanceBooking) {
      if (!selectedUser) {
        showMessage("Please select a customer for this booking", "error");
        setLoading(false);
        return;
      }

      bookingData.user_id = selectedUser.id;
      bookingData.total_price = parseFloat(priceInput.value);
    } else {
      // For maintenance bookings, set price to 0
      bookingData.total_price = 0;
    }

    // Add notes if provided
    if (notesInput && notesInput.value.trim()) {
      bookingData.notes = notesInput.value.trim();
    }

    debug("Creating booking with data:", bookingData);

    // Generate a new booking ID
    const bookingId = `booking_${Date.now()}`;
    bookingData.id = bookingId;

    // Add to main bookings collection
    await setDoc(doc(db, "bookings", bookingId), bookingData);
    debug("Added to main bookings collection");

    // Add to car timesheet
    await setDoc(
      doc(db, "timesheets", selectedCar.id, "bookings", bookingId),
      bookingData
    );
    debug("Added to car timesheet");

    // For regular bookings, add to user's bookings collection
    if (!isMaintenanceBooking) {
      await setDoc(
        doc(db, "users", selectedUser.id, "bookings", bookingId),
        bookingData
      );
      debug("Added to user bookings");
    }

    showMessage("Booking created successfully", "success");

    // Redirect to bookings page after short delay
    setTimeout(() => {
      goBackToBookings();
    }, 1500);
  } catch (error) {
    console.error("Error creating booking:", error);
    showMessage("Failed to create booking: " + error.message, "error");
    setLoading(false);
  }
}

// Update the validateForm function
function validateForm() {
  // Check required fields
  if (!selectedCar) {
    showMessage("Please select a car", "error");
    return false;
  }

  if (!selectedStartTime || !selectedEndTime) {
    showMessage("Please select valid start and end times", "error");
    return false;
  }

  // Check that end time is after start time
  if (selectedEndTime <= selectedStartTime) {
    showMessage("End time must be after start time", "error");
    return false;
  }

  return true;
}

// Navigate back to bookings page
function goBackToBookings() {
  window.location.href = "admin-bookings.html";
}

// Show a message to the user
function showMessage(message, type = "info") {
  // Create the message container if it doesn't exist
  let messageContainer = document.getElementById("message-container");

  if (!messageContainer) {
    messageContainer = document.createElement("div");
    messageContainer.id = "message-container";
    messageContainer.style.position = "fixed";
    messageContainer.style.bottom = "20px";
    messageContainer.style.right = "20px";
    messageContainer.style.zIndex = "1000";
    document.body.appendChild(messageContainer);
  }

  // Create message element
  const messageElement = document.createElement("div");
  messageElement.className = `message ${type}`;

  messageElement.innerHTML = `
    <div class="message-content">
      <span>${message}</span>
    </div>
    <button class="close-message">
      <i class="bi bi-x"></i>
    </button>
  `;

  // Add close button functionality
  const closeButton = messageElement.querySelector(".close-message");
  closeButton.addEventListener("click", () => {
    messageElement.style.animation = "slideOut 0.3s ease-out forwards";
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageContainer.removeChild(messageElement);
      }
    }, 300);
  });

  // Add to container
  messageContainer.appendChild(messageElement);

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.style.animation = "slideOut 0.3s ease-out forwards";
      setTimeout(() => {
        if (messageElement.parentNode) {
          messageContainer.removeChild(messageElement);
        }
      }, 300);
    }
  }, 5000);
}

// Set loading state
function setLoading(isLoading) {
  if (!loadingOverlay) {
    loadingOverlay = document.getElementById("loading-overlay");

    if (!loadingOverlay) {
      debug("Loading overlay not found, creating one");
      loadingOverlay = document.createElement("div");
      loadingOverlay.id = "loading-overlay";
      loadingOverlay.innerHTML = `
        <div class="spinner"></div>
        <p>Loading...</p>
      `;
      loadingOverlay.style.position = "fixed";
      loadingOverlay.style.top = "0";
      loadingOverlay.style.left = "0";
      loadingOverlay.style.width = "100%";
      loadingOverlay.style.height = "100%";
      loadingOverlay.style.backgroundColor = "rgba(255, 255, 255, 0.7)";
      loadingOverlay.style.display = "none";
      loadingOverlay.style.justifyContent = "center";
      loadingOverlay.style.alignItems = "center";
      loadingOverlay.style.zIndex = "1000";
      document.body.appendChild(loadingOverlay);
    }
  }

  if (loadingOverlay) {
    loadingOverlay.style.display = isLoading ? "flex" : "none";
  }
}
