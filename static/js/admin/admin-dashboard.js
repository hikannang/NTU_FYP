import { db, auth } from "../common/firebase-config.js";
import {
  collection,
  getDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Dashboard state
let currentPeriod = "day";
let carStatusChart = null;
let userRegistrationChart = null;
let dashboardData = {
  activeBookings: 0,
  totalUsers: 0,
  availableCars: 0,
  totalRevenue: 0,
  recentBookings: [],
  carStatus: {
    available: 0,
    booked: 0,
    maintenance: 0,
  },
  userRegistrations: [],
  maintenanceAlerts: [],
};

// Initialize the page with improved sequence
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, starting initialization");

  // Then load UI components
  try {
    document.getElementById("header").innerHTML = await fetch(
      "../static/headerFooter/admin-header.html"
    ).then((response) => response.text());

    document.getElementById("footer").innerHTML = await fetch(
      "../static/headerFooter/admin-footer.html"
    ).then((response) => response.text());

    // Start background status update with a delay to prioritize UI loading
    setTimeout(() => {
      updateAllBookingStatuses();
    }, 2000); // 2 second delay

    // Only proceed with auth check after UI is loaded
    setTimeout(() => checkAuthAndLoadData(), 100);
  } catch (error) {
    console.error("Error loading UI components:", error);
  }
});

// Separate function to check auth and load data
async function checkAuthAndLoadData() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
          console.error("User document not found");
          return;
        }

        const userData = userDoc.data();
        if (userData.role !== "admin") {
          console.warn("Not an admin user");
          window.location.href = "../user/user-dashboard.html";
          return;
        }

        // Update welcome message
        const welcomeMessage = document.getElementById("welcome-message");
        if (welcomeMessage) {
          welcomeMessage.textContent = userData.firstName || "Admin";
        }

        // Initialize dashboard with admin data
        setupDateFilters();
        await loadDashboardData("day");
      } catch (error) {
        console.error("Error loading admin data:", error);
        // Log but don't alert
      }
    } else {
      // Redirect without alert
      window.location.href = "../index.html";
    }
  });
}

// Date helpers
const getDateRange = (period) => {
  const now = new Date();
  let startDate;

  switch (period) {
    case "day":
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    case "week":
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      break;
    default:
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
  }

  return {
    start: startDate,
    end: now,
  };
};

// Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
  }).format(amount);
};

// Format date
const formatDate = (timestamp) => {
  if (!timestamp) return "N/A";

  const date =
    timestamp instanceof Timestamp
      ? new Date(timestamp.seconds * 1000)
      : new Date(timestamp);

  return date.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

// Setup date filter buttons
function setupDateFilters() {
  const filterButtons = document.querySelectorAll(".filter-btn");

  filterButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      // Update active button
      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      // Get selected period
      const period = button.getAttribute("data-period");
      currentPeriod = period;

      // Load data for selected period
      await loadDashboardData(period);

      // Update the dashboard
      renderDashboard();
    });
  });
}

// Load all dashboard data with better error handling
async function loadDashboardData(period) {
  try {
    const dateRange = getDateRange(period);

    // Handle each operation separately
    try {
      await loadStatistics(dateRange);
    } catch (error) {
      console.error("Error loading statistics:", error);
      // Don't show alert, just log the error
    }

    try {
      await loadRecentBookings();
    } catch (error) {
      console.error("Error loading bookings:", error);
      // Don't show alert, just log the error
    }

    try {
      await loadCarStatusData();
    } catch (error) {
      console.error("Error loading car status:", error);
      // Don't show alert, just log the error
    }

    try {
      await loadUserRegistrationData(period);
    } catch (error) {
      console.error("Error loading user registrations:", error);
      // Don't show alert, just log the error
    }

    try {
      await loadMaintenanceAlerts();
    } catch (error) {
      console.error("Error loading maintenance alerts:", error);
      // Don't show alert, just log the error
    }

    // Still render whatever data we could load
    renderDashboard();
  } catch (error) {
    console.error("Error in dashboard data loading:", error);
    // No alert here - just log to console
  }
}

