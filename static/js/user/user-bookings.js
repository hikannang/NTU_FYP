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
  writeBatch
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
const cancelledBookingsContainer = document.getElementById("cancelled-bookings");

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
        
        // Load bookings directly from user's bookings collection
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

// Load user bookings directly from user's bookings collection
async function loadUserBookings() {
  try {
    console.log("Loading bookings from user's bookings collection");
    
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
    
    // Get current date for categorization
    const now = new Date();
    
    // Query bookings from user's bookings collection
    try {
      const userBookingsRef = collection(db, "users", userId, "bookings");
      const bookingsSnapshot = await getDocs(userBookingsRef);
      
      console.log(`Found ${bookingsSnapshot.size} bookings in user's collection`);
      
      if (bookingsSnapshot.empty) {
        console.log("No bookings found for user");
        noBookingsMessage.style.display = "flex";
        loadingIndicator.style.display = "none";
        return;
      }
      
      // Process each booking and load car details
      const bookings = [];
      const carPromises = [];
      
      bookingsSnapshot.forEach(docSnapshot => {
        const bookingData = docSnapshot.data();
        const booking = {
          id: docSnapshot.id,
          ...bookingData
        };
        
        console.log("Processing booking:", booking.id);
        
        // Convert timestamps to dates
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
          booking.startTimeDate = now;
          booking.endTimeDate = new Date(now.getTime() + 3600000); // Default to 1 hour later
        }
        
        // Get car details - Alternative approach to avoid "doc is not a function" error
        if (booking.car_id) {
          console.log(`Loading car details for booking ${booking.id}, car ${booking.car_id}`);
          
          // Alternative approach: query collection with a filter
          const carPromise = getDocs(query(collection(db, "cars"), where("__name__", "==", booking.car_id)))
            .then(querySnapshot => {
              if (!querySnapshot.empty) {
                const carDoc = querySnapshot.docs[0];
                booking.car = carDoc.data();
                booking.car.id = carDoc.id;
                console.log(`Car details loaded for ${booking.id}`);
              } else {
                console.warn(`Car ${booking.car_id} not found for booking ${booking.id}`);
                booking.car = { 
                  car_type: booking.car_type || "Unknown Car",
                  address: "Address unavailable" 
                };
              }
            })
            .catch(error => {
              console.error(`Error fetching car ${booking.car_id} for booking ${booking.id}:`, error);
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
      
      // Wait for all car details to be loaded
      await Promise.allSettled(carPromises);
      console.log(`Processed ${bookings.length} bookings with car details`);
      
      // Categorize bookings
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
      bookingsData.active.sort((a, b) => a.endTimeDate - b.endTimeDate);
      bookingsData.past.sort((a, b) => b.startTimeDate - a.startTimeDate);
      bookingsData.cancelled.sort((a, b) => b.startTimeDate - a.startTimeDate);
      
      // Update UI
      updateBookingsUI();
    } catch (innerError) {
      console.error("Error processing bookings:", innerError);
      throw innerError;
    }
    
  } catch (error) {
    console.error("Error loading bookings:", error);
    showErrorMessage(`Failed to load your bookings: ${error.message}`);
    loadingIndicator.style.display = "none";
  }
}
    
    // Update UI with bookings data
    function updateBookingsUI() {
      console.group("Updating booking UI");
      console.log("Upcoming bookings:", bookingsData.upcoming.length);
      console.log("Active bookings:", bookingsData.active.length);
      console.log("Past bookings:", bookingsData.past.length);
      console.log("Cancelled bookings:", bookingsData.cancelled.length);
      console.groupEnd();
      
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
        loadingIndicator.style.display = "none";
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
      
      // Hide loading indicator
      loadingIndicator.style.display = "none";
    }
    
    // Create a booking card element with improved car name display
function createBookingCard(booking, bookingType) {
  console.log("Creating booking card for:", booking.id, "Type:", bookingType);
  
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

  // Extract car information
  const carType = booking.car && booking.car.car_type ? booking.car.car_type : booking.car_type || 'car';
  const carAddress = booking.car && booking.car.address ? booking.car.address : 'Address not available';
  
  // Extract model_id from car_type (e.g., "modely_white" → "modely")
  const modelId = carType.split('_')[0];
  
  // Extract color from car_type or car object
  let carColor = "";
  if (carType.includes('_')) {
    carColor = carType.split('_')[1];
    // Capitalize first letter of color
    carColor = carColor.charAt(0).toUpperCase() + carColor.slice(1);
  } else if (booking.car && booking.car.car_color) {
    carColor = booking.car.car_color;
  }
  
  // Determine car name from car_models collection data or our mapping
  let carName = "";
  
  // Use car_models data if available in the booking
  if (booking.car && booking.car.model_data && booking.car.model_data.name) {
    carName = booking.car.model_data.name;
  } 
  // Otherwise use our mapping of model_ids to proper names
  else {
    // Map model ID to proper car name
    if (modelId === "modely") carName = "Tesla Model Y";
    else if (modelId === "model3") carName = "Tesla Model 3";
    else if (modelId === "models") carName = "Tesla Model S";
    else if (modelId === "modelx") carName = "Tesla Model X";
    else if (modelId === "vezel") carName = "Honda Vezel";
    else carName = modelId.charAt(0).toUpperCase() + modelId.slice(1); // Capitalize first letter
  }
  
  // Create the display name with color in parentheses if available
  const displayName = carColor ? `${carName} (${carColor})` : carName;

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
                    alt="${displayName}" 
                    onerror="this.onerror=null; this.src='../static/images/assets/car-placeholder.jpg'">
            </div>
            <div class="booking-info">
                <h3>${displayName}</h3>
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
    booking.car_id || ''
  }" class="primary-btn">
                View Details
            </a>
            ${
              bookingType === "upcoming"
                ? `
                <button class="secondary-btn cancel-btn" data-booking-id="${booking.id}" data-car-id="${booking.car_id || ''}">
                    Cancel Booking
                </button>
            `
                : ""
            }
            ${
              isAREnabled
                ? `
                <button class="ar-btn" data-booking-id="${booking.id}" data-car-id="${booking.car_id || ''}">
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
          booking.car_id || ''
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
          booking.car_id || ''
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
      
      if (!confirm("Are you sure you want to cancel this booking?")) {
        return;
      }
    
      try {
        console.log(`Cancelling booking ${bookingId} for car ${carId}`);
        
        // Update the booking status in user's bookings collection
        await updateDoc(doc(db, "users", userId, "bookings", bookingId), {
          status: "cancelled",
        });
        
        // Also update in timesheet collection if car ID is available
        if (carId) {
          try {
            await updateDoc(doc(db, "timesheets", carId, "bookings", bookingId), {
              status: "cancelled",
            });
          } catch (e) {
            console.warn("Could not update timesheet booking:", e);
          }
        }
        
        // Update in main bookings collection if it exists
        try {
          await updateDoc(doc(db, "bookings", bookingId), {
            status: "cancelled",
          });
        } catch (e) {
          console.warn("Could not update main bookings collection:", e);
          // This is expected if the main bookings collection doesn't exist
        }
        
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
      if (!carId) {
        alert("Car information unavailable for AR navigation");
        return;
      }
      
      // Store the IDs in session storage for the AR page to use
      sessionStorage.setItem("arBookingId", bookingId);
      sessionStorage.setItem("arCarId", carId);
      
      console.log(`Launching AR wayfinding for booking ${bookingId}, car ${carId}`);
    
      // Redirect to the AR wayfinding page
      window.location.href = '../AR/user-ar-wayfinding.html';
    }