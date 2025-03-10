// user-book-confirmation.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc, setDoc, collection, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize global variables
let bookingDetails;
let carData;
let userId;

// DOM Elements
const loadingOverlay = document.getElementById('loading-overlay');
const confirmButton = document.getElementById('confirm-btn');
const modifyButton = document.getElementById('modify-btn');
const termsCheckbox = document.getElementById('terms-checkbox');
const termsError = document.getElementById('terms-error');

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
            
            // Get booking details from session storage
            const storedDetails = sessionStorage.getItem('bookingDetails');
            if (!storedDetails) {
                // No booking details found
                alert('No booking details found. Please start again.');
                window.location.href = 'user-dashboard.html';
                return;
            }
            
            bookingDetails = JSON.parse(storedDetails);
            await loadCarData();
            populateBookingDetails();
            
            // Set up event listeners
            setupEventListeners();
        } else {
            // Redirect to login if not authenticated
            window.location.href = '../index.html';
        }
    });
});

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

// Load car data from Firestore
async function loadCarData() {
    try {
        const carDoc = await getDoc(doc(db, 'cars', bookingDetails.carId));
        
        if (!carDoc.exists()) {
            alert("Car not found. It may have been removed.");
            window.location.href = 'user-dashboard.html';
            return;
        }
        
        carData = carDoc.data();
    } catch (error) {
        console.error('Error loading car data:', error);
        alert('Failed to load car data. Please try again.');
        window.location.href = 'user-dashboard.html';
    }
}

// Populate booking details in the UI
function populateBookingDetails() {
    // Set car image
    const carImage = document.getElementById('car-image');
    const imagePath = `../static/assets/images/${carData.car_type.toLowerCase()}.jpg`;
    carImage.src = imagePath;
    carImage.onerror = () => {
        carImage.src = '../static/assets/images/car-placeholder.jpg';
    };
    
    // Set car details
    document.getElementById('car-model').textContent = carData.car_type;
    document.getElementById('car-type').textContent = carData.car_type;
    document.getElementById('car-seats').textContent = `${carData.seating_capacity} seats`;
    document.getElementById('car-luggage').textContent = `${carData.large_luggage || 0} large, ${carData.small_luggage || 0} small`;
    
    // Set booking details
    document.getElementById('booking-location').textContent = carData.address;
    
    const pickupDate = new Date(`${bookingDetails.pickupDate}T${bookingDetails.pickupTime}`);
    const formattedDate = pickupDate.toLocaleDateString('en-US', { 
        weekday: 'short',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    const formattedTime = pickupDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit'
    });
    
    document.getElementById('booking-date').textContent = formattedDate;
    document.getElementById('booking-time').textContent = formattedTime;
    
    const duration = parseInt(bookingDetails.duration);
    const durationText = duration === 1 ? '1 hour' : `${duration} hours`;
    document.getElementById('booking-duration').textContent = durationText;
    
    // Set price details
    document.getElementById('hourly-rate').textContent = bookingDetails.hourlyRate;
    document.getElementById('duration-hours').textContent = duration;
    document.getElementById('subtotal').textContent = bookingDetails.totalPrice;
    document.getElementById('total-price').textContent = bookingDetails.totalPrice;
}

// Set up event listeners
function setupEventListeners() {
    // Modify booking button
    modifyButton.addEventListener('click', () => {
        history.back();
    });
    
    // Terms checkbox
    termsCheckbox.addEventListener('change', () => {
        if (termsCheckbox.checked) {
            termsError.style.display = 'none';
        }
    });
    
    // Confirm booking button
    confirmButton.addEventListener('click', async () => {
        if (!termsCheckbox.checked) {
            termsError.style.display = 'flex';
            return;
        }
        
        await createBooking();
    });
}

// Create booking in Firestore
async function createBooking() {
    try {
        loadingOverlay.style.display = 'flex';
        
        // Calculate start and end times
        const startTime = new Date(`${bookingDetails.pickupDate}T${bookingDetails.pickupTime}`);
        const duration = parseInt(bookingDetails.duration);
        const endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + duration);
        
        // Create booking object
        const booking = {
            user_id: userId,
            car_id: bookingDetails.carId,
            start_time: Timestamp.fromDate(startTime),
            end_time: Timestamp.fromDate(endTime),
            duration_hours: duration,
            price: parseFloat(bookingDetails.totalPrice),
            status: 'confirmed',
            created_at: Timestamp.now()
        };
        
        // Add to timesheet bookings collection
        const bookingRef = await addDoc(
            collection(db, 'timesheets', bookingDetails.carId, 'bookings'), 
            booking
        );
        
        // Store booking ID and redirect to success page
        sessionStorage.setItem('lastBookingId', bookingRef.id);
        sessionStorage.setItem('lastCarId', bookingDetails.carId);
        
        // Clear booking details from session storage
        sessionStorage.removeItem('bookingDetails');
        
        // Redirect to booking success page
        window.location.href = 'user-booking-success.html';
        
    } catch (error) {
        console.error('Error creating booking:', error);
        loadingOverlay.style.display = 'none';
        alert('Failed to create booking. Please try again.');
    }
}