// Import necessary Firebase modules
import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

// Function to populate the cars table
async function populateCarsTable() {
  const carsTableBody = document.getElementById('cars-table').getElementsByTagName('tbody')[0];
  try {
    const carsSnapshot = await getDocs(collection(db, 'cars'));
    carsSnapshot.forEach((doc) => {
      const car = doc.data();
      const row = carsTableBody.insertRow();
      row.insertCell(0).textContent = doc.id; // Car ID
      row.insertCell(1).textContent = car.address;
      row.insertCell(2).textContent = car.license_plate; // Car Plate
      row.insertCell(3).textContent = car.status;
      row.insertCell(4).textContent = car.car_type; // Car Type
      row.insertCell(5).textContent = new Date(car.service_due.seconds * 1000).toLocaleDateString(); // Service Expiry
      row.insertCell(6).textContent = new Date(car.insurance_expiry.seconds * 1000).toLocaleDateString(); // Insurance Expiry
      const actionsCell = row.insertCell(7);
      actionsCell.innerHTML = '<button>Edit</button> <button>Delete</button>';
    });
  } catch (error) {
    console.error('Error fetching cars:', error);
    alert('Failed to load cars. Please try again.');
  }
}

// Function to filter the cars table based on search input
function filterCarsTable() {
  const searchInput = document.getElementById('search-bar').value.toLowerCase();
  const carsTable = document.getElementById('cars-table');
  const rows = carsTable.getElementsByTagName('tbody')[0].getElementsByTagName('tr');

  for (let i = 0; i < rows.length; i++) {
    const carID = rows[i].getElementsByTagName('td')[0].textContent.toLowerCase();
    const address = rows[i].getElementsByTagName('td')[1].textContent.toLowerCase();
    const carPlate = rows[i].getElementsByTagName('td')[2].textContent.toLowerCase();

    if (carID.includes(searchInput) || address.includes(searchInput) || carPlate.includes(searchInput)) {
      rows[i].style.display = '';
    } else {
      rows[i].style.display = 'none';
    }
  }
}

// Populate cars table on page load
populateCarsTable();

// Add event listener to search bar
document.getElementById('search-bar').addEventListener('input', filterCarsTable);