// Load statistics with improved revenue calculation
// Load statistics with improved revenue calculation - fixed query
async function loadStatistics(dateRange) {
  try {
    console.log("Loading statistics for date range:", dateRange);

    // --- 1. TOTAL USERS COUNT ---
    // This query is fine as is
    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      dashboardData.totalUsers = usersSnapshot.size;
      console.log(`Found ${dashboardData.totalUsers} total users`);
    } catch (userErr) {
      console.error("Error fetching users:", userErr);
      dashboardData.totalUsers = 0;
    }

    // --- 2. AVAILABLE CARS COUNT ---
    // This query is fine as is
    try {
      const availableCarsQuery = query(
        collection(db, "cars"),
        where("status", "==", "available")
      );
      const availableCarsSnapshot = await getDocs(availableCarsQuery);
      dashboardData.availableCars = availableCarsSnapshot.size;
      console.log(`Found ${dashboardData.availableCars} available cars`);
    } catch (carErr) {
      console.error("Error fetching available cars:", carErr);
      dashboardData.availableCars = 0;
    }

    // --- 3. ACTIVE BOOKINGS COUNT ---
    // Use a different approach to avoid the inequality filter issue
    try {
      // Get current time
      const now = new Date();

      // First query: Get all active status bookings
      const activeStatusQuery = query(
        collection(db, "bookings"),
        where("status", "==", "active")
      );

      const activeStatusSnapshot = await getDocs(activeStatusQuery);
      console.log(
        `Found ${activeStatusSnapshot.size} bookings with status="active"`
      );

      // Filter in memory for those that are currently active based on time
      let currentlyActive = 0;
      activeStatusSnapshot.forEach((doc) => {
        const booking = doc.data();

        // Extract start and end times
        let startTime = null;
        let endTime = null;

        // Convert Firestore timestamps to JavaScript Date
        if (booking.start_time) {
          if (booking.start_time instanceof Timestamp) {
            startTime = booking.start_time.toDate();
          } else if (booking.start_time.seconds) {
            startTime = new Date(booking.start_time.seconds * 1000);
          } else {
            startTime = new Date(booking.start_time);
          }
        }

        if (booking.end_time) {
          if (booking.end_time instanceof Timestamp) {
            endTime = booking.end_time.toDate();
          } else if (booking.end_time.seconds) {
            endTime = new Date(booking.end_time.seconds * 1000);
          } else {
            endTime = new Date(booking.end_time);
          }
        }

        // Check if booking is currently active
        if (startTime && endTime && now >= startTime && now <= endTime) {
          currentlyActive++;
        }
      });

      dashboardData.activeBookings = currentlyActive;
      console.log(`Found ${currentlyActive} currently active bookings`);
    } catch (activeErr) {
      console.error("Error counting active bookings:", activeErr);

      // Fallback: Just use timesheet collection if root-level query fails
      try {
        console.log("Using fallback timesheet collection for active bookings");
        // Use your existing timesheet based method
        let activeBookingsCount = 0;
        const carsSnapshot = await getDocs(collection(db, "cars"));

        // For each car, check bookings
        const bookingPromises = carsSnapshot.docs.map(async (carDoc) => {
          const carId = carDoc.id;
          const bookingsRef = collection(db, "timesheets", carId, "bookings");
          const activeBookingsQuery = query(
            bookingsRef,
            where("status", "==", "active")
          );

          const bookingsSnapshot = await getDocs(activeBookingsQuery);
          return bookingsSnapshot.size;
        });

        // Sum up all active bookings
        const bookingCounts = await Promise.all(bookingPromises);
        activeBookingsCount = bookingCounts.reduce(
          (sum, count) => sum + count,
          0
        );
        dashboardData.activeBookings = activeBookingsCount;
      } catch (fallbackErr) {
        console.error(
          "Fallback active bookings calculation failed:",
          fallbackErr
        );
        dashboardData.activeBookings = 0;
      }
    }

    // --- 4. TOTAL REVENUE CALCULATION ---
    // Fix the revenue calculation to properly handle the day view and other periods
    try {
      const startTimestamp = Timestamp.fromDate(dateRange.start);
      const endTimestamp = Timestamp.fromDate(dateRange.end);

      console.log(
        `Calculating revenue from ${dateRange.start.toLocaleString()} to ${dateRange.end.toLocaleString()}`
      );

      // Initialize revenue
      let totalRevenue = 0;
      let processedBookings = 0;

      // Use a more direct approach to get completed bookings
      let bookingsSnapshot;

      try {
        // Try with a compound query first
        const completedBookingsQuery = query(
          collection(db, "bookings"),
          where("status", "==", "completed")
        );

        bookingsSnapshot = await getDocs(completedBookingsQuery);
        console.log(
          `Found ${bookingsSnapshot.size} total completed bookings to filter by date`
        );
      } catch (queryErr) {
        // If compound query fails, get all bookings and filter in memory
        console.error(
          "Specific query failed, falling back to all bookings:",
          queryErr
        );
        bookingsSnapshot = await getDocs(collection(db, "bookings"));
        console.log(
          `Fallback: Found ${bookingsSnapshot.size} total bookings to filter`
        );
      }

      // Filter bookings in memory based on status and date range
      bookingsSnapshot.forEach((doc) => {
        const booking = doc.data();

        // Skip if not completed
        if (booking.status !== "completed") {
          return;
        }

        // Extract end_time for date filtering
        let endTime = null;

        if (booking.end_time) {
          if (booking.end_time instanceof Timestamp) {
            endTime = booking.end_time.toDate();
          } else if (booking.end_time.seconds) {
            endTime = new Date(booking.end_time.seconds * 1000);
          } else if (typeof booking.end_time === "string") {
            endTime = new Date(booking.end_time);
          }
        }

        // Check if booking falls within our date range
        if (!endTime) {
          console.log(
            `Booking ${doc.id} has invalid end time:`,
            booking.end_time
          );
          return;
        }

        // Debug date comparison
        const endTimeFormatted = endTime.toLocaleDateString();
        const startFormatted = dateRange.start.toLocaleDateString();
        const endFormatted = dateRange.end.toLocaleDateString();

        // Check if booking is within date range
        if (endTime >= dateRange.start && endTime <= dateRange.end) {
          // Process the booking for revenue calculation
          processedBookings++;

          let bookingRevenue = null;

          // Method 1: Use total_price directly
          if (
            booking.total_price !== undefined &&
            booking.total_price !== null
          ) {
            if (typeof booking.total_price === "number") {
              bookingRevenue = booking.total_price;
            } else {
              // Parse string price (remove currency symbols)
              const priceStr = String(booking.total_price).replace(
                /[^0-9.-]+/g,
                ""
              );
              const parsedPrice = parseFloat(priceStr);
              if (!isNaN(parsedPrice)) {
                bookingRevenue = parsedPrice;
              }
            }
          }

          // Method 2: Calculate from price_per_hour and duration
          if (
            bookingRevenue === null &&
            booking.price_per_hour !== undefined &&
            booking.start_time &&
            booking.end_time
          ) {
            // Get start and end times
            let startTime = null;

            if (booking.start_time) {
              if (booking.start_time instanceof Timestamp) {
                startTime = booking.start_time.toDate();
              } else if (booking.start_time.seconds) {
                startTime = new Date(booking.start_time.seconds * 1000);
              } else if (typeof booking.start_time === "string") {
                startTime = new Date(booking.start_time);
              }
            }

            if (startTime && endTime) {
              // Calculate duration in hours
              const durationMs = endTime - startTime;
              const durationHours = durationMs / (1000 * 60 * 60);

              // Calculate revenue
              bookingRevenue = booking.price_per_hour * durationHours;
            }
          }

          // Method 3: Use a generic price field if available
          if (bookingRevenue === null && booking.price !== undefined) {
            if (typeof booking.price === "number") {
              bookingRevenue = booking.price;
            } else {
              const priceStr = String(booking.price).replace(/[^0-9.-]+/g, "");
              const parsedPrice = parseFloat(priceStr);
              if (!isNaN(parsedPrice)) {
                bookingRevenue = parsedPrice;
              }
            }
          }

          // Add to total if we got a valid revenue figure
          if (bookingRevenue !== null && !isNaN(bookingRevenue)) {
            totalRevenue += bookingRevenue;
            console.log(
              `Added revenue $${bookingRevenue.toFixed(2)} from booking ${
                doc.id
              } (${endTimeFormatted})`
            );
          } else {
            console.warn(`Could not calculate revenue for booking ${doc.id}`);
          }
        } else {
          // Debug why booking was filtered out
          console.log(
            `Booking ${doc.id} outside date range: ${endTimeFormatted} not in ${startFormatted} to ${endFormatted}`
          );
        }
      });

      // Format for display with 2 decimal places
      dashboardData.totalRevenue = Math.round(totalRevenue * 100) / 100;
      console.log(
        `Total revenue for period: $${dashboardData.totalRevenue.toFixed(
          2
        )} from ${processedBookings} bookings`
      );
    } catch (revenueErr) {
      console.error("Error calculating revenue:", revenueErr);
      dashboardData.totalRevenue = 0;
    }

    // Update the UI with our statistics
    updateStatisticsUI();
  } catch (error) {
    console.error("Error loading statistics:", error);
    throw error;
  }
}

