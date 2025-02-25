import { db, auth } from '../common/firebase-config.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js';

// Get car ID from query parameters
const urlParams = new URLSearchParams(window.location.search);
const carId = urlParams.get('carId');

// Populate form with car data
const populateForm = async () => {
  try {
    const carDoc = await getDoc(doc(db, 'cars', carId));
    if (carDoc.exists()) {
      const car = carDoc.data();
      document.getElementById('car-model').value = car.model_id;
      document.getElementById('car-address').value = car.address;
      document.getElementById('car-latitude').value = car.current_location.latitude;
      document.getElementById('car-longitude').value = car.current_location.longitude;
      document.getElementById('car-status').value = car.status;
      document.getElementById('service-due').value = new Date(car.service_due.seconds * 1000).toISOString().split('T')[0];
      document.getElementById('insurance-expiry').value = new Date(car.insurance_expiry.seconds * 1000).toISOString().split('T')[0];
    } else {
      alert('Car not found');
    }
  } catch (error) {
    console.error('Error fetching car data:', error);
    alert('Failed to fetch car data. Please try again.');
  }
};

// Update car data on form submission
document.getElementById('edit-car-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const modelId = document.getElementById('car-model').value.trim();
  const address = document.getElementById('car-address').value.trim();
  const latitude = parseFloat(document.getElementById('car-latitude').value.trim());
  const longitude = parseFloat(document.getElementById('car-longitude').value.trim());
  const status = document.getElementById('car-status').value;
  const serviceDue = new Date(document.getElementById('service-due').value);
  const insuranceExpiry = new Date(document.getElementById('insurance-expiry').value);

  try {
    await updateDoc(doc(db, 'cars', carId), {
      model_id: modelId,
      address: address,
      current_location: {
        latitude: latitude,
        longitude: longitude,
      },
      status: status,
      service_due: serviceDue,
      insurance_expiry: insuranceExpiry,
    });

    alert('Car updated successfully!');
    window.location.href = 'cars.html';
  } catch (error) {
    console.error('Error updating car:', error);
    alert('Failed to update car. Please try again.');
  }
});

// Populate the form when the page loads
populateForm();