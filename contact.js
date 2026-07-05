
// DOM Elements specific to contact page
const contactForm = document.getElementById('contactForm');

// Initialize Contact Page
function initContactPage() {
    // Load guest data
    loadGuestData();
    
    // Initialize contact form
    initContactForm();
    
    // Initialize map
    initMap();
    
    // Add specific event listeners for contact page
    addContactEventListeners();
}

// Initialize Google Maps with error handling
function initMap() {
    const mapIframe = document.querySelector('.map-section iframe');
    if (mapIframe) {
        // Add error handling for map iframe
        mapIframe.addEventListener('load', function() {
            console.log('Map loaded successfully');
        });
        
        mapIframe.addEventListener('error', function() {
            console.error('Failed to load map');
            showMapFallback();
        });
        
        // Set a timeout to check if map loads properly
        setTimeout(() => {
            if (mapIframe.contentWindow && mapIframe.contentWindow.document) {
                console.log('Map is accessible');
            } else {
                console.warn('Map might be blocked by browser restrictions');
            }
        }, 3000);
    }
}

// Show fallback if map fails to load
function showMapFallback() {
    const mapSection = document.querySelector('.map-section');
    if (mapSection) {
        const fallbackHTML = `
            <div style="
                background: #f8f9fa;
                padding: 40px;
                text-align: center;
                border-radius: 15px;
                border: 2px dashed #dee2e6;
            ">
                <i class="fas fa-map-marker-alt" style="font-size: 48px; color: #6c757d; margin-bottom: 15px;"></i>
                <h3 style="color: #5f2b27; margin-bottom: 10px;">Map Not Available</h3>
                <p style="color: #6c757d; margin-bottom: 20px;">We're located in Thalassery, Kannur, Kerala</p>
                <a href="https://maps.google.com/?q=Thalassery,Kannur,Kerala" 
                   target="_blank" 
                   style="
                       background: #5f2b27;
                       color: white;
                       padding: 10px 20px;
                       border-radius: 25px;
                       text-decoration: none;
                       font-family: 'Unbounded', sans-serif;
                       font-weight: 600;
                   ">
                   Open in Google Maps
                </a>
            </div>
        `;
        mapSection.innerHTML = fallbackHTML;
    }
}

// Initialize contact form functionality
function initContactForm() {
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleContactFormSubmission();
        });
        
        // Add phone number validation (numbers only)
        const phoneInput = document.getElementById('phone');
        if (phoneInput) {
            phoneInput.addEventListener('input', function(e) {
                // Remove any non-digit characters
                this.value = this.value.replace(/[^\d]/g, '');
            });
            
            // Prevent paste of non-numeric characters
            phoneInput.addEventListener('paste', function(e) {
                const pasteData = e.clipboardData.getData('text');
                if (!/^\d+$/.test(pasteData)) {
                    e.preventDefault();
                    alert('Only numbers are allowed in phone field');
                }
            });
        }
    }
}

// Contact Form Submission
function submitContactForm(event) {
    event.preventDefault();
    
    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        subject: document.getElementById('subject').value,
        message: document.getElementById('message').value,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'new'
    };
    
    db.collection('contactSubmissions').add(formData)
        .then((docRef) => {
            alert('Message sent successfully! We will get back to you soon.');
            document.getElementById('contactForm').reset();
        })
        .catch((error) => {
            console.error("Error sending message:", error);
            alert('Error sending message. Please try again.');
        });
}