// Helper function to update the statistics UI
function updateStatisticsUI() {
  // Update the card displays with the calculated statistics
  document.getElementById("active-bookings-count").textContent =
    dashboardData.activeBookings;
  document.getElementById("total-users-count").textContent =
    dashboardData.totalUsers;
  document.getElementById("available-cars-count").textContent =
    dashboardData.availableCars;
  document.getElementById(
    "total-revenue-value"
  ).textContent = `$${dashboardData.totalRevenue.toFixed(2)}`;
}

// Load recent bookings with proper license plate display
async function loadRecentBookings() {
  try {
    // Step 1: Fetch recent bookings from the bookings collection
    const bookingsQuery = query(
      collection(db, "bookings"),
      orderBy("created_at", "desc"),
      limit(10)
    );

    const bookingsSnapshot = await getDocs(bookingsQuery);
    const bookings = [];

    // Step 2: Process each booking and get car details
    for (const bookingDoc of bookingsSnapshot.docs) {
      const bookingData = bookingDoc.data();
      
      // Get car details
      let carDisplay = "Unknown";
      const carId = bookingData.car_id || bookingData.carID || "";
      
      if (carId) {
        try {
          console.log(`Fetching car details for car_id: ${carId}`);
          const carDoc = await getDoc(doc(db, "cars", carId));
          
          if (carDoc.exists()) {
            const carData = carDoc.data();
            // Format as "LICENSE_PLATE (carID)"
            carDisplay = `${carData.license_plate || "No Plate"} (${carId})`;
            console.log(`Found car: ${carDisplay}`);
          } else {
            console.warn(`Car document not found for ID: ${carId}`);
            carDisplay = `Unknown (${carId})`;
          }
        } catch (error) {
          console.error(`Error fetching car data for ${carId}:`, error);
          carDisplay = `Error (${carId})`;
        }
      } else {
        console.warn(`No car_id found in booking: ${bookingDoc.id}`);
      }

      // Get user name
      let userName = "Unknown User";
      if (bookingData.user_id) {
        try {
          const userDoc = await getDoc(doc(db, "users", bookingData.user_id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userName = `${userData.firstName || ""} ${userData.lastName || ""}`.trim();
            if (!userName) {
              userName = userData.email || "Unknown User";
            }
          }
        } catch (e) {
          console.error("Error fetching user data:", e);
        }
      }

      // Update booking status based on time
      const currentStatus = bookingData.status || "unknown";
      const determinedStatus = determineCorrectStatus(bookingData);

      // Add to display array
      bookings.push({
        id: bookingDoc.id,
        user: userName,
        car: carDisplay,
        date: bookingData.start_time,
        status: determinedStatus,
        car_id: carId,
        statusChanged: determinedStatus !== currentStatus,
      });
    }

    // Sort by date (newest first) and take top 5
    bookings.sort((a, b) => {
      const dateA = a.date instanceof Timestamp ? a.date.seconds : a.date?.seconds || 0;
      const dateB = b.date instanceof Timestamp ? b.date.seconds : b.date?.seconds || 0;
      return dateB - dateA;
    });

    // Set dashboard data
    dashboardData.recentBookings = bookings.slice(0, 5);
    
    // Debug
    console.log("Recent bookings data:", dashboardData.recentBookings);
    
  } catch (error) {
    console.error("Error loading recent bookings:", error);
    throw error;
  }
}



// Load car status data
async function loadCarStatusData() {
  try {
    // Reset car status counts
    dashboardData.carStatus = {
      available: 0,
      booked: 0,
      maintenance: 0,
    };

    // Get all cars
    const carsSnapshot = await getDocs(collection(db, "cars"));

    carsSnapshot.forEach((doc) => {
      const car = doc.data();
      const status = car.status || "unknown";

      // Increment appropriate counter
      if (status === "available") {
        dashboardData.carStatus.available++;
      } else if (status === "booked") {
        dashboardData.carStatus.booked++;
      } else if (status === "maintenance") {
        dashboardData.carStatus.maintenance++;
      }
    });
  } catch (error) {
    console.error("Error loading car status data:", error);
    throw error;
  }
}

// Load user registration data
async function loadUserRegistrationData(period) {
  try {
    // Prepare dates for chart
    const dateLabels = [];
    const registrationCounts = [];
    const dateRange = getDateRange(period);

    // Generate date labels based on period
    if (period === "day") {
      // Hourly data for today
      for (let i = 0; i < 24; i++) {
        const hour = i < 10 ? `0${i}` : `${i}`;
        dateLabels.push(`${hour}:00`);
        registrationCounts.push(0);
      }

      // Get users registered today
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const usersQuery = query(
        collection(db, "users"),
        where("created_at", ">=", Timestamp.fromDate(startOfDay))
      );

      const usersSnapshot = await getDocs(usersQuery);

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.created_at) {
          const creationDate =
            userData.created_at instanceof Timestamp
              ? new Date(userData.created_at.seconds * 1000)
              : new Date(userData.created_at);

          const hour = creationDate.getHours();
          registrationCounts[hour]++;
        }
      });
    } else if (period === "week") {
      // Daily data for the week
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        dateLabels.push(date.toLocaleDateString("en-SG", { weekday: "short" }));
        registrationCounts.push(0);
      }

      // Get users registered this week
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 6);
      startOfWeek.setHours(0, 0, 0, 0);

      const usersQuery = query(
        collection(db, "users"),
        where("created_at", ">=", Timestamp.fromDate(startOfWeek))
      );

      const usersSnapshot = await getDocs(usersQuery);

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.created_at) {
          const creationDate =
            userData.created_at instanceof Timestamp
              ? new Date(userData.created_at.seconds * 1000)
              : new Date(userData.created_at);

          const dayDiff = Math.floor(
            (new Date() - creationDate) / (1000 * 60 * 60 * 24)
          );
          const dayIndex = 6 - dayDiff;

          if (dayIndex >= 0 && dayIndex < 7) {
            registrationCounts[dayIndex]++;
          }
        }
      });
    } else if (period === "month") {
      // Weekly data for the month
      for (let i = 3; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i * 7);

        dateLabels.push(`Week ${4 - i}`);
        registrationCounts.push(0);
      }

      // Get users registered this month
      const startOfMonth = new Date();
      startOfMonth.setMonth(startOfMonth.getMonth() - 1);

      const usersQuery = query(
        collection(db, "users"),
        where("created_at", ">=", Timestamp.fromDate(startOfMonth))
      );

      const usersSnapshot = await getDocs(usersQuery);

      usersSnapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.created_at) {
          const creationDate =
            userData.created_at instanceof Timestamp
              ? new Date(userData.created_at.seconds * 1000)
              : new Date(userData.created_at);

          const dayDiff = Math.floor(
            (new Date() - creationDate) / (1000 * 60 * 60 * 24)
          );
          const weekIndex = Math.floor(dayDiff / 7);

          if (weekIndex >= 0 && weekIndex < 4) {
            registrationCounts[weekIndex]++;
          }
        }
      });
    }

    dashboardData.userRegistrations = {
      labels: dateLabels,
      counts: registrationCounts,
    };
  } catch (error) {
    console.error("Error loading user registration data:", error);
    throw error;
  }
}

