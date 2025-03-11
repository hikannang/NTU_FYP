// user-bookings.js
import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  orderBy,
  Timestamp,
  collectionGroup
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize variables
let userId;
let bookingsData = {
  upcoming: [],
  active: [],
  past: [],
  cancelled: [],
};

// DOM Elements
const loadingIndicator = document.getElementById("loading-indicator");
const noBookingsMessage = document.getElementById("no-bookings-message");
const bookingsTabs = document.querySelectorAll(".tab-item");
const bookingsTabContent = document.querySelectorAll(".tab-content");
const upcomingBookingsContainer = document.getElementById("upcoming-bookings");
const activeBookingsContainer = document.getElementById("active-bookings");
const pastBookingsContainer = document.getElementById("past-bookings");
const cancelledBookingsContainer =
  document.getElementById("cancelled-bookings");

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Bookings page loaded");
  
  try {
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
        console.log("User authenticated:", user.uid);
        userId = user.uid;
        setupTabNavigation();
        await loadUserBookings();
      } else {
        console.log("User not authenticated, redirecting to login");
        // Redirect to login if not authenticated
        window.location.href = "../index.html";
      }
    });
  } catch (error) {
    console.error("Error initializing bookings page:", error);
    showErrorMessage(`Error loading page: ${error.message}`);
  }
});

// Add this function
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
      console.warn("Logout button not found");
    }
  }, 300);
}

// Setup tab navigation
function setupTabNavigation() {
  bookingsTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Remove active class from all tabs
      bookingsTabs.forEach((t) => t.classList.remove("active"));

      // Add active class to clicked tab
      tab.classList.add("active");

      // Hide all tab content
      bookingsTabContent.forEach((content) => (content.style.display = "none"));

      // Show selected tab content
      const tabId = tab.getAttribute("data-tab");
      document.getElementById(tabId).style.display = "block";
      
      console.log(`Tab changed to: ${tabId}`);
    });
  });
  console.log("Tab navigation set up");
}

// Improved approach to load bookings
async function loadUserBookings() {
    try {
      console.log("Loading user bookings");
      
      // Show loading indicator
      loadingIndicator.style.display = "flex";
      noBookingsMessage.style.display = "none";
  
      // Reset booking data
      bookingsData = {
        upcoming: [],
        active: [],
        past: [],
        cancelled: [],
      };
      
      // APPROACH 1: Try loading from user's bookings collection first
      console.log("Trying to load from user's bookings collection");
      try {
        const userBookingsQuery = query(collection(db, "users", userId, "bookings"));
        const userBookingsSnapshot = await getDocs(userBookingsQuery);
        
        console.log(`Found ${userBookingsSnapshot.size} bookings in user collection`);
        
        if (!userBookingsSnapshot.empty) {
          // Process these bookings
          await processBookings(userBookingsSnapshot);
          return; // Exit if we found bookings here
        }
      } catch (userBookingsError) {
        console.error("Error loading from user bookings:", userBookingsError);
        // Continue to next approach
      }
      
      // APPROACH 2: Try loading from main bookings collection
      console.log("Trying to load from main bookings collection");
      try {
        const bookingsQuery = query(
          collection(db, "bookings"),
          where("user_id", "==", userId)
        );
        const bookingsSnapshot = await getDocs(bookingsQuery);
        
        console.log(`Found ${bookingsSnapshot.size} bookings in main collection`);
        
        if (!bookingsSnapshot.empty) {
          // Process these bookings
          await processBookings(bookingsSnapshot);
          return; // Exit if we found bookings here
        }
      } catch (mainBookingsError) {
        console.error("Error loading from main bookings:", mainBookingsError);
        // Continue to next approach
      }
      
      // APPROACH 3: Last resort - load from all car timesheets
      console.log("Trying to load from car timesheets");
      try {
        const carsSnapshot = await getDocs(collection(db, "cars"));
        let foundBookings = false;
        const allBookings = [];
        
        for (const carDoc of carsSnapshot.docs) {
          const carId = carDoc.id;
          const bookingsRef = collection(db, "timesheets", carId, "bookings");
          const bookingsQuery = query(
            bookingsRef,
            where("user_id", "==", userId)
          );
          
          const bookingsSnapshot = await getDocs(bookingsQuery);
          console.log(`Found ${bookingsSnapshot.size} bookings for car ${carId}`);
          
          if (!bookingsSnapshot.empty) {
            foundBookings = true;
            // Add these to our collection for processing
            bookingsSnapshot.forEach(doc => {
              allBookings.push({
                ref: doc.ref,
                data: { id: doc.id, ...doc.data(), car_id: carId }
              });
            });
          }
        }
        
        if (foundBookings) {
          // Create a custom snapshot-like object
          const customSnapshot = {
            forEach: (callback) => {
              allBookings.forEach(item => {
                callback({
                  id: item.data.id,
                  data: () => item.data,
                  ref: item.ref
                });
              });
            },
            empty: allBookings.length === 0,
            size: allBookings.length
          };
          
          await processBookings(customSnapshot);
          return;
        }
      } catch (timesheetsError) {
        console.error("Error loading from timesheets:", timesheetsError);
      }
      
      // If we got here, no bookings were found in any collection
      console.log("No bookings found in any collection");
      noBookingsMessage.style.display = "flex";
      
    } catch (error) {
      console.error("Error loading bookings:", error);
      showErrorMessage(`Failed to load your bookings: ${error.message}`);
    } finally {
      loadingIndicator.style.display = "none";
    }
  }

