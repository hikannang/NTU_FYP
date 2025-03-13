import { db } from "../common/firebase-config.js";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Dashboard state
let currentPeriod = 'day';
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
    maintenance: 0
  },
  userRegistrations: [],
  maintenanceAlerts: []
};

// Date helpers
const getDateRange = (period) => {
  const now = new Date();
  let startDate;
  
  switch(period) {
    case 'day':
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      break;
    default:
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
  }
  
  return {
    start: startDate,
    end: now
  };
};

// Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2
  }).format(amount);
};

// Format date
const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  
  const date = timestamp instanceof Timestamp ? 
    new Date(timestamp.seconds * 1000) : 
    new Date(timestamp);
    
  return date.toLocaleDateString('en-SG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Example function to validate Singapore license plate format
function isValidLicensePlate(plate) {
  // Singapore license plate format: 1-3 letters, followed by 1-4 digits, optionally followed by a letter
  const regex = /^[A-Z]{1,3}[0-9]{1,4}[A-Z]?$/;
  return regex.test(plate);
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
  // Set up date filter buttons
  setupDateFilters();
  
  // Load initial data
  await loadDashboardData('day');
  
  // Render all dashboard components
  renderDashboard();
});

// Setup date filter buttons
function setupDateFilters() {
  const filterButtons = document.querySelectorAll('.filter-btn');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', async () => {
      // Update active button
      filterButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Get selected period
      const period = button.getAttribute('data-period');
      currentPeriod = period;
      
      // Load data for selected period
      await loadDashboardData(period);
      
      // Update the dashboard
      renderDashboard();
    });
  });
}

// Load all dashboard data
async function loadDashboardData(period) {
  try {
    const dateRange = getDateRange(period);
    
    // Load data in parallel for better performance
    await Promise.all([
      loadStatistics(dateRange),
      loadRecentBookings(),
      loadCarStatusData(),
      loadUserRegistrationData(period),
      loadMaintenanceAlerts()
    ]);
    
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showErrorMessage('Failed to load dashboard data. Please try again.');
  }
}

// Load statistics
async function loadStatistics(dateRange) {
  try {
    // Active bookings count
    const activeBookingsQuery = query(
      collection(db, 'bookings'),
      where('status', '==', 'active')
    );
    const activeBookingsSnapshot = await getDocs(activeBookingsQuery);
    dashboardData.activeBookings = activeBookingsSnapshot.size;
    
    // Total users count
    const usersSnapshot = await getDocs(collection(db, 'users'));
    dashboardData.totalUsers = usersSnapshot.size;
    
    // Available cars count
    const availableCarsQuery = query(
      collection(db, 'cars'),
      where('status', '==', 'available')
    );
    const availableCarsSnapshot = await getDocs(availableCarsQuery);
    dashboardData.availableCars = availableCarsSnapshot.size;
    
    // Total revenue (from completed bookings within date range)
    const startTimestamp = Timestamp.fromDate(dateRange.start);
    const endTimestamp = Timestamp.fromDate(dateRange.end);
    
    const revenueQuery = query(
      collection(db, 'bookings'),
      where('status', '==', 'completed'),
      where('end_time', '>=', startTimestamp),
      where('end_time', '<=', endTimestamp)
    );
    
    const revenueSnapshot = await getDocs(revenueQuery);
    let totalRevenue = 0;
    
    revenueSnapshot.forEach(doc => {
      const booking = doc.data();
      if (booking.price) {
        totalRevenue += parseFloat(booking.price);
      }
    });
    
    dashboardData.totalRevenue = totalRevenue;
    
  } catch (error) {
    console.error('Error loading statistics:', error);
    throw error;
  }
}

// Load recent bookings
async function loadRecentBookings() {
  try {
    const recentBookingsQuery = query(
      collection(db, 'bookings'),
      orderBy('created_at', 'desc'),
      limit(5)
    );
    
    const bookingsSnapshot = await getDocs(recentBookingsQuery);
    const bookings = [];
    
    for (const bookingDoc of bookingsSnapshot.docs) {
      const bookingData = bookingDoc.data();
      
      // Get user name
      let userName = 'Unknown User';
      if (bookingData.user_id) {
        try {
          const userDoc = await getDocs(doc(db, 'users', bookingData.user_id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
          }
        } catch (e) {
          console.error('Error fetching user data:', e);
        }
      }
      
      // Get car details
      let carDetails = 'Unknown Car';
      if (bookingData.car_id) {
        try {
          const carDoc = await getDocs(doc(db, 'cars', bookingData.car_id));
          if (carDoc.exists()) {
            const carData = carDoc.data();
            carDetails = `${carData.car_type || ''} (${carData.license_plate || ''})`.trim();
          }
        } catch (e) {
          console.error('Error fetching car data:', e);
        }
      }
      
      bookings.push({
        id: bookingDoc.id,
        user: userName,
        car: carDetails,
        date: bookingData.start_time,
        status: bookingData.status,
        car_id: bookingData.car_id
      });
    }
    
    dashboardData.recentBookings = bookings;
    
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
        
        dateLabels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
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
        } else if (daysDiff < 14) {  // Changed from 7 to 14 days (two weeks notice)
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
        } else if (daysDiff < 30) {  // Changed from 14 to 30 days (one month notice)
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

// Render dashboard UI
function renderDashboard() {
  // Update statistics
  updateStatistics();
  
  // Update recent bookings table
  renderRecentBookings();
  
  // Update car status chart
  renderCarStatusChart();
  
  // Update user registration chart
  renderUserRegistrationChart();
  
  // Update maintenance alerts
  renderMaintenanceAlerts();
}

// Update statistics cards
function updateStatistics() {
  document.getElementById('active-bookings').textContent = dashboardData.activeBookings;
  document.getElementById('total-users').textContent = dashboardData.totalUsers;
  document.getElementById('available-cars').textContent = dashboardData.availableCars;
  document.getElementById('total-revenue').textContent = formatCurrency(dashboardData.totalRevenue);
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
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function getStatusClass(status) {
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

function showErrorMessage(message) {
  // You can implement error toast/notification here
  console.error(message);
}

// Global function for booking details (needs to be accessible from HTML)
window.viewBookingDetails = function(bookingId, carId) {
  window.location.href = `admin-booking-details.html?id=${bookingId}&carId=${carId}`;
};