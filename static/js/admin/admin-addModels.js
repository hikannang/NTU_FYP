// admin-addModels.js - Part 1
import { db, auth } from "../common/firebase-config.js";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Global variables
let currentUser = null;
let allCarModels = {};
let isEditMode = false;
let currentModelId = null;

// DOM Elements
const loadingOverlay = document.getElementById("loading-overlay");
const formContainer = document.getElementById("form-container");
const errorContainer = document.getElementById("error-container");
const addModelForm = document.getElementById("add-model-form");
const modelList = document.getElementById("model-list");
const modelNameInput = document.getElementById("model-name");
const modelIdInput = document.getElementById("model-id");
const fuelTypeSelect = document.getElementById("fuel-type");
const colorInput = document.getElementById("color");
const seatingCapacityInput = document.getElementById("seating-capacity");
const largeLuggageInput = document.getElementById("large-luggage");
const smallLuggageInput = document.getElementById("small-luggage");
const submitButton = document.getElementById("submit-button");
const cancelButton = document.getElementById("cancel-button");
const modelPreview = document.getElementById("model-preview");
const addColorBtn = document.getElementById("add-color-btn");
const colorsList = document.getElementById("colors-list");
const modelSearch = document.getElementById("model-search");
const formTitleEl = document.getElementById("form-title");
const formSubtitleEl = document.getElementById("form-subtitle");

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log("Add Car Models page loading");
  
  try {
    // Check authentication
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Verify admin status
          const userDoc = await getDoc(doc(db, "users", user.uid));
          
          if (userDoc.exists() && userDoc.data().role === "admin") {
            currentUser = {
              uid: user.uid,
              ...userDoc.data()
            };
            
            console.log("Admin authenticated:", currentUser.email);
            
            // Initialize form and load existing models
            await initializeForm();
            await loadExistingModels();
          } else {
            console.error("User is not an admin");
            showError("You don't have permission to access this page");
            setTimeout(() => {
              window.location.href = "../index.html";
            }, 2000);
          }
        } catch (error) {
          console.error("Authentication error:", error);
          showError("Failed to verify admin permissions");
        }
      } else {
        console.log("User not authenticated, redirecting to login");
        window.location.href = "../index.html";
      }
    });

    // Setup form handlers
    setupEventListeners();
    
  } catch (error) {
    console.error("Initialization error:", error);
    showError(`Error initializing page: ${error.message}`);
  }
});

// Initialize form
function initializeForm() {
  showLoading(true);
  
  try {
    // Reset form to default state
    resetForm();
    
    // Set default values
    seatingCapacityInput.value = "5";
    largeLuggageInput.value = "2";
    smallLuggageInput.value = "3";
    
    showLoading(false);
  } catch (error) {
    console.error("Error initializing form:", error);
    showError(`Failed to initialize form: ${error.message}`);
    showLoading(false);
  }
}

// Load existing car models
async function loadExistingModels() {
  try {
    showLoading(true);
    console.log("Loading existing car models");
    
    // Clear model list
    modelList.innerHTML = '';
    
    // Get car models
    const carModelsSnapshot = await getDocs(collection(db, "car_models"));
    
    if (carModelsSnapshot.empty) {
      modelList.innerHTML = '<div class="empty-state">No car models found. Add one below.</div>';
      showLoading(false);
      return;
    }
    
    // Process and display models
    carModelsSnapshot.forEach(doc => {
      const model = doc.data();
      const modelId = doc.id;
      
      // Store model data for later use
      allCarModels[modelId] = model;
      
      // Create model card
      const modelCard = createModelCard(modelId, model);
      modelList.appendChild(modelCard);
    });
    
    console.log(`Loaded ${Object.keys(allCarModels).length} car models`);
    
    showLoading(false);
  } catch (error) {
    console.error("Error loading car models:", error);
    showError(`Failed to load car models: ${error.message}`);
    showLoading(false);
  }
}

