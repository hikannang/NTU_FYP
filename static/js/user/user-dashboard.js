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
  // Set today's date as minimum
  const today = new Date();
  const dateString = today.toISOString().split("T")[0];
  const dateInput = document.getElementById("pickup-date");

  if (dateInput) {
    dateInput.min = dateString;
    dateInput.value = dateString;

    // Listen for date changes
    dateInput.addEventListener("change", updateTimeBasedOnDate);
  }

  // Round current time to next 15-minute interval
  const currentHour = today.getHours();
  const currentMinute = today.getMinutes();
  const roundedMinute = Math.ceil(currentMinute / 15) * 15;
  const adjustedHour = roundedMinute === 60 ? currentHour + 1 : currentHour;
  const finalMinute = roundedMinute === 60 ? 0 : roundedMinute;

  // Initialize time selectors
  initializeTimeSelectors(adjustedHour, finalMinute);

  // Add this line to initialize duration selectors
  initializeDurationSelectors();

  // Set default duration
  const durationDays = document.getElementById("duration-days");
  const durationHours = document.getElementById("duration-hours");
  const durationMinutes = document.getElementById("duration-minutes");

  if (durationDays) durationDays.value = "0";
  if (durationHours) durationHours.value = "1";
  if (durationMinutes) durationMinutes.value = "0";
}

// Initialize time selectors with proper options
function initializeTimeSelectors(currentHour, currentMinute) {
  const hoursSelect = document.getElementById("pickup-time-hours");
  const minutesSelect = document.getElementById("pickup-time-minutes");

  if (!hoursSelect || !minutesSelect) return;

  // Clear existing options
  hoursSelect.innerHTML = "";
  minutesSelect.innerHTML = "";

  // Today's date
  const selectedDate = document.getElementById("pickup-date").value;
  const today = new Date().toISOString().split("T")[0];
  const isToday = selectedDate === today;

  // Hours options (0-23)
  for (let i = 0; i < 24; i++) {
    // Skip hours that have already passed if today
    if (isToday && i < currentHour) continue;

    const option = document.createElement("option");
    option.value = i;
    option.text = i.toString().padStart(2, "0");
    hoursSelect.appendChild(option);
  }

  // If no options were added (all hours passed), add remaining hours
  if (hoursSelect.options.length === 0 && isToday) {
    const option = document.createElement("option");
    option.value = currentHour;
    option.text = currentHour.toString().padStart(2, "0");
    hoursSelect.appendChild(option);
  }

  // Set default hour
  if (hoursSelect.options.length > 0) {
    // Find closest available hour
    const defaultHour = isToday ? currentHour : 9; // 9 AM default for future dates
    let selectedIndex = 0;

    for (let i = 0; i < hoursSelect.options.length; i++) {
      const optionValue = parseInt(hoursSelect.options[i].value);
      if (optionValue >= defaultHour) {
        selectedIndex = i;
        break;
      }
    }

    hoursSelect.selectedIndex = selectedIndex;
  }

  // Update minutes based on selected hour
  updateMinutesOptions(minutesSelect, isToday ? currentHour : 0);

  // Listen for hour changes
  hoursSelect.addEventListener("change", function () {
    updateMinutesOptions(minutesSelect, isToday ? currentHour : 0);
  });
}

// Add this function to ensure duration selectors have options
function initializeDurationSelectors() {
  console.log("Initializing duration selectors");

  const daysSelect = document.getElementById("duration-days");
  const hoursSelect = document.getElementById("duration-hours");
  const minutesSelect = document.getElementById("duration-minutes");

  // Check if all elements exist
  if (!daysSelect || !hoursSelect || !minutesSelect) {
    console.error("Duration selectors not found in DOM");
    return;
  }

  // Set up days options (0-30)
  if (daysSelect.options.length === 0) {
    for (let i = 0; i <= 30; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      daysSelect.appendChild(option);
    }
    daysSelect.value = "0"; // Default to 0 days
  }

  // Set up hours options (0-23)
  if (hoursSelect.options.length === 0) {
    for (let i = 0; i <= 23; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = i;
      hoursSelect.appendChild(option);
    }
    hoursSelect.value = "1"; // Default to 1 hour
  }

  // Set up minutes options (0, 15, 30, 45)
  if (minutesSelect.options.length === 0) {
    [0, 15, 30, 45].forEach((minute) => {
      const option = document.createElement("option");
      option.value = minute;
      option.textContent = minute;
      minutesSelect.appendChild(option);
    });
    minutesSelect.value = "0"; // Default to 0 minutes
  }

  // Validate that at least some duration is selected
  daysSelect.addEventListener("change", validateDuration);
  hoursSelect.addEventListener("change", validateDuration);
  minutesSelect.addEventListener("change", validateDuration);

  function validateDuration() {
    const totalMinutes =
      parseInt(daysSelect.value) * 24 * 60 +
      parseInt(hoursSelect.value) * 60 +
      parseInt(minutesSelect.value);

    if (totalMinutes <= 0) {
      alert("Duration must be greater than 0 minutes.");
      hoursSelect.value = "1"; // Default to 1 hour
    }
  }
}

