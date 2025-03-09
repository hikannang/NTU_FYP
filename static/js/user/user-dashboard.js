// user-dashboard.js
import { db, auth } from '../common/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy,
    Timestamp,
    doc,
    getDoc 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html')
        .then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html')
        .then(response => response.text());
    
    // Set default date and time for search
    setDefaultDateTime();
    
    // Check user authentication and load user data
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            await loadUserData(user.uid);
            await loadActiveBookings(user.uid);
            initializeSearch();
            loadNearbyCars();
        } else {
            // User is signed out, redirect to login
            window.location.href = "../index.html";
        }
    });

    // Event listeners
    document.getElementById('search-btn').addEventListener('click', searchCars);
    document.getElementById('current-location-btn').addEventListener('click', getCurrentLocation);
    document.getElementById('car-type-filter').addEventListener('change', filterNearbyCars);
});

// Set default date and time (current time rounded to next hour)
function setDefaultDateTime() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate());
    tomorrow.setHours(now.getHours() + 1);
    tomorrow.setMinutes(0);
    
    const dateInput = document.getElementById('pickup-date');
    const timeInput = document.getElementById('pickup-time');
    
    dateInput.value = tomorrow.toISOString().split('T')[0];
    timeInput.value = `${String(tomorrow.getHours()).padStart(2, '0')}:00`;
    
    // Set min date to today
    dateInput.min = now.toISOString().split('T')[0];
}

// Load user data
async function loadUserData(userId) {
    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            document.getElementById('user-name').textContent = userData.firstName || 'User';
            // Update welcome message in header
            const welcomeElement = document.getElementById('welcome-message');
            if (welcomeElement) {
                welcomeElement.textContent = `Hi, ${userData.firstName}`;
            }
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

// Load active bookings
async function loadActiveBookings(userId) {
    const bookingsContainer = document.querySelector('.bookings-container');
    const noBookingsMessage = document.getElementById('no-bookings-message');
    
    try {
        // Get current timestamp
        const now = Timestamp.now();
        
        // Find bookings for this user that haven't ended yet
        const activeBookings = [];
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        
        for (const carDoc of carsSnapshot.docs) {
            const bookingsRef = collection(db, 'timesheets', carDoc.id, 'bookings');
            const bookingsQuery = query(
                bookingsRef, 
                where('user_id', '==', userId),
                where('end_time', '>=', now),
                orderBy('end_time')
            );
            
            const bookingsSnapshot = await getDocs(bookingsQuery);
            
            for (const bookingDoc of bookingsSnapshot.docs) {
                const bookingData = bookingDoc.data();
                activeBookings.push({
                    id: bookingDoc.id,
                    carId: carDoc.id,
                    ...bookingData,
                    car: await getCarDetails(carDoc.id)
                });
            }
        }

        // Clear container and show bookings or empty state
        bookingsContainer.innerHTML = '';

        if (activeBookings.length > 0) {
            // Hide no bookings message
            if (noBookingsMessage) {
                noBookingsMessage.style.display = 'none';
            }
            
            // Sort by start time (nearest first)
            activeBookings.sort((a, b) => a.start_time.seconds - b.start_time.seconds);
            
            // Show only up to 3 bookings on dashboard
            const displayBookings = activeBookings.slice(0, 3);
            
            displayBookings.forEach(booking => {
                const bookingElement = createBookingElement(booking);
                bookingsContainer.appendChild(bookingElement);
            });
        } else {
            // Show empty state message
            bookingsContainer.appendChild(noBookingsMessage || createNoBookingsMessage());
        }
    } catch (error) {
        console.error("Error loading active bookings:", error);
        bookingsContainer.innerHTML = `
            <div class="error-message">
                <p>Failed to load bookings. Please try again later.</p>
            </div>
        `;
    }
}

// Create booking card element
function createBookingElement(booking) {
    const startTime = new Date(booking.start_time.seconds * 1000);
    const endTime = new Date(booking.end_time.seconds * 1000);
    const now = new Date();
    
    // Determine booking status
    const isUpcoming = startTime > now;
    const isOngoing = startTime <= now && endTime >= now;
    const status = isUpcoming ? 'upcoming' : (isOngoing ? 'ongoing' : 'completed');
    const statusText = isUpcoming ? 'Upcoming' : (isOngoing ? 'In Progress' : 'Completed');
    
    // Format dates
    const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    const startDate = startTime.toLocaleDateString('en-US', dateOptions);
    const startTimeStr = startTime.toLocaleTimeString('en-US', timeOptions);
    const endDate = endTime.toLocaleDateString('en-US', dateOptions);
    const endTimeStr = endTime.toLocaleTimeString('en-US', timeOptions);
    
    // Calculate duration
    const durationMs = endTime - startTime;
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationDays = Math.floor(durationHours / 24);
    let durationText = '';
    
    if (durationDays > 0) {
        durationText = `${durationDays} day${durationDays > 1 ? 's' : ''}`;
        const remainingHours = durationHours - (durationDays * 24);
        if (remainingHours > 0) {
            durationText += `, ${remainingHours} hr${remainingHours > 1 ? 's' : ''}`;
        }
    } else {
        durationText = `${durationHours} hour${durationHours > 1 ? 's' : ''}`;
    }
    
    // Create booking element
    const bookingDiv = document.createElement('div');
    bookingDiv.className = 'booking-card';
    bookingDiv.innerHTML = `
        <div class="booking-header">
            <h3 class="booking-title">${booking.car?.make || ''} ${booking.car?.model || 'Car'}</h3>
            <span class="booking-status status-${status}">${statusText}</span>
        </div>
        <div class="booking-details">
            <div class="booking-detail">
                <span class="detail-label">Pickup</span>
                <span class="detail-value">${startDate}, ${startTimeStr}</span>
            </div>
            <div class="booking-detail">
                <span class="detail-label">Return</span>
                <span class="detail-value">${endDate}, ${endTimeStr}</span>
            </div>
            <div class="booking-detail">
                <span class="detail-label">Duration</span>
                <span class="detail-value">${durationText}</span>
            </div>
            <div class="booking-detail">
                <span class="detail-label">Location</span>
                <span class="detail-value">${booking.car?.address || 'N/A'}</span>
            </div>
        </div>
        <div class="booking-actions">
            <a href="user-booking-details.html?bookingId=${booking.id}&carId=${booking.carId}" class="booking-action primary-action">
                View Details
            </a>
            ${isUpcoming ? `
                <button class="booking-action secondary-action" onclick="cancelBooking('${booking.id}', '${booking.carId}')">
                    Cancel
                </button>
            ` : (isOngoing ? `
                <a href="user-extend-booking.html?bookingId=${booking.id}&carId=${booking.carId}" class="booking-action secondary-action">
                    Extend
                </a>
            ` : '')}
        </div>
    `;
    return bookingDiv;
}

// Create no bookings message
function createNoBookingsMessage() {
    const div = document.createElement('div');
    div.id = 'no-bookings-message';
    div.className = 'empty-state';
    div.innerHTML = `
        <i class="bi bi-calendar-x"></i>
        <p>You have no active bookings</p>
        <a href="#quick-search" class="primary-btn">Find a car now</a>
    `;
    return div;
}

// Get car details
async function getCarDetails(carId) {
    try {
        const carDoc = await getDoc(doc(db, 'cars', carId));
        if (carDoc.exists()) {
            const carData = carDoc.data();
            
            // Get car model details
            const modelDoc = await getDoc(doc(db, 'models', carData.model_id));
            const modelData = modelDoc.exists() ? modelDoc.data() : {};
            
            return {
                id: carId,
                ...carData,
                make: modelData.make || 'Unknown',
                model: modelData.model || 'Unknown',
                image: modelData.image_url || '../static/images/car-placeholder.jpg'
            };
        }
        return null;
    } catch (error) {
        console.error("Error getting car details:", error);
        return null;
    }
}

// Initialize search functionality
function initializeSearch() {
    // Set up location autocomplete (this will be integrated with map-handler.js)
    const locationInput = document.getElementById('location-input');
    if (locationInput && window.google && window.google.maps) {
        const autocomplete = new google.maps.places.Autocomplete(locationInput);
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place.geometry) {
                // Store the selected location for search
                sessionStorage.setItem('searchLocation', JSON.stringify({
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    address: place.formatted_address
                }));
            }
        });
    }
}

