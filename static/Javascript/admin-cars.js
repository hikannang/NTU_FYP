import { db } from './firebase-config.js';
import { collection, onSnapshot } from 'firebase/firestore';

const carsTableBody = document.getElementById('cars-table').querySelector('tbody');

onSnapshot(collection(db, 'cars'), (snapshot) => {
  carsTableBody.innerHTML = '';
  snapshot.forEach((doc) => {
    const car = doc.data();
    const row = `
      <tr>
        <td>${car.model_id}</td>
        <td>${car.address}</td>
        <td>${car.status}</td>
        <td>${new Date(car.service_due).toLocaleDateString()}</td>
        <td>${new Date(car.insurance_expiry).toLocaleDateString()}</td>
        <td><button onclick="editCar('${doc.id}')">Edit</button></td>
      </tr>
    `;
    carsTableBody.innerHTML += row;
  });
});