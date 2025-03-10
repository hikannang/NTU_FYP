// user-bookings.js
import { db, auth } from '../common/firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize variables
let userId;
let bookingsData = {
    upcoming: [],
    active: [],
    past: [],
    cancelled: []
};

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const noBookingsMessage = document.getElementById('no-bookings-message');
const bookingsTabs = document.querySelectorAll('.tab-item');
const bookingsTabContent = document.querySelectorAll('.tab-content');
const upcomingBookingsContainer = document.getElementById('upcoming-bookings');
const activeBookingsContainer = document.getElementById('active-bookings');
const pastBookingsContainer = document.getElementById('past-bookings');
const cancelledBookingsContainer = document.getElementById('cancelled-bookings');

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
    
    // Setup logout button
    setupLogoutButton();
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            setupTabNavigation();
            await loadUserBookings();
        } else {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

// Add this function
function setupLogoutButton() {
    setTimeout(() => {
        const logoutButton = document.getElementById('logout-button');
        if (logoutButton) {
            logoutButton.addEventListener('click', async (event) => {
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

// Setup tab navigation
function setupTabNavigation() {
    bookingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            bookingsTabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Hide all tab content
            bookingsTabContent.forEach(content => content.style.display = 'none');
            
            // Show selected tab content
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).style.display = 'block';
        });
    });
}

// Load all user bookings
async function loadUserBookings() {
    try {
        // Show loading indicator
        loadingIndicator.style.display = 'flex';
        noBookingsMessage.style.display = 'none';
        
        // Reset booking data
        bookingsData = {
            upcoming: [],
            active: [],
            past: [],
            cancelled: []
        };
        
        // Get current timestamp
        const now = Timestamp.now();
        
        // Get all cars
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        const cars = {};
        
        // Create a map of car IDs to car data for quick lookup
        carsSnapshot.forEach(doc => {
            cars[doc.id] = { id: doc.id, ...doc.data() };
        });
        
        // Loop through each car to find bookings for the current user
        for (const carId in cars) {
            const bookingsRef = collection(db, 'timesheets', carId, 'bookings');
            const userBookingsQuery = query(
                bookingsRef, 
                where('user_id', '==', userId),
                orderBy('start_time', 'desc')
            );
            
            const bookingsSnapshot = await getDocs(userBookingsQuery);
            
            for (const doc of bookingsSnapshot.docs) {
                const booking = {
                    id: doc.id,
                    carId: carId,
                    car: cars[carId],
                    ...doc.data()
                };
                
                // Determine booking category based on time and status
                if (booking.status === 'cancelled') {
                    bookingsData.cancelled.push(booking);
                } else if (booking.start_time.seconds * 1000 > now.seconds * 1000) {
                    bookingsData.upcoming.push(booking);
                } else if (booking.end_time.seconds * 1000 < now.seconds * 1000) {
                    bookingsData.past.push(booking);
                } else {
                    bookingsData.active.push(booking);
                }
            }
        }
        
        // Sort bookings by start time
        bookingsData.upcoming.sort((a, b) => a.start_time.seconds - b.start_time.seconds);
        bookingsData.active.sort((a, b) => a.end_time.seconds - b.end_time.seconds);
        bookingsData.past.sort((a, b) => b.start_time.seconds - a.start_time.seconds);
        bookingsData.cancelled.sort((a, b) => b.start_time.seconds - a.start_time.seconds);
        
        // Update UI with bookings
        updateBookingsUI();
        
    } catch (error) {
        console.error('Error loading bookings:', error);
        showErrorMessage('Failed to load your bookings. Please try again later.');
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Update UI with bookings data
function updateBookingsUI() {
    // Clear all containers
    upcomingBookingsContainer.innerHTML = '';
    activeBookingsContainer.innerHTML = '';
    pastBookingsContainer.innerHTML = '';
    cancelledBookingsContainer.innerHTML = '';
    
    // Check if there are any bookings at all
    const totalBookings = bookingsData.upcoming.length + 
                          bookingsData.active.length + 
                          bookingsData.past.length + 
                          bookingsData.cancelled.length;
    
    if (totalBookings === 0) {
        noBookingsMessage.style.display = 'flex';
        return;
    }
    
    // Populate upcoming bookings
    if (bookingsData.upcoming.length > 0) {
        bookingsData.upcoming.forEach(booking => {
            upcomingBookingsContainer.appendChild(createBookingCard(booking, 'upcoming'));
        });
    } else {
        upcomingBookingsContainer.innerHTML = createEmptyStateMessage('No upcoming bookings');
    }
    
    // Populate active bookings
    if (bookingsData.active.length > 0) {
        bookingsData.active.forEach(booking => {
            activeBookingsContainer.appendChild(createBookingCard(booking, 'active'));
        });
    } else {
        activeBookingsContainer.innerHTML = createEmptyStateMessage('No active bookings');
    }
    
    // Populate past bookings
    if (bookingsData.past.length > 0) {
        bookingsData.past.forEach(booking => {
            pastBookingsContainer.appendChild(createBookingCard(booking, 'past'));
        });
    } else {
        pastBookingsContainer.innerHTML = createEmptyStateMessage('No past bookings');
    }
    
    // Populate cancelled bookings
    if (bookingsData.cancelled.length > 0) {
        bookingsData.cancelled.forEach(booking => {
            cancelledBookingsContainer.appendChild(createBookingCard(booking, 'cancelled'));
        });
    } else {
        cancelledBookingsContainer.innerHTML = createEmptyStateMessage('No cancelled bookings');
    }
    
    // Set active tab based on which category has bookings
    setInitialActiveTab();
}

// Create a booking card element
function createBookingCard(booking, bookingType) {
    const bookingCard = document.createElement('div');
    bookingCard.className = 'booking-card';
    
    // Convert timestamps to Date objects
    const startTime = new Date(booking.start_time.seconds * 1000);
    const endTime = new Date(booking.end_time.seconds * 1000);
    
    // Format dates and times
    const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    const formattedDate = startTime.toLocaleDateString('en-US', dateOptions);
    const formattedStartTime = startTime.toLocaleTimeString('en-US', timeOptions);
    const formattedEndTime = endTime.toLocaleTimeString('en-US', timeOptions);
    
    // Calculate time remaining or time until booking (for active and upcoming)
    let timeText = '';
    const now = new Date();
    
    if (bookingType === 'active') {
        const minutesRemaining = Math.floor((endTime - now) / 60000);
        const hoursRemaining = Math.floor(minutesRemaining / 60);
        const mins = minutesRemaining % 60;
        
        if (hoursRemaining > 0) {
            timeText = `${hoursRemaining}h ${mins}m remaining`;
        } else {
            timeText = `${mins} minutes remaining`;
        }
    } else if (bookingType === 'upcoming') {
        const minutesUntil = Math.floor((startTime - now) / 60000);
        const hoursUntil = Math.floor(minutesUntil / 60);
        const daysUntil = Math.floor(hoursUntil / 24);
        
        if (daysUntil > 0) {
            timeText = `Starts in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
        } else if (hoursUntil > 0) {
            const mins = minutesUntil % 60;
            timeText = `Starts in ${hoursUntil}h ${mins}m`;
        } else {
            timeText = `Starts in ${minutesUntil} minutes`;
        }
    }
    
    // Determine if AR wayfinding should be enabled
    const thirtyMinutesBeforeStart = new Date(startTime);
    thirtyMinutesBeforeStart.setMinutes(thirtyMinutesBeforeStart.getMinutes() - 30);
    
    const isAREnabled = bookingType === 'active' || 
                        (bookingType === 'upcoming' && now >= thirtyMinutesBeforeStart);
    
    // Set card HTML content
    bookingCard.innerHTML = `
        <div class="booking-status ${bookingType}">
            <span>${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)}</span>
        </div>
        
        <div class="booking-header">
            <div class="car-image">
                <img src="../static/assets/images/${booking.car.car_type.toLowerCase()}.jpg" 
                    alt="${booking.car.car_type}" 
                    onerror="this.src='../static/assets/images/car-placeholder.jpg'">
            </div>
            <div class="booking-info">
                <h3>${booking.car.car_type}</h3>
                <div class="booking-time">
                    <div><i class="bi bi-calendar"></i> ${formattedDate}</div>
                    <div><i class="bi bi-clock"></i> ${formattedStartTime} - ${formattedEndTime}</div>
                </div>
                ${timeText ? `<div class="time-remaining">${timeText}</div>` : ''}
            </div>
        </div>
        
        <div class="booking-details">
            <div class="detail-item">
                <i class="bi bi-geo-alt"></i>
                <span>${booking.car.address}</span>
            </div>
            <div class="detail-item">
                <i class="bi bi-tag"></i>
                <span>Booking #${booking.id.slice(-6)}</span>
            </div>
        </div>
        
        <div class="booking-actions">
            <a href="user-booking-details.html?id=${booking.id}&carId=${booking.carId}" class="primary-btn">
                View Details
            </a>
            ${bookingType === 'upcoming' ? `
                <button class="secondary-btn cancel-btn" data-booking-id="${booking.id}" data-car-id="${booking.carId}">
                    Cancel Booking
                </button>
            ` : ''}
            ${isAREnabled ? `
                <button class="ar-btn" data-booking-id="${booking.id}" data-car-id="${booking.carId}">
                    <i class="bi bi-pin-map-fill"></i> Find Car
                </button>
            ` : ''}
        </div>
    `;
    
    // Add event listeners to buttons
    if (bookingType === 'upcoming') {
        const cancelButton = bookingCard.querySelector('.cancel-btn');
        cancelButton.addEventListener('click', () => cancelBooking(booking.id, booking.carId));
    }
    
    if (isAREnabled) {
        const arButton = bookingCard.querySelector('.ar-btn');
        arButton.addEventListener('click', () => launchARWayfinding(booking.id, booking.carId));
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
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="bi bi-exclamation-triangle"></i>
        <p>${message}</p>
        <button onclick="location.reload()" class="secondary-btn">Retry</button>
    `;
    
    // Clear loading indicator and show error
    loadingIndicator.style.display = 'none';
    document.querySelector('.container').appendChild(errorDiv);
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
    bookingsTabs[activeTabIndex].click();
}

// Cancel booking
async function cancelBooking(bookingId, carId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }
    
    try {
        // Update booking status to cancelled
        await updateDoc(doc(db, 'timesheets', carId, 'bookings', bookingId), {
            status: 'cancelled'
        });
        
        // Reload bookings
        await loadUserBookings();
        
        // Show success message
        alert('Booking cancelled successfully');
    } catch (error) {
        console.error('Error cancelling booking:', error);
        alert('Failed to cancel booking. Please try again.');
    }
}

// Launch AR wayfinding
function launchARWayfinding(bookingId, carId) {
    // Store the IDs in session storage for the AR page to use
    sessionStorage.setItem('arBookingId', bookingId);
    sessionStorage.setItem('arCarId', carId);
    
    // Redirect to the AR wayfinding page
    window.location.href = 'user-ar-wayfinding.html';
}