// Load maintenance and insurance alerts with color-coded dates
async function loadMaintenanceAlerts() {
  try {
    // Get current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get cars collection
    const carsSnapshot = await getDocs(collection(db, "cars"));
    
    // Array to store alerts
    const alerts = [];
    
    // Process each car
    carsSnapshot.forEach(doc => {
      const car = doc.data();
      car.id = doc.id;
      
      // Check for service due date alerts
      if (car.service_due) {
        const serviceDueDate = parseFirestoreDate(car.service_due);
        
        if (serviceDueDate) {
          const daysDifference = calculateDaysDifference(today, serviceDueDate);
          
          // Add to alerts if service is due within 30 days or overdue
          if (daysDifference <= 30) {
            alerts.push({
              type: 'service',
              car: car,
              title: `Service ${daysDifference < 0 ? 'Overdue' : 'Due Soon'}`,
              details: `${car.license_plate || 'Unknown'} (${car.id})`,
              dueDate: serviceDueDate,
              daysDifference: daysDifference,
              severity: daysDifference < 0 ? 'high' : 'medium',
              formattedDate: formatDate(serviceDueDate),
              countText: formatDaysDifference(daysDifference)
            });
          }
        }
      }
      
      // Check for insurance expiry alerts
      if (car.insurance_expiry) {
        const insuranceExpiryDate = parseFirestoreDate(car.insurance_expiry);
        
        if (insuranceExpiryDate) {
          const daysDifference = calculateDaysDifference(today, insuranceExpiryDate);
          
          // Add to alerts if insurance expires within 30 days or is expired
          if (daysDifference <= 30) {
            alerts.push({
              type: 'insurance',
              car: car,
              title: `Insurance ${daysDifference < 0 ? 'Expired' : 'Expiring Soon'}`,
              details: `${car.license_plate || 'Unknown'} (${car.id})`,
              dueDate: insuranceExpiryDate,
              daysDifference: daysDifference,
              severity: daysDifference < 0 ? 'high' : 'medium',
              formattedDate: formatDate(insuranceExpiryDate),
              countText: formatDaysDifference(daysDifference)
            });
          }
        }
      }
    });
    
    // Sort alerts by days_difference (most urgent first)
    alerts.sort((a, b) => a.daysDifference - b.daysDifference);
    
    // Store in dashboard data
    dashboardData.maintenanceAlerts = alerts;
    
    console.log(`Loaded ${alerts.length} maintenance/insurance alerts`);
  } catch (error) {
    console.error("Error loading maintenance alerts:", error);
    throw error;
  }
}

