// user-booking-success.js
import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize variables
let bookingId;
let carId;
let carData;
let bookingData;
let userId;

// DOM Elements
const copyBtn = document.getElementById("copy-btn");
const addToCalendarBtn = document.getElementById("add-to-calendar");
const loadingOverlay = document.createElement("div");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Booking success page loaded");
  setupLoadingOverlay();
  showLoading(true);

  try {
    // Load header and footer
    await loadHeaderFooter();

    // Setup logout button
    setupLogoutButton();

    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          userId = user.uid;
          console.log("User authenticated:", userId);

          // Get booking ID from URL parameters
          const urlParams = new URLSearchParams(window.location.search);
          bookingId = urlParams.get("id");

          console.log("Booking ID from URL:", bookingId);

          if (!bookingId) {
            console.error("No booking ID found in URL");
            showError("Booking information not found.");
            return;
          }

          // Load booking and car data
          await loadBookingData();

          // Load car details after getting carId from booking
          if (carId) {
            await loadCarData();
          }

          // Display booking details
          displayBookingSummary();

          // Setup event listeners
          setupEventListeners();

          // Hide loading
          showLoading(false);
        } catch (error) {
          console.error("Error loading booking success page:", error);
          showError("Failed to load booking details: " + error.message);
        }
      } else {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("General initialization error:", error);
    showError("An error occurred while loading the page.");
  }
});