// Handle contact form submission with better error handling
function handleContactFormSubmission() {
    if (!contactForm) return;
    
    // Get form data
    const formData = new FormData(contactForm);
    const name = formData.get('name');
    const email = formData.get('email');
    const phone = formData.get('phone');
    const subject = formData.get('subject');
    const message = formData.get('message');
    
    // Basic validation
    if (!name || !email || !subject || !message) {
        showFormErrorMessage('Please fill in all required fields');
        return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showFormErrorMessage('Please enter a valid email address');
        return;
    }
    
    // Phone validation (if provided)
    if (phone && !/^\d+$/.test(phone)) {
        showFormErrorMessage('Phone number can only contain numbers');
        return;
    }
    
    // Show loading state
    const submitBtn = contactForm.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    submitBtn.disabled = true;
    
    // Remove any existing success message
    removeExistingSuccessMessage();
    
    // Check Firebase connection first
    if (!db) {
        console.error('Firebase not initialized');
        showFormErrorMessage('Connection error. Please check your internet connection.');
        resetSubmitButton(submitBtn, originalText);
        return;
    }
    
    // Save to Firestore with better error handling
    const submissionData = {
        name: name,
        email: email,
        phone: phone || 'Not provided',
        subject: subject,
        message: message,
        userId: currentUser ? currentUser.uid : 'guest',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        page: 'contact',
        timestamp: new Date().toISOString()
    };
    
    // Try Firestore first, fallback to email if fails
    db.collection('contactSubmissions').add(submissionData)
        .then((docRef) => {
            console.log('Form submitted successfully with ID:', docRef.id);
            
            // Track successful submission
            if (currentUser) {
                db.collection('analytics').add({
                    type: 'contact_form_submission',
                    userId: currentUser.uid,
                    page: 'contact',
                    subject: subject,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(analyticsError => {
                    console.warn('Analytics tracking failed:', analyticsError);
                });
            }
            
            showFormSuccessMessage();
            contactForm.reset();
        })
        .catch((error) => {
            console.error("Error submitting contact form to Firestore:", error);
            
            // Fallback: Try to send via email API or show alternative contact methods
            if (error.code === 'unavailable' || error.code === 'failed-precondition') {
                showFormErrorMessage('Network issue. Please try again or contact us directly at info@hexahoney.in');
            } else {
                showFormErrorMessage('Error submitting form. Please try again or contact us directly.');
            }
            
            // Also save to localStorage as backup
            saveToLocalStorage(submissionData);
        })
        .finally(() => {
            resetSubmitButton(submitBtn, originalText);
        });
}

// Save form data to localStorage as backup
function saveToLocalStorage(formData) {
    try {
        const submissions = JSON.parse(localStorage.getItem('contactFormBackup') || '[]');
        submissions.push({
            ...formData,
            localTimestamp: new Date().toISOString(),
            id: Date.now().toString()
        });
        localStorage.setItem('contactFormBackup', JSON.stringify(submissions));
        console.log('Form data saved to localStorage as backup');
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
    }
}

// Reset submit button to original state
function resetSubmitButton(button, originalText) {
    button.textContent = originalText;
    button.disabled = false;
}

// Remove existing success message
function removeExistingSuccessMessage() {
    const existingMessage = document.querySelector('.form-success-feedback');
    if (existingMessage) {
        existingMessage.remove();
    }
}

// Show success message below the submit button
function showFormSuccessMessage() {
    const submitBtn = contactForm.querySelector('.submit-btn');
    
    // Create success message element
    const successMsg = document.createElement('div');
    successMsg.className = 'form-success-feedback';
    successMsg.innerHTML = `
        <div style="
            background: #d4edda;
            color: #155724;
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid #c3e6cb;
            margin-top: 15px;
            text-align: center;
            font-family: 'Unbounded', sans-serif;
            font-weight: 500;
            font-size: 14px;
            animation: fadeIn 0.5s ease-in;
        ">
            <i class="fas fa-check-circle" style="margin-right: 8px;"></i>
            Thank you for your feedback! We'll get back to you soon.
        </div>
    `;
    
    // Insert after the submit button
    submitBtn.parentNode.insertBefore(successMsg, submitBtn.nextSibling);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (successMsg.parentElement) {
            successMsg.style.animation = 'fadeOut 0.5s ease-out';
            setTimeout(() => {
                if (successMsg.parentElement) {
                    successMsg.remove();
                }
            }, 500);
        }
    }, 5000);
}

// Show error message with custom text
function showFormErrorMessage(message = 'Error submitting form. Please try again.') {
    const submitBtn = contactForm.querySelector('.submit-btn');
    
    // Remove any existing messages
    removeExistingSuccessMessage();
    const existingError = document.querySelector('.form-error-feedback');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message element
    const errorMsg = document.createElement('div');
    errorMsg.className = 'form-error-feedback';
    errorMsg.innerHTML = `
        <div style="
            background: #f8d7da;
            color: #721c24;
            padding: 12px 20px;
            border-radius: 8px;
            border: 1px solid #f5c6cb;
            margin-top: 15px;
            text-align: center;
            font-family: 'Unbounded', sans-serif;
            font-weight: 500;
            font-size: 14px;
        ">
            <i class="fas fa-exclamation-circle" style="margin-right: 8px;"></i>
            ${message}
        </div>
    `;
    
    // Insert after the submit button
    submitBtn.parentNode.insertBefore(errorMsg, submitBtn.nextSibling);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (errorMsg.parentElement) {
            errorMsg.remove();
        }
    }, 5000);
}