// Process bookings from query snapshot
async function processBookings(bookingsSnapshot) {
  try {
    // Process each booking
    const bookings = [];
    const carPromises = [];
    
    bookingsSnapshot.forEach(doc => {
      const booking = {
        id: doc.id,
        ...doc.data()
      };
      
      console.log("Processing booking:", booking.id);
      
      // Convert timestamps to JS dates with better error handling
      try {
        if (booking.start_time) {
          if (typeof booking.start_time.toDate === 'function') {
            booking.startTimeDate = booking.start_time.toDate();
          } else if (booking.start_time.seconds) {
            booking.startTimeDate = new Date(booking.start_time.seconds * 1000);
          }
        }
        
        if (booking.end_time) {
          if (typeof booking.end_time.toDate === 'function') {
            booking.endTimeDate = booking.end_time.toDate();
          } else if (booking.end_time.seconds) {
            booking.endTimeDate = new Date(booking.end_time.seconds * 1000);
          }
        }
      } catch (err) {
        console.error("Error converting timestamps for booking", booking.id, err);
        // Default to current time if conversion fails
        booking.startTimeDate = new Date();
        booking.endTimeDate = new Date(Date.now() + 3600000); // 1 hour later
      }
      
      // Get car details if needed
      if (booking.car_id) {
        const carPromise = getDoc(doc(db, "cars", booking.car_id))
          .then(carDoc => {
            if (carDoc.exists()) {
              booking.car = carDoc.data();
              booking.car.id = carDoc.id;
            } else {
              console.warn(`Car ${booking.car_id} not found`);
              booking.car = { 
                car_type: booking.car_type || "Unknown Car",
                address: "Address unavailable" 
              };
            }
          })
          .catch(error => {
            console.error(`Error fetching car ${booking.car_id}:`, error);
            booking.car = { 
              car_type: booking.car_type || "Unknown Car",
              address: "Error loading address" 
            };
          });
          
        carPromises.push(carPromise);
      } else {
        console.warn(`Booking ${booking.id} has no car_id`);
        booking.car = { 
          car_type: booking.car_type || "Unknown Car",
          address: "Car information unavailable"
        };
      }
      
      bookings.push(booking);
    });
    
    // Wait for all car data to be loaded
    await Promise.allSettled(carPromises);
    console.log(`Processed ${bookings.length} bookings with car details`);
    
    // Categorize bookings
    const now = new Date();
    
    bookings.forEach(booking => {
      if (!booking.startTimeDate || !booking.endTimeDate) {
        console.warn(`Booking ${booking.id} has invalid dates, skipping`);
        return;
      }
      
      if (booking.status === "cancelled") {
        bookingsData.cancelled.push(booking);
      } else if (booking.startTimeDate > now) {
        bookingsData.upcoming.push(booking);
      } else if (booking.endTimeDate < now) {
        bookingsData.past.push(booking);
      } else {
        bookingsData.active.push(booking);
      }
    });
    
    console.log("Categorized bookings:", {
      upcoming: bookingsData.upcoming.length,
      active: bookingsData.active.length,
      past: bookingsData.past.length,
      cancelled: bookingsData.cancelled.length
    });
    
    // Sort each category
    bookingsData.upcoming.sort((a, b) => a.startTimeDate - b.startTimeDate);
    bookingsData.active.sort((a, b) => b.endTimeDate - a.endTimeDate);
    bookingsData.past.sort((a, b) => b.startTimeDate - a.startTimeDate);
    bookingsData.cancelled.sort((a, b) => b.startTimeDate - a.startTimeDate);
    
    // Update UI
    updateBookingsUI();
  } catch (error) {
    console.error("Error processing bookings:", error);
    throw error;
  }
}