// Update minutes options based on selected hour
function updateMinutesOptions(minutesSelect, currentHour) {
  const selectedDate = document.getElementById("pickup-date").value;
  const today = new Date().toISOString().split("T")[0];
  const isToday = selectedDate === today;

  const hoursSelect = document.getElementById("pickup-time-hours");
  const selectedHour = parseInt(hoursSelect.value);

  // Clear existing options
  minutesSelect.innerHTML = "";

  // Minutes options (0, 15, 30, 45)
  const minuteValues = [0, 15, 30, 45];
  const currentMinute = new Date().getMinutes();
  const roundedCurrentMinute = Math.ceil(currentMinute / 15) * 15;

  minuteValues.forEach((minute) => {
    // Skip minutes that have already passed if same hour on today
    if (
      isToday &&
      selectedHour === currentHour &&
      minute < roundedCurrentMinute
    )
      return;

    const option = document.createElement("option");
    option.value = minute;
    option.text = minute.toString().padStart(2, "0");
    minutesSelect.appendChild(option);
  });

  // If no options were added (all minutes passed), add next hour's minutes
  if (minutesSelect.options.length === 0) {
    minuteValues.forEach((minute) => {
      const option = document.createElement("option");
      option.value = minute;
      option.text = minute.toString().padStart(2, "0");
      minutesSelect.appendChild(option);
    });
  }

  // Set default
  if (minutesSelect.options.length > 0) {
    minutesSelect.selectedIndex = 0;
  }
}

// Update time options based on selected date
function updateTimeBasedOnDate() {
  const selectedDate = document.getElementById("pickup-date").value;
  const today = new Date().toISOString().split("T")[0];

  // Get current hour and minute
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const roundedMinute = Math.ceil(currentMinute / 15) * 15;
  const adjustedHour = roundedMinute === 60 ? currentHour + 1 : currentHour;
  const finalMinute = roundedMinute === 60 ? 0 : roundedMinute;

  // Reinitialize time selectors based on date
  if (selectedDate === today) {
    // Today: Only show future times
    initializeTimeSelectors(adjustedHour, finalMinute);
  } else {
    // Future date: Show all times
    initializeTimeSelectors(0, 0);
  }
}

// Load user data - Fix
async function loadUserData(userId) {
  try {
    console.log("Loading user data for ID:", userId);
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      console.log("User data loaded:", userData);

      // Update user name display - Fixed to use firstName
      const userNameElement = document.getElementById("user-name");
      if (userNameElement) {
        // Make sure we're using the correct field name from your database structure
        if (userData.firstName) {
          userNameElement.textContent = userData.firstName;
          console.log("User name updated to:", userData.firstName);
        } else {
          console.warn("firstName field missing in user data:", userData);
          userNameElement.textContent = "User";
        }
      } else {
        console.error("User name element not found in DOM");
      }
    } else {
      console.error("User document does not exist for ID:", userId);
    }
  } catch (error) {
    console.error("Error loading user data:", error);
  }
}