// Create a card for displaying a car model
function createModelCard(modelId, modelData) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.dataset.modelId = modelId;
  
  // Extract model details
  const name = modelData.name || "Unnamed Model";
  const fuelType = modelData.fuel_type || "Not specified";
  const seatingCapacity = modelData.seating_capacity || "-";
  const color = modelData.color || "Not specified";
  const colors = modelData.colors || [];
  
  // Create color chips HTML
  let colorChipsHtml = '';
  if (colors.length > 0) {
    colorChipsHtml = colors.map(c => 
      `<span class="color-chip" style="background-color: ${getColorHex(c)}" title="${c}"></span>`
    ).join('');
  } else if (color) {
    colorChipsHtml = `<span class="color-chip" style="background-color: ${getColorHex(color)}" title="${color}"></span>`;
  }
  
  // Create card HTML
  card.innerHTML = `
    <div class="card-header">
      <h3 class="model-name">${name}</h3>
      <div class="model-id">${modelId}</div>
    </div>
    <div class="card-body">
      <div class="model-details">
        <div class="detail-item">
          <div class="detail-icon"><i class="bi bi-fuel-pump"></i></div>
          <div class="detail-text">
            <span class="detail-label">Fuel Type</span>
            <span class="detail-value">${fuelType}</span>
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-icon"><i class="bi bi-people-fill"></i></div>
          <div class="detail-text">
            <span class="detail-label">Seating</span>
            <span class="detail-value">${seatingCapacity} seats</span>
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-icon"><i class="bi bi-palette"></i></div>
          <div class="detail-text">
            <span class="detail-label">Colors</span>
            <div class="color-chips">${colorChipsHtml}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card-actions">
      <button class="edit-btn" data-model-id="${modelId}">
        <i class="bi bi-pencil"></i> Edit
      </button>
      <button class="delete-btn" data-model-id="${modelId}">
        <i class="bi bi-trash"></i> Delete
      </button>
    </div>
  `;
  
  // Add event listeners
  const editBtn = card.querySelector('.edit-btn');
  const deleteBtn = card.querySelector('.delete-btn');
  
  editBtn.addEventListener('click', () => {
    editModel(modelId);
  });
  
  deleteBtn.addEventListener('click', () => {
    confirmDeleteModel(modelId);
  });
  
  return card;
}

// Get hex color code from color name
function getColorHex(colorName) {
  const colorMap = {
    "white": "#ffffff",
    "black": "#000000",
    "red": "#dc2626",
    "blue": "#2563eb",
    "green": "#16a34a",
    "yellow": "#eab308",
    "orange": "#ea580c",
    "purple": "#9333ea",
    "pink": "#ec4899",
    "silver": "#94a3b8",
    "gray": "#6b7280",
    "brown": "#92400e"
  };
  
  return colorMap[colorName.toLowerCase()] || "#e5e5e5";
}

// Reset form to default state
function resetForm() {
  addModelForm.reset();
  isEditMode = false;
  currentModelId = null;
  
  // Clear colors list
  colorsList.innerHTML = '';
  
  // Reset form title
  formTitleEl.textContent = "Add New Car Model";
  formSubtitleEl.textContent = "Create a new car model specification";
  
  // Reset submit button
  submitButton.innerHTML = '<i class="bi bi-plus-lg"></i> Add Model';
  
  // Reset model ID input
  modelIdInput.removeAttribute("readonly");
  modelIdInput.value = "";
  
  // Show model preview
  updateModelPreview();
}

// Setup event listeners
function setupEventListeners() {
  // Form submission
  if (addModelForm) {
    addModelForm.addEventListener('submit', handleFormSubmit);
  }
  
  // Cancel button
  if (cancelButton) {
    cancelButton.addEventListener('click', (e) => {
      e.preventDefault();
      resetForm();
    });
  }
  
  // Add color button
  if (addColorBtn) {
    addColorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const colorValue = colorInput.value.trim().toLowerCase();
      if (colorValue) {
        addColorChip(colorValue);
        colorInput.value = '';
        updateModelPreview();
      } else {
        showMessage("Please enter a color", "warning");
      }
    });
  }
  
  // Model ID input changes - for preview and validation
  if (modelIdInput) {
    modelIdInput.addEventListener('input', () => {
      validateModelId();
      updateModelPreview();
    });
  }
  
  // Model name input changes
  if (modelNameInput) {
    modelNameInput.addEventListener('input', () => {
      updateModelPreview();
    });
  }
  
  // Fuel type changes
  if (fuelTypeSelect) {
    fuelTypeSelect.addEventListener('change', () => {
      updateModelPreview();
    });
  }
  
  // Seats and luggage input changes
  const numericInputs = [seatingCapacityInput, largeLuggageInput, smallLuggageInput];
  numericInputs.forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        updateModelPreview();
      });
    }
  });
  
  // Model search
  if (modelSearch) {
    modelSearch.addEventListener('input', () => {
      filterModels(modelSearch.value.trim().toLowerCase());
    });
  }
}

