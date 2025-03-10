// user-booking-success.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, signOut} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize variables
let bookingId;
let carId;
let carData;
let bookingData;

// DOM Elements
const copyBtn = document.getElementById('copy-btn');
const addToCalendarBtn = document.getElementById('add-to-calendar');

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
            // Get booking and car IDs from session storage
            bookingId = sessionStorage.getItem('lastBookingId');
            carId = sessionStorage.getItem('lastCarId');
            
            if (!bookingId || !carId) {
                // If no booking or car ID found, redirect to bookings page
                window.location.href = 'user-bookings.html';
                return;
            }
            
            await loadBookingAndCarData();
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

// Load booking and car data
async function loadBookingAndCarData() {
    try {
        // Load car data
        const carDoc = await getDoc(doc(db, 'cars', carId));
        if (!carDoc.exists()) {
            throw new Error('Car not found');
        }
        carData = carDoc.data();
        
        // Load booking data
        const bookingDoc = await getDoc(doc(db, 'timesheets', carId, 'bookings', bookingId));
        if (!bookingDoc.exists()) {
            throw new Error('Booking not found');
        }
        bookingData = bookingDoc.data();
        
        // Update UI
        updateUI();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Could not load booking details. Redirecting to bookings page.');
        window.location.href = 'user-bookings.html';
    }
}

// Update UI with booking and car data
function updateUI() {
    // Set booking ID
    document.getElementById('booking-id').textContent = bookingId;
    
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
    
    // Set booking details
    document.getElementById('pickup-location').textContent = carData.address;
    
    const startTime = new Date(bookingData.start_time.seconds * 1000);
    const endTime = new Date(bookingData.end_time.seconds * 1000);
    
    const formattedDate = startTime.toLocaleDateString('en-US', { 
        weekday: 'short',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const formattedTime = startTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit'
    });
    
    document.getElementById('pickup-date').textContent = formattedDate;
    document.getElementById('pickup-time').textContent = formattedTime;
    
    const durationHours = bookingData.duration_hours;
    const durationText = durationHours === 1 ? '1 hour' : `${durationHours} hours`;
    document.getElementById('booking-duration').textContent = durationText;
}

// Set up event listeners
function setupEventListeners() {
    // Copy booking reference button
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(bookingId)
            .then(() => {
                copyBtn.innerHTML = '<i class="bi bi-check"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
                }, 2000);
            })
            .catch(err => {
                console.error('Could not copy text: ', err);
                alert('Failed to copy booking reference');
            });
    });
    
    // Add to calendar button
    addToCalendarBtn.addEventListener('click', addToCalendar);
}

// Generate calendar event
function addToCalendar() {
    if (!bookingData) return;
    
    const startTime = new Date(bookingData.start_time.seconds * 1000);
    const endTime = new Date(bookingData.end_time.seconds * 1000);
    
    const start = startTime.toISOString().replace(/-|:|\.\d+/g, '');
    const end = endTime.toISOString().replace(/-|:|\.\d+/g, '');
    
    const title = `CarShare: ${carData.car_type} Booking`;
    const location = carData.address;
    const description = `Booking Reference: ${bookingId}\nCar: ${carData.car_type}\nLicense Plate: ${carData.license_plate}\nDuration: ${bookingData.duration_hours} hours`;
    
    // Generate Google Calendar URL
    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(description)}&location=${encodeURIComponent(location)}&sf=true&output=xml`;
    
    window.open(calendarUrl, '_blank');
}