// Updated function to load active bookings with better error handling
async function loadActiveBookings(userId) {
  try {
    console.log("Loading active bookings for user:", userId);
    const bookingsContainer = document.querySelector(".bookings-container");

    if (!bookingsContainer) {
      console.error("Bookings container not found");
      return;
    }

    // Show loading state
    bookingsContainer.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading your bookings...</p>
      </div>
    `;

    // Verify userId is valid
    if (!userId) {
      console.error("No valid userId provided to loadActiveBookings");
      bookingsContainer.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-calendar-x"></i>
          <p>You have no active bookings</p>
          <a href="#quick-search" class="primary-btn">Find a car now</a>
        </div>
      `;
      return;
    }

    console.log("Checking for bookings in user collection:", userId);

    // Option 1: Try getting bookings from user subcollection
    try {
      // Get current timestamp
      const now = new Date();

      // First, check if the bookings subcollection exists
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        console.error("User document does not exist");
        throw new Error("User document not found");
      }

      console.log("User document found, checking for bookings subcollection");

      // Create a simplified query that's less likely to fail
      const bookingsRef = collection(db, "users", userId, "bookings");
      const bookingsSnapshot = await getDocs(bookingsRef);

      console.log(`Found ${bookingsSnapshot.size} total bookings`);

      // If no bookings at all, show empty state
      if (bookingsSnapshot.empty) {
        bookingsContainer.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-calendar-x"></i>
            <p>You have no active bookings</p>
            <a href="#quick-search" class="primary-btn">Find a car now</a>
          </div>
        `;
        return;
      }

      // Process all bookings and filter client-side for simplicity
      const allBookings = [];
      bookingsSnapshot.forEach((doc) => {
        const bookingData = doc.data();

        // Add ID to the booking data
        bookingData.id = doc.id;

        // Convert timestamps to Date objects
        if (
          bookingData.start_time &&
          typeof bookingData.start_time.toDate === "function"
        ) {
          bookingData.start_time = bookingData.start_time.toDate();
        } else if (bookingData.start_time && bookingData.start_time.seconds) {
          bookingData.start_time = new Date(
            bookingData.start_time.seconds * 1000
          );
        }

        if (
          bookingData.end_time &&
          typeof bookingData.end_time.toDate === "function"
        ) {
          bookingData.end_time = bookingData.end_time.toDate();
        } else if (bookingData.end_time && bookingData.end_time.seconds) {
          bookingData.end_time = new Date(bookingData.end_time.seconds * 1000);
        }

        // Only include active or upcoming bookings
        if (
          (bookingData.status === "active" ||
            bookingData.status === "upcoming") &&
          bookingData.end_time >= now
        ) {
          allBookings.push(bookingData);
        }
      });

      console.log(`Found ${allBookings.length} active/upcoming bookings`);

      // If no active bookings, show empty state
      if (allBookings.length === 0) {
        bookingsContainer.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-calendar-x"></i>
            <p>You have no active bookings</p>
            <a href="#quick-search" class="primary-btn">Find a car now</a>
          </div>
        `;
        return;
      }

      // Sort bookings: active first, then by start time
      allBookings.sort((a, b) => {
        const aActive = a.start_time <= now && a.end_time >= now;
        const bActive = b.start_time <= now && b.end_time >= now;

        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return a.start_time - b.start_time;
      });

      // Take only the first 3
      const displayBookings = allBookings.slice(0, 3);

      // Clear container
      bookingsContainer.innerHTML = "";

      // Create and display booking cards
      for (const booking of displayBookings) {
        try {
          // Try to get car details if car_id exists
          if (booking.car_id) {
            try {
              const carDoc = await getDoc(doc(db, "cars", booking.car_id));
              if (carDoc.exists()) {
                booking.car = carDoc.data();
                booking.car.id = carDoc.id;
                booking.car_type = booking.car.car_type;
              }
            } catch (error) {
              console.warn(`Could not get car details for booking ${booking.id}:`, error);
            }
          }
      
          // Create and append the booking card (now async)
          const bookingCard = await createBookingCard(booking);
          bookingsContainer.appendChild(bookingCard);
        } catch (error) {
          console.error(`Error creating booking card for ${booking.id}:`, error);
        }
      }

      console.log("Successfully displayed booking cards");
    } catch (error) {
      console.error("Error with user bookings collection:", error);

      // Option 2: Try getting bookings from main bookings collection
      try {
        console.log("Trying to find bookings in main bookings collection");
        const now = new Date();

        const mainBookingsQuery = query(
          collection(db, "bookings"),
          where("user_id", "==", userId),
          where("status", "in", ["active", "upcoming"]),
          where("end_time", ">=", now)
        );

        const mainBookingsSnapshot = await getDocs(mainBookingsQuery);
        console.log(
          `Found ${mainBookingsSnapshot.size} bookings in main collection`
        );

        if (mainBookingsSnapshot.empty) {
          bookingsContainer.innerHTML = `
            <div class="empty-state">
              <i class="bi bi-calendar-x"></i>
              <p>You have no active bookings</p>
              <a href="#quick-search" class="primary-btn">Find a car now</a>
            </div>
          `;
          return;
        }

        // Process bookings
        const bookings = [];
        mainBookingsSnapshot.forEach((doc) => {
          const booking = doc.data();
          booking.id = doc.id;

          // Convert timestamps
          if (
            booking.start_time &&
            typeof booking.start_time.toDate === "function"
          ) {
            booking.start_time = booking.start_time.toDate();
          } else if (booking.start_time && booking.start_time.seconds) {
            booking.start_time = new Date(booking.start_time.seconds * 1000);
          }

          if (
            booking.end_time &&
            typeof booking.end_time.toDate === "function"
          ) {
            booking.end_time = booking.end_time.toDate();
          } else if (booking.end_time && booking.end_time.seconds) {
            booking.end_time = new Date(booking.end_time.seconds * 1000);
          }

          bookings.push(booking);
        });

        // Sort and limit bookings
        bookings.sort((a, b) => {
          const aActive = a.start_time <= now && a.end_time >= now;
          const bActive = b.start_time <= now && b.end_time >= now;

          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
          return a.start_time - b.start_time;
        });

        const displayBookings = bookings.slice(0, 3);
        bookingsContainer.innerHTML = "";

        // Create booking cards
        for (const booking of displayBookings) {
          if (booking.car_id) {
            try {
              const carDoc = await getDoc(doc(db, "cars", booking.car_id));
              if (carDoc.exists()) {
                booking.car = carDoc.data();
                booking.car.id = carDoc.id;
              }
            } catch (error) {
              console.warn(
                `Could not get car details for booking ${booking.id}:`,
                error
              );
            }
          }

          const bookingCard = createBookingCard(booking);
          bookingsContainer.appendChild(bookingCard);
        }
      } catch (fallbackError) {
        console.error("Both booking retrieval methods failed:", fallbackError);
        bookingsContainer.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-calendar-x"></i>
            <p>You have no active bookings</p>
            <a href="#quick-search" class="primary-btn">Find a car now</a>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error("Error in loadActiveBookings:", error);
    const bookingsContainer = document.querySelector(".bookings-container");
    if (bookingsContainer) {
      bookingsContainer.innerHTML = `
        <div class="error-state">
          <i class="bi bi-exclamation-triangle"></i>
          <p>Failed to load your bookings</p>
          <button onclick="loadActiveBookings('${userId}')" class="refresh-btn">
            <i class="bi bi-arrow-clockwise"></i> Try Again
          </button>
        </div>
      `;
    }
  }
}