// Helper function to parse Firestore dates in various formats
function parseFirestoreDate(dateInput) {
  if (!dateInput) return null;
  
  try {
    // Check if it's a Timestamp
    if (dateInput instanceof Timestamp) {
      return dateInput.toDate();
    }
    
    // Check for Firebase timestamp object
    if (dateInput.seconds !== undefined) {
      return new Date(dateInput.seconds * 1000);
    }
    
    // For string dates
    if (typeof dateInput === 'string') {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    
    // For numeric timestamp
    if (typeof dateInput === 'number') {
      return new Date(dateInput);
    }
    
    return null;
  } catch (e) {
    console.error("Date parsing error:", e);
    return null;
  }
}

// Calculate difference in days between two dates
function calculateDaysDifference(startDate, endDate) {
  const startUtc = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUtc = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  
  return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24));
}

// Format days difference with color coding
function formatDaysDifference(days) {
  if (days < 0) {
    // Overdue/expired - red text
    return `<span class="text-danger">${Math.abs(days)} days ago</span>`;
  } else if (days === 0) {
    // Due today - yellow text
    return `<span class="text-warning">Today</span>`;
  } else {
    // Upcoming - yellow text
    return `<span class="text-warning">${days} days left</span>`;
  }
}

// Render dashboard UI with error handling
function renderDashboard() {
  try {
    updateStatistics();
  } catch (e) {
    console.warn("Error updating statistics:", e);
  }

  try {
    renderRecentBookings();
  } catch (e) {
    console.warn("Error rendering bookings:", e);
  }

  try {
    renderCarStatusChart();
  } catch (e) {
    console.warn("Error rendering car chart:", e);
  }

  try {
    renderUserRegistrationChart();
  } catch (e) {
    console.warn("Error rendering user chart:", e);
  }

  try {
    renderMaintenanceAlerts();
  } catch (e) {
    console.warn("Error rendering alerts:", e);
  }
}

// Update statistics cards
function updateStatistics() {
  document.getElementById("active-bookings").textContent =
    dashboardData.activeBookings;
  document.getElementById("total-users").textContent = dashboardData.totalUsers;
  document.getElementById("available-cars").textContent =
    dashboardData.availableCars;
  document.getElementById("total-revenue").textContent = formatCurrency(
    dashboardData.totalRevenue
  );

  // Remove percentage increase/decrease as requested
  const trendElements = document.querySelectorAll(".stat-trend");
  trendElements.forEach((el) => {
    el.style.display = "none";
  });
}