// Validate model ID
function validateModelId() {
  if (!modelIdInput) return true;
  
  const modelId = modelIdInput.value.trim();
  
  // Only allow lowercase letters, numbers and underscores, no spaces
  const validPattern = /^[a-z0-9_]+$/;
  
  if (!validPattern.test(modelId) && modelId !== '') {
    modelIdInput.classList.add('invalid');
    return false;
  } else {
    modelIdInput.classList.remove('invalid');
    return true;
  }
}

// Add color chip to colors list
function addColorChip(colorValue) {
  // Check if color already exists
  const existingChips = colorsList.querySelectorAll('.color-chip');
  for (const chip of existingChips) {
    if (chip.dataset.color === colorValue) {
      showMessage("This color is already added", "info");
      return;
    }
  }
  
  const chip = document.createElement('div');
  chip.className = 'color-chip';
  chip.dataset.color = colorValue;
  chip.style.backgroundColor = getColorHex(colorValue);
  
  const colorName = document.createElement('span');
  colorName.className = 'color-name';
  colorName.textContent = colorValue.charAt(0).toUpperCase() + colorValue.slice(1);
  
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-color';
  removeBtn.innerHTML = '&times;';
  removeBtn.addEventListener('click', () => {
    chip.remove();
    updateModelPreview();
  });
  
  chip.appendChild(colorName);
  chip.appendChild(removeBtn);
  colorsList.appendChild(chip);
}

