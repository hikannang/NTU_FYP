import { db } from './firebase-config.js';
import { collection, addDoc } from 'firebase/firestore';
import { geocodeAddress } from './location_search/location.js';

document.getElementById('add-car-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const modelId = document.getElementById('car-model').value;
  const address = document.getElementById('car-address').value;
  const latitude = parseFloat(document.getElementById('car-latitude').value);
  const longitude = parseFloat(document.getElementById('car-longitude').value);
  const status = document.getElementById('car-status').value;
  const serviceDue = new Date(document.getElementById('service-due').value);
  const insuranceExpiry = new Date(document.getElementById('insurance-expiry').value);

  let carData = {
    model_id: modelId,
    address: address,
    current_location: {
      latitude: latitude,
      longitude: longitude,
    },
    status: status,
    service_due: serviceDue,
    insurance_expiry: insuranceExpiry,
  };

  try {
    if (isNaN(latitude) || isNaN(longitude)) {
      const location = await geocodeAddress(address);
      carData.current_location = location;
    }

    await addDoc(collection(db, 'cars'), carData);
    alert('Car added successfully!');
    document.getElementById('add-car-form').reset();
  } catch (error) {
    console.error('Error adding car:', error);
    alert('Failed to add car. Please try again.');
  }
});