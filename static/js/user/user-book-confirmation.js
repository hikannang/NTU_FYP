import { db, auth } from "../common/firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize global variables
let bookingDetails;
let carData;
let userId;

// DOM Elements
const loadingOverlay = document.getElementById("loading-overlay");
const confirmButton = document.getElementById("confirm-btn");
const modifyButton = document.getElementById("modify-btn");
const termsCheckbox = document.getElementById("terms-checkbox");
const termsError = document.getElementById("terms-error");
const bookingSummary = document.getElementById("booking-summary");
const errorMessage = document.getElementById("error-message");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Booking confirmation page loaded");
  
  try {
    // Load header and footer
    await loadHeaderFooter();
    
    // Show loading state
    showLoading(true);
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        userId = user.uid;
        console.log("User authenticated:", userId);
        
        try {
          // Get booking details from session storage that were set by user-car-details.js
          const bookingDetailsString = sessionStorage.getItem("bookingDetails");
          if (!bookingDetailsString) {
            throw new Error("Booking details not found. Please try booking again.");
          }
          
          // Parse booking details
          bookingDetails = JSON.parse(bookingDetailsString);
          console.log("Retrieved booking details:", bookingDetails);
          
          // Load car details to display additional information
          await loadCarDetails(bookingDetails.carId);
          
          // Display booking summary
          displayBookingSummary();
          
          // Setup event listeners
          setupEventListeners();
          
          // Hide loading overlay
          showLoading(false);
        } catch (error) {
          console.error("Error loading booking confirmation:", error);
          showError("Failed to load booking details: " + error.message);
        }
      } else {
        console.log("User not authenticated, redirecting to login");
        // Redirect to login if not authenticated
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("General initialization error:", error);
    showError("An error occurred while initializing the page: " + error.message);
  }
});

// Load header and footer
async function loadHeaderFooter() {
  try {
    // Load header
    const headerResponse = await fetch("../static/headerFooter/user-header.html");
    if (!headerResponse.ok) {
      throw new Error(`Failed to load header: ${headerResponse.status}`);
    }
    document.getElementById("header").innerHTML = await headerResponse.text();
    
    // Load footer
    const footerResponse = await fetch("../static/headerFooter/user-footer.html");
    if (!footerResponse.ok) {
      throw new Error(`Failed to load footer: ${footerResponse.status}`);
    }
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
    } else {
      console.warn("Logout button not found in the DOM");
    }
  }, 300);
}

