// user-dashboard.js
import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc, getDocs, collection, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let userId;
let userPosition = null;
let map;
let markers = [];
let nearbyCarsList = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Check if logout was requested
    if (sessionStorage.getItem('performLogout') === 'true') {
        sessionStorage.removeItem('performLogout');
        try {
            await signOut(auth);
            alert("You have been logged out.");
            window.location.href = "../index.html";
            return; // Exit early
        } catch (error) {
            console.error("Error during logout:", error);
            alert("Logout failed: " + error.message);
        }
    }
    
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('../static/headerFooter/user-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('../static/headerFooter/user-footer.html').then(response => response.text());
    
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            await loadUserData(userId);
            setDefaultDateTime();
            initializeSearch();
            loadNearbyCars();
            await loadActiveBookings(userId);
        } else {
            // User is signed out, redirect to login
            window.location.href = "../index.html";
        }
    });

    // Event listeners
    document.getElementById('search-btn').addEventListener('click', searchCars);
    document.getElementById('current-location-btn').addEventListener('click', getCurrentLocation);
    document.getElementById('car-type-filter').addEventListener('change', filterNearbyCars);

    // Add this: Setup logout functionality after header is loaded
    setupLogoutButton();
});

// Add this new function to handle logout
function setupLogoutButton() {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        console.log("Logout button found, attaching event listener");
        logoutButton.addEventListener('click', async (event) => {
            event.preventDefault();
            console.log("Logout button clicked");
            try {
                await signOut(auth);
                console.log("User signed out successfully");
                alert("You have been logged out.");
                window.location.href = "../index.html";
            } catch (error) {
                console.error("Error during logout:", error);
                alert("Logout failed: " + error.message);
            }
        });
    } else {
        console.log("Logout button not found. It might not be in the DOM yet.");
        // Try again after a short delay to ensure the header has loaded
        setTimeout(() => {
            const retryLogoutButton = document.getElementById('logout-button');
            if (retryLogoutButton) {
                console.log("Logout button found after delay");
                retryLogoutButton.addEventListener('click', async (event) => {
                    event.preventDefault();
                    try {
                        await signOut(auth);
                        alert("You have been logged out.");
                        window.location.href = "../index.html";
                    } catch (error) {
                        console.error("Error during logout:", error);
                        alert("Logout failed: " + error.message);
                    }
                });
            }
        }, 500);
    }
}

// Set default date and time (current time rounded to next 15-minute interval)
function setDefaultDateTime() {
    const now = new Date();
    const dateInput = document.getElementById('pickup-date');
    const hoursSelect = document.getElementById('pickup-time-hours');
    const minutesSelect = document.getElementById('pickup-time-minutes');
    
    // Set default date to today
    const today = now.toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.min = today;
    
    // Set default time to next 15-minute interval
    let hours = now.getHours();
    let minutes = now.getMinutes();
    
    // Round up to next 15 minutes
    minutes = Math.ceil(minutes / 15) * 15;
    
    // Handle overflow
    if (minutes >= 60) {
        hours += 1;
        minutes = 0;
    }
    
    // Handle day overflow
    if (hours >= 24) {
        hours = 0;
        // Should also update date but that's handled elsewhere
    }
    
    // Initialize time selectors
    initializeTimeSelectors(hours, minutes);
    
    // Set up date change listener to update time options
    dateInput.addEventListener('change', updateTimeBasedOnDate);
}

