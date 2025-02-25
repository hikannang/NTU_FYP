// table.js

/**
 * Populate a table with car details.
 * @param {string} tableId - The ID of the table to populate.
 * @param {Array} carData - An array of car objects containing details like model, location, distance, and price.
 */
export function populateTable(tableId, carData) {
    const tableBody = document.querySelector(`#${tableId} tbody`);
  
    // Clear any existing rows in the table
    tableBody.innerHTML = "";
  
    // Check if there is any data to display
    if (carData.length === 0) {
      const noDataRow = document.createElement("tr");
      const noDataCell = document.createElement("td");
      noDataCell.colSpan = 5; // Number of columns in the table
      noDataCell.textContent = "No cars available for the selected criteria.";
      noDataCell.style.textAlign = "center";
      noDataRow.appendChild(noDataCell);
      tableBody.appendChild(noDataRow);
      return;
    }
  
    // Populate the table with car data
    carData.forEach((car) => {
      const row = document.createElement("tr");
  
      // Car Model
      const modelCell = document.createElement("td");
      modelCell.textContent = car.model;
      row.appendChild(modelCell);
  
      // Location
      const locationCell = document.createElement("td");
      locationCell.textContent = car.address;
      row.appendChild(locationCell);
  
      // Distance
      const distanceCell = document.createElement("td");
      distanceCell.textContent = `${car.distance} km`;
      row.appendChild(distanceCell);
  
      // Price
      const priceCell = document.createElement("td");
      priceCell.textContent = car.price ? `$${car.price}` : "N/A";
      row.appendChild(priceCell);
  
      // Action (Book Now Button)
      const actionCell = document.createElement("td");
      const bookButton = document.createElement("button");
      bookButton.textContent = "Book Now";
      bookButton.classList.add("book-now-button");
      bookButton.addEventListener("click", () => {
        handleBooking(car.id); // Call the booking handler with the car ID
      });
      actionCell.appendChild(bookButton);
      row.appendChild(actionCell);
  
      // Append the row to the table body
      tableBody.appendChild(row);
    });
  }
  
  /**
   * Handle the booking action when the "Book Now" button is clicked.
   * @param {string} carId - The ID of the car to book.
   */
  function handleBooking(carId) {
    alert(`Booking car with ID: ${carId}`);
    // Implement the booking logic here (e.g., redirect to a booking page or open a modal)
  }