// Load car details (just additional info, not to recreate booking details)
async function loadCarDetails(carId) {
  try {
    console.log("Loading car details for ID:", carId);
    
    // Get car document
    const carDoc = await getDoc(doc(db, "cars", carId));
    
    if (!carDoc.exists()) {
      throw new Error("Car not found in database");
    }
    
    // Store car data
    carData = carDoc.data();
    carData.id = carId;
    console.log("Car data loaded:", carData);
    
    // Parse car type for display
    const carInfo = parseCarType(carData.car_type || "");
    carData.make = carInfo.make;
    carData.model = carInfo.model;
    
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

// Display booking summary using the details from user-car-details.js
function displayBookingSummary() {
  if (!bookingSummary) {
    console.error("Booking summary container not found in the DOM");
    return;
  }
  
  try {
    // Car details
    const carNameElement = document.getElementById("car-name");
    if (carNameElement) {
      carNameElement.textContent = `${carData.make} ${carData.model}`;
    }
    
    // Car license plate
    const carPlateElement = document.getElementById("car-plate");
    if (carPlateElement && carData.license_plate) {
      carPlateElement.textContent = carData.license_plate;
    }
    
    // Remove car type tag - not needed as per requirement
    const carTypeElement = document.getElementById("car-type");
    if (carTypeElement) {
      carTypeElement.style.display = "none";
    }
    
    // Car image - full size
    const carImageElement = document.getElementById("car-image");
    if (carImageElement) {
      carImageElement.src = `../static/images/car_images/${carData.car_type || "car"}.png`;
      carImageElement.onerror = () => {
        // First fallback
        carImageElement.src = `../static/images/assets/${carData.car_type || "car"}.png`;
        carImageElement.onerror = () => {
          // Second fallback
          carImageElement.src = "../static/images/assets/car-placeholder.jpg";
        };
      };
    }
    
    // Car seats - dynamic based on car data
    const carSeatsElement = document.getElementById("car-seats");
    if (carSeatsElement && carData.seating_capacity) {
      carSeatsElement.textContent = `${carData.seating_capacity} seats`;
    }
    
    // Small luggage - from database
    const smallLuggageElement = document.getElementById("small-luggage");
    if (smallLuggageElement && carData.small_luggage !== undefined) {
      smallLuggageElement.textContent = carData.small_luggage || "0";
    }
    
    // Big luggage - from database
    const bigLuggageElement = document.getElementById("big-luggage");
    if (bigLuggageElement && carData.big_luggage !== undefined) {
      bigLuggageElement.textContent = carData.big_luggage || "0";
    }
    
    // Car address
    const addressElement = document.getElementById("car-address");
    if (addressElement) {
      addressElement.textContent = carData.address || "Location not available";
    }
    
    // Format booking dates from the passed booking details
    const startTime = new Date(bookingDetails.startDateTime);
    const endTime = new Date(bookingDetails.endDateTime);
    
    const options = { 
      weekday: "short", 
      month: "short", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit" 
    };
    
    const startFormatted = startTime.toLocaleString("en-US", options);
    const endFormatted = endTime.toLocaleString("en-US", options);
    
    // Set pickup and return times
    const pickupElement = document.getElementById("pickup-time");
    const returnElement = document.getElementById("return-time");
    
    if (pickupElement) pickupElement.textContent = startFormatted;
    if (returnElement) returnElement.textContent = endFormatted;
    
    // Format duration text from the existing booking details
    let durationText = "";
    if (bookingDetails.durationDays > 0) {
      durationText += `${bookingDetails.durationDays} day${bookingDetails.durationDays > 1 ? "s" : ""} `;
    }
    if (bookingDetails.durationHours > 0) {
      durationText += `${bookingDetails.durationHours} hour${bookingDetails.durationHours > 1 ? "s" : ""} `;
    }
    if (bookingDetails.durationMinutes > 0) {
      durationText += `${bookingDetails.durationMinutes} minute${bookingDetails.durationMinutes > 1 ? "s" : ""}`;
    }
    
    const durationElement = document.getElementById("booking-duration");
    if (durationElement) {
      durationElement.textContent = durationText.trim() || "0 minutes";
    }
    
    // Also update duration text in price summary
    const durationTextElement = document.getElementById("duration-text");
    if (durationTextElement) {
      durationTextElement.textContent = durationText.trim() || "0 minutes";
    }
    
    // Set price details from the existing booking details
    const rateElement = document.getElementById("hourly-rate");
    const subtotalElement = document.getElementById("subtotal");
    const totalElement = document.getElementById("total-price");
    
    if (rateElement) {
      rateElement.textContent = parseFloat(bookingDetails.hourlyRate).toFixed(2);
    }
    
    if (subtotalElement) {
      subtotalElement.textContent = parseFloat(bookingDetails.totalPrice).toFixed(2);
    }
    
    if (totalElement) {
      totalElement.textContent = parseFloat(bookingDetails.totalPrice).toFixed(2);
    }
    
    // Show booking summary
    bookingSummary.style.display = "block";
    
    // Set confirm button initial state based on terms checkbox
    updateConfirmButtonState();
    
    console.log("Booking summary displayed successfully");
  } catch (error) {
    console.error("Error displaying booking summary:", error);
    showError("Failed to display booking details: " + error.message);
  }
}

// Update confirm button state based on terms checkbox
function updateConfirmButtonState() {
  if (confirmButton && termsCheckbox) {
    confirmButton.disabled = !termsCheckbox.checked;
    
    // Apply appropriate styling based on disabled state
    if (confirmButton.disabled) {
      confirmButton.classList.add("disabled");
    } else {
      confirmButton.classList.remove("disabled");
    }
  }
}

// Setup event listeners
function setupEventListeners() {

console.log("Setting up event listeners");
  
  // Terms checkbox - update button state when changed
  if (termsCheckbox) {
    console.log("Setting up terms checkbox listener");
    termsCheckbox.addEventListener("change", () => {
      console.log("Terms checkbox changed:", termsCheckbox.checked);
      
      // Update button state
      if (confirmButton) {
        confirmButton.disabled = !termsCheckbox.checked;
        if (termsCheckbox.checked) {
          confirmButton.classList.remove("disabled");
        } else {
          confirmButton.classList.add("disabled");
        }
        console.log("Confirm button disabled state:", confirmButton.disabled);
      }
      
      if (termsError) {
        termsError.style.display = "none";
      }
    });
  } else {
    console.warn("Terms checkbox not found");
  }
  
  // Confirm booking button
  if (confirmButton) {
    // Remove any previous listeners
    const newConfirmBtn = confirmButton.cloneNode(true);
    confirmButton.parentNode.replaceChild(newConfirmBtn, confirmButton);
    
    // Add event listener to the fresh button
    newConfirmBtn.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      handleConfirmBooking(event);
    });
    console.log("Confirm button event listener attached");
  } else {
    console.warn("Confirm button not found in the DOM");
  }
  
  // Modify button - go back to car details
  if (modifyButton) {
    modifyButton.addEventListener("click", (event) => {
      event.preventDefault();
      console.log("Returning to car details page");
      history.back();
    });
    console.log("Modify button event listener attached");
  } else {
    console.warn("Modify button not found in the DOM");
  }
  
  // Terms checkbox - update button state when changed
  if (termsCheckbox) {
    termsCheckbox.addEventListener("change", () => {
      updateConfirmButtonState();
      
      if (termsError) {
        termsError.style.display = "none";
      }
    });
    console.log("Terms checkbox event listener attached");
  } else {
    console.warn("Terms checkbox not found in the DOM");
  }
  
  console.log("All event listeners set up");
}