// Initialize time selectors with proper options
function initializeTimeSelectors(currentHour, currentMinute) {
    const hoursSelect = document.getElementById('pickup-time-hours');
    const minutesSelect = document.getElementById('pickup-time-minutes');
    const durationDaysSelect = document.getElementById('duration-days');
    const durationHoursSelect = document.getElementById('duration-hours');
    const durationMinutesSelect = document.getElementById('duration-minutes');
    
    // Clear existing options
    hoursSelect.innerHTML = '';
    minutesSelect.innerHTML = '';
    
    // Populate hours (only showing current hour onwards)
    for (let i = currentHour; i < 24; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i.toString().padStart(2, '0');
        hoursSelect.appendChild(option);
    }
    
    // Set selected hour
    hoursSelect.value = currentHour;
    
    // Populate minutes (15-minute intervals)
    const minuteIntervals = [0, 15, 30, 45];
    
    // For the current hour, only show minutes from current time onwards
    if (currentHour === new Date().getHours()) {
        for (const minute of minuteIntervals) {
            if (minute >= currentMinute) {
                const option = document.createElement('option');
                option.value = minute;
                option.textContent = minute.toString().padStart(2, '0');
                minutesSelect.appendChild(option);
            }
        }
    } else {
        // For future hours, show all 15-minute intervals
        for (const minute of minuteIntervals) {
            const option = document.createElement('option');
            option.value = minute;
            option.textContent = minute.toString().padStart(2, '0');
            minutesSelect.appendChild(option);
        }
    }
    
    // Set default minute value (first available option)
    if (minutesSelect.options.length > 0) {
        minutesSelect.selectedIndex = 0;
    }
    
    // Add hour change event listener to update minutes
    hoursSelect.addEventListener('change', () => {
        updateMinutesOptions(minutesSelect, parseInt(hoursSelect.value));
    });
    
    // Populate duration days (0-7 days)
    durationDaysSelect.innerHTML = '';
    for (let i = 0; i <= 7; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        durationDaysSelect.appendChild(option);
    }
    
    // Populate duration hours (0-23 hours)
    durationHoursSelect.innerHTML = '';
    for (let i = 0; i < 24; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        durationHoursSelect.appendChild(option);
    }
    
    // Populate duration minutes (15-minute intervals)
    durationMinutesSelect.innerHTML = '';
    for (const minute of [0, 15, 30, 45]) {
        const option = document.createElement('option');
        option.value = minute;
        option.textContent = minute;
        durationMinutesSelect.appendChild(option);
    }
    
    // Set default duration to 1 hour
    durationDaysSelect.value = "0";
    durationHoursSelect.value = "1";
    durationMinutesSelect.value = "0";
    
    // Set up validation for form
    setupFormValidation();
}

// Update minutes options based on selected hour
function updateMinutesOptions(minutesSelect, selectedHour) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Clear existing options
    minutesSelect.innerHTML = '';
    
    // Determine which minutes to show (15-minute intervals)
    const minuteIntervals = [0, 15, 30, 45];
    
    // If selected hour is current hour, only show future minutes
    if (selectedHour === currentHour) {
        // Calculate next 15-minute interval from current time
        const nextInterval = Math.ceil(currentMinute / 15) * 15;
        
        // Add minutes options that are in the future
        for (const minute of minuteIntervals) {
            if (minute >= nextInterval) {
                const option = document.createElement('option');
                option.value = minute;
                option.textContent = minute.toString().padStart(2, '0');
                minutesSelect.appendChild(option);
            }
        }
    } else {
        // For future hours, show all 15-minute intervals
        for (const minute of minuteIntervals) {
            const option = document.createElement('option');
            option.value = minute;
            option.textContent = minute.toString().padStart(2, '0');
            minutesSelect.appendChild(option);
        }
    }
    
    // Select first available option
    if (minutesSelect.options.length > 0) {
        minutesSelect.selectedIndex = 0;
    }
}

// Update time options based on selected date
function updateTimeBasedOnDate() {
    const dateInput = document.getElementById('pickup-date');
    const hoursSelect = document.getElementById('pickup-time-hours');
    const minutesSelect = document.getElementById('pickup-time-minutes');
    
    if (!dateInput || !hoursSelect || !minutesSelect) return;
    
    const selectedDate = new Date(dateInput.value);
    const now = new Date();
    
    // If selected date is today, limit time options to current time and future
    if (selectedDate.toDateString() === now.toDateString()) {
        // Get current hours and minutes
        let currentHour = now.getHours();
        let currentMinute = now.getMinutes();
        
        // Round up to next 15 minutes
        currentMinute = Math.ceil(currentMinute / 15) * 15;
        
        // Handle overflow
        if (currentMinute >= 60) {
            currentHour += 1;
            currentMinute = 0;
        }
        
        // Update hours options (only showing current hour onwards)
        hoursSelect.innerHTML = '';
        for (let i = currentHour; i < 24; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i.toString().padStart(2, '0');
            hoursSelect.appendChild(option);
        }
        
        // Update minutes based on selected hour
        updateMinutesOptions(minutesSelect, parseInt(hoursSelect.value));
    } else {
        // For future dates, show all hours
        hoursSelect.innerHTML = '';
        for (let i = 0; i < 24; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i.toString().padStart(2, '0');
            hoursSelect.appendChild(option);
        }
        
        // Show all 15-minute intervals for minutes
        minutesSelect.innerHTML = '';
        for (const minute of [0, 15, 30, 45]) {
            const option = document.createElement('option');
            option.value = minute;
            option.textContent = minute.toString().padStart(2, '0');
            minutesSelect.appendChild(option);
        }
    }
    
    // Select first available options
    if (hoursSelect.options.length > 0) {
        hoursSelect.selectedIndex = 0;
    }
    if (minutesSelect.options.length > 0) {
        minutesSelect.selectedIndex = 0;
    }
}