async function createBookingCard(booking) {
  // Create booking card element
  const bookingCard = document.createElement("div");
  bookingCard.className = "booking-card";

  // Get car info
  const car = booking.car || {};
  const carType = car.car_type || booking.car_type || "";

  // Get proper car display name from car_models collection
  let carDisplayName = "";
  
  // Use car_models collection lookup - simplified version
  if (carType) {
    try {
      // Try with the full car_type first (including color)
      const fullModelRef = doc(db, "car_models", carType);
      const fullModelDoc = await getDoc(fullModelRef);
      
      if (fullModelDoc.exists()) {
        // Get the name field from car_models document
        const modelData = fullModelDoc.data();
        carDisplayName = modelData.name || "";
        
        // Add color if available
        const color = carType.split('_')[1];
        if (color && !carDisplayName.toLowerCase().includes(color.toLowerCase())) {
          const formattedColor = color.charAt(0).toUpperCase() + color.slice(1);
          carDisplayName += ` (${formattedColor})`;
        }
      } else {
        // If not found, use parseCarType as fallback
        const carTypeInfo = parseCarType(carType);
        if (carTypeInfo.make === "Tesla") {
          carDisplayName = `${carTypeInfo.make} ${carTypeInfo.model}`;
        } else {
          carDisplayName = carTypeInfo.model;
        }
        
        // Add color if available
        const color = carType.split('_')[1];
        if (color) {
          const formattedColor = color.charAt(0).toUpperCase() + color.slice(1);
          carDisplayName += ` (${formattedColor})`;
        }
      }
    } catch (error) {
      console.error("Error fetching car model:", error);
      // Use parseCarType as fallback
      const carTypeInfo = parseCarType(carType);
      carDisplayName = carTypeInfo.make === "Tesla" ? 
        `${carTypeInfo.make} ${carTypeInfo.model}` : 
        carTypeInfo.model;
      
      // Add color
      if (carTypeInfo.color) {
        carDisplayName += ` (${carTypeInfo.color})`;
      }
    }
  }
  
  // Fallback if we couldn't determine the name
  if (!carDisplayName) {
    carDisplayName = car.make ? `${car.make} ${car.model}` : "Car";
  }

  // Convert timestamps to dates
  const startTime =
    booking.start_time instanceof Date
      ? booking.start_time
      : booking.start_time?.toDate
      ? booking.start_time.toDate()
      : new Date(booking.start_time);

  const endTime =
    booking.end_time instanceof Date
      ? booking.end_time
      : booking.end_time?.toDate
      ? booking.end_time.toDate()
      : new Date(booking.end_time);

  // Format dates
  const formattedDate = startTime.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const formattedStartTime = startTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const formattedEndTime = endTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Calculate duration
  const durationMs = endTime - startTime;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

  // Determine status
  const now = new Date();
  let statusClass = "upcoming";
  let statusText = "Upcoming";
  let timeLeftText = "";

  if (now >= startTime && now <= endTime) {
    statusClass = "active";
    statusText = "Active";
    const timeLeft = endTime - now;
    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    timeLeftText = `${hoursLeft}h ${minutesLeft}m remaining`;
  } else if (now < startTime) {
    const timeUntil = startTime - now;
    const daysUntil = Math.floor(timeUntil / (1000 * 60 * 60 * 24));
    const hoursUntil = Math.floor(
      (timeUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    timeLeftText =
      daysUntil > 0
        ? `Starts in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`
        : `Starts in ${hoursUntil} hour${hoursUntil > 1 ? "s" : ""}`;
  }

  // Extract license plate
  const licensePlate = car.license_plate || "No plate";

  // Get car image
  const carImage =
    car.image_url || `../static/images/car_images/${carType || "car"}.png`;

  // Get pickup location
  const pickupLocation =
    booking.pickup_location || car.address || "Location not available";

  // Build HTML using carDisplayName
  bookingCard.innerHTML = `
    <div class="booking-car-image">
      <img src="${carImage}" alt="${carDisplayName}" onerror="this.src='../static/images/car_images/car.png';">
      <div class="status-badge ${statusClass}">${statusText}</div>
    </div>
    <div class="booking-details">
      <div class="car-header">
        <h3>${carDisplayName}</h3>
        <div class="license-plate-badge">${licensePlate}</div>
      </div>
      
      <div class="booking-info-grid">
        <div class="booking-info-item">
          <i class="bi bi-calendar3"></i>
          <span>${formattedDate}</span>
        </div>
        <div class="booking-info-item">
          <i class="bi bi-clock"></i>
          <span>${formattedStartTime} - ${formattedEndTime}</span>
        </div>
        <div class="booking-info-item">
          <i class="bi bi-hourglass-split"></i>
          <span>${durationText}</span>
        </div>
        <div class="booking-info-item">
          <i class="bi bi-geo-alt"></i>
          <span title="${pickupLocation}">${truncateText(
    pickupLocation,
    30
  )}</span>
        </div>
      </div>
      
      ${
        timeLeftText
          ? `<div class="time-remaining"><i class="bi bi-alarm"></i> ${timeLeftText}</div>`
          : ""
      }
      
      <div class="booking-actions">
        <a href="user-booking-details.html?id=${
          booking.id
        }" class="booking-view-link">
          View Details <i class="bi bi-arrow-right"></i>
        </a>
      </div>
    </div>
  `;

  return bookingCard;
}

// Helper function for text truncation
function truncateText(text, maxLength) {
  if (!text) return "";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

// Initialize search functionality
function initializeSearch() {
  // Initialize Google Places Autocomplete with expanded options
  const input = document.getElementById("location-input");

  // Create a more inclusive autocomplete that shows more detailed results
  const autocompleteOptions = {
    componentRestrictions: { country: "sg" }, // Keep Singapore restriction
    fields: ["address_components", "geometry", "name", "formatted_address"],
    types: ["establishment", "geocode"], // Include both establishments and geocodes
    strictBounds: false, // Don't restrict to viewport
    bounds: new google.maps.LatLngBounds(
      new google.maps.LatLng(1.1304, 103.602), // SW bounds of Singapore
      new google.maps.LatLng(1.4504, 104.02) // NE bounds of Singapore
    ),
  };

  const autocomplete = new google.maps.places.Autocomplete(
    input,
    autocompleteOptions
  );

  // Prevent form submission on Enter key (keep this)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  });

  // Store location when place is selected (improved version)
  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    console.log("Selected place:", place);

    if (!place.geometry) {
      input.placeholder = "Enter a location";
      return;
    }

    // Store the selected position with more details
    userPosition = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      name: place.name || "",
      address: place.formatted_address || "",
    };

    console.log("Set user position:", userPosition);

    // Update location input with full formatted address if available
    if (place.formatted_address) {
      input.value = place.formatted_address;
    }

    // Center map on the selected location and update nearby cars
    if (map) {
      map.setCenter(userPosition);
      map.setZoom(15); // Closer zoom for better detail
      loadNearbyCars();
    }
  });

  // Setup form validation (keep this part)
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

// Modified loadNearbyCars function to handle async car model info fetching
async function loadNearbyCars() {
  console.log("Loading nearby cars...");
  const nearbyCarsContainer = document.getElementById("nearby-cars");

  try {
    // Show loading state
    nearbyCarsContainer.innerHTML =
      '<div class="loading-state"><div class="spinner"></div><p>Finding cars near you...</p></div>';

    // Get all cars
    const carsSnapshot = await getDocs(collection(db, "cars"));
    console.log(`Found ${carsSnapshot.size} total cars in database`);

    if (carsSnapshot.empty) {
      console.log("No cars found in database");
      nearbyCarsContainer.innerHTML =
        '<div class="empty-state"><i class="bi bi-car-front"></i><p>No cars available at the moment</p></div>';
      return;
    }

    // Process cars
    const carDataPromises = [];

    // Debug counters
    let availableCount = 0;
    let withLocationCount = 0;

    // Process each car document
    for (const carDoc of carsSnapshot.docs) {
      const carData = carDoc.data();

      // Check if car is available
      if (carData.status && carData.status.toLowerCase() === "available") {
        availableCount++;

        // Check if car has valid location data
        if (
          carData.current_location &&
          typeof carData.current_location.latitude === "number" &&
          typeof carData.current_location.longitude === "number"
        ) {
          withLocationCount++;

          // Create a promise for getting car model info
          const carDataPromise = (async () => {
            console.log(
              `Getting model info for car ${carDoc.id} with type ${carData.car_type}`
            );

            // Extract car information from car_type
            const carTypeInfo = await getCarModelInfo(carData.car_type || "");
            console.log(`Model info result for ${carDoc.id}:`, carTypeInfo);

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

            // Return the processed car data
            return {
              id: carDoc.id,
              ...carData,
              make: carTypeInfo.make,
              modelName: carTypeInfo.model,
              displayName: carTypeInfo.displayName,
              image: `../static/images/car_images/${
                carData.car_type || "car"
              }.png`,
              distance: distance,
            };
          })();

          carDataPromises.push(carDataPromise);
        }
      }
    }

    // Wait for all car data promises to resolve
    nearbyCarsList = await Promise.all(carDataPromises);

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

      // Initialize map with car locations
      console.log("Initializing map with", nearbyCarsList.length, "cars");
      initializeMap(nearbyCarsList);
    }
  } catch (error) {
    console.error("Error loading cars:", error);
    nearbyCarsContainer.innerHTML =
      '<div class="error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load cars. Please try again.</p></div>';
  }
}

