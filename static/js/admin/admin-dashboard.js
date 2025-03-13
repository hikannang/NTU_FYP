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
    
    // handle each operation separately
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

// Load statistics
async function loadStatistics(dateRange) {
  try {
    // Active bookings count - across all cars
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
    activeBookingsCount = bookingCounts.reduce((sum, count) => sum + count, 0);
    dashboardData.activeBookings = activeBookingsCount;

    // Total users count
    const usersSnapshot = await getDocs(collection(db, "users"));
    dashboardData.totalUsers = usersSnapshot.size;

    // Available cars count
    const availableCarsQuery = query(
      collection(db, "cars"),
      where("status", "==", "available")
    );
    const availableCarsSnapshot = await getDocs(availableCarsQuery);
    dashboardData.availableCars = availableCarsSnapshot.size;

    // Total revenue (from completed bookings within date range)
    const startTimestamp = Timestamp.fromDate(dateRange.start);
    const endTimestamp = Timestamp.fromDate(dateRange.end);

    // Initialize revenue
    let totalRevenue = 0;
    
    // Collect completed bookings across all cars
    const revenuePromises = carsSnapshot.docs.map(async (carDoc) => {
      const carId = carDoc.id;
      const bookingsRef = collection(db, "timesheets", carId, "bookings");
      const completedBookingsQuery = query(
        bookingsRef,
        where("status", "==", "completed"),
        where("end_time", ">=", startTimestamp),
        where("end_time", "<=", endTimestamp)
      );
      
      const bookingsSnapshot = await getDocs(completedBookingsQuery);
      let carRevenue = 0;
      
      bookingsSnapshot.forEach(doc => {
        const booking = doc.data();
        if (booking.price) {
          carRevenue += parseFloat(booking.price);
        }
      });
      
      return carRevenue;
    });
    
    // Sum up all revenue
    const revenues = await Promise.all(revenuePromises);
    totalRevenue = revenues.reduce((sum, rev) => sum + rev, 0);
    dashboardData.totalRevenue = totalRevenue;
  } catch (error) {
    console.error("Error loading statistics:", error);
    throw error;
  }
}

