import { db } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { checkAdmin } from './auth.js';

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Load header and footer
    document.getElementById('header').innerHTML = await fetch('headerFooter/admin-header.html').then(response => response.text());
    document.getElementById('footer').innerHTML = await fetch('headerFooter/admin-footer.html').then(response => response.text());

    // Check admin authorization
    try {
        const userData = await checkAdmin();
        document.getElementById('welcome-message').textContent = `Welcome, ${userData.firstName}`;
        await loadBookings();
    } catch (error) {
        alert(error);
        window.location.href = "/index.html";
    }

    // Add event listeners for filters
    document.getElementById('search-bookings').addEventListener('input', filterBookings);
    document.getElementById('date-filter').addEventListener('change', filterBookings);
    document.getElementById('status-filter').addEventListener('change', filterBookings);
});

// Load all bookings
async function loadBookings() {
    const bookingsTableBody = document.getElementById('bookings-table-body');
    bookingsTableBody.innerHTML = '';

    try {
        const allBookings = [];
        const carsSnapshot = await getDocs(collection(db, 'cars'));
        
        for (const carDoc of carsSnapshot.docs) {
            const bookingsSnapshot = await getDocs(collection(db, 'timesheets', carDoc.id, 'bookings'));
            const carDetails = carDoc.data();
            
            for (const bookingDoc of bookingsSnapshot.docs) {
                const bookingData = bookingDoc.data();
                const userData = await getUserDetails(bookingData.user_id);
                
                allBookings.push({
                    id: bookingDoc.id,
                    carId: carDoc.id,
                    carDetails: carDetails,
                    userData: userData,
                    ...bookingData
                });
            }
        }

        // Sort bookings by start time (most recent first)
        allBookings.sort((a, b) => b.start_time.seconds - a.start_time.seconds);

        // Create table rows
        allBookings.forEach(booking => {
            const row = createBookingRow(booking);
            bookingsTableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading bookings:", error);
        alert('Failed to load bookings. Please try again.');
    }
}

// Get user details
async function getUserDetails(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        return userDoc.exists() ? userDoc.data() : null;
    } catch (error) {
        console.error("Error fetching user details:", error);
        return null;
    }
}

// Create table row for booking
function createBookingRow(booking) {
    const row = document.createElement('tr');
    const startTime = new Date(booking.start_time.seconds * 1000);
    const endTime = new Date(booking.end_time.seconds * 1000);
    const status = getBookingStatus(startTime, endTime);
    
    row.innerHTML = `
        <td>${booking.id}</td>
        <td>${booking.carDetails.car_type} - ${booking.carDetails.license_plate}</td>
        <td>${booking.userData ? `${booking.userData.firstName} ${booking.userData.lastName}` : 'N/A'}</td>
        <td>${startTime.toLocaleString()}</td>
        <td>${endTime.toLocaleString()}</td>
        <td>${calculateDuration(startTime, endTime)}</td>
        <td class="status-${status.toLowerCase()}">${status}</td>
        <td>
            ${status === 'Upcoming' ? 
                `<button onclick="cancelBooking('${booking.carId}', '${booking.id}')" class="action-btn cancel-btn">Cancel</button>` : 
                ''
            }
            <button onclick="viewBookingDetails('${booking.carId}', '${booking.id}')" class="action-btn">View Details</button>
        </td>
    `;
    return row;
}

// Calculate booking duration
function calculateDuration(startTime, endTime) {
    const diff = endTime - startTime;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    
    return `${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m`;
}

// Get booking status
function getBookingStatus(startTime, endTime) {
    const now = new Date();
    if (now < startTime) return 'Upcoming';
    if (now > endTime) return 'Completed';
    return 'Ongoing';
}

// Filter bookings
function filterBookings() {
    const searchTerm = document.getElementById('search-bookings').value.toLowerCase();
    const dateFilter = document.getElementById('date-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const rows = document.getElementById('bookings-table-body').getElementsByTagName('tr');

    Array.from(rows).forEach(row => {
        const carDetails = row.cells[1].textContent.toLowerCase();
        const userName = row.cells[2].textContent.toLowerCase();
        const startDate = new Date(row.cells[3].textContent).toLocaleDateString();
        const status = row.cells[6].textContent.toLowerCase();

        const matchesSearch = carDetails.includes(searchTerm) || userName.includes(searchTerm);
        const matchesDate = !dateFilter || startDate === new Date(dateFilter).toLocaleDateString();
        const matchesStatus = statusFilter === 'all' || status === statusFilter.toLowerCase();

        row.style.display = matchesSearch && matchesDate && matchesStatus ? '' : 'none';
    });
}

// Reset filters
window.resetFilters = () => {
    document.getElementById('search-bookings').value = '';
    document.getElementById('date-filter').value = '';
    document.getElementById('status-filter').value = 'all';
    filterBookings();
};

// Cancel booking
window.cancelBooking = async (carId, bookingId) => {
    if (confirm('Are you sure you want to cancel this booking?')) {
        try {
            const bookingRef = doc(db, 'timesheets', carId, 'bookings', bookingId);
            await updateDoc(bookingRef, { status: 'cancelled' });
            alert('Booking cancelled successfully!');
            await loadBookings();
        } catch (error) {
            console.error("Error cancelling booking:", error);
            alert('Failed to cancel booking. Please try again.');
        }
    }
};

// View booking details
window.viewBookingDetails = (carId, bookingId) => {
    // Store IDs in session storage and redirect to details page
    sessionStorage.setItem('viewBookingCarId', carId);
    sessionStorage.setItem('viewBookingId', bookingId);
    window.location.href = 'admin-booking-details.html';
};