// Filter models based on search query
function filterModels(query) {
  const cards = modelList.querySelectorAll('.model-card');
  
  cards.forEach(card => {
    const modelName = card.querySelector('.model-name').textContent.toLowerCase();
    const modelId = card.dataset.modelId.toLowerCase();
    
    if (modelName.includes(query) || modelId.includes(query)) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
  
  // Check if any models are visible
  const visibleCards = [...cards].filter(card => card.style.display !== 'none');
  
  if (visibleCards.length === 0 && cards.length > 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.textContent = 'No models match your search.';
    
    // Remove any existing no-results element
    const existingNoResults = modelList.querySelector('.no-results');
    if (existingNoResults) {
      existingNoResults.remove();
    }
    
    modelList.appendChild(noResults);
  } else {
    const existingNoResults = modelList.querySelector('.no-results');
    if (existingNoResults) {
      existingNoResults.remove();
    }
  }
}

// Update model preview
function updateModelPreview() {
  if (!modelPreview) return;
  
  const modelName = modelNameInput.value.trim() || 'Model Name';
  const modelId = modelIdInput.value.trim() || 'model_id';
  const fuelType = fuelTypeSelect.value;
  const seatingCapacity = seatingCapacityInput.value || '0';
  const largeLuggage = largeLuggageInput.value || '0';
  const smallLuggage = smallLuggageInput.value || '0';
  
  // Get all colors
  const colorChips = colorsList.querySelectorAll('.color-chip');
  let colorChipsHtml = '';
  
  if (colorChips.length > 0) {
    colorChipsHtml = Array.from(colorChips).map(chip => {
      const color = chip.dataset.color;
      return `<span class="preview-color" style="background-color: ${getColorHex(color)}" title="${color}"></span>`;
    }).join('');
  } else if (colorInput.value.trim()) {
    const color = colorInput.value.trim().toLowerCase();
    colorChipsHtml = `<span class="preview-color" style="background-color: ${getColorHex(color)}" title="${color}"></span>`;
  } else {
    colorChipsHtml = '<span class="preview-color no-color">None</span>';
  }
  
  // Update preview HTML
  modelPreview.innerHTML = `
    <div class="preview-header">
      <h3 class="preview-name">${modelName}</h3>
      <div class="preview-id">${modelId}</div>
    </div>
    <div class="preview-details">
      <div class="preview-item">
        <div class="preview-icon"><i class="bi bi-fuel-pump"></i></div>
        <div>
          <div class="preview-label">Fuel Type</div>
          <div class="preview-value">${fuelType}</div>
        </div>
      </div>
      <div class="preview-item">
        <div class="preview-icon"><i class="bi bi-people-fill"></i></div>
        <div>
          <div class="preview-label">Seating</div>
          <div class="preview-value">${seatingCapacity} seats</div>
        </div>
      </div>
      <div class="preview-item">
        <div class="preview-icon"><i class="bi bi-briefcase-fill"></i></div>
        <div>
          <div class="preview-label">Luggage</div>
          <div class="preview-value">${largeLuggage} large, ${smallLuggage} small</div>
        </div>
      </div>
      <div class="preview-item">
        <div class="preview-icon"><i class="bi bi-palette"></i></div>
        <div>
          <div class="preview-label">Colors</div>
          <div class="preview-colors">${colorChipsHtml}</div>
        </div>
      </div>
    </div>
  `;
}

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();
  
  try {
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    showLoading(true);
    
    // Get form values
    const modelId = modelIdInput.value.trim();
    const modelName = modelNameInput.value.trim();
    const fuelType = fuelTypeSelect.value;
    const seatingCapacity = parseInt(seatingCapacityInput.value) || 0;
    const largeLuggage = parseInt(largeLuggageInput.value) || 0;
    const smallLuggage = parseInt(smallLuggageInput.value) || 0;
    
    // Get colors
    const colorChips = colorsList.querySelectorAll('.color-chip');
    const colors = Array.from(colorChips).map(chip => chip.dataset.color);
    
    // Create model data
    const modelData = {
      name: modelName,
      fuel_type: fuelType,
      seating_capacity: seatingCapacity,
      large_luggage: largeLuggage,
      small_luggage: smallLuggage,
      updated_at: serverTimestamp(),
      updated_by: currentUser?.uid || 'unknown'
    };
    
    // Add colors array if there are multiple colors
    if (colors.length > 0) {
      modelData.colors = colors;
    } else if (colorInput.value.trim()) {
      // Use single color if colors array is empty but color input has value
      modelData.color = colorInput.value.trim().toLowerCase();
    }
    
    if (isEditMode) {
      // Update existing model
      await updateCarModel(currentModelId, modelData);
    } else {
      // Check if model ID already exists
      const modelRef = doc(db, "car_models", modelId);
      const modelSnapshot = await getDoc(modelRef);
      
      if (modelSnapshot.exists()) {
        showMessage("A model with this ID already exists", "error");
        showLoading(false);
        return;
      }
      
      // Add new model
      await setDoc(modelRef, {
        ...modelData,
        created_at: serverTimestamp(),
        created_by: currentUser?.uid || 'unknown'
      });
      
      console.log(`Model added with ID: ${modelId}`);
      showMessage(`Car model "${modelName}" added successfully`, "success");
    }
    
    // Reset form and reload models
    resetForm();
    await loadExistingModels();
    
  } catch (error) {
    console.error("Error submitting form:", error);
    showMessage(error.message, "error");
  } finally {
    showLoading(false);
  }
}

// Validate form before submission
function validateForm() {
  let isValid = true;
  
  // Model ID validation
  if (!modelIdInput.value.trim()) {
    showMessage("Please enter a model ID", "error");
    modelIdInput.focus();
    isValid = false;
  } else if (!validateModelId()) {
    showMessage("Model ID can only contain lowercase letters, numbers and underscores", "error");
    modelIdInput.focus();
    isValid = false;
  }
  
  // Model name validation
  if (!modelNameInput.value.trim()) {
    showMessage("Please enter a model name", "error");
    modelNameInput.focus();
    isValid = false;
  }
  
  // At least one color validation
  const colorChips = colorsList.querySelectorAll('.color-chip');
  if (colorChips.length === 0 && !colorInput.value.trim()) {
    showMessage("Please add at least one color", "error");
    colorInput.focus();
    isValid = false;
  }
  
  return isValid;
}

// Update an existing car model
async function updateCarModel(modelId, modelData) {
  try {
    await setDoc(doc(db, "car_models", modelId), modelData, { merge: true });
    console.log(`Model ${modelId} updated successfully`);
    showMessage(`Car model "${modelData.name}" updated successfully`, "success");
    return true;
  } catch (error) {
    console.error(`Error updating model ${modelId}:`, error);
    showMessage(`Failed to update model: ${error.message}`, "error");
    return false;
  }
}

// Edit existing model
function editModel(modelId) {
  const model = allCarModels[modelId];
  if (!model) {
    showMessage("Model not found", "error");
    return;
  }
  
  // Set edit mode
  isEditMode = true;
  currentModelId = modelId;
  
  // Update form title
  formTitleEl.textContent = "Edit Car Model";
  formSubtitleEl.textContent = `Updating model: ${modelId}`;
  
  // Update submit button
  submitButton.innerHTML = '<i class="bi bi-save"></i> Update Model';
  
  // Fill form fields
  modelIdInput.value = modelId;
  modelIdInput.setAttribute("readonly", "readonly");
  modelNameInput.value = model.name || "";
  fuelTypeSelect.value = model.fuel_type || "petrol";
  seatingCapacityInput.value = model.seating_capacity || "";
  largeLuggageInput.value = model.large_luggage || "";
  smallLuggageInput.value = model.small_luggage || "";
  
  // Clear colors list
  colorsList.innerHTML = '';
  
  // Add color chips
  if (model.colors && Array.isArray(model.colors) && model.colors.length > 0) {
    model.colors.forEach(color => {
      addColorChip(color);
    });
  } else if (model.color) {
    addColorChip(model.color);
  }
  
  // Update preview
  updateModelPreview();
  
  // Scroll to form
  addModelForm.scrollIntoView({ behavior: 'smooth' });
}

// Confirm model deletion
function confirmDeleteModel(modelId) {
  const model = allCarModels[modelId];
  if (!model) {
    showMessage("Model not found", "error");
    return;
  }
  
  // Create confirmation dialog
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  document.body.appendChild(backdrop);
  
  const modal = document.createElement("div");
  modal.className = "confirm-modal";
  modal.innerHTML = `
    <div class="modal-header">
      <h3>Delete Car Model</h3>
    </div>
    <div class="modal-body">
      <p>Are you sure you want to delete the car model "<strong>${model.name}</strong>" (${modelId})?</p>
      <p class="warning">This action cannot be undone. Cars using this model may be affected.</p>
    </div>
    <div class="modal-footer">
      <button id="cancel-delete" class="secondary-btn"><i class="bi bi-x-lg"></i> Cancel</button>
      <button id="confirm-delete" class="danger-btn"><i class="bi bi-trash"></i> Delete Model</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Show modal with animation
  setTimeout(() => {
    backdrop.classList.add('active');
    modal.classList.add('active');
  }, 10);
  
  // Add event listeners
  document.getElementById("cancel-delete").addEventListener('click', () => {
    closeModal();
  });
  
  document.getElementById("confirm-delete").addEventListener('click', async () => {
    try {
      closeModal();
      showLoading(true);
      
      await deleteCarModel(modelId);
      
      // Reload models after deletion
      await loadExistingModels();
    } catch (error) {
      console.error(`Error deleting model ${modelId}:`, error);
      showMessage(`Failed to delete model: ${error.message}`, "error");
    } finally {
      showLoading(false);
    }
  });
  
  // Close modal function
  function closeModal() {
    backdrop.classList.remove('active');
    modal.classList.remove('active');
    
    setTimeout(() => {
      backdrop.remove();
      modal.remove();
    }, 300);
  }
}

// Delete a car model
async function deleteCarModel(modelId) {
  try {
    await setDoc(doc(db, "car_models", modelId), { 
      deleted: true,
      deleted_at: serverTimestamp(),
      deleted_by: currentUser?.uid || 'unknown'
    }, { merge: true });
    
    console.log(`Model ${modelId} marked as deleted`);
    showMessage(`Car model deleted successfully`, "success");
    
    // Remove from local cache
    delete allCarModels[modelId];
    
    return true;
  } catch (error) {
    console.error(`Error deleting model ${modelId}:`, error);
    showMessage(`Failed to delete model: ${error.message}`, "error");
    return false;
  }
}

// Helper functions
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? "flex" : "none";
  }
}

function showError(message) {
  if (errorContainer) {
    errorContainer.textContent = message;
    errorContainer.style.display = "block";
    formContainer.style.display = "none";
  } else {
    alert(message);
  }
  
  showLoading(false);
}

function showMessage(message, type = "info") {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }
  
  // Create toast message
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  // Set toast icon based on type
  let icon = "info-circle";
  if (type === "success") icon = "check-circle";
  if (type === "warning") icon = "exclamation-triangle";
  if (type === "error") icon = "x-circle";
  
  toast.innerHTML = `
    <i class="bi bi-${icon}"></i>
    <span>${message}</span>
  `;
  
  // Add toast to container
  toastContainer.appendChild(toast);
  
  // Show toast with animation
  setTimeout(() => {
    toast.classList.add("show");
    
    // Auto-hide after delay
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 10);
}