// Load recent bookings
async function loadRecentBookings() {
  try {
    const carsSnapshot = await getDocs(collection(db, "cars"));
    let allRecentBookings = [];
    
    // Get bookings from each car
    for (const carDoc of carsSnapshot.docs) {
      const carId = carDoc.id;
      const carData = carDoc.data();
      
      // Query recent bookings for this car
      const bookingsRef = collection(db, "timesheets", carId, "bookings");
      const recentBookingsQuery = query(
        bookingsRef,
        orderBy("created_at", "desc"),
        limit(10)
      );
      
      const bookingsSnapshot = await getDocs(recentBookingsQuery);
      
      // Process each booking
      for (const bookingDoc of bookingsSnapshot.docs) {
        const bookingData = bookingDoc.data();
        
        // Get user name
        let userName = 'Unknown User';
        if (bookingData.user_id) {
          try {
            const userDoc = await getDoc(doc(db, 'users', bookingData.user_id));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
              if (!userName) {
                // Fallback to email if name isn't available
                userName = userData.email || 'Unknown User';
              }
            }
          } catch (e) {
            console.error('Error fetching user data:', e);
          }
        }
        
        // Add booking to list with car details
        allRecentBookings.push({
          id: bookingDoc.id,
          user: userName,
          car: `${carData.car_type || ''} (${carData.license_plate || 'No Plate'})`,
          date: bookingData.start_time,
          status: bookingData.status || 'unknown',
          car_id: carId
        });
      }
    }
    
    // Sort by date (newest first) and take top 5
    allRecentBookings.sort((a, b) => {
      const dateA = a.date instanceof Timestamp ? a.date.seconds : a.date;
      const dateB = b.date instanceof Timestamp ? b.date.seconds : b.date;
      return dateB - dateA;
    });
    
    // Set dashboard data
    dashboardData.recentBookings = allRecentBookings.slice(0, 5);
    
  } catch (error) {
    console.error('Error loading recent bookings:', error);
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
      maintenance: 0
    };
    
    // Get all cars
    const carsSnapshot = await getDocs(collection(db, 'cars'));
    
    carsSnapshot.forEach(doc => {
      const car = doc.data();
      const status = car.status || 'unknown';
      
      // Increment appropriate counter
      if (status === 'available') {
        dashboardData.carStatus.available++;
      } else if (status === 'booked') {
        dashboardData.carStatus.booked++;
      } else if (status === 'maintenance') {
        dashboardData.carStatus.maintenance++;
      }
    });
    
  } catch (error) {
    console.error('Error loading car status data:', error);
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
    if (period === 'day') {
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
        collection(db, 'users'),
        where('created_at', '>=', Timestamp.fromDate(startOfDay))
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.created_at) {
          const creationDate = userData.created_at instanceof Timestamp ?
            new Date(userData.created_at.seconds * 1000) : new Date(userData.created_at);
          
          const hour = creationDate.getHours();
          registrationCounts[hour]++;
        }
      });
      
    } else if (period === 'week') {
      // Daily data for the week
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        dateLabels.push(date.toLocaleDateString('en-SG', { weekday: 'short' }));
        registrationCounts.push(0);
      }
      
      // Get users registered this week
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 6);
      startOfWeek.setHours(0, 0, 0, 0);
      
      const usersQuery = query(
        collection(db, 'users'),
        where('created_at', '>=', Timestamp.fromDate(startOfWeek))
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.created_at) {
          const creationDate = userData.created_at instanceof Timestamp ?
            new Date(userData.created_at.seconds * 1000) : new Date(userData.created_at);
          
          const dayDiff = Math.floor((new Date() - creationDate) / (1000 * 60 * 60 * 24));
          const dayIndex = 6 - dayDiff;
          
          if (dayIndex >= 0 && dayIndex < 7) {
            registrationCounts[dayIndex]++;
          }
        }
      });
      
    } else if (period === 'month') {
      // Weekly data for the month
      for (let i = 3; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - (i * 7));
        
        dateLabels.push(`Week ${4-i}`);
        registrationCounts.push(0);
      }
      
      // Get users registered this month
      const startOfMonth = new Date();
      startOfMonth.setMonth(startOfMonth.getMonth() - 1);
      
      const usersQuery = query(
        collection(db, 'users'),
        where('created_at', '>=', Timestamp.fromDate(startOfMonth))
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.created_at) {
          const creationDate = userData.created_at instanceof Timestamp ?
            new Date(userData.created_at.seconds * 1000) : new Date(userData.created_at);
          
          const dayDiff = Math.floor((new Date() - creationDate) / (1000 * 60 * 60 * 24));
          const weekIndex = Math.floor(dayDiff / 7);
          
          if (weekIndex >= 0 && weekIndex < 4) {
            registrationCounts[weekIndex]++;
          }
        }
      });
    }
    
    dashboardData.userRegistrations = {
      labels: dateLabels,
      counts: registrationCounts
    };
    
  } catch (error) {
    console.error('Error loading user registration data:', error);
    throw error;
  }
}

