// user-help.js - Help Center and FAQ handling
import { auth } from "../common/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";

// Initialize page
document.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("Help Center initializing");

    // Load header and footer
    await loadHeaderFooter();
    
    // Setup FAQ accordion
    setupFAQAccordion();
    
    // Setup search functionality
    setupSearch();
    
    // Setup contact form
    setupContactForm();
    
    // Setup feedback buttons
    setupFeedbackButtons();
    
    // Check authentication
    onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("User authenticated:", user.uid);
      } else {
        // Redirect to login if not authenticated
        console.log("User not authenticated, redirecting to login");
        window.location.href = '../index.html';
      }
    });
  } catch (error) {
    console.error("Error initializing help center:", error);
    showError("Failed to initialize page: " + error.message);
  }
});

// Load header and footer
async function loadHeaderFooter() {
  try {
    // Load header
    const headerResponse = await fetch("../static/headerFooter/user-header.html");
    if (!headerResponse.ok) {
      throw new Error(`Failed to load header: ${headerResponse.status}`);
    }
    document.getElementById("header").innerHTML = await headerResponse.text();

    // Load footer
    const footerResponse = await fetch("../static/headerFooter/user-footer.html");
    if (!footerResponse.ok) {
      throw new Error(`Failed to load footer: ${footerResponse.status}`);
    }
    document.getElementById("footer").innerHTML = await footerResponse.text();

    // Setup logout button in header
    setupLogoutButton();
  } catch (error) {
    console.error("Error loading header/footer:", error);
    // Don't fail completely, just log the error
  }
}

// Setup logout button
function setupLogoutButton() {
  const logoutBtn = document.getElementById("logout-button");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await auth.signOut();
        window.location.href = '../index.html';
      } catch (error) {
        console.error("Error during logout:", error);
        showError("Failed to log out. Please try again.");
      }
    });
  }
}

// Setup FAQ accordion functionality
function setupFAQAccordion() {
  const accordionItems = document.querySelectorAll('.faq-item');
  
  accordionItems.forEach(item => {
    const header = item.querySelector('.faq-question');
    const content = item.querySelector('.faq-answer');
    
    header.addEventListener('click', () => {
      // Check if this item is already active
      const isActive = item.classList.contains('active');
      
      // Close all items first
      accordionItems.forEach(accItem => {
        accItem.classList.remove('active');
        accItem.querySelector('.faq-answer').style.maxHeight = null;
      });
      
      // Open the clicked item if it wasn't active
      if (!isActive) {
        item.classList.add('active');
        content.style.maxHeight = content.scrollHeight + 'px';
      }
    });
  });
  
  // Open the first FAQ item by default
  if (accordionItems.length > 0) {
    accordionItems[0].classList.add('active');
    const firstContent = accordionItems[0].querySelector('.faq-answer');
    if (firstContent) {
      firstContent.style.maxHeight = firstContent.scrollHeight + 'px';
    }
  }
}

// Setup search functionality for FAQs
function setupSearch() {
  const searchInput = document.getElementById('help-search');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', function() {
    const searchTerm = this.value.toLowerCase().trim();
    const faqItems = document.querySelectorAll('.faq-item');
    let resultsFound = false;
    
    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question').textContent.toLowerCase();
      const answer = item.querySelector('.faq-answer').textContent.toLowerCase();
      
      if (question.includes(searchTerm) || answer.includes(searchTerm) || searchTerm === '') {
        item.style.display = 'block';
        resultsFound = true;
        
        // Highlight matching text if search term exists
        if (searchTerm !== '') {
          highlightText(item, searchTerm);
        } else {
          // Remove highlights if search is cleared
          removeHighlights(item);
        }
      } else {
        item.style.display = 'none';
      }
    });
    
    // Show/hide no results message
    const noResultsMessage = document.getElementById('no-results-message');
    if (noResultsMessage) {
      noResultsMessage.style.display = resultsFound ? 'none' : 'block';
    }
  });
}