// Render recent bookings table
function renderRecentBookings() {
  const tableBody = document.querySelector("#recent-bookings-table tbody");

  if (!tableBody) return;

  if (dashboardData.recentBookings.length === 0) {
    tableBody.innerHTML = `
      <tr class="placeholder-row">
        <td colspan="6">No recent bookings found</td>
      </tr>
    `;
    return;
  }

  let tableContent = "";

  dashboardData.recentBookings.forEach((booking) => {
    const statusClass = getStatusClass(booking.status);

    tableContent += `
      <tr>
        <td>${booking.id}</td>
        <td>${booking.user}</td>
        <td>${booking.car}</td>
        <td>${formatDate(booking.date)}</td>
        <td>
          <span class="status-badge ${statusClass}">${capitalizeFirstLetter(booking.status)}</span>
        </td>
        <td>
          <button class="action-btn" onclick="viewBookingDetails('${booking.id}', '${booking.car_id}')">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = tableContent;
}

// Render car status chart
function renderCarStatusChart() {
  const chartCanvas = document.getElementById("carStatusChart");

  if (!chartCanvas) return;

  const ctx = chartCanvas.getContext("2d");

  if (carStatusChart) {
    carStatusChart.destroy();
  }

  carStatusChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Available", "Booked", "Maintenance"],
      datasets: [
        {
          data: [
            dashboardData.carStatus.available,
            dashboardData.carStatus.booked,
            dashboardData.carStatus.maintenance,
          ],
          backgroundColor: [
            "#4caf50", // Green for available
            "#ff9800", // Orange for booked
            "#f44336", // Red for maintenance
          ],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage =
                total > 0 ? Math.round((value / total) * 100) : 0;
              return `${label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
    },
  });
}

// Helper functions
function capitalizeFirstLetter(string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getStatusClass(status) {
  if (!status) return "";

  switch (status.toLowerCase()) {
    case "upcoming":
      return "status-upcoming";
    case "active":
      return "status-active";
    case "completed":
      return "status-completed";
    case "cancelled":
      return "status-cancelled";
    default:
      return "";
  }
}

// Determine correct booking status based on time
function determineCorrectStatus(booking) {
  // If already cancelled, don't change the status
  if (booking.status === "cancelled") {
    return booking.status;
  }

  const now = new Date();
  let startTime, endTime;

  // Handle Timestamp objects from Firestore
  if (booking.start_time instanceof Timestamp) {
    startTime = new Date(booking.start_time.seconds * 1000);
  } else if (
    booking.start_time &&
    typeof booking.start_time === "object" &&
    booking.start_time.seconds
  ) {
    // Handle plain object with seconds property
    startTime = new Date(booking.start_time.seconds * 1000);
  } else {
    // Handle string or date
    startTime = new Date(booking.start_time);
  }

  if (booking.end_time instanceof Timestamp) {
    endTime = new Date(booking.end_time.seconds * 1000);
  } else if (
    booking.end_time &&
    typeof booking.end_time === "object" &&
    booking.end_time.seconds
  ) {
    endTime = new Date(booking.end_time.seconds * 1000);
  } else {
    endTime = new Date(booking.end_time);
  }

  // Check if dates are valid
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    console.error("Invalid dates in booking:", booking);
    return booking.status; // Return existing status if dates are invalid
  }

  // Compare dates to determine status
  if (now < startTime) {
    return "upcoming";
  } else if (now >= startTime && now <= endTime) {
    return "active";
  } else if (now > endTime) {
    return "completed";
  }

  return booking.status; // Return existing status if logic fails
}