// Load maintenance alerts
async function loadMaintenanceAlerts() {
  try {
    const alerts = [];
    const now = new Date();
    
    // Get cars that need maintenance soon or are past due
    const carsSnapshot = await getDocs(collection(db, 'cars'));
    
    carsSnapshot.forEach(doc => {
      const car = doc.data();
      
      // Check service due date
      if (car.service_due) {
        const serviceDueDate = car.service_due instanceof Timestamp ?
          new Date(car.service_due.seconds * 1000) : new Date(car.service_due);
        
        const daysDiff = Math.floor((serviceDueDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 0) {
          // Past due
          alerts.push({
            id: doc.id,
            title: `${car.car_type || 'Car'} (${car.license_plate || 'Unknown'}) Service Overdue`,
            details: `Service was due ${Math.abs(daysDiff)} days ago`,
            severity: 'high',
            car_id: doc.id
          });
        } else if (daysDiff < 14) { // Changed from 7 to 14 days (Singapore context)
          // Due within two weeks
          alerts.push({
            id: doc.id,
            title: `${car.car_type || 'Car'} (${car.license_plate || 'Unknown'}) Service Due Soon`,
            details: `Service due in ${daysDiff} days`,
            severity: 'medium',
            car_id: doc.id
          });
        }
      }
      
      // Check insurance expiry
      if (car.insurance_expiry) {
        const insuranceExpiryDate = car.insurance_expiry instanceof Timestamp ?
          new Date(car.insurance_expiry.seconds * 1000) : new Date(car.insurance_expiry);
        
        const daysDiff = Math.floor((insuranceExpiryDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysDiff < 0) {
          // Expired
          alerts.push({
            id: `${doc.id}-insurance`,
            title: `${car.car_type || 'Car'} (${car.license_plate || 'Unknown'}) Insurance Expired`,
            details: `Insurance expired ${Math.abs(daysDiff)} days ago`,
            severity: 'high',
            car_id: doc.id
          });
        } else if (daysDiff < 30) { // Changed from 14 to 30 days (Singapore context)
          // Expiring soon
          alerts.push({
            id: `${doc.id}-insurance`,
            title: `${car.car_type || 'Car'} (${car.license_plate || 'Unknown'}) Insurance Expiring Soon`,
            details: `Insurance expires in ${daysDiff} days`,
            severity: 'medium',
            car_id: doc.id
          });
        }
      }
    });
    
    // Sort by severity (high to low)
    alerts.sort((a, b) => {
      if (a.severity === 'high' && b.severity !== 'high') return -1;
      if (a.severity !== 'high' && b.severity === 'high') return 1;
      return 0;
    });
    
    dashboardData.maintenanceAlerts = alerts.slice(0, 5); // Only show top 5
    
  } catch (error) {
    console.error('Error loading maintenance alerts:', error);
    throw error;
  }
}

// Render dashboard UI with error tolerance
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
  try {
    if (!document.getElementById('active-bookings')) return;
    document.getElementById('active-bookings').textContent = dashboardData.activeBookings || 0;
    document.getElementById('total-users').textContent = dashboardData.totalUsers || 0;
    document.getElementById('available-cars').textContent = dashboardData.availableCars || 0;
    document.getElementById('total-revenue').textContent = formatCurrency(dashboardData.totalRevenue || 0);
  } catch (error) {
    console.warn("Error updating statistics:", error);
  }
}

// Render recent bookings table
function renderRecentBookings() {
  const tableBody = document.querySelector('#recent-bookings-table tbody');
  
  if (!tableBody) return;
  
  if (dashboardData.recentBookings.length === 0) {
    tableBody.innerHTML = `
      <tr class="placeholder-row">
        <td colspan="6">No recent bookings found</td>
      </tr>
    `;
    return;
  }
  
  let tableContent = '';
  
  dashboardData.recentBookings.forEach(booking => {
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
  const chartCanvas = document.getElementById('carStatusChart');
  
  if (!chartCanvas) return;
  
  const ctx = chartCanvas.getContext('2d');
  
  if (carStatusChart) {
    carStatusChart.destroy();
  }
  
  carStatusChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Available', 'Booked', 'Maintenance'],
      datasets: [{
        data: [
          dashboardData.carStatus.available,
          dashboardData.carStatus.booked,
          dashboardData.carStatus.maintenance
        ],
        backgroundColor: [
          '#4caf50', // Green for available
          '#ff9800', // Orange for booked
          '#f44336'  // Red for maintenance
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

// Render user registration chart
function renderUserRegistrationChart() {
  const chartCanvas = document.getElementById('userRegistrationChart');
  
  if (!chartCanvas || !dashboardData.userRegistrations.labels) return;
  
  const ctx = chartCanvas.getContext('2d');
  
  if (userRegistrationChart) {
    userRegistrationChart.destroy();
  }
  
  userRegistrationChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dashboardData.userRegistrations.labels,
      datasets: [{
        label: 'New Users',
        data: dashboardData.userRegistrations.counts,
        borderColor: '#1e88e5',
        backgroundColor: 'rgba(30, 136, 229, 0.1)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

// Render maintenance alerts
function renderMaintenanceAlerts() {
  const alertsList = document.getElementById('maintenance-alerts-list');
  
  if (!alertsList) return;
  
  if (dashboardData.maintenanceAlerts.length === 0) {
    alertsList.innerHTML = `
      <li class="alert-item placeholder">No maintenance alerts found</li>
    `;
    return;
  }
  
  let alertsContent = '';
  
  dashboardData.maintenanceAlerts.forEach(alert => {
    const iconClass = alert.severity === 'high' ? 'bi-exclamation-triangle' : 'bi-exclamation-circle';
    
    alertsContent += `
      <li class="alert-item">
        <div class="alert-icon">
          <i class="bi ${iconClass}"></i>
        </div>
        <div class="alert-info">
          <p class="alert-title">${alert.title}</p>
          <p class="alert-details">${alert.details}</p>
        </div>
      </li>
    `;
  });
  
  alertsList.innerHTML = alertsContent;
}

// Helper functions
function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getStatusClass(status) {
  if (!status) return '';
  
  switch(status.toLowerCase()) {
    case 'active':
      return 'status-active';
    case 'pending':
      return 'status-pending';
    case 'cancelled':
      return 'status-cancelled';
    case 'completed':
      return 'status-completed';
    default:
      return '';
  }
}

// Function to handle navigation to booking details
window.viewBookingDetails = function(bookingId, carId) {
  window.location.href = `admin-booking-details.html?id=${bookingId}&carId=${carId}`;
};