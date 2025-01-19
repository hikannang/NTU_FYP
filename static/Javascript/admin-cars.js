import { db } from './firebase-config.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js';

const carsTableBody = document.getElementById('cars-table').querySelector('tbody');

onSnapshot(collection(db, 'cars'), (snapshot) => {
  carsTableBody.innerHTML = '';
  snapshot.forEach((doc) => {
    const car = doc.data();
    const serviceDueDate = car.service_due ? new Date(car.service_due.seconds * 1000).toLocaleDateString('en-GB') : 'Not available';
    const insuranceExpiryDate = car.insurance_expiry ? new Date(car.insurance_expiry.seconds * 1000).toLocaleDateString('en-GB') : 'Not available';
    const row = `
      <tr>
        <td>${car.model_id}</td>
        <td>${car.address}</td>
        <td>${car.status}</td>
        <td>${serviceDueDate}</td>
        <td>${insuranceExpiryDate}</td>
        <td><button onclick="editCar('${doc.id}')">Edit</button></td>
      </tr>
    `;
    carsTableBody.innerHTML += row;
  });
});

window.editCar = (carId) => {
  window.location.href = `admin-editCar.html?carId=${carId}`;
};