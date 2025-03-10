// user-booking-details.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc, updateDoc, Timestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize variables
let bookingId;
let carId;
let bookingData;
let carData;
let map;
let marker;
let userId;
let isAREnabled = false;

// DOM Elements
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const contentContainer = document.getElementById('booking-details-content');
const arButton = document.getElementById('ar-find-car-btn');
const cancelButton = document.getElementById('cancel-booking-btn');
const extendButton = document.getElementById('extend-booking-btn');
const directionsButton = document.getElementById('directions-btn');
const cancelModal = document.getElementById('cancel-modal');
const confirmCancelButton = document.getElementById('confirm-cancel-btn');
const closeCancelModalButtons = document.querySelectorAll('.close-cancel-modal');
const timeRemainingElement = document.getElementById('time-remaining');

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
            
            // Get booking and car IDs from URL
            const urlParams = new URLSearchParams(window.location.search);
            bookingId = urlParams.get('id');
            carId = urlParams.get('carId');
            
            if (!bookingId || !carId) {
                showError("Booking information is missing. Please go back to your bookings.");
                return;
            }
            
            await loadBookingAndCarData();
            
            // If data loaded successfully, initialize the page
            if (bookingData && carData) {
                updateUI();
                initMap();
                setupEventListeners();
                startTimeUpdates();
            }
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

