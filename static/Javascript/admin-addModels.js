import { db, storage } from './firebase-config.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-storage.js";

// Form Submission Handler
document.getElementById("add-car-model-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  // Collect form data
  const carModelName = document.getElementById("car-model-name").value.trim();
  const carColor = document.getElementById("car-color").value.trim();
  const fuelType = document.getElementById("fuel-type").value;
  const seatingCapacity = parseInt(document.getElementById("seating-capacity").value, 10);
  const largeLuggage = parseInt(document.getElementById("large-luggage").value, 10);
  const smallLuggage = parseInt(document.getElementById("small-luggage").value, 10);
  const carImageFile = document.getElementById("car-image").files[0];

  // Validate inputs
  if (!carModelName || !carColor || !fuelType || !seatingCapacity || !largeLuggage || !smallLuggage || !carImageFile) {
    alert("Please fill in all fields and upload an image.");
    return;
  }

  try {
    // Upload image to Firebase Storage
    const imageRef = ref(storage, `car_models/${carModelName}_${Date.now()}`);
    const uploadResult = await uploadBytes(imageRef, carImageFile);
    const imageUrl = await getDownloadURL(uploadResult.ref);

    // Add car model data to Firestore
    const carModelData = {
      name: carModelName,
      color: carColor,
      fuel_type: fuelType,
      seating_capacity: seatingCapacity,
      large_luggage: largeLuggage,
      small_luggage: smallLuggage,
      image_url: imageUrl,
    };

    await addDoc(collection(db, "car_models"), carModelData);

    // Success message and form reset
    alert("Car model added successfully!");
    document.getElementById("add-car-model-form").reset();
    document.getElementById("image-upload-status").textContent = "";
  } catch (error) {
    console.error("Error adding car model:", error);
    alert("Failed to add car model. Please try again.");
  }
});