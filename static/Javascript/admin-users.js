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
        await loadUsers();
    } catch (error) {
        alert(error);
        window.location.href = "/index.html";
    }

    // Add event listeners
    document.getElementById('search-users').addEventListener('input', filterUsers);
    document.getElementById('role-filter').addEventListener('change', filterUsers);
});

// Load all users
async function loadUsers() {
    const usersTableBody = document.getElementById('users-table-body');
    usersTableBody.innerHTML = '';

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        querySnapshot.forEach((doc) => {
            const user = doc.data();
            const row = createUserRow(doc.id, user);
            usersTableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading users:", error);
        alert('Failed to load users. Please try again.');
    }
}

// Create table row for user
function createUserRow(userId, userData) {
    const row = document.createElement('tr');
    const joinDate = userData.joinDate ? new Date(userData.joinDate.seconds * 1000).toLocaleDateString() : 'N/A';
    const lastLogin = userData.lastLogin ? new Date(userData.lastLogin.seconds * 1000).toLocaleDateString() : 'N/A';
    
    row.innerHTML = `
        <td>${userId}</td>
        <td>${userData.firstName} ${userData.lastName}</td>
        <td>${userData.email}</td>
        <td>${userData.role}</td>
        <td>${joinDate}</td>
        <td>${lastLogin}</td>
        <td>
            ${userData.role === 'user' ? 
                `<button onclick="makeAdmin('${userId}')" class="action-btn">Make Admin</button>` : 
                `<button onclick="removeAdmin('${userId}')" class="action-btn">Remove Admin</button>`
            }
            <button onclick="viewBookings('${userId}')" class="action-btn">View Bookings</button>
        </td>
    `;
    return row;
}

// Filter users based on search and role
function filterUsers() {
    const searchTerm = document.getElementById('search-users').value.toLowerCase();
    const roleFilter = document.getElementById('role-filter').value;
    const rows = document.getElementById('users-table-body').getElementsByTagName('tr');

    Array.from(rows).forEach(row => {
        const name = row.cells[1].textContent.toLowerCase();
        const email = row.cells[2].textContent.toLowerCase();
        const role = row.cells[3].textContent.toLowerCase();

        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
        const matchesRole = roleFilter === 'all' || role === roleFilter;

        row.style.display = matchesSearch && matchesRole ? '' : 'none';
    });
}

// Make user an admin
window.makeAdmin = async (userId) => {
    if (confirm('Are you sure you want to make this user an admin?')) {
        try {
            await updateDoc(doc(db, "users", userId), { role: "admin" });
            alert('User has been made an admin successfully!');
            await loadUsers(); // Reload the table
        } catch (error) {
            console.error("Error updating user role:", error);
            alert('Failed to update user role. Please try again.');
        }
    }
};

// Remove admin privileges
window.removeAdmin = async (userId) => {
    if (confirm('Are you sure you want to remove admin privileges from this user?')) {
        try {
            await updateDoc(doc(db, "users", userId), { role: "user" });
            alert('Admin privileges have been removed successfully!');
            await loadUsers(); // Reload the table
        } catch (error) {
            console.error("Error updating user role:", error);
            alert('Failed to update user role. Please try again.');
        }
    }
};

// View user's bookings
window.viewBookings = async (userId) => {
    // Store userId in session storage and redirect to bookings page
    sessionStorage.setItem('viewBookingsForUser', userId);
    window.location.href = 'admin-bookings.html';
};