// Load booking and car data from Firestore
async function loadBookingAndCarData() {
    try {
        // Show loading state
        loadingIndicator.style.display = 'flex';
        errorMessage.style.display = 'none';
        contentContainer.style.display = 'none';
        
        // Get booking document
        const bookingDoc = await getDoc(doc(db, 'timesheets', carId, 'bookings', bookingId));
        
        if (!bookingDoc.exists()) {
            showError("Booking not found. It may have been deleted.");
            return false;
        }
        
        bookingData = bookingDoc.data();
        
        // Verify that this booking belongs to the current user
        if (bookingData.user_id !== userId) {
            showError("You don't have permission to view this booking.");
            return false;
        }
        
        // Get car document
        const carDoc = await getDoc(doc(db, 'cars', carId));
        
        if (!carDoc.exists()) {
            showError("Car information not found.");
            return false;
        }
        
        carData = carDoc.data();
        carData.id = carId;
        
        return true;
    } catch (error) {
        console.error('Error loading booking data:', error);
        showError("Failed to load booking details. Please try again.");
        return false;
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Update UI with booking and car data
function updateUI() {
    // Convert timestamps to Date objects
    const startTime = new Date(bookingData.start_time.seconds * 1000);
    const endTime = new Date(bookingData.end_time.seconds * 1000);
    
    // Format dates and times
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    const formattedDate = startTime.toLocaleDateString('en-US', dateOptions);
    const formattedStartTime = startTime.toLocaleTimeString('en-US', timeOptions);
    const formattedEndTime = endTime.toLocaleTimeString('en-US', timeOptions);
    
    // Set booking status and class
    const now = new Date();
    let statusText = '';
    let statusClass = '';
    
    if (bookingData.status === 'cancelled') {
        statusText = 'Cancelled';
        statusClass = 'cancelled';
    } else if (now < startTime) {
        statusText = 'Upcoming';
        statusClass = 'upcoming';
    } else if (now >= startTime && now <= endTime) {
        statusText = 'Active';
        statusClass = 'active';
    } else {
        statusText = 'Completed';
        statusClass = 'completed';
    }
    
    // Set booking info
    document.getElementById('booking-id').textContent = bookingId.slice(-6); // Last 6 chars for display
    document.getElementById('booking-status').textContent = statusText;
    document.getElementById('booking-status').className = `status-badge ${statusClass}`;
    
    document.getElementById('booking-date').textContent = formattedDate;
    document.getElementById('booking-time').textContent = `${formattedStartTime} - ${formattedEndTime}`;
    
    // Calculate and set duration
    const durationMs = endTime - startTime;
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationMinutes = Math.floor((durationMs / (1000 * 60)) % 60);
    let durationText = '';
    
    if (durationHours > 0) {
        durationText += `${durationHours} hour${durationHours > 1 ? 's' : ''}`;
    }
    if (durationMinutes > 0) {
        durationText += `${durationHours > 0 ? ' ' : ''}${durationMinutes} minute${durationMinutes > 1 ? 's' : ''}`;
    }
    
    document.getElementById('booking-duration').textContent = durationText;
    
    // Set car info
    document.getElementById('car-model').textContent = carData.car_type || 'Unknown Model';
    document.getElementById('car-license').textContent = carData.license_plate;
    document.getElementById('car-color').textContent = carData.car_color;
    document.getElementById('car-location').textContent = carData.address;
    
    // Set car image
    const carImage = document.getElementById('car-image');
    const imagePath = `../static/assets/images/${carData.car_type.toLowerCase()}.jpg`;
    carImage.src = imagePath;
    carImage.onerror = () => {
        carImage.src = '../static/assets/images/car-placeholder.jpg';
    };
    
    // Calculate and display price
    const price = bookingData.price || 0;
    document.getElementById('booking-price').textContent = `$${price.toFixed(2)}`;
    
    // Set appropriate action buttons based on booking status
    updateActionButtons(now, startTime, endTime);
    
    // Show content
    contentContainer.style.display = 'block';
}

// Update action buttons based on booking status
function updateActionButtons(now, startTime, endTime) {
    // Hide all action buttons by default
    if (cancelButton) cancelButton.style.display = 'none';
    if (extendButton) extendButton.style.display = 'none';
    if (arButton) arButton.style.display = 'none';
    
    // Determine which buttons to show based on booking status
    if (bookingData.status === 'cancelled') {
        // No actions for cancelled bookings
        document.getElementById('booking-actions').style.display = 'none';
        return;
    }
    
    // Show action section
    document.getElementById('booking-actions').style.display = 'flex';
    
    // For upcoming bookings: show cancel button
    if (now < startTime) {
        cancelButton.style.display = 'block';
    }
    
    // For active bookings: show extend button
    if (now >= startTime && now <= endTime) {
        extendButton.style.display = 'block';
    }
    
    // Check if AR should be enabled (within 30 min of start time or during active booking)
    const thirtyMinutesBeforeStart = new Date(startTime);
    thirtyMinutesBeforeStart.setMinutes(thirtyMinutesBeforeStart.getMinutes() - 30);
    
    isAREnabled = (now >= thirtyMinutesBeforeStart && now <= endTime);
    
    // Show/disable AR button
    if (arButton) {
        arButton.style.display = 'block';
        
        if (!isAREnabled) {
            arButton.disabled = true;
            arButton.classList.add('disabled');
            arButton.title = 'AR is only available 30 minutes before and during your booking';
        } else {
            arButton.disabled = false;
            arButton.classList.remove('disabled');
            arButton.title = '';
        }
    }
}

// Initialize Google Map
function initMap() {
    if (!carData.current_location) return;
    
    const carLocation = {
        lat: carData.current_location.latitude,
        lng: carData.current_location.longitude
    };
    
    // Create map
    map = new google.maps.Map(document.getElementById('car-map'), {
        center: carLocation,
        zoom: 15,
        mapTypeControl: false,
        fullscreenControl: true,
        streetViewControl: false
    });
    
    // Add marker for car
    marker = new google.maps.Marker({
        position: carLocation,
        map: map,
        title: carData.car_type,
        icon: {
            url: `../static/assets/images/car-marker.png`,
            scaledSize: new google.maps.Size(32, 32)
        }
    });
    
    // Add info window
    const infoWindow = new google.maps.InfoWindow({
        content: `
            <div style="padding: 5px;">
                <strong>${carData.car_type}</strong><br>
                ${carData.license_plate}<br>
                ${carData.address}
            </div>
        `
    });
    
    marker.addListener('click', () => {
        infoWindow.open(map, marker);
    });
}

// Set up event listeners
function setupEventListeners() {
    // Directions button
    if (directionsButton) {
        directionsButton.addEventListener('click', () => {
            if (carData.current_location) {
                const lat = carData.current_location.latitude;
                const lng = carData.current_location.longitude;
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
            }
        });
    }
    
    // Cancel button
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            cancelModal.style.display = 'flex';
        });
    }
    
    // Close cancel modal buttons
    if (closeCancelModalButtons) {
        closeCancelModalButtons.forEach(button => {
            button.addEventListener('click', () => {
                cancelModal.style.display = 'none';
            });
        });
    }
    
    // Confirm cancel button
    if (confirmCancelButton) {
        confirmCancelButton.addEventListener('click', async () => {
            await cancelBooking();
            cancelModal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === cancelModal) {
            cancelModal.style.display = 'none';
        }
    });
    
    // Extend booking button
    if (extendButton) {
        extendButton.addEventListener('click', () => {
            // Store booking info in session storage for the extension page
            sessionStorage.setItem('extendBookingId', bookingId);
            sessionStorage.setItem('extendCarId', carId);
            window.location.href = 'user-extend-booking.html';
        });
    }
    
    // AR wayfinding button
    if (arButton) {
        arButton.addEventListener('click', () => {
            if (isAREnabled) {
                // Store car location in session storage for AR page
                sessionStorage.setItem('arCarId', carId);
                sessionStorage.setItem('arBookingId', bookingId);
                window.location.href = 'user-ar-wayfinding.html';
            }
        });
    }
}