// Alternative approach to load bookings from timesheets
async function loadBookingsFromTimesheets() {
  try {
    console.log("Fetching bookings from timesheets");
    
    // Get all cars first
    const carsSnapshot = await getDocs(collection(db, "cars"));
    const cars = {};

    // Create a map of car IDs to car data for quick lookup
    carsSnapshot.forEach((doc) => {
      cars[doc.id] = { id: doc.id, ...doc.data() };
    });
    
    console.log(`Found ${Object.keys(cars).length} cars`);

    // Get current timestamp
    const now = new Date();

    // Loop through each car to find bookings for the current user
    for (const carId in cars) {
      const bookingsRef = collection(db, "timesheets", carId, "bookings");
      const userBookingsQuery = query(
        bookingsRef,
        where("user_id", "==", userId),
        orderBy("start_time", "desc")
      );

      const bookingsSnapshot = await getDocs(userBookingsQuery);
      console.log(`Found ${bookingsSnapshot.size} bookings for car ${carId}`);

      for (const doc of bookingsSnapshot.docs) {
        const booking = {
          id: doc.id,
          carId: carId,
          car: cars[carId],
          ...doc.data()
        };

        // Fix timestamp conversion
        if (booking.start_time) {
          if (typeof booking.start_time.toDate === 'function') {
            booking.startTimeDate = booking.start_time.toDate();
          } else if (booking.start_time.seconds) {
            booking.startTimeDate = new Date(booking.start_time.seconds * 1000);
          }
        }
        
        if (booking.end_time) {
          if (typeof booking.end_time.toDate === 'function') {
            booking.endTimeDate = booking.end_time.toDate();
          } else if (booking.end_time.seconds) {
            booking.endTimeDate = new Date(booking.end_time.seconds * 1000);
          }
        }

        // Determine booking category based on time and status
        if (booking.status === "cancelled") {
          bookingsData.cancelled.push(booking);
        } else if (booking.startTimeDate > now) {
          bookingsData.upcoming.push(booking);
        } else if (booking.endTimeDate < now) {
          bookingsData.past.push(booking);
        } else {
          bookingsData.active.push(booking);
        }
      }
    }

    // Sort bookings
    bookingsData.upcoming.sort((a, b) => a.startTimeDate - b.startTimeDate);
    bookingsData.active.sort((a, b) => a.endTimeDate - b.endTimeDate);
    bookingsData.past.sort((a, b) => b.startTimeDate - a.startTimeDate);
    bookingsData.cancelled.sort((a, b) => b.startTimeDate - a.startTimeDate);
    
    console.log("Categorized bookings from timesheets:", {
      upcoming: bookingsData.upcoming.length,
      active: bookingsData.active.length,
      past: bookingsData.past.length,
      cancelled: bookingsData.cancelled.length
    });

    // Update UI with bookings
    updateBookingsUI();
  } catch (error) {
    console.error("Error loading bookings from timesheets:", error);
    showErrorMessage("Failed to load your bookings. Please try again later.");
  } finally {
    loadingIndicator.style.display = "none";
  }
}