// Add CSS animations for the success message
function addSuccessMessageStyles() {
    if (!document.getElementById('success-message-styles')) {
        const style = document.createElement('style');
        style.id = 'success-message-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeOut {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(-10px); }
            }
            .form-success-feedback {
                animation: fadeIn 0.5s ease-in;
            }
            
            /* Map fallback styles */
            .map-fallback {
                background: #f8f9fa;
                padding: 40px;
                text-align: center;
                border-radius: 15px;
                border: 2px dashed #dee2e6;
            }
            
            .map-fallback i {
                font-size: 48px;
                color: #6c757d;
                margin-bottom: 15px;
            }
            
            .map-fallback h3 {
                color: #5f2b27;
                margin-bottom: 10px;
            }
            
            .map-fallback p {
                color: #6c757d;
                margin-bottom: 20px;
            }
            
            .map-fallback a {
                background: #5f2b27;
                color: white;
                padding: 10px 20px;
                border-radius: 25px;
                text-decoration: none;
                font-family: 'Unbounded', sans-serif;
                font-weight: 600;
                display: inline-block;
            }
        `;
        document.head.appendChild(style);
    }
}

// Add contact page specific event listeners
function addContactEventListeners() {
    // Social media links tracking
    document.querySelectorAll('.social-icons a').forEach(link => {
        link.addEventListener('click', function(e) {
            const platform = this.querySelector('i').className.split(' ')[1].split('-')[1];
            trackSocialMediaClick(platform);
        });
    });
    
    // Contact method clicks tracking
    document.querySelectorAll('.contact-item').forEach(item => {
        item.addEventListener('click', function() {
            const method = this.querySelector('h3').textContent.toLowerCase();
            trackContactMethodClick(method);
        });
    });
}

// Track social media clicks for analytics
function trackSocialMediaClick(platform) {
    if (currentUser && db) {
        db.collection('analytics').add({
            type: 'social_media_click',
            platform: platform,
            userId: currentUser.uid,
            page: 'contact',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(error => {
            console.warn('Analytics tracking failed:', error);
        });
    }
}

// Track contact method clicks for analytics
function trackContactMethodClick(method) {
    if (currentUser && db) {
        db.collection('analytics').add({
            type: 'contact_method_click',
            method: method,
            userId: currentUser.uid,
            page: 'contact',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(error => {
            console.warn('Analytics tracking failed:', error);
        });
    }
}

// Enhanced form validation
function validateContactForm() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value.trim();
    
    // Clear previous errors
    clearFormErrors();
    
    let isValid = true;
    
    // Name validation
    if (name.length < 2) {
        showFieldError('name', 'Name must be at least 2 characters long');
        isValid = false;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showFieldError('email', 'Please enter a valid email address');
        isValid = false;
    }
    
    // Phone validation (if provided)
    if (phone && !/^\d+$/.test(phone)) {
        showFieldError('phone', 'Phone number can only contain numbers');
        isValid = false;
    }
    
    // Subject validation
    if (!subject) {
        showFieldError('subject', 'Please select a subject');
        isValid = false;
    }
    
    // Message validation
    if (message.length < 10) {
        showFieldError('message', 'Message must be at least 10 characters long');
        isValid = false;
    }
    
    return isValid;
}

// Show field error
function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const formGroup = field.closest('.form-group');
    
    // Add error class
    field.classList.add('error');
    
    // Create error message
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.style.cssText = `
        color: #e74c3c;
        font-size: 12px;
        margin-top: 5px;
        font-family: Unbounded, sans-serif;
    `;
    errorElement.textContent = message;
    
    formGroup.appendChild(errorElement);
}

// Clear form errors
function clearFormErrors() {
    // Remove error classes
    document.querySelectorAll('.form-group input.error, .form-group select.error, .form-group textarea.error').forEach(field => {
        field.classList.remove('error');
    });
    
    // Remove error messages
    document.querySelectorAll('.field-error').forEach(error => {
        error.remove();
    });
}

// Add real-time form validation
function addRealTimeValidation() {
    const fields = ['name', 'email', 'phone', 'message'];
    
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('blur', function() {
                validateField(fieldId);
            });
        }
    });
    
    // Subject field validation
    const subjectField = document.getElementById('subject');
    if (subjectField) {
        subjectField.addEventListener('change', function() {
            validateField('subject');
        });
    }
}

// Validate individual field
function validateField(fieldId) {
    const field = document.getElementById(fieldId);
    const value = field.value.trim();
    
    // Clear existing error for this field
    const formGroup = field.closest('.form-group');
    const existingError = formGroup.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    field.classList.remove('error');
    
    let isValid = true;
    let errorMessage = '';
    
    switch (fieldId) {
        case 'name':
            if (value.length < 2) {
                isValid = false;
                errorMessage = 'Name must be at least 2 characters long';
            }
            break;
            
        case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            }
            break;
            
        case 'phone':
            if (value && !/^\d+$/.test(value)) {
                isValid = false;
                errorMessage = 'Phone number can only contain numbers';
            }
            break;
            
        case 'subject':
            if (!value) {
                isValid = false;
                errorMessage = 'Please select a subject';
            }
            break;
            
        case 'message':
            if (value.length < 10) {
                isValid = false;
                errorMessage = 'Message must be at least 10 characters long';
            }
            break;
    }
    
    if (!isValid) {
        field.classList.add('error');
        showFieldError(fieldId, errorMessage);
    }
}

// Auto-fill form for logged-in users
function autoFillFormForUser() {
    if (currentUser && contactForm) {
        const nameField = document.getElementById('name');
        const emailField = document.getElementById('email');
        
        if (nameField && currentUser.displayName) {
            nameField.value = currentUser.displayName;
        }
        
        if (emailField && currentUser.email) {
            emailField.value = currentUser.email;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initContactPage();
    addRealTimeValidation();
    addSuccessMessageStyles();
    
    // Auto-fill form when user logs in
    auth.onAuthStateChanged((user) => {
        if (user && contactForm) {
            setTimeout(autoFillFormForUser, 100);
        }
    });
});

// Export functions for global access (if needed)
window.ContactPage = {
    initContactPage,
    handleContactFormSubmission,
    validateContactForm
};

