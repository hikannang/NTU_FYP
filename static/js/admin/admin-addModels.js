import { db, auth } from '../common/firebase-config.js';
import { collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";

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

  // Validate inputs
  if (!carModelName || !carColor || !fuelType || !seatingCapacity || !largeLuggage || !smallLuggage) {
    alert("Please fill in all fields.");
    return;
  }

  try {
    // Add car model data to Firestore with the document ID set to the car model name
    const carModelData = {
      name: carModelName,
      color: carColor,
      fuel_type: fuelType,
      seating_capacity: seatingCapacity,
      large_luggage: largeLuggage,
      small_luggage: smallLuggage,
    };

    console.log("Adding car model data to Firestore...");
    await setDoc(doc(db, "car_models", carModelName), carModelData);
    console.log("Car model added successfully.");

    // Success message and form reset
    alert("Car model added successfully!");
    document.getElementById("add-car-model-form").reset();
  } catch (error) {
    console.error("Error adding car model:", error);
    alert("Failed to add car model. Please try again.");
  }
});