// Update UI with bookings data
function updateBookingsUI() {
  console.log("Updating UI with bookings data");
  
  // Clear all containers
  upcomingBookingsContainer.innerHTML = "";
  activeBookingsContainer.innerHTML = "";
  pastBookingsContainer.innerHTML = "";
  cancelledBookingsContainer.innerHTML = "";

  // Check if there are any bookings at all
  const totalBookings =
    bookingsData.upcoming.length +
    bookingsData.active.length +
    bookingsData.past.length +
    bookingsData.cancelled.length;

  console.log("Total bookings:", totalBookings);

  if (totalBookings === 0) {
    noBookingsMessage.style.display = "flex";
    return;
  }

  // Populate upcoming bookings
  if (bookingsData.upcoming.length > 0) {
    bookingsData.upcoming.forEach((booking) => {
      upcomingBookingsContainer.appendChild(
        createBookingCard(booking, "upcoming")
      );
    });
    console.log("Populated upcoming bookings:", bookingsData.upcoming.length);
  } else {
    upcomingBookingsContainer.innerHTML = createEmptyStateMessage(
      "No upcoming bookings"
    );
    console.log("No upcoming bookings");
  }

  // Populate active bookings
  if (bookingsData.active.length > 0) {
    bookingsData.active.forEach((booking) => {
      activeBookingsContainer.appendChild(createBookingCard(booking, "active"));
    });
    console.log("Populated active bookings:", bookingsData.active.length);
  } else {
    activeBookingsContainer.innerHTML =
      createEmptyStateMessage("No active bookings");
    console.log("No active bookings");
  }

  // Populate past bookings
  if (bookingsData.past.length > 0) {
    bookingsData.past.forEach((booking) => {
      pastBookingsContainer.appendChild(createBookingCard(booking, "past"));
    });
    console.log("Populated past bookings:", bookingsData.past.length);
  } else {
    pastBookingsContainer.innerHTML =
      createEmptyStateMessage("No past bookings");
    console.log("No past bookings");
  }

  // Populate cancelled bookings
  if (bookingsData.cancelled.length > 0) {
    bookingsData.cancelled.forEach((booking) => {
      cancelledBookingsContainer.appendChild(
        createBookingCard(booking, "cancelled")
      );
    });
    console.log("Populated cancelled bookings:", bookingsData.cancelled.length);
  } else {
    cancelledBookingsContainer.innerHTML = createEmptyStateMessage(
      "No cancelled bookings"
    );
    console.log("No cancelled bookings");
  }

  // Set active tab based on which category has bookings
  setInitialActiveTab();
}