// Load header and footer
async function loadHeaderFooter() {
  try {
    // Load header
    const headerResponse = await fetch(
      "../static/headerFooter/user-header.html"
    );
    if (!headerResponse.ok) {
      throw new Error(`Failed to load header: ${headerResponse.status}`);
    }
    document.getElementById("header").innerHTML = await headerResponse.text();

    // Load footer
    const footerResponse = await fetch(
      "../static/headerFooter/user-footer.html"
    );
    if (!footerResponse.ok) {
      throw new Error(`Failed to load footer: ${footerResponse.status}`);
    }
    document.getElementById("footer").innerHTML = await footerResponse.text();
  } catch (error) {
    console.error("Error loading header/footer:", error);
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

// Load booking data from Firestore
async function loadBookingData() {
  try {
    console.log("Loading booking data for ID:", bookingId);

    // First try to get booking from user's bookings
    const bookingDoc = await getDoc(
      doc(db, "users", userId, "bookings", bookingId)
    );

    if (!bookingDoc.exists()) {
      console.log(
        "Booking not found in user's bookings, trying timesheet collection..."
      );
      // Fall back to timesheets collection if needed
      // (We'd need to know the car ID for this, which might not be possible)
      throw new Error("Booking not found. It may have been removed.");
    }

    // Store booking data
    bookingData = bookingDoc.data();
    console.log("Booking data loaded:", bookingData);

    // Get car ID from booking data
    carId = bookingData.car_id;
    console.log("Car ID from booking:", carId);

    if (!carId) {
      throw new Error("Car information not found in booking.");
    }

    return bookingData;
  } catch (error) {
    console.error("Error loading booking data:", error);
    throw error;
  }
}

// Load car details from Firestore
async function loadCarData() {
  try {
    console.log("Loading car data for ID:", carId);

    // Get car document
    const carDoc = await getDoc(doc(db, "cars", carId));

    if (!carDoc.exists()) {
      throw new Error("Car not found in database.");
    }

    // Store car data
    carData = carDoc.data();
    carData.id = carId;
    console.log("Car data loaded:", carData);

    // Extract full car_type for database lookup
    const fullCarType = carData.car_type || "";
    console.log(`Full car_type for database lookup: "${fullCarType}"`);

    // Look up car model info in car_models collection
    try {
      // First try with the FULL car_type (including color)
      console.log(`Looking up car model with FULL car_type: "${fullCarType}"`);
      let modelDoc = await getDoc(doc(db, "car_models", fullCarType));

      // If not found with full car_type, try with base model as fallback
      if (!modelDoc.exists() && fullCarType.includes("_")) {
        const baseModelId = fullCarType.split("_")[0];
        console.log(
          `Full car_type not found, trying base model: "${baseModelId}"`
        );
        modelDoc = await getDoc(doc(db, "car_models", baseModelId));
      }

      if (modelDoc.exists()) {
        const modelData = modelDoc.data();
        console.log("Found car model data:", modelData);

        // If the model has a name field, use it for display
        if (modelData.name) {
          console.log(`Using car name from database: "${modelData.name}"`);

          // Store the exact name from the database
          carData.displayName = modelData.name;

          // Also store make/model for compatibility with existing code
          const nameParts = modelData.name.split(" ");
          if (nameParts.length > 1) {
            carData.make = nameParts[0];
            carData.model = nameParts.slice(1).join(" ");
          } else {
            carData.make = modelData.name;
            carData.model = "";
          }
        } else {
          console.log(
            "Model document has no name field, using fallback parsing"
          );
          // Fall back to parsing if no name field
          const parsed = parseCarType(fullCarType);
          carData.make = parsed.make;
          carData.model = parsed.model;
          carData.displayName = `${parsed.make} ${parsed.model}`.trim();
        }
      } else {
        console.log(`No model document found, using fallback parsing`);
        // Fall back to parsing if no document found
        const parsed = parseCarType(fullCarType);
        carData.make = parsed.make;
        carData.model = parsed.model;
        carData.displayName = `${parsed.make} ${parsed.model}`.trim();
      }
    } catch (modelError) {
      console.error("Error fetching car model data:", modelError);
      // Fall back to parsing if lookup fails
      const parsed = parseCarType(fullCarType);
      carData.make = parsed.make;
      carData.model = parsed.model;
      carData.displayName = `${parsed.make} ${parsed.model}`.trim();
    }

    return carData;
  } catch (error) {
    console.error("Error loading car data:", error);
    throw error;
  }
}

// Helper function to parse car_type
function parseCarType(carType) {
  // Default values
  let make = "Unknown";
  let model = "Car";

  // Parse car_type (e.g., "modely_white" -> "Tesla", "Model Y")
  if (carType) {
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
  }

  return { make, model };
}

// Display booking summary
function displayBookingSummary() {
  try {
    // Set booking ID
    const bookingIdElement = document.getElementById("booking-id");
    if (bookingIdElement) {
      // Format booking ID to be more readable by removing "booking_" prefix
      const formattedId = bookingId.replace("booking_", "");
      bookingIdElement.textContent = formattedId;
    }

    // Car details
    const carModelElement = document.getElementById("car-model");
    if (carModelElement && carData) {
      carModelElement.textContent = `${carData.make} ${carData.model}`;
    }

    // Car license plate
    const carPlateElement = document.getElementById("car-plate");
    if (carPlateElement && carData && carData.license_plate) {
      carPlateElement.textContent = carData.license_plate;
    }

    // Car image
    const carImageElement = document.getElementById("car-image");
    if (carImageElement && carData) {
      carImageElement.src = `../static/images/car_images/${
        carData.car_type || "car"
      }.png`;
      carImageElement.onerror = () => {
        carImageElement.src = `../static/images/assets/${
          carData.car_type || "car"
        }.png`;
        carImageElement.onerror = () => {
          carImageElement.src = "../static/images/assets/car-placeholder.jpg";
        };
      };
    }

    // Car seats
    const carSeatsElement = document.getElementById("car-seats");
    if (carSeatsElement && carData && carData.seating_capacity) {
      carSeatsElement.textContent = `${carData.seating_capacity} seats`;
    }

    // Simplified luggage capacity code
    const smallLuggageElement = document.getElementById("small-luggage");
    if (smallLuggageElement && carData) {
      smallLuggageElement.textContent = carData.small_luggage || "0";
    }

    const largeLuggageElement = document.getElementById("large-luggage");
    if (largeLuggageElement && carData) {
      largeLuggageElement.textContent = carData.large_luggage || "0";
    }

    // Location
    const locationElement = document.getElementById("pickup-location");
    if (locationElement && carData) {
      locationElement.textContent = carData.address || "Location not available";
    }

    // Format booking dates
    if (bookingData) {
      const startTime = bookingData.start_time.toDate
        ? bookingData.start_time.toDate()
        : new Date(bookingData.start_time.seconds * 1000);

      const endTime = bookingData.end_time.toDate
        ? bookingData.end_time.toDate()
        : new Date(bookingData.end_time.seconds * 1000);

      const dateOptions = {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };

      // Set formatted start and end times
      const pickupElement = document.getElementById("pickup-datetime");
      if (pickupElement) {
        pickupElement.textContent = startTime.toLocaleString(
          "en-US",
          dateOptions
        );
      }

      const returnElement = document.getElementById("return-datetime");
      if (returnElement) {
        returnElement.textContent = endTime.toLocaleString(
          "en-US",
          dateOptions
        );
      }

      // Calculate and format duration
      const durationMinutes = bookingData.duration_minutes;
      const days = Math.floor(durationMinutes / (24 * 60));
      const hours = Math.floor((durationMinutes % (24 * 60)) / 60);
      const minutes = durationMinutes % 60;

      let durationText = "";
      if (days > 0) durationText += `${days} day${days > 1 ? "s" : ""} `;
      if (hours > 0) durationText += `${hours} hour${hours > 1 ? "s" : ""} `;
      if (minutes > 0)
        durationText += `${minutes} minute${minutes > 1 ? "s" : ""}`;

      const durationElement = document.getElementById("booking-duration");
      if (durationElement) {
        durationElement.textContent = durationText.trim() || "0 minutes";
      }

      // Set price information
      const rateElement = document.getElementById("hourly-rate");
      const totalElement = document.getElementById("total-price");

      if (rateElement && bookingData.hourly_rate) {
        rateElement.textContent = bookingData.hourly_rate.toFixed(2);
      }

      if (totalElement && bookingData.total_price) {
        totalElement.textContent = bookingData.total_price.toFixed(2);
      }
    }
  } catch (error) {
    console.error("Error displaying booking summary:", error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Copy booking ID button
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const bookingIdElement = document.getElementById("booking-id");
      if (bookingIdElement) {
        const bookingText = bookingIdElement.textContent;
        navigator.clipboard
          .writeText(bookingText)
          .then(() => {
            // Show copy confirmation
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
            setTimeout(() => {
              copyBtn.innerHTML = originalIcon;
            }, 2000);
          })
          .catch((err) => {
            console.error("Could not copy text: ", err);
          });
      }
    });
  }

  // Add to calendar button
  if (addToCalendarBtn) {
    addToCalendarBtn.addEventListener("click", createCalendarEvent);
  }
}

// Create calendar event
function createCalendarEvent() {
  try {
    if (!bookingData) return;

    const startTime = bookingData.start_time.toDate
      ? bookingData.start_time.toDate()
      : new Date(bookingData.start_time.seconds * 1000);

    const endTime = bookingData.end_time.toDate
      ? bookingData.end_time.toDate()
      : new Date(bookingData.end_time.seconds * 1000);

    const title = `Car Rental: ${
      carData ? `${carData.make} ${carData.model}` : "Reserved Car"
    }`;
    const location = carData ? carData.address : "";
    const details =
      `Booking Reference: ${bookingId}\n` +
      `Car: ${
        carData ? `${carData.make} ${carData.model}` : "Reserved Car"
      }\n` +
      `License Plate: ${carData ? carData.license_plate || "N/A" : "N/A"}\n` +
      `Pickup Location: ${location}`;

    // Format for Google Calendar
    const startIso = startTime.toISOString().replace(/-|:|\.\d+/g, "");
    const endIso = endTime.toISOString().replace(/-|:|\.\d+/g, "");

    const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      title
    )}&dates=${startIso}/${endIso}&details=${encodeURIComponent(
      details
    )}&location=${encodeURIComponent(location)}&sf=true&output=xml`;

    window.open(url, "_blank");
  } catch (error) {
    console.error("Error creating calendar event:", error);
    alert("Failed to create calendar event. Please try again.");
  }
}

// Setup loading overlay
function setupLoadingOverlay() {
  loadingOverlay.className = "loading-overlay";
  loadingOverlay.innerHTML = `
        <div class="spinner"></div>
        <p>Loading booking details...</p>
    `;
  document.body.appendChild(loadingOverlay);
}

// Show/hide loading overlay
function showLoading(show) {
  loadingOverlay.style.display = show ? "flex" : "none";
}

// Show error message
function showError(message) {
  const container = document.querySelector(".container");
  if (container) {
    container.innerHTML = `
            <div class="error-card">
                <div class="error-icon">
                    <i class="bi bi-exclamation-circle"></i>
                </div>
                <h2>Oops! Something went wrong</h2>
                <p>${message}</p>
                <div class="action-buttons">
                    <a href="user-dashboard.html" class="secondary-btn">
                        <i class="bi bi-house"></i> Back to Dashboard
                    </a>
                    <a href="user-bookings.html" class="primary-btn">
                        <i class="bi bi-list"></i> View My Bookings
                    </a>
                </div>
            </div>
        `;
  }
  showLoading(false);
}