// Handle confirm booking button click
async function handleConfirmBooking(event) {
  // Prevent default behavior
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  console.log("Confirm booking process started");
  
  // Check terms checkbox
  if (termsCheckbox && !termsCheckbox.checked) {
    if (termsError) {
      termsError.style.display = "block";
      termsError.textContent = "Please accept the terms and conditions";
    }
    return false;
  }
  
  // Visual feedback - disable button and update text
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.classList.add("disabled");
    confirmButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
  }
  
  // Show loading
  showLoading(true);
  
  try {
    // Create the booking using the details from user-car-details.js
    const bookingId = await createBooking();
    console.log("Booking created successfully with ID:", bookingId);
    
    // Redirect to success page
    try {
      console.log("Redirecting to success page");
      window.location.href = `user-booking-success.html?id=${bookingId}`;
      
      // Fallback navigation methods if the first one fails
      setTimeout(() => {
        try {
          console.log("Using fallback navigation method");
          window.location.assign(`user-booking-success.html?id=${bookingId}`);
          
          // Final fallback
          setTimeout(() => {
            console.log("Using final fallback navigation method");
            window.open(`user-booking-success.html?id=${bookingId}`, "_self");
          }, 300);
        } catch (navError) {
          console.error("Navigation error:", navError);
        }
      }, 300);
    } catch (navError) {
      console.error("Error navigating to success page:", navError);
      alert(`Booking was successful, but navigation failed. Please go to Your Bookings to see your booking.`);
    }
  } catch (error) {
    console.error("Error creating booking:", error);
    showError(`Failed to create booking: ${error.message}`);
    
    // Re-enable button
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.classList.remove("disabled");
      confirmButton.innerHTML = '<i class="bi bi-check-lg"></i> Confirm Booking';
    }
    
    showLoading(false);
  }
  
  return false;
}

// Create booking using details passed from user-car-details.js
async function createBooking() {
  try {
    console.log("Creating booking in database");
    
    // Format dates for Firestore
    const startTime = new Date(bookingDetails.startDateTime);
    const endTime = new Date(bookingDetails.endDateTime);
    
    // Generate booking ID with expected format
    const bookingId = `booking_${Date.now()}`;
    console.log("Generated booking ID:", bookingId);
    
    // Create booking data with exact required structure for timesheet
    const timesheetBookingData = {
      user_id: userId,
      start_time: Timestamp.fromDate(startTime),
      end_time: Timestamp.fromDate(endTime),
      duration_minutes: bookingDetails.totalDurationMinutes,
      hourly_rate: parseFloat(bookingDetails.hourlyRate),
      total_price: parseFloat(bookingDetails.totalPrice),
      status: "upcoming",
      created_at: Timestamp.now(),
      car_type: bookingDetails.carType
    };
    
    console.log("Saving booking to timesheet with data:", timesheetBookingData);
    
    // Save to car's timesheet collection
    await setDoc(
      doc(db, "timesheets", bookingDetails.carId, "bookings", bookingId),
      timesheetBookingData
    );
    
    console.log("Booking saved to timesheet collection");
    
    // Save to user's bookings with the required structure
    const userBookingData = {
      car_id: bookingDetails.carId,
      booking_id: bookingId,
      user_id: userId,
      start_time: Timestamp.fromDate(startTime),
      end_time: Timestamp.fromDate(endTime),
      duration_minutes: bookingDetails.totalDurationMinutes,
      hourly_rate: parseFloat(bookingDetails.hourlyRate),
      total_price: parseFloat(bookingDetails.totalPrice),
      status: "upcoming",
      created_at: Timestamp.now(),
      car_type: bookingDetails.carType
    };
    
    console.log("Saving booking to user's bookings with data:", userBookingData);
    
    // Save to user's bookings collection
    await setDoc(
      doc(db, "users", userId, "bookings", bookingId),
      userBookingData
    );
    
    console.log("Booking saved to user's bookings collection");
    
    // Clear booking details from session storage
    sessionStorage.removeItem("bookingDetails");
    console.log("Booking details cleared from session storage");
    
    return bookingId;
  } catch (error) {
    console.error("Error creating booking in database:", error);
    throw error;
  }
}

// Show/hide loading overlay
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? "flex" : "none";
  }
}

// Show error message
function showError(message) {
  console.error("ERROR:", message);
  
  if (errorMessage) {
    const errorText = errorMessage.querySelector("p") || errorMessage;
    errorText.textContent = message;
    errorMessage.style.display = "block";
  }
  
  if (bookingSummary) {
    bookingSummary.style.display = "none";
  }
  
  showLoading(false);
}