// Create a booking card element
function createBookingCard(booking, bookingType) {
  const bookingCard = document.createElement("div");
  bookingCard.className = "booking-card";
  
  // Ensure we have valid date objects
  let startTime, endTime;
  
  if (booking.startTimeDate) {
    startTime = booking.startTimeDate;
  } else if (booking.start_time) {
    if (booking.start_time.toDate) {
      startTime = booking.start_time.toDate();
    } else if (booking.start_time.seconds) {
      startTime = new Date(booking.start_time.seconds * 1000);
    }
  } else {
    startTime = new Date(); // Fallback
    console.warn("Missing start time for booking:", booking.id);
  }
  
  if (booking.endTimeDate) {
    endTime = booking.endTimeDate;
  } else if (booking.end_time) {
    if (booking.end_time.toDate) {
      endTime = booking.end_time.toDate();
    } else if (booking.end_time.seconds) {
      endTime = new Date(booking.end_time.seconds * 1000);
    }
  } else {
    endTime = new Date(); // Fallback
    console.warn("Missing end time for booking:", booking.id);
  }

  // Format dates and times
  const dateOptions = { weekday: "short", month: "short", day: "numeric" };
  const timeOptions = { hour: "2-digit", minute: "2-digit" };

  const formattedDate = startTime.toLocaleDateString("en-US", dateOptions);
  const formattedStartTime = startTime.toLocaleTimeString("en-US", timeOptions);
  const formattedEndTime = endTime.toLocaleTimeString("en-US", timeOptions);

  // Calculate time remaining or time until booking (for active and upcoming)
  let timeText = "";
  const now = new Date();

  if (bookingType === "active") {
    const minutesRemaining = Math.floor((endTime - now) / 60000);
    const hoursRemaining = Math.floor(minutesRemaining / 60);
    const mins = minutesRemaining % 60;

    if (hoursRemaining > 0) {
      timeText = `${hoursRemaining}h ${mins}m remaining`;
    } else {
      timeText = `${mins} minutes remaining`;
    }
  } else if (bookingType === "upcoming") {
    const minutesUntil = Math.floor((startTime - now) / 60000);
    const hoursUntil = Math.floor(minutesUntil / 60);
    const daysUntil = Math.floor(hoursUntil / 24);

    if (daysUntil > 0) {
      timeText = `Starts in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`;
    } else if (hoursUntil > 0) {
      const mins = minutesUntil % 60;
      timeText = `Starts in ${hoursUntil}h ${mins}m`;
    } else {
      timeText = `Starts in ${minutesUntil} minutes`;
    }
  }

  // Determine if AR wayfinding should be enabled
  const thirtyMinutesBeforeStart = new Date(startTime);
  thirtyMinutesBeforeStart.setMinutes(
    thirtyMinutesBeforeStart.getMinutes() - 30
  );

  const isAREnabled =
    bookingType === "active" ||
    (bookingType === "upcoming" && now >= thirtyMinutesBeforeStart);

  // Get car type safely
  const carType = booking.car && booking.car.car_type ? booking.car.car_type : 'car';
  const carAddress = booking.car && booking.car.address ? booking.car.address : 'Address not available';

  // Set card HTML content
  bookingCard.innerHTML = `
        <div class="booking-status ${bookingType}">
            <span>${
              bookingType.charAt(0).toUpperCase() + bookingType.slice(1)
            }</span>
        </div>
        
        <div class="booking-header">
            <div class="car-image">
                <img src="../static/images/car_images/${carType.toLowerCase()}.png" 
                    alt="${carType}" 
                    onerror="this.onerror=null; this.src='../static/images/assets/car-placeholder.jpg'">
            </div>
            <div class="booking-info">
                <h3>${carType}</h3>
                <div class="booking-time">
                    <div><i class="bi bi-calendar"></i> ${formattedDate}</div>
                    <div><i class="bi bi-clock"></i> ${formattedStartTime} - ${formattedEndTime}</div>
                </div>
                ${
                  timeText
                    ? `<div class="time-remaining">${timeText}</div>`
                    : ""
                }
            </div>
        </div>
        
        <div class="booking-details">
            <div class="detail-item">
                <i class="bi bi-geo-alt"></i>
                <span>${carAddress}</span>
            </div>
            <div class="detail-item">
                <i class="bi bi-tag"></i>
                <span>Booking #${booking.id.slice(-6)}</span>
            </div>
        </div>
        
        <div class="booking-actions">
            <a href="user-booking-details.html?id=${booking.id}&carId=${
    booking.carId || booking.car_id || ''
  }" class="primary-btn">
                View Details
            </a>
            ${
              bookingType === "upcoming"
                ? `
                <button class="secondary-btn cancel-btn" data-booking-id="${booking.id}" data-car-id="${booking.carId || booking.car_id || ''}">
                    Cancel Booking
                </button>
            `
                : ""
            }
            ${
              isAREnabled
                ? `
                <button class="ar-btn" data-booking-id="${booking.id}" data-car-id="${booking.carId || booking.car_id || ''}">
                    <i class="bi bi-pin-map-fill"></i> Find Car
                </button>
            `
                : ""
            }
        </div>
    `;

  // Add event listeners to buttons
  if (bookingType === "upcoming") {
    const cancelButton = bookingCard.querySelector(".cancel-btn");
    if (cancelButton) {
      cancelButton.addEventListener("click", () =>
        cancelBooking(
          booking.id, 
          booking.carId || booking.car_id || ''
        )
      );
    }
  }

  if (isAREnabled) {
    const arButton = bookingCard.querySelector(".ar-btn");
    if (arButton) {
      arButton.addEventListener("click", () =>
        launchARWayfinding(
          booking.id, 
          booking.carId || booking.car_id || ''
        )
      );
    }
  }

  return bookingCard;
}