// Load user data
async function loadUserData(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Update welcome message
            const userName = `${userData.firstName || 'User'}`;
            document.getElementById('user-name').textContent = userName;
            
            // Store user location if available
            if (userData.address && userData.address.coordinates) {
                userPosition = {
                    lat: userData.address.coordinates.latitude,
                    lng: userData.address.coordinates.longitude
                };
                
                // If map is already initialized, update its center
                if (map) {
                    map.setCenter(userPosition);
                }
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
        // Show loading state
        bookingsContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Loading your bookings...</p>
            </div>
        `;
        
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
                
                // Skip cancelled bookings
                if (bookingData.status === 'cancelled') continue;
                
                activeBookings.push({
                    id: bookingDoc.id,
                    carId: carDoc.id,
                    ...bookingData,
                    car: await getCarDetails(carDoc.id)
                });
            }
        }
        
        // Clear container
        bookingsContainer.innerHTML = '';
        
        // Show active bookings or no bookings message
        if (activeBookings.length > 0) {
            // Sort by start time (closest first)
            activeBookings.sort((a, b) => a.start_time.seconds - b.start_time.seconds);
            
            // Limit to 3 most recent bookings
            const recentBookings = activeBookings.slice(0, 3);
            
            // Create booking elements
            recentBookings.forEach(booking => {
                const bookingElement = createBookingElement(booking);
                bookingsContainer.appendChild(bookingElement);
            });
        } else {
            bookingsContainer.appendChild(createNoBookingsMessage());
        }
    } catch (error) {
        console.error("Error loading bookings:", error);
        bookingsContainer.innerHTML = '';
        bookingsContainer.appendChild(createNoBookingsMessage());
    }
}

// Create booking card element
function createBookingElement(booking) {
    const bookingElement = document.createElement('div');
    bookingElement.className = 'booking-card';
    
    // Convert timestamps to Date objects
    const startTime = new Date(booking.start_time.seconds * 1000);
    const endTime = new Date(booking.end_time.seconds * 1000);
    
    // Format dates and times
    const dateOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    const formattedDate = startTime.toLocaleDateString('en-US', dateOptions);
    const formattedStartTime = startTime.toLocaleTimeString('en-US', timeOptions);
    const formattedEndTime = endTime.toLocaleTimeString('en-US', timeOptions);
    
    // Calculate status
    const now = new Date();
    let statusText, statusClass;
    
    if (now < startTime) {
        statusText = 'Upcoming';
        statusClass = 'status-upcoming';
    } else {
        statusText = 'Active';
        statusClass = 'status-active';
    }
    
    bookingElement.innerHTML = `
        <div class="booking-status ${statusClass}">
            <span class="status-dot"></span>
            <span class="status-text">${statusText}</span>
        </div>
        <div class="booking-content">
            <div class="car-image">
                <img src="${booking.car?.image || '../static/assets/images/car-placeholder.jpg'}" alt="Car image" onerror="this.src='../static/assets/images/car-placeholder.jpg';">
            </div>
            <div class="booking-details">
                <div class="booking-title">
                    <h3>${booking.car?.make || ''} ${booking.car?.modelName || booking.car?.car_type || 'Car'}</h3>
                </div>
                <div class="booking-meta">
                    <div class="booking-time">
                        <i class="bi bi-calendar3"></i>
                        <span>${formattedDate} • ${formattedStartTime} - ${formattedEndTime}</span>
                    </div>
                    <div class="booking-location">
                        <i class="bi bi-geo-alt"></i>
                        <span>${booking.car?.address || 'Address not available'}</span>
                    </div>
                </div>
                <div class="booking-actions">
                    <a href="user-booking-details.html?id=${booking.id}&carId=${booking.carId}" class="primary-btn sm">
                        View Details
                    </a>
                </div>
            </div>
        </div>
    `;
    
    return bookingElement;
}

// Create no bookings message
function createNoBookingsMessage() {
    const noBookingsElement = document.createElement('div');
    noBookingsElement.className = 'empty-state';
    noBookingsElement.innerHTML = `
        <i class="bi bi-calendar-x"></i>
        <p>You have no active bookings</p>
        <a href="#quick-search" class="primary-btn">Find a car now</a>
    `;
    return noBookingsElement;
}

// Get car details
async function getCarDetails(carId) {
    try {
        const carDoc = await getDoc(doc(db, 'cars', carId));
        if (carDoc.exists()) {
            const carData = carDoc.data();
            
            // Get car model details
            let modelData = {};
            if (carData.model_id) {
                try {
                    const modelDoc = await getDoc(doc(db, 'models', carData.model_id));
                    if (modelDoc.exists()) {
                        modelData = modelDoc.data();
                    }
                } catch (err) {
                    console.error("Error fetching model data:", err);
                }
            }
            
            return {
                id: carId,
                ...carData,
                make: modelData.make || 'Unknown',
                modelName: modelData.model || carData.car_type || 'Unknown',
                image: modelData.image_url || `../static/assets/images/${carData.car_type?.toLowerCase() || 'car'}.jpg`
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
    // Initialize Google Places Autocomplete
    const input = document.getElementById('location-input');
    const autocomplete = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: "sg" },
        fields: ["address_components", "geometry", "name"],
        types: ["geocode"]
    });
    
    // Prevent form submission on Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    });
    
    // Store location when place is selected
    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        
        if (!place.geometry) {
            input.placeholder = "Enter a location";
            return;
        }
        
        // Store the selected position
        userPosition = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
        };
        
        // Center map on the selected location and update nearby cars
        if (map) {
            map.setCenter(userPosition);
            loadNearbyCars();
        }
    });
}

// Setup validation for the search form
function setupFormValidation() {
    const searchBtn = document.getElementById('search-btn');
    const locationInput = document.getElementById('location-input');
    const pickupDate = document.getElementById('pickup-date');
    const pickupHoursSelect = document.getElementById('pickup-time-hours');
    const pickupMinutesSelect = document.getElementById('pickup-time-minutes');
    
    // Function to check if form is valid
    function checkFormValidity() {
        const isValid = locationInput.value.trim() !== '' && 
                      pickupDate.value !== '';
        
        searchBtn.disabled = !isValid;
        return isValid;
    }
    
    // Add event listeners for form validation
    locationInput.addEventListener('input', checkFormValidity);
    pickupDate.addEventListener('change', checkFormValidity);
    pickupHoursSelect.addEventListener('change', checkFormValidity);
    pickupMinutesSelect.addEventListener('change', checkFormValidity);
    
    // Initial validation
    checkFormValidity();
}

// Search for cars based on the form inputs
function searchCars() {
    const locationInput = document.getElementById('location-input').value;
    const pickupDate = document.getElementById('pickup-date').value;
    const pickupHours = document.getElementById('pickup-time-hours').value;
    const pickupMinutes = document.getElementById('pickup-time-minutes').value;
    const durationDays = document.getElementById('duration-days').value;
    const durationHours = document.getElementById('duration-hours').value;
    const durationMinutes = document.getElementById('duration-minutes').value;
    
    if (!locationInput || !pickupDate) {
        alert("Please fill in all required fields to search for cars.");
        return;
    }
    
    // Calculate total duration in minutes
    const totalDuration = 
        (parseInt(durationDays) * 24 * 60) +
        (parseInt(durationHours) * 60) +
        parseInt(durationMinutes);
    
    if (totalDuration <= 0) {
        alert("Please select a valid duration.");
        return;
    }
    
    // Format time for storage
    const formattedTime = `${pickupHours.toString().padStart(2, '0')}:${pickupMinutes.toString().padStart(2, '0')}`;
    
    // Calculate start and end times for booking
    const startDateTime = new Date(`${pickupDate}T${formattedTime}`);
    const endDateTime = new Date(startDateTime.getTime() + totalDuration * 60000);
    
    // Store search parameters in session storage
    const searchParams = {
        location: locationInput,
        pickupDate,
        pickupHours,
        pickupMinutes,
        formattedTime,
        durationDays,
        durationHours,
        durationMinutes,
        totalDurationMinutes: totalDuration,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString()
    };
    
    sessionStorage.setItem('carSearchParams', JSON.stringify(searchParams));
    
    // If we have user position from the map, store that too
    if (userPosition) {
        sessionStorage.setItem('userMapPosition', JSON.stringify(userPosition));
    }
    
    // Navigate to search results page
    window.location.href = "user-search-results.html";
}

// Get current location
function getCurrentLocation() {
    if (navigator.geolocation) {
        const locationInput = document.getElementById('location-input');
        
        locationInput.value = "Getting your location...";
        locationInput.disabled = true;
        
        navigator.geolocation.getCurrentPosition(
            // Success callback
            async (position) => {
                userPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Reverse geocode to get address
                try {
                    const geocoder = new google.maps.Geocoder();
                    const results = await new Promise((resolve, reject) => {
                        geocoder.geocode({ location: userPosition }, (results, status) => {
                            if (status === "OK" && results[0]) {
                                resolve(results);
                            } else {
                                reject(status);
                            }
                        });
                    });
                    
                    locationInput.value = results[0].formatted_address;
                } catch (error) {
                    locationInput.value = `${userPosition.lat.toFixed(4)}, ${userPosition.lng.toFixed(4)}`;
                }
                
                // Update map and nearby cars
                if (map) {
                    map.setCenter(userPosition);
                    loadNearbyCars();
                }
                
                locationInput.disabled = false;
            },
            // Error callback
            (error) => {
                console.error("Geolocation error:", error);
                alert("Unable to get your location. Please enter it manually.");
                locationInput.value = "";
                locationInput.disabled = false;
            },
            // Options
            { maximumAge: 60000, timeout: 10000, enableHighAccuracy: true }
        );
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

// Load nearby cars
async function loadNearbyCars() {
    console.log("Loading nearby cars...");
    const nearbyCarsContainer = document.getElementById('nearby-cars');
    
    try {
        // Show loading state
        nearbyCarsContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Finding cars near you...</p></div>';
        
        // Get all available cars
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        
        if (carsSnapshot.empty) {
            console.log("No cars found in database");
            nearbyCarsContainer.innerHTML = '<div class="empty-state"><i class="bi bi-car-front"></i><p>No cars available at the moment</p></div>';
            return;
        }
        
        console.log(`Found ${carsSnapshot.size} cars in database`);
        
        // Process cars
        nearbyCarsList = [];
        for (const carDoc of carsSnapshot.docs) {
            const carData = carDoc.data();
            console.log(`Processing car ${carDoc.id}:`, carData);
            
            if (carData.status === 'available') {
                // Check if car has location data
                if (carData.current_location) {
                    console.log(`Car ${carDoc.id} has location:`, carData.current_location);
                    
                    // Get model details if available
                    let modelData = {};
                    if (carData.car_type) {  // Using car_type as the model identifier
                        try {
                            // Try both collections
                            let modelDoc = await getDoc(doc(db, 'models', carData.car_type));
                            
                            if (!modelDoc.exists()) {
                                // Try car_models if models doesn't have it
                                modelDoc = await getDoc(doc(db, 'car_models', carData.car_type));
                            }
                            
                            if (modelDoc.exists()) {
                                modelData = modelDoc.data();
                            } else {
                                console.log(`No model data found for ${carData.car_type}`);
                            }
                        } catch (e) {
                            console.error(`Error fetching model data for ${carData.car_type}:`, e);
                        }
                    }
                    
                    // Calculate distance if user position is available
                    let distance = null;
                    if (userPosition) {
                        distance = calculateDistance(
                            userPosition.lat,
                            userPosition.lng,
                            carData.current_location.latitude,
                            carData.current_location.longitude
                        );
                    }
                    
                    // Add to cars list
                    nearbyCarsList.push({
                        id: carDoc.id,
                        ...carData,
                        make: modelData.make || carData.car_type || 'Unknown',
                        modelName: modelData.name || modelData.model || carData.car_type || 'Unknown',
                        image: modelData.image_url || 
                               `../static/assets/images/${(carData.car_type || 'sedan').toLowerCase()}.jpg`,
                        distance: distance,
                        // Add missing price_per_hour if it doesn't exist in your database
                        price_per_hour: carData.price_per_hour || 15 // Default hourly price
                    });
                } else {
                    console.log(`Car ${carDoc.id} is missing location data!`);
                }
            } else {
                console.log(`Car ${carDoc.id} is not available. Status: ${carData.status}`);
            }
        }
        
        // Sort cars by distance if available
        if (nearbyCarsList.some(car => car.distance !== null)) {
            nearbyCarsList.sort((a, b) => {
                // Handle null distances (put them at the end)
                if (a.distance === null) return 1;
                if (b.distance === null) return -1;
                return a.distance - b.distance;
            });
        }
        
        // Clear container
        nearbyCarsContainer.innerHTML = '';
        
        // If no available cars were found
        if (nearbyCarsList.length === 0) {
            nearbyCarsContainer.innerHTML = '<div class="empty-state"><i class="bi bi-car-front"></i><p>No available cars found nearby</p></div>';
        } else {
            // Display cars
            nearbyCarsList.forEach(car => {
                const carElement = createCarElement(car);
                nearbyCarsContainer.appendChild(carElement);
            });
        }
        
        // Initialize map with car locations
        initializeMap(nearbyCarsList);
        
    } catch (error) {
        console.error("Error loading cars:", error);
        nearbyCarsContainer.innerHTML = '<div class="error-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to load cars. Please try again.</p></div>';
    }
}

// Calculate distance between two points (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Create car element
function createCarElement(car) {
    const carEl = document.createElement('div');
    carEl.className = 'car-card';
    carEl.dataset.type = car.car_type ? car.car_type.toLowerCase() : 'unknown';
    
    // Prepare distance display
    let distanceDisplay = '';
    if (car.distance !== null) {
        distanceDisplay = `<span class="car-distance"><i class="bi bi-geo"></i> ${car.distance.toFixed(1)} km</span>`;
    }
    
    // Prepare price display
    const priceDisplay = car.price_per_hour ? `$${car.price_per_hour.toFixed(2)}/hour` : 'Price not available';
    
    // Create HTML content
    carEl.innerHTML = `
        <div class="car-image">
            <img src="${car.image}" alt="${car.modelName}" onerror="this.src='../static/assets/images/car-placeholder.jpg';">
        </div>
        <div class="car-info">
            <div class="car-header">
                <h3>${car.make} ${car.modelName}</h3>
                <div class="car-type-badge">${car.car_type || 'Standard'}</div>
            </div>
            <div class="car-meta">
                ${distanceDisplay}
                <span class="car-price">${priceDisplay}</span>
            </div>
            <p class="car-location">
                    <i class="bi bi-geo-alt"></i> 
                                ${car.address || 'Location not available'}
                            </p>
                            <a href="user-car-details.html?id=${car.id}" class="view-details-btn">
                                View Details <i class="bi bi-arrow-right"></i>
                            </a>
                        </div>
                    `;
                    
                    return carEl;
                }
                
                // Initialize map with car markers
                function initializeMap(cars) {
                    console.log("Initializing map with cars:", cars);
                    
                    // Check if the map element exists and is visible
                    const mapElement = document.getElementById('map');
                    if (!mapElement) {
                        console.error("Map element not found");
                        return;
                    }
                    
                    // Force dimensions if needed
                    if (mapElement.offsetWidth === 0 || mapElement.offsetHeight === 0) {
                        console.log("Map container has zero dimensions. Setting height.");
                        mapElement.style.height = '400px';
                    }
                    
                    // Default center (Singapore)
                    let mapCenter = { lat: 1.3521, lng: 103.8198 };
                    
                    // Try to use user position or first valid car position
                    if (userPosition && typeof userPosition.lat === 'number' && typeof userPosition.lng === 'number') {
                        mapCenter = userPosition;
                    } else if (cars && cars.length > 0) {
                        // Find first car with valid location
                        const carWithLocation = cars.find(car => 
                            car.current_location && 
                            typeof car.current_location.latitude === 'number' && 
                            typeof car.current_location.longitude === 'number'
                        );
                        
                        if (carWithLocation) {
                            mapCenter = {
                                lat: carWithLocation.current_location.latitude,
                                lng: carWithLocation.current_location.longitude
                            };
                        }
                    }
                    
                    // Ensure the map center is valid
                    if (typeof mapCenter.lat !== 'number' || typeof mapCenter.lng !== 'number' ||
                        isNaN(mapCenter.lat) || isNaN(mapCenter.lng)) {
                        console.error("Invalid map center:", mapCenter);
                        mapCenter = { lat: 1.3521, lng: 103.8198 }; // Default to Singapore
                    }
                    
                    // Clear existing markers if any
                    if (markers && markers.length > 0) {
                        console.log("Clearing", markers.length, "existing markers");
                        markers.forEach(marker => marker.setMap(null));
                    }
                    markers = [];
                    
                    // Initialize map if not already
                    if (!map) {
                        console.log("Creating new map instance");
                        try {
                            map = new google.maps.Map(mapElement, {
                                center: mapCenter,
                                zoom: 13,
                                mapTypeControl: false,
                                fullscreenControl: false,
                                streetViewControl: false
                            });
                            console.log("Map created successfully");
                        } catch (error) {
                            console.error("Error creating map:", error);
                            return;
                        }
                    } else {
                        console.log("Reusing existing map instance");
                        map.setCenter(mapCenter);
                    }
                    
                    // Add user location marker if available
                    if (userPosition) {
                        console.log("Adding user marker at:", userPosition);
                        try {
                            const userMarker = new google.maps.Marker({
                                position: userPosition,
                                map: map,
                                title: "Your Location",
                                icon: {
                                    url: '../static/assets/images/user-marker.png',
                                    scaledSize: new google.maps.Size(32, 32)
                                },
                                zIndex: 1000 // Keep user marker on top
                            });
                            markers.push(userMarker);
                        } catch (error) {
                            console.error("Error adding user marker:", error);
                        }
                    }
                    
                    // Add markers for each car
                    const bounds = new google.maps.LatLngBounds();
                    
                    // If user position exists, extend bounds
                    if (userPosition) {
                        bounds.extend(userPosition);
                    }
                    
                    console.log("Adding", cars.length, "car markers");
                    
                    cars.forEach((car, index) => {
                        if (car.current_location) {
                            const position = {
                                lat: car.current_location.latitude,
                                lng: car.current_location.longitude
                            };
                            
                            console.log(`Adding marker for car ${index + 1}:`, position);
                            
                            try {
                                const marker = new google.maps.Marker({
                                    position: position,
                                    map: map,
                                    title: `${car.make} ${car.modelName}`,
                                    icon: {
                                        url: '../static/assets/images/car-marker.png',
                                        scaledSize: new google.maps.Size(32, 32)
                                    }
                                });
                                
                                markers.push(marker);
                                
                                // Info window for the marker
                                const infoWindow = new google.maps.InfoWindow({
                                    content: `
                                        <div class="map-info-window">
                                            <h4>${car.make} ${car.modelName}</h4>
                                            <p>${car.address || 'Location not available'}</p>
                                            <a href="user-car-details.html?id=${car.id}" class="info-window-link">View Details</a>
                                        </div>
                                    `
                                });
                                
                                marker.addListener('click', () => {
                                    infoWindow.open(map, marker);
                                });
                                
                                // Extend bounds to include this marker
                                bounds.extend(position);
                            } catch (error) {
                                console.error(`Error adding marker for car ${index + 1}:`, error);
                            }
                        } else {
                            console.warn(`Car ${index + 1} has no location data`);
                        }
                    });
                    
                    // If we have markers, fit the map to their bounds
                    if (markers.length > 0) {
                        console.log("Fitting map to bounds with", markers.length, "markers");
                        try {
                            map.fitBounds(bounds);
                            
                            // Don't zoom in too much
                            const listener = google.maps.event.addListener(map, 'idle', () => {
                                if (map.getZoom() > 15) {
                                    console.log("Limiting zoom level to 15");
                                    map.setZoom(15);
                                }
                                google.maps.event.removeListener(listener);
                            });
                        } catch (error) {
                            console.error("Error fitting bounds:", error);
                        }
                    } else {
                        console.warn("No markers to fit bounds");
                    }
                }
                
                // Filter nearby cars by type
                function filterNearbyCars() {
                    const filterValue = document.getElementById('car-type-filter').value.toLowerCase();
                    const carCards = document.querySelectorAll('#nearby-cars .car-card');
                    
                    carCards.forEach(card => {
                        const cardType = card.dataset.type;
                        
                        if (filterValue === 'all' || cardType === filterValue) {
                            card.style.display = 'block';
                        } else {
                            card.style.display = 'none';
                        }
                    });
                    
                    // Also filter map markers
                    if (map && markers.length > 0) {
                        // Filter visible cars
                        const visibleCars = filterValue === 'all' 
                            ? nearbyCarsList 
                            : nearbyCarsList.filter(car => car.car_type && car.car_type.toLowerCase() === filterValue);
                        
                        // Clear existing markers
                        markers.forEach(marker => marker.setMap(null));
                        markers = [];
                        
                        // Add user location marker if available
                        if (userPosition) {
                            const userMarker = new google.maps.Marker({
                                position: userPosition,
                                map: map,
                                title: "Your Location",
                                icon: {
                                    url: '../static/assets/images/user-marker.png',
                                    scaledSize: new google.maps.Size(32, 32)
                                },
                                zIndex: 1000
                            });
                            markers.push(userMarker);
                        }
                        
                        // Add markers for filtered cars
                        const bounds = new google.maps.LatLngBounds();
                        if (userPosition) bounds.extend(userPosition);
                        
                        visibleCars.forEach(car => {
                            if (car.current_location) {
                                const position = {
                                    lat: car.current_location.latitude,
                                    lng: car.current_location.longitude
                                };
                                
                                const marker = new google.maps.Marker({
                                    position: position,
                                    map: map,
                                    title: `${car.make} ${car.modelName}`,
                                    icon: {
                                        url: '../static/assets/images/car-marker.png',
                                        scaledSize: new google.maps.Size(32, 32)
                                    }
                                });
                                
                                markers.push(marker);
                                
                                // Info window for the marker
                                const infoWindow = new google.maps.InfoWindow({
                                    content: `
                                        <div class="map-info-window">
                                            <h4>${car.make} ${car.modelName}</h4>
                                            <p>${car.address || 'Location not available'}</p>
                                            <a href="user-car-details.html?id=${car.id}" class="info-window-link">View Details</a>
                                        </div>
                                    `
                                });
                                
                                marker.addListener('click', () => {
                                    infoWindow.open(map, marker);
                                });
                                
                                bounds.extend(position);
                            }
                        });
                        
                        // If we have markers, fit the map to their bounds
                        if (markers.length > 1) { // More than just the user marker
                            map.fitBounds(bounds);
                        }
                    }
                }
                
                // Function to get available booking time slots for a car
                // This is similar to the one in admin-addBookings.js but adapted for the user dashboard
                async function getAvailableTimeSlots(carId, selectedDate) {
                    try {
                        // Convert selected date to Date objects for start and end of day
                        const startOfDay = new Date(selectedDate);
                        startOfDay.setHours(0, 0, 0, 0);
                        
                        const endOfDay = new Date(selectedDate);
                        endOfDay.setHours(23, 59, 59, 999);
                        
                        // Get all bookings for this car on the selected date
                        const bookingsRef = collection(db, 'timesheets', carId, 'bookings');
                        const bookingsQuery = query(
                            bookingsRef,
                            where('start_time', '<=', endOfDay),
                            where('end_time', '>=', startOfDay),
                            where('status', '!=', 'cancelled')
                        );
                        
                        const bookingsSnapshot = await getDocs(bookingsQuery);
                        
                        // Convert bookings to a more manageable format with JS Date objects
                        const bookings = bookingsSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return {
                                id: doc.id,
                                start: new Date(data.start_time.seconds * 1000),
                                end: new Date(data.end_time.seconds * 1000),
                                status: data.status
                            };
                        }).sort((a, b) => a.start - b.start); // Sort by start time
                        
                        // Current time (rounded up to nearest 15 minutes)
                        const now = new Date();
                        const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
                        now.setMinutes(roundedMinutes);
                        now.setSeconds(0);
                        now.setMilliseconds(0);
                        
                        // Calculate available time slots
                        const timeSlots = [];
                        
                        // If there are no bookings, the entire day is available (from now if today)
                        if (bookings.length === 0) {
                            const startTime = startOfDay < now ? new Date(now) : new Date(startOfDay);
                            timeSlots.push({
                                start: startTime,
                                end: new Date(endOfDay)
                            });
                        } else {
                            // Check for slot before first booking
                            const firstBookingStart = new Date(bookings[0].start.getTime() - (15 * 60000)); // 15 mins before first booking
                            if (startOfDay < firstBookingStart) {
                                const slotStart = startOfDay < now ? new Date(now) : new Date(startOfDay);
                                if (slotStart < firstBookingStart) {
                                    timeSlots.push({
                                        start: slotStart,
                                        end: firstBookingStart
                                    });
                                }
                            }
                            
                            // Check for slots between bookings
                            for (let i = 0; i < bookings.length - 1; i++) {
                                const currentBookingEnd = new Date(bookings[i].end.getTime() + (15 * 60000)); // 15 mins after booking ends
                                const nextBookingStart = new Date(bookings[i + 1].start.getTime() - (15 * 60000)); // 15 mins before next booking
                                
                                if (currentBookingEnd < nextBookingStart) {
                                    const slotStart = currentBookingEnd < now ? new Date(now) : currentBookingEnd;
                                    if (slotStart < nextBookingStart) {
                                        timeSlots.push({
                                            start: slotStart,
                                            end: nextBookingStart
                                        });
                                    }
                                }
                            }
                            
                            // Check for slot after last booking
                            const lastBookingEnd = new Date(bookings[bookings.length - 1].end.getTime() + (15 * 60000)); // 15 mins after last booking
                            if (lastBookingEnd < endOfDay) {
                                const slotStart = lastBookingEnd < now ? new Date(now) : lastBookingEnd;
                                timeSlots.push({
                                    start: slotStart,
                                    end: new Date(endOfDay)
                                });
                            }
                        }
                        
                        return timeSlots;
                    } catch (error) {
                        console.error("Error getting available time slots:", error);
                        return [];
                    }
                }