// Add after loadNearbyCars function
async function debugMapAndCars() {
  console.log("==== DEBUG MAP AND CARS ====");

  // 1. Check map element
  const mapEl = document.getElementById("map");
  console.log("Map element exists:", !!mapEl);
  if (mapEl) {
    console.log("Map dimensions:", {
      offsetWidth: mapEl.offsetWidth,
      offsetHeight: mapEl.offsetHeight,
      clientWidth: mapEl.clientWidth,
      clientHeight: mapEl.clientHeight,
      style: mapEl.style.cssText,
    });
  }

  // 2. Check cars in database
  try {
    const carsSnapshot = await getDocs(collection(db, "cars"));
    console.log(`Found ${carsSnapshot.size} total cars in database`);

    if (carsSnapshot.size > 0) {
      // Log the first car for inspection
      const firstCar = carsSnapshot.docs[0].data();
      console.log("Sample car data:", firstCar);

      // Check critical properties
      console.log("Car status:", firstCar.status);
      console.log("Car location:", firstCar.current_location);

      if (firstCar.current_location) {
        console.log(
          "Location lat type:",
          typeof firstCar.current_location.latitude
        );
        console.log(
          "Location lng type:",
          typeof firstCar.current_location.longitude
        );
      }
    }
  } catch (e) {
    console.error("Error checking cars:", e);
  }

  console.log("==== END DEBUG ====");
}