// Create empty state message
function createEmptyStateMessage(message) {
  return `
        <div class="empty-state">
            <i class="bi bi-calendar-x"></i>
            <p>${message}</p>
        </div>
    `;
}

// Show error message
function showErrorMessage(message) {
  console.error("ERROR:", message);
  
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.innerHTML = `
        <i class="bi bi-exclamation-triangle"></i>
        <p>${message}</p>
        <button onclick="location.reload()" class="secondary-btn">Retry</button>
    `;

  // Clear loading indicator and show error
  if (loadingIndicator) {
    loadingIndicator.style.display = "none";
  }
  
  const container = document.querySelector(".container");
  if (container) {
    container.appendChild(errorDiv);
  } else {
    document.body.appendChild(errorDiv);
  }
}

// Set initial active tab based on which category has bookings
function setInitialActiveTab() {
  let activeTabIndex = 0;

  if (bookingsData.active.length > 0) {
    activeTabIndex = 1; // Active tab
  } else if (bookingsData.upcoming.length > 0) {
    activeTabIndex = 0; // Upcoming tab
  } else if (bookingsData.past.length > 0) {
    activeTabIndex = 2; // Past tab
  } else if (bookingsData.cancelled.length > 0) {
    activeTabIndex = 3; // Cancelled tab
  }

  // Trigger click on the appropriate tab
  if (bookingsTabs[activeTabIndex]) {
    bookingsTabs[activeTabIndex].click();
    console.log(`Set initial active tab to index ${activeTabIndex}`);
  }
}

// Cancel booking
async function cancelBooking(bookingId, carId) {
  if (!bookingId) {
    alert("Invalid booking ID");
    return;
  }
  
  if (!carId) {
    alert("Invalid car ID. Cannot cancel booking.");
    return;
  }

  if (!confirm("Are you sure you want to cancel this booking?")) {
    return;
  }

  try {
    console.log(`Cancelling booking ${bookingId} for car ${carId}`);
    
    // Use batch to update all locations atomically
    const batch = writeBatch(db);
    
    // Update in main bookings collection
    const mainBookingRef = doc(db, "bookings", bookingId);
    batch.update(mainBookingRef, { status: "cancelled" });
    
    // Update in timesheet collection
    const carBookingRef = doc(db, "timesheets", carId, "bookings", bookingId);
    batch.update(carBookingRef, { status: "cancelled" });
    
    // Update in user bookings collection
    const userBookingRef = doc(db, "users", userId, "bookings", bookingId);
    batch.update(userBookingRef, { status: "cancelled" });
    
    // Commit all updates
    await batch.commit();
    
    console.log("Booking cancelled successfully");
    
    // Reload bookings
    await loadUserBookings();

    // Show success message
    alert("Booking cancelled successfully");
  } catch (error) {
    console.error("Error cancelling booking:", error);
    alert("Failed to cancel booking. Please try again.");
  }
}

// Launch AR wayfinding
function launchARWayfinding(bookingId, carId) {
  // Store the IDs in session storage for the AR page to use
  sessionStorage.setItem("arBookingId", bookingId);
  sessionStorage.setItem("arCarId", carId);
  
  console.log(`Launching AR wayfinding for booking ${bookingId}, car ${carId}`);

  // Redirect to the AR wayfinding page
  window.location.href = "user-ar-wayfinding.html";
}