// Background function to update all booking statuses
async function updateAllBookingStatuses() {
  try {
    console.log("Starting background booking status update...");
    const bookingsSnapshot = await getDocs(collection(db, "bookings"));
    const bookingsToUpdate = [];

    // Process each booking
    for (const bookingDoc of bookingsSnapshot.docs) {
      const booking = bookingDoc.data();
      const currentStatus = booking.status || "unknown";
      const newStatus = determineCorrectStatus(booking);

      console.log(`Booking ${bookingDoc.id}: ${currentStatus} -> ${newStatus}`);

      // Check if status changed
      if (newStatus !== currentStatus) {
        const carId = booking.carID || null;

        // Add to updates list
        bookingsToUpdate.push({
          bookingId: bookingDoc.id,
          carId: carId,
          newStatus: newStatus,
        });
      }
    }

    // Update bookings in batches
    if (bookingsToUpdate.length > 0) {
      console.log(`Updating ${bookingsToUpdate.length} bookings...`);

      // Use batch for better performance
      const batch = writeBatch(db);
      let batchCount = 0;

      // Update root bookings collection
      for (const booking of bookingsToUpdate) {
        batch.update(doc(db, "bookings", booking.bookingId), {
          status: booking.newStatus,
        });
        batchCount++;

        // Commit batch if it gets too large
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`Committed batch of ${batchCount} updates`);
          batchCount = 0;
        }
      }

      // Commit any remaining updates
      if (batchCount > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${batchCount} updates`);
      }

      // Now update timesheets collection if carId is available
      for (const booking of bookingsToUpdate) {
        if (booking.carId) {
          try {
            await updateDoc(
              doc(
                db,
                "timesheets",
                booking.carId,
                "bookings",
                booking.bookingId
              ),
              {
                status: booking.newStatus,
              }
            );
            console.log(
              `Updated timesheet booking ${booking.bookingId} status to ${booking.newStatus}`
            );
          } catch (e) {
            console.error(
              `Error updating timesheet booking ${booking.bookingId}:`,
              e
            );
          }
        }
      }
    } else {
      console.log("No status changes detected");
    }
  } catch (error) {
    console.error("Error updating booking statuses:", error);
  }
}

// Render user registration chart
function renderUserRegistrationChart() {
  const chartCanvas = document.getElementById("userRegistrationChart");

  if (!chartCanvas || !dashboardData.userRegistrations.labels) return;

  const ctx = chartCanvas.getContext("2d");

  if (userRegistrationChart) {
    userRegistrationChart.destroy();
  }

  userRegistrationChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dashboardData.userRegistrations.labels,
      datasets: [
        {
          label: "New Users",
          data: dashboardData.userRegistrations.counts,
          borderColor: "#1e88e5",
          backgroundColor: "rgba(30, 136, 229, 0.1)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
      },
    },
  });
}

// Render maintenance alerts with new table format
function renderMaintenanceAlerts() {
  const alertsList = document.getElementById("maintenance-alerts-list");
  
  if (!alertsList) {
    // Try to find table body instead (for table format)
    const tableBody = document.getElementById("maintenance-alerts-body");
    if (!tableBody) {
      console.error("Maintenance alerts container not found");
      return;
    }
    
    if (dashboardData.maintenanceAlerts.length === 0) {
      tableBody.innerHTML = `
        <tr class="no-alerts">
          <td colspan="4">No maintenance or insurance alerts</td>
        </tr>
      `;
      return;
    }
    
    let alertsHTML = "";
    
    dashboardData.maintenanceAlerts.forEach(alert => {
      // Determine icon based on alert type
      const icon = alert.type === 'service' 
        ? '<i class="bi bi-wrench text-primary"></i>'
        : '<i class="bi bi-shield-check text-success"></i>';
      
      alertsHTML += `
        <tr class="alert-row ${alert.daysDifference < 0 ? 'overdue' : 'upcoming'}">
          <td>
            <div class="car-id-cell">
              ${icon}
              <span>${alert.car.license_plate || 'Unknown'}</span>
              <span class="car-id">(${alert.car.id})</span>
            </div>
          </td>
          <td>
            <span class="alert-type">${alert.title}</span>
          </td>
          <td>
            <span class="due-date">${alert.formattedDate}</span>
          </td>
          <td>
            <span class="days-counter">${alert.countText}</span>
          </td>
        </tr>
      `;
    });
    
    tableBody.innerHTML = alertsHTML;
    return;
  }
  
  // Original list format if table not found
  if (dashboardData.maintenanceAlerts.length === 0) {
    alertsList.innerHTML = `
      <li class="alert-item placeholder">No maintenance or insurance alerts</li>
    `;
    return;
  }
  
  let alertsContent = "";
  
  dashboardData.maintenanceAlerts.forEach(alert => {
    const iconClass = alert.type === 'service' 
      ? "bi-wrench" 
      : "bi-shield-check";
    
    const severityClass = alert.daysDifference < 0 ? "alert-high" : "alert-medium";
    
    alertsContent += `
      <li class="alert-item ${severityClass}">
        <div class="alert-icon">
          <i class="bi ${iconClass}"></i>
        </div>
        <div class="alert-info">
          <p class="alert-title">${alert.title}</p>
          <p class="alert-details">
            ${alert.details} - ${alert.formattedDate} 
            <span class="${alert.daysDifference < 0 ? 'text-danger' : 'text-warning'}">
              (${alert.daysDifference < 0 
                ? Math.abs(alert.daysDifference) + ' days ago' 
                : alert.daysDifference === 0 
                  ? 'Today' 
                  : alert.daysDifference + ' days left'})
            </span>
          </p>
        </div>
      </li>
    `;
  });
  
  alertsList.innerHTML = alertsContent;
}

// Function to handle navigation to booking details
window.viewBookingDetails = function (bookingId, carId) {
  window.location.href = `admin-booking-details.html?id=${bookingId}&carId=${carId}`;
};

// Globally expose the viewBookingDetails function
window.viewBookingDetails = viewBookingDetails;

// View booking details function
async function viewBookingDetails(bookingId, carId) {
  console.log(`Viewing booking details for ID: ${bookingId}, Car ID: ${carId}`);
  try {
    // Show loading state
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(loadingOverlay);
    
    // Get booking data
    const bookingDoc = await getDoc(doc(db, "bookings", bookingId));
    
    if (!bookingDoc.exists()) {
      alert("Booking not found");
      document.body.removeChild(loadingOverlay);
      return;
    }
    
    const booking = {
      id: bookingId,
      ...bookingDoc.data()
    };
    
    // Get user and car data
    const userId = booking.user_id;
    let userData = null;
    let carData = null;
    
    // Get user data
    if (userId) {
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
          userData = userDoc.data();
        }
      } catch (error) {
        console.error(`Error fetching user data for ${userId}:`, error);
      }
    }
    
    // If userData is still null, provide default values
    if (!userData) {
      userData = { firstName: "Unknown", lastName: "", email: "Not available" };
    }
    
    // Get car data - use the carId from the parameter or from the booking
    const carIdToUse = carId || booking.car_id;
    if (carIdToUse) {
      try {
        const carDoc = await getDoc(doc(db, "cars", carIdToUse));
        if (carDoc.exists()) {
          carData = carDoc.data();
          carData.id = carDoc.id;
        }
      } catch (error) {
        console.error(`Error fetching car data for ${carIdToUse}:`, error);
      }
    }
    
    // If carData is still null, provide default values
    if (!carData) {
      carData = { 
        car_type: "Unknown", 
        license_plate: "Unknown",
        car_color: "Not specified" 
      };
    }
    
    // Format dates
    let startDate, endDate, createdDate;
    
    try {
      if (booking.start_time instanceof Timestamp) {
        startDate = booking.start_time.toDate();
      } else if (typeof booking.start_time === 'object' && booking.start_time?.seconds) {
        startDate = new Date(booking.start_time.seconds * 1000);
      } else {
        startDate = new Date(booking.start_time);
      }
    } catch (e) {
      console.error("Error parsing start date:", e);
      startDate = new Date();
    }
    
    try {
      if (booking.end_time instanceof Timestamp) {
        endDate = booking.end_time.toDate();
      } else if (typeof booking.end_time === 'object' && booking.end_time?.seconds) {
        endDate = new Date(booking.end_time.seconds * 1000);
      } else {
        endDate = new Date(booking.end_time);
      }
    } catch (e) {
      console.error("Error parsing end date:", e);
      endDate = new Date(startDate.getTime() + 3600000); // 1 hour after start
    }
    
    try {
      if (booking.created_at instanceof Timestamp) {
        createdDate = booking.created_at.toDate();
      } else if (typeof booking.created_at === 'object' && booking.created_at?.seconds) {
        createdDate = new Date(booking.created_at.seconds * 1000);
      } else {
        createdDate = new Date(booking.created_at);
      }
    } catch (e) {
      console.error("Error parsing created date:", e);
      createdDate = new Date();
    }
    
    // Format for display
    const dateTimeFormat = {
      weekday: 'short',
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    const formattedStartDateTime = startDate.toLocaleString('en-US', dateTimeFormat);
    const formattedEndDateTime = endDate.toLocaleString('en-US', dateTimeFormat);
    const formattedCreatedDate = createdDate.toLocaleDateString('en-US');
    
    // Calculate duration
    const durationMs = endDate - startDate;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    // Get the modal elements
    const modal = document.getElementById("booking-modal");
    const modalTitle = document.querySelector("#booking-modal .modal-header h2");
    const modalBody = document.getElementById("modal-body");
    
    if (!modal || !modalBody) {
      console.error("Modal elements not found!");
      document.body.removeChild(loadingOverlay);
      return;
    }
    
    // Update modal title
    if (modalTitle) {
  modalTitle.textContent = `Booking Details: ${bookingId}`;
}
    
    // Format status with proper styling
    const statusClass = getStatusClass(booking.status || 'unknown');
    const statusDisplay = capitalizeFirstLetter(booking.status || 'Unknown');
    
    // Update modal content
    modalBody.innerHTML = `
      <div class="booking-details-grid">
        <!-- Booking Info Section -->
        <div class="details-section">
          <h4><i class="bi bi-info-circle"></i> Booking Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Status</div>
              <div class="info-value">
                <span class="status-badge ${statusClass}">
                  ${statusDisplay}
                </span>
              </div>
            </div>
            <div class="info-item">
              <div class="info-label">Created On</div>
              <div class="info-value">${formattedCreatedDate}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Price</div>
              <div class="info-value">$${(booking.total_price || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
        
        <!-- Customer Info Section -->
        <div class="details-section">
          <h4><i class="bi bi-person"></i> Customer Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Name</div>
              <div class="info-value">${userData.firstName || 'Unknown'} ${userData.lastName || ''}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Customer ID</div>
              <div class="info-value">${userId || 'Unknown'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Email</div>
              <div class="info-value">${userData.email || 'Not provided'}</div>
            </div>
          </div>
        </div>
        
        <!-- Vehicle Information -->
        <div class="details-section">
          <h4><i class="bi bi-car-front"></i> Vehicle Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Vehicle Model</div>
              <div class="info-value">${carData.car_type || 'Unknown'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">License Plate</div>
              <div class="info-value">${carData.license_plate || 'N/A'} (${carIdToUse || 'Unknown'})</div>
            </div>
            <div class="info-item">
              <div class="info-label">Color</div>
              <div class="info-value">${carData.car_color || 'Not specified'}</div>
            </div>
          </div>
        </div>
        
        <!-- Time Information -->
        <div class="details-section">
          <h4><i class="bi bi-clock"></i> Time Information</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Start</div>
              <div class="info-value">${formattedStartDateTime}</div>
            </div>
            <div class="info-item">
              <div class="info-label">End</div>
              <div class="info-value">${formattedEndDateTime}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Duration</div>
              <div class="info-value">${hours}h ${minutes}m</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Set up edit button link
    const editBtn = document.getElementById("edit-booking-btn");
    if (editBtn) {
      editBtn.href = `admin-booking-edit.html?id=${bookingId}`;
    }
    
    // Show the modal
    modal.style.display = "flex";
    
    // Remove loading overlay
    document.body.removeChild(loadingOverlay);
    
    // Set up modal close functionality if not already done
    setupModalClose();
  } catch (error) {
    console.error("Error viewing booking details:", error);
    alert("Error loading booking details. Please try again.");
    const loadingOverlay = document.querySelector('.loading-overlay');
    if (loadingOverlay) {
      document.body.removeChild(loadingOverlay);
    }
  }
}

// Set up modal close functionality
function setupModalClose() {
  const closeButtons = document.querySelectorAll(".close-modal");
  const modal = document.getElementById("booking-modal");
  
  if (!modal) return;
  
  closeButtons.forEach(button => {
    // Remove existing event listeners to prevent duplicates
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add new event listener
    newButton.addEventListener("click", () => {
      modal.style.display = "none";
    });
  });
  
  // Close when clicking outside the modal content
  window.addEventListener("click", event => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
}