// Highlight matching text in FAQ items
function highlightText(element, searchTerm) {
  // Remove existing highlights first
  removeHighlights(element);
  
  // Highlight text in question
  const question = element.querySelector('.faq-question');
  question.innerHTML = question.textContent.replace(
    new RegExp(searchTerm, 'gi'),
    match => `<span class="highlight">${match}</span>`
  );
  
  // Highlight text in answer
  const answer = element.querySelector('.faq-answer');
  answer.innerHTML = answer.textContent.replace(
    new RegExp(searchTerm, 'gi'),
    match => `<span class="highlight">${match}</span>`
  );
}

// Remove highlights from FAQ items
function removeHighlights(element) {
  const question = element.querySelector('.faq-question');
  const answer = element.querySelector('.faq-answer');
  
  if (question.innerHTML.includes('<span class="highlight">')) {
    question.textContent = question.textContent;
  }
  
  if (answer.innerHTML.includes('<span class="highlight">')) {
    answer.textContent = answer.textContent;
  }
}

// Setup contact form submission
function setupContactForm() {
  const contactForm = document.getElementById('contact-form');
  if (!contactForm) return;
  
  contactForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const subject = document.getElementById('contact-subject').value.trim();
    const message = document.getElementById('contact-message').value.trim();
    
    // Simple validation
    if (!name || !email || !subject || !message) {
      showError('Please fill in all fields.');
      return;
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    
    try {
      showLoading(true);
      
      // In a real app, you would send this to your backend
      // For demo purposes, we'll simulate a successful submission
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Clear form
      contactForm.reset();
      
      // Show success message
      showSuccess('Your message has been sent. We\'ll get back to you soon!');
    } catch (error) {
      console.error('Error submitting contact form:', error);
      showError('Failed to send your message. Please try again later.');
    } finally {
      showLoading(false);
    }
  });
}

// Setup feedback buttons for FAQ items
function setupFeedbackButtons() {
  document.querySelectorAll('.feedback-buttons').forEach(container => {
    const helpfulBtn = container.querySelector('.helpful-btn');
    const notHelpfulBtn = container.querySelector('.not-helpful-btn');
    
    if (helpfulBtn) {
      helpfulBtn.addEventListener('click', function() {
        // In a real app, you would send this feedback to your backend
        this.classList.add('selected');
        if (notHelpfulBtn) notHelpfulBtn.classList.remove('selected');
        container.querySelector('.feedback-thank-you').style.display = 'block';
      });
    }
    
    if (notHelpfulBtn) {
      notHelpfulBtn.addEventListener('click', function() {
        // In a real app, you would send this feedback to your backend
        this.classList.add('selected');
        if (helpfulBtn) helpfulBtn.classList.remove('selected');
        container.querySelector('.feedback-thank-you').style.display = 'block';
        
        // Show additional feedback form
        const faqItem = container.closest('.faq-item');
        if (faqItem) {
          const additionalFeedback = faqItem.querySelector('.additional-feedback');
          if (additionalFeedback) additionalFeedback.style.display = 'block';
        }
      });
    }
  });
  
  // Setup additional feedback form submissions
  document.querySelectorAll('.additional-feedback-form').forEach(form => {
    form.addEventListener('submit', function(event) {
      event.preventDefault();
      
      // In a real app, you would send this feedback to your backend
      const textarea = this.querySelector('textarea');
      if (textarea && textarea.value.trim()) {
        this.innerHTML = '<p class="feedback-thank-you">Thank you for your feedback!</p>';
      } else {
        showError('Please enter your feedback before submitting.');
      }
    });
  });
}

// Show loading overlay
function showLoading(show) {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }
}

// Show error message
function showError(message) {
  const errorToast = document.getElementById('error-toast');
  const errorMessage = document.getElementById('error-message');
  
  if (errorToast && errorMessage) {
    errorMessage.textContent = message;
    errorToast.classList.add('show');
    
    setTimeout(() => {
      errorToast.classList.remove('show');
    }, 5000);
  } else {
    alert(message);
  }
}

// Show success message
function showSuccess(message) {
  const successToast = document.getElementById('success-toast');
  const successMessage = document.getElementById('success-message');
  
  if (successToast && successMessage) {
    successMessage.textContent = message;
    successToast.classList.add('show');
    
    setTimeout(() => {
      successToast.classList.remove('show');
    }, 5000);
  } else {
    alert(message);
  }
}