// Cancel booking
async function cancelBooking() {
    try {
        // Show loading state
        loadingIndicator.style.display = 'flex';
        contentContainer.style.display = 'none';
        
        // Update booking status to cancelled
        await updateDoc(doc(db, 'timesheets', carId, 'bookings', bookingId), {
            status: 'cancelled',
            cancelled_at: Timestamp.now()
        });
        
        // Reload data and update UI
        await loadBookingAndCarData();
        updateUI();
        
        // Show success message
        showSuccessMessage('Booking cancelled successfully');
    } catch (error) {
        console.error('Error cancelling booking:', error);
        showError('Failed to cancel booking. Please try again.');
    } finally {
        loadingIndicator.style.display = 'none';
    }
}

// Start timer for time remaining/until updates
function startTimeUpdates() {
    // Update immediately
    updateTimeDisplay();
    
    // Then update every minute
    setInterval(updateTimeDisplay, 60000);
}

// Update time remaining or time until booking display
function updateTimeDisplay() {
    if (!bookingData) return;
    
    const now = new Date();
    const startTime = new Date(bookingData.start_time.seconds * 1000);
    const endTime = new Date(bookingData.end_time.seconds * 1000);
    
    // Skip for cancelled or completed bookings
    if (bookingData.status === 'cancelled' || now > endTime) {
        if (timeRemainingElement) {
            timeRemainingElement.style.display = 'none';
        }
        return;
    }
    
    let timeText = '';
    let timeClass = '';
    
    if (now < startTime) {
        // Upcoming booking
        const msUntil = startTime - now;
        const minutesUntil = Math.floor(msUntil / 60000);
        const hoursUntil = Math.floor(minutesUntil / 60);
        const daysUntil = Math.floor(hoursUntil / 24);
        
        if (daysUntil > 0) {
            timeText = `Starts in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
        } else if (hoursUntil > 0) {
            const mins = minutesUntil % 60;
            timeText = `Starts in ${hoursUntil}h ${mins}m`;
        } else {
            timeText = `Starts in ${minutesUntil} minute${minutesUntil > 1 ? 's' : ''}`;
        }
        
        timeClass = 'upcoming-time';
        
        // Check if AR should be enabled (within 30 min of start)
        const thirtyMinutesBeforeStart = new Date(startTime);
        thirtyMinutesBeforeStart.setMinutes(thirtyMinutesBeforeStart.getMinutes() - 30);
        
        if (now >= thirtyMinutesBeforeStart && arButton) {
            isAREnabled = true;
            arButton.disabled = false;
            arButton.classList.remove('disabled');
            arButton.title = '';
        }
    } else {
        // Active booking
        const msRemaining = endTime - now;
        const minutesRemaining = Math.floor(msRemaining / 60000);
        const hoursRemaining = Math.floor(minutesRemaining / 60);
        
        if (hoursRemaining > 0) {
            const mins = minutesRemaining % 60;
            timeText = `${hoursRemaining}h ${mins}m remaining`;
        } else {
            timeText = `${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''} remaining`;
        }
        
        timeClass = minutesRemaining < 30 ? 'ending-soon' : 'active-time';
    }
    
    if (timeRemainingElement) {
        timeRemainingElement.textContent = timeText;
        timeRemainingElement.className = `time-badge ${timeClass}`;
        timeRemainingElement.style.display = 'inline-flex';
    }
}

// Show error message and hide other content
function showError(message) {
    loadingIndicator.style.display = 'none';
    contentContainer.style.display = 'none';
    errorMessage.style.display = 'flex';
    errorMessage.querySelector('p').textContent = message;
}

// Show success message toast
function showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Show the toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // Hide and remove the toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 500);
    }, 3000);
}