// Search for cars based on the form inputs
function searchCars() {
    const locationInput = document.getElementById('location-input').value;
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupTime = document.getElementById('pickup-time').value;
    const duration = document.getElementById('duration').value;
    
    if (!locationInput || !pickupDate || !pickupTime) {
        alert("Please fill in all fields to search for cars.");
        return;
    }
    
    // Store search parameters in session storage
    const searchParams = {
        location: locationInput,
        pickupDate,
        pickupTime,
        duration
    };
    
    sessionStorage.setItem('carSearchParams', JSON.stringify(searchParams));
    
    // Navigate to search results page
    window.location.href = "user-search-results.html";
}

// Get current location
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            
            // You can use Google Maps Geocoder to get the address from coordinates
            if (window.google && window.google.maps) {
                const geocoder = new google.maps.Geocoder();
                const latlng = { lat: latitude, lng: longitude };
                
                geocoder.geocode({ location: latlng }, (results, status) => {
                    if (status === "OK" && results[0]) {
                        document.getElementById('location-input').value = results[0].formatted_address;
                        
                        // Store the location for search
                        sessionStorage.setItem('searchLocation', JSON.stringify({
                            lat: latitude,
                            lng: longitude,
                            address: results[0].formatted_address
                        }));
                    }
                });
            }
            
            // Center the map on current location
            if (window.centerMapOnLocation) {
                window.centerMapOnLocation(latitude, longitude);
            }
        }, error => {
            console.error("Error getting current location:", error);
            alert("Could not get your current location. Please enter it manually.");
        });
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

// Load nearby cars (this will integrate with map-handler.js)
async function loadNearbyCars() {
    // This function will be implemented in map-handler.js
    // It will fetch nearby cars and display them on the map
    console.log("Loading nearby cars...");
}

// Filter nearby cars based on type
function filterNearbyCars() {
    const carTypeFilter = document.getElementById('car-type-filter').value;
    // This will be handled by map-handler.js
    console.log(`Filtering cars by type: ${carTypeFilter}`);
    
    // Dispatch custom event for map handler
    document.dispatchEvent(new CustomEvent('filterCars', { detail: { carType: carTypeFilter } }));
}

// Expose functions for booking actions
window.cancelBooking = async (bookingId, carId) => {
    if (confirm('Are you sure you want to cancel this booking?')) {
        // Implement cancellation logic
        console.log(`Cancelling booking ${bookingId} for car ${carId}`);
        // After cancellation, reload bookings
        const user = auth.currentUser;
        if (user) {
            await loadActiveBookings(user.uid);
        }
    }
};