// Call this at the beginning of your loadNearbyCars function
await debugMapAndCars();

// Enhanced function to get car display name from database
async function getCarModelInfo(carType) {
  try {
    // If no car type provided, return default
    if (!carType) {
      return {
        make: "Unknown",
        model: "Vehicle",
        displayName: "Unknown Vehicle",
      };
    }

    // Extract color for display purposes
    const [modelId, colorPart] = carType.split("_");
    const color = colorPart
      ? colorPart.charAt(0).toUpperCase() + colorPart.slice(1)
      : "";

    // Special handling for Tesla models
    if (modelId.toLowerCase().startsWith("model")) {
      // For Tesla, use direct formatting without database lookup
      let make = "Tesla";
      let model;

      switch (modelId.toLowerCase()) {
        case "modely":
          model = "Model Y";
          break;
        case "model3":
          model = "Model 3";
          break;
        case "models":
          model = "Model S";
          break;
        case "modelx":
          model = "Model X";
          break;
        default:
          model = modelId.replace(/([A-Z])/g, " $1").trim();
      }

      const displayName = color
        ? `${make} ${model} (${color})`
        : `${make} ${model}`;

      console.log(`Generated Tesla display name: ${displayName}`);

      return {
        make: make,
        model: model,
        color: color,
        displayName: displayName,
      };
    }

    // For non-Tesla cars, try multiple lookup methods
    console.log(`Looking up car model document...`);

    // First try with the full car_type as document ID
    let modelDoc = null;

    try {
      // Try with the full car_type first (including color if present)
      const fullModelRef = doc(db, "car_models", carType);
      const fullModelDoc = await getDoc(fullModelRef);

      if (fullModelDoc.exists()) {
        console.log(`Found car model using full car_type: ${carType}`);
        modelDoc = fullModelDoc;
      } else {
        // If not found, try with just the model part
        console.log(
          `No document found for full car_type, trying model part: ${modelId}`
        );
        const modelOnlyRef = doc(db, "car_models", modelId);
        const modelOnlyDoc = await getDoc(modelOnlyRef);

        if (modelOnlyDoc.exists()) {
          console.log(`Found car model using model part: ${modelId}`);
          modelDoc = modelOnlyDoc;
        } else {
          console.log(`No document found for either ${carType} or ${modelId}`);
        }
      }
    } catch (dbError) {
      console.error(`Database error fetching car model:`, dbError);
    }

    // If we found a document, use its data
    if (modelDoc && modelDoc.exists()) {
      const modelData = modelDoc.data();
      console.log(`Found car model data:`, modelData);

      // Get the name field
      const modelName = modelData.name || "";

      // Build display name
      let displayName = modelName;
      if (color) {
        displayName += ` (${color})`;
      }

      console.log(`Generated display name from car_models: ${displayName}`);

      return {
        make: "", // We don't separate make/model as it's in the name field
        model: modelName,
        color: color,
        displayName: displayName,
      };
    }

    // Fallback if car model not found in database
    console.log(`Using fallback formatting for ${carType}`);

    // Format the model ID as a fallback
    const formattedModel = modelId
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    // For fallback, we don't assume any specific make
    const displayName = color ? `${formattedModel} (${color})` : formattedModel;

    return {
      make: "",
      model: formattedModel,
      color: color,
      displayName: displayName,
    };
  } catch (error) {
    // Handle errors gracefully
    console.error("Error in getCarModelInfo:", error);

    // Simple fallback formatting in case of error
    const [modelId, colorPart] = carType.split("_");
    const color = colorPart
      ? colorPart.charAt(0).toUpperCase() + colorPart.slice(1)
      : "";

    const formattedModel = modelId
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return {
      make: "",
      model: formattedModel,
      color: color,
      displayName: color ? `${formattedModel} (${color})` : formattedModel,
    };
  }
}

// Helper function to parse car_type
function parseCarType(carType) {
  if (!carType) return { make: "Unknown", model: "Vehicle" };

  // Parse car_type to extract make/model and color
  const [modelPart, colorPart] = carType.split("_");

  // Special cases for specific models
  let make = "Tesla";
  let model = "";

  // Handle specific model cases
  switch (modelPart.toLowerCase()) {
    case "modely":
      model = "Model Y";
      break;
    default:
      // Format the model part to be more readable for other models
      model = modelPart
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
  }

  // Format color part if it exists
  const color = colorPart
    ? colorPart.charAt(0).toUpperCase() + colorPart.slice(1)
    : "";

  return {
    make: make,
    model: model,
    color: color,
  };
}

// Modified createCarElement function to use the enhanced getCarModelInfo
function createCarElement(car) {
  const carEl = document.createElement("div");
  carEl.className = "car-card";

  // Get the car type for dataset filtering
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

  // Get license plate and car ID
  const licensePlate = car.license_plate || "No plate";
  const carId = car.id ? car.id.substring(0, 6) : "";
  const licensePlatePill = `${licensePlate}${carId ? ` (${carId})` : ""}`;

  // Create HTML content with car name from displayName
  carEl.innerHTML = `
    <div class="car-image">
      <img src="${car.image}" alt="${
    car.displayName || `${car.make} ${car.modelName}`
  }" onerror="this.src='../static/images/assets/car-placeholder.png';">
    </div>
    <div class="car-info">
      <div class="car-header">
        <h3>${car.displayName || `${car.make} ${car.modelName}`}</h3>
        <div class="license-plate-badge">${licensePlatePill}</div>
      </div>
      <div class="car-meta">
        ${distanceDisplay}
        <span class="car-price">${priceDisplay}</span>
      </div>
      <p class="car-location">
        <i class="bi bi-geo-alt"></i> 
        ${car.address || "Location not available"}
      </p>
      <a href="user-car-details.html?id=${car.id}" class="view-details-btn">
        View Details <i class="bi bi-arrow-right"></i>
      </a>
    </div>`;

  return carEl;
}

// Initialize map with car markers
function initializeMap(cars) {
  console.log("Initializing map with cars:", cars);

  // Check marker image paths
  const userMarkerPath = "../static/images/assets/user-marker.png";
  const carMarkerPath = "../static/images/assets/car-marker.png";

  // Debug image paths
  const userImg = new Image();
  userImg.onload = () => console.log("User marker image loaded successfully");
  userImg.onerror = () => console.error("User marker image failed to load");
  userImg.src = userMarkerPath;

  const carImg = new Image();
  carImg.onload = () => console.log("Car marker image loaded successfully");
  carImg.onerror = () => console.error("Car marker image failed to load");
  carImg.src = carMarkerPath;

  // Force map dimensions
  const mapElement = document.getElementById("map");
  if (!mapElement) {
    console.error("Map element not found");
    return;
  }

  // CRITICAL: Explicitly set map height inline
  mapElement.style.height = "400px";
  mapElement.style.width = "100%";
  console.log("Set map dimensions explicitly");

  // Debug map element
  console.log("Map element dimensions:", {
    offsetHeight: mapElement.offsetHeight,
    clientHeight: mapElement.clientHeight,
    style: mapElement.style.cssText,
  });

  // Default center (Singapore)
  let mapCenter = { lat: 1.3521, lng: 103.8198 };

  // Try to use user position or car position
  if (userPosition && typeof userPosition.lat === "number") {
    mapCenter = userPosition;
  } else if (cars.length > 0 && cars[0].current_location) {
    const firstCar = cars[0];
    mapCenter = {
      lat: firstCar.current_location.latitude,
      lng: firstCar.current_location.longitude,
    };
  }

  console.log("Map will center at:", mapCenter);

  // Clear existing markers
  if (markers.length > 0) {
    markers.forEach((marker) => marker.setMap(null));
    markers = [];
  }

  // Ensure the Google Maps API is loaded
  if (!window.google || !window.google.maps) {
    console.error("Google Maps API not loaded!");
    return;
  }

  // Create the map with a timeout to ensure DOM is ready
  setTimeout(() => {
    try {
      // Create new map instance
      map = new google.maps.Map(mapElement, {
        center: mapCenter,
        zoom: 13,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
      });

      console.log("Map created successfully");

      // Add markers after a small delay
      setTimeout(() => addMarkersToMap(cars), 500);
    } catch (error) {
      console.error("Error creating map:", error);
    }
  }, 300);
}

// Modified addMarkersToMap function to store car IDs with markers
function addMarkersToMap(cars) {
  if (!map) {
    console.error("Map not initialized!");
    return;
  }

  console.log("Adding markers to map");
  const bounds = new google.maps.LatLngBounds();

  // Add user position marker if available
  if (userPosition) {
    try {
      const userMarker = new google.maps.Marker({
        position: userPosition,
        map: map,
        title: "Your location",
        icon: {
          url: "../static/images/assets/user-marker.png",
          scaledSize: new google.maps.Size(32, 32),
        },
        zIndex: 1000, // Make sure user marker appears on top
      });

      markers.push(userMarker);
      bounds.extend(userPosition);
      console.log("Added user position marker");
    } catch (e) {
      console.error("Error adding user marker:", e);
    }
  }

  // Add car markers
  cars.forEach((car, index) => {
    if (car.current_location) {
      const position = {
        lat: car.current_location.latitude,
        lng: car.current_location.longitude,
      };

      try {
        // Create marker
        const marker = new google.maps.Marker({
          position: position,
          map: map,
          title: car.displayName || `${car.make} ${car.modelName}`,
          icon: {
            url: "../static/images/assets/car-marker.png",
            scaledSize: new google.maps.Size(32, 32),
          },
          animation: google.maps.Animation.DROP,
        });

        // Store car ID with marker for filtering
        marker.carId = car.id;

        // Create info window
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 10px; max-width: 200px;">
              <h4 style="margin-top: 0;">${
                car.displayName || `${car.make} ${car.modelName}`
              }</h4>
              <p style="margin-bottom: 8px;">${
                car.address || "Location not available"
              }</p>
              <a href="user-car-details.html?id=${car.id}" 
                 style="display: inline-block; background: #1e88e5; color: white; 
                        padding: 4px 10px; text-decoration: none; border-radius: 4px;">
                View Details
              </a>
            </div>
          `,
        });

        // Add click event
        marker.addListener("click", function () {
          infoWindow.open(map, marker);
        });

        markers.push(marker);
        bounds.extend(position);
      } catch (e) {
        console.error(`Error adding marker for car ${index}:`, e);
      }
    }
  });

  // Fit bounds
  if (markers.length > 0) {
    map.fitBounds(bounds);

    // Don't zoom in too far
    google.maps.event.addListenerOnce(map, "idle", function () {
      if (map.getZoom() > 15) map.setZoom(15);
    });
  }
}

// Enhanced filterNearbyCars function
function filterNearbyCars() {
  const typeFilter = document
    .getElementById("car-type-filter")
    .value.toLowerCase();
  const seatsFilter = document.getElementById("seats-filter").value;
  const fuelFilter = document.getElementById("fuel-filter").value.toLowerCase();

  console.log("Filtering cars with criteria:", {
    typeFilter,
    seatsFilter,
    fuelFilter,
  });

  let visibleCars = 0;

  // Filter the car elements in the list view
  const carCards = document.querySelectorAll("#nearby-cars .car-card");
  carCards.forEach((card) => {
    // Get dataset values for filtering
    const cardType = card.dataset.type;
    const cardSeats = card.dataset.seats;
    const cardFuel = card.dataset.fuel;

    // Check if card matches all selected filters
    const typeMatch = typeFilter === "all" || cardType === typeFilter;
    const seatsMatch = seatsFilter === "all" || cardSeats === seatsFilter;
    const fuelMatch = fuelFilter === "all" || cardFuel === fuelFilter;

    // Apply filter
    if (typeMatch && seatsMatch && fuelMatch) {
      card.style.display = "block";
      visibleCars++;
    } else {
      card.style.display = "none";
    }
  });

  // Filter map markers to match visible cars
  if (markers && markers.length > 0) {
    markers.forEach((marker) => {
      // Skip markers without car data or user location marker
      if (!marker.carId) {
        return; // This is likely the user location marker
      }

      // Find the corresponding car in nearbyCarsList
      const car = nearbyCarsList.find((c) => c.id === marker.carId);
      if (!car) return;

      // Extract filtering data from car
      const carType = car.car_type
        ? car.car_type.split("_")[0].toLowerCase()
        : "";
      const carSeats = car.seating_capacity || "5";
      const carFuel = car.fuel_type ? car.fuel_type.toLowerCase() : "petrol";

      // Apply same filtering logic as for cards
      const typeMatch = typeFilter === "all" || carType === typeFilter;
      const seatsMatch = seatsFilter === "all" || carSeats === seatsFilter;
      const fuelMatch = fuelFilter === "all" || carFuel === fuelFilter;

      // Show/hide marker based on filter results
      if (typeMatch && seatsMatch && fuelMatch) {
        marker.setMap(map); // Show marker
      } else {
        marker.setMap(null); // Hide marker
      }
    });
  }

  // Show no results message when all cars are filtered out
  const emptyStateEl = document.querySelector("#nearby-cars .empty-state");
  if (visibleCars === 0) {
    if (!emptyStateEl) {
      const noResults = document.createElement("div");
      noResults.className = "empty-state";
      noResults.innerHTML = `
        <i class="bi bi-car-front"></i>
        <p>No cars match your filter criteria</p>
      `;
      document.getElementById("nearby-cars").appendChild(noResults);
    }
  } else if (emptyStateEl) {
    emptyStateEl.remove();
  }

  console.log(`Filter applied - ${visibleCars} cars visible`);
}

// Function to reset all filters
function resetFilters() {
  console.log("Resetting all filters");

  // Reset filter dropdown values
  document.getElementById("car-type-filter").value = "all";
  document.getElementById("seats-filter").value = "all";
  document.getElementById("fuel-filter").value = "all";

  // Make all car cards visible
  const carCards = document.querySelectorAll("#nearby-cars .car-card");
  carCards.forEach((card) => {
    card.style.display = "block";
  });

  // Show all car markers on the map
  if (markers && markers.length > 0) {
    markers.forEach((marker) => {
      if (marker.carId) {
        // Only show car markers (not user location)
        marker.setMap(map);
      }
    });
  }

  // Remove any "No results" message
  const emptyStateEl = document.querySelector("#nearby-cars .empty-state");
  if (emptyStateEl) {
    emptyStateEl.remove();
  }

  console.log("All filters reset");
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
