
let isProcessingPayment = false;
let razorpayScriptLoaded = false;


// Initialize checkout page
async function initCheckoutPage() {
    console.log('Initializing checkout page with Razorpay...');
    
    // Initial updates
    updateOrderSummary();
    setupCheckoutEventListeners();
    updateCheckoutUI();
    
    // Preload Razorpay script in background
    preloadRazorpayScript();
    
    // Load promo codes with error handling
    try {
        console.log('Loading promo codes...');
        await loadPromoCodesFromFirebase();
        console.log('Promo codes loaded:', window.activePromoCodes);
        
        // Wait a bit for DOM to be fully ready
        setTimeout(() => {
            displayAvailablePromoCodes();
            
            // Add animation for promo cards
            const promoCards = document.querySelectorAll('.promo-code-card');
            promoCards.forEach((card, index) => {
                card.style.animationDelay = `${index * 0.1}s`;
                card.classList.add('animate-fade-in');
            });
        }, 500);
        
    } catch (error) {
        console.error('Failed to load promo codes:', error);
        showPromoError('Unable to load promo codes. Please try again later.');
    }
    
    // Update UI based on cart state
    if (cartProducts.length === 0) {
        const checkoutBtn = document.querySelector('.checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.style.opacity = '0.7';
        }
    }
    
    // Load user's default address if logged in
    if (currentUser) {
        loadUserDefaultAddress();
    }
}

// Preload Razorpay script
function preloadRazorpayScript() {
    if (razorpayScriptLoaded || window.Razorpay) {
        return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => {
        console.log('Razorpay script preloaded');
        razorpayScriptLoaded = true;
    };
    script.onerror = () => {
        console.error('Failed to preload Razorpay script');
    };
    
    document.head.appendChild(script);
}

// Ensure Razorpay script is loaded
async function ensureRazorpayLoaded() {
    if (window.Razorpay) {
        return true;
    }
    
    if (razorpayScriptLoaded) {
        // Wait a bit more for script to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        return !!window.Razorpay;
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.onload = () => {
            console.log('Razorpay script loaded');
            razorpayScriptLoaded = true;
            resolve(true);
        };
        script.onerror = () => {
            console.error('Failed to load Razorpay script');
            reject(new Error('Failed to load payment gateway'));
        };
        
        document.head.appendChild(script);
    });
}

// Update checkout UI
function updateCheckoutUI() {
    const emailInput = document.getElementById('email');
    const loginBtnCheckout = document.getElementById('loginBtnCheckout');
    
    if (currentUser) {
        if (emailInput) {
            emailInput.value = currentUser.email;
            emailInput.disabled = true;
            emailInput.style.backgroundColor = '#f5f5f5';
            emailInput.style.color = '#666';
            emailInput.style.cursor = 'not-allowed';
        }
        
        if (loginBtnCheckout) {
            loginBtnCheckout.textContent = 'LOGOUT';
            loginBtnCheckout.style.backgroundColor = 'transparent';
            loginBtnCheckout.style.color = '#e74c3c';
            loginBtnCheckout.style.textDecoration = 'none';
            loginBtnCheckout.style.fontFamily = "'Unbounded', sans-serif";
            loginBtnCheckout.style.fontWeight = '600';
            loginBtnCheckout.style.textTransform = 'uppercase';
            loginBtnCheckout.style.border = 'none';
            loginBtnCheckout.style.cursor = 'pointer';
            loginBtnCheckout.style.fontSize = '14px';
            loginBtnCheckout.style.padding = '0';
            loginBtnCheckout.style.margin = '0';
        }
        
    } else {
        // User is not logged in
        if (emailInput) {
            emailInput.value = '';
            emailInput.disabled = false;
            emailInput.style.backgroundColor = '';
            emailInput.style.color = '';
            emailInput.style.cursor = '';
        }
        
        if (loginBtnCheckout) {
            loginBtnCheckout.textContent = 'LOGIN';
            loginBtnCheckout.style.backgroundColor = 'transparent';
            loginBtnCheckout.style.color = '#3498db';
            loginBtnCheckout.style.textDecoration = 'none';
            loginBtnCheckout.style.fontFamily = "'Unbounded', sans-serif";
            loginBtnCheckout.style.fontWeight = '600';
            loginBtnCheckout.style.textTransform = 'uppercase';
            loginBtnCheckout.style.border = 'none';
            loginBtnCheckout.style.cursor = 'pointer';
            loginBtnCheckout.style.fontSize = '14px';
            loginBtnCheckout.style.padding = '0';
            loginBtnCheckout.style.margin = '0';
        }
    }
}

// Load user's default address for auto-fill
function loadUserDefaultAddress() {
    if (!currentUser || !db) return;
    
    console.log('Loading default address for user:', currentUser.uid);
    
    // Unsubscribe from previous listener if exists
    if (window.addressUnsubscribe) {
        window.addressUnsubscribe();
    }
    
    // Set up real-time listener for default address changes
    window.addressUnsubscribe = db.collection('users').doc(currentUser.uid).collection('addresses')
        .where('isDefault', '==', true)
        .onSnapshot((querySnapshot) => {
            if (!querySnapshot.empty && querySnapshot.docs.length > 0) {
                const defaultAddress = querySnapshot.docs[0].data();
                console.log('Default address found (real-time):', defaultAddress);
                
                // Add a small delay to ensure DOM is ready
                setTimeout(() => {
                    fillAddressForm(defaultAddress);
                }, 100);
                
            } else {
                console.log('No default address found for user');
                // Check if user has any addresses (even without default)
                db.collection('users').doc(currentUser.uid).collection('addresses')
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get()
                    .then((addressSnapshot) => {
                        if (!addressSnapshot.empty && addressSnapshot.docs.length > 0) {
                            const recentAddress = addressSnapshot.docs[0].data();
                            console.log('Using most recent address:', recentAddress);
                            
                            setTimeout(() => {
                                fillAddressForm(recentAddress);
                            }, 100);
                        }
                    });
            }
        }, (error) => {
            console.error("Error in address listener:", error);
        });
}

function fillAddressForm(address) {
    console.log('Filling address form with:', address);
    
    if (address.name) {
        const nameParts = address.name.split(' ');
        if (nameParts.length > 1) {
            window.safeSetFormField('firstName', nameParts[0]);
            window.safeSetFormField('lastName', nameParts.slice(1).join(' '));
        } else {
            window.safeSetFormField('firstName', address.name);
        }
    }
    
    window.safeSetFormField('address', address.address);
    window.safeSetFormField('zipCode', address.pincode);
    
    if (address.city) {
        window.safeSetFormField('city', address.city);
    }
    
    if (address.state) {
        window.safeSetFormField('state', address.state);
    }
    
    const phoneField = document.getElementById('phone');
    if (phoneField && address.phone) {
        let phoneNumber = address.phone.toString();
        
        phoneNumber = phoneNumber.replace(/\+91/g, '').replace(/\D/g, '');
        
        if (phoneNumber.length > 10) {
            phoneNumber = phoneNumber.substring(phoneNumber.length - 10);
        }
        
        if (phoneNumber.length === 10 && /^[6-9]\d{9}$/.test(phoneNumber)) {
            phoneField.value = phoneNumber;
            console.log('Phone number autofilled:', phoneNumber);
        } else {
            console.log('Invalid phone number format:', address.phone);
            phoneField.value = '';
        }
    }
}

// Modified updateTotals to validate applied promo code
function updateTotals() {
    const subtotalElement = document.getElementById('subtotal');
    const shippingElement = document.getElementById('shipping');
    const totalElement = document.getElementById('total');
    const discountRow = document.getElementById('discountRow');
    const discountAmount = document.getElementById('discountAmount');
    
    if (!subtotalElement || !shippingElement || !totalElement || !discountRow || !discountAmount) return;
    
    // Calculate subtotal (without shipping)
    const subtotal = window.originalTotal - (window.appliedPromoType === 'shipping' ? 0 : window.shippingCost);
    
    // Validate applied promo code before calculating total
    validateAppliedPromoCode();
    
    const newTotal = Math.max(0, window.originalTotal - window.currentDiscount);
    
    // Update display - show original subtotal
    subtotalElement.textContent = `₹${subtotal.toFixed(2)}`;
    
    // Update shipping display based on promo type
    if (window.appliedPromoType === 'shipping') {
        shippingElement.textContent = 'FREE';
        shippingElement.style.color = '#27ae60'; // Green for free shipping
    } else if (window.shippingCost > 0) {
        shippingElement.textContent = `₹${window.shippingCost.toFixed(2)}`;
        shippingElement.style.color = '#e74c3c'; // Red color for shipping cost
    } else {
        shippingElement.textContent = 'FREE';
        shippingElement.style.color = '#27ae60'; // Green for free shipping
    }
    
    // Show discount if applied (but not for shipping type)
    if (window.currentDiscount > 0 && window.appliedPromoCode && window.appliedPromoType !== 'shipping') {
        discountRow.style.display = 'flex';
        discountAmount.textContent = `-₹${window.currentDiscount.toFixed(2)}`;
        discountAmount.style.color = '#27ae60';
    } else {
        discountRow.style.display = 'none';
    }
    
    // Show TOTAL amount
    totalElement.textContent = `₹${newTotal.toFixed(2)}`;
    
    // Also request the total amount to user (add a visual emphasis)
    emphasizeTotalAmount(newTotal);
    
    refreshPromoCodes();
}

// Add this new function to emphasize total amount
function emphasizeTotalAmount(total) {
    const totalElement = document.getElementById('total');
    if (totalElement) {
        totalElement.style.fontSize = '24px';
        totalElement.style.fontWeight = '800';
        totalElement.style.color = '#5f2b27';
        
        // Add a small animation
        totalElement.classList.add('animate-total');
    }
}

// PROMO CODE FUNCTIONALITY

// Get active promo codes
function getActivePromoCodes() {
    return window.activePromoCodes || {};
}

// Load promo codes from Firebase
function loadPromoCodesFromFirebase() {
    return new Promise((resolve) => {
        const now = new Date();
        
        db.collection('promoCodes')
            .where('active', '==', true)
            .get()
            .then((querySnapshot) => {
                const promoCodes = {};
                
                if (querySnapshot.empty) {
                    console.log('No promo codes found');
                    window.activePromoCodes = {};
                    resolve({});
                    return;
                }
                
                querySnapshot.forEach((doc) => {
                    const promoData = doc.data() || {};
                    const promoId = doc.id;
                    
                    // Check if promo code is active and not expired
                    const isActive = promoData.active === true;
                    const notExpired = !promoData.validUntil || new Date(promoData.validUntil) >= now;
                    
                    if (isActive && notExpired) {
                        // Store ALL active promo codes regardless of showOnCheckout setting
                        promoCodes[promoId] = {
                            code: promoId,
                            id: promoId,
                            type: promoData.type || 'fixed',
                            value: Number(promoData.value) || 0,
                            description: promoData.description || '',
                            minOrder: Number(promoData.minOrder) || 0,
                            maxDiscount: promoData.maxDiscount || null,
                            validUntil: promoData.validUntil || null,
                            usageLimit: promoData.usageLimit || 0,
                            usedCount: Number(promoData.usedCount) || 0,
                            isPopular: promoData.isPopular || false,
                            terms: promoData.terms || '',
                            active: true,
                            showOnCheckout: promoData.showOnCheckout !== false // Store this setting
                        };
                        
                        console.log('Loaded promo code:', promoId, promoCodes[promoId]);
                    }
                });
                
                window.activePromoCodes = promoCodes;
                console.log('All promo codes loaded:', window.activePromoCodes);
                resolve(promoCodes);
            })
            .catch((error) => {
                console.error('Error loading promo codes:', error);
                window.activePromoCodes = {};
                resolve({});
            });
    });
}

// Apply promo code when user types and clicks Apply
function applyPromoCode() {
    const promoInput = document.getElementById('promoCodeInput');
    
    if (!promoInput) return;
    
    const promoCode = promoInput.value.trim().toUpperCase();
    if (!promoCode) {
        showPromoError('Please enter a promo code');
        return;
    }
    
    hideAllPromoMessages();
    
    // Check if code exists in active promos
    const matchingCode = Object.keys(window.activePromoCodes).find(
        (code) => code === promoCode
    );
    
    // If code doesn't exist
    if (!matchingCode) {
        showPromoError('Invalid promo code');
        promoInput.value = '';
        refreshPromoCodes();
        return;
    }
    
    const promoDetails = window.activePromoCodes[matchingCode];
    
    // If same code already applied
    if (window.appliedPromoCode === promoCode) {
        showPromoError('This promo code is already applied');
        promoInput.value = '';
        return;
    }
    
    // Validate all criteria
    if (!validatePromoCode(promoDetails, promoCode)) {
        promoInput.value = '';
        refreshPromoCodes();
        return;
    }
    
    // If there's already a different code applied, remove it first
    if (window.appliedPromoCode && window.appliedPromoCode !== promoCode) {
        window.currentDiscount = 0;
        window.appliedPromoCode = null;
    }
    
    // Calculate and apply discount
    applyPromoDiscount(promoDetails, promoCode);
    
    // Show success message with REMOVE button
    showPromoSuccessWithRemove(promoDetails, promoCode);
    
    // Clear input
    promoInput.value = '';
}

// Show success message with remove button
function showPromoSuccessWithRemove(promoDetails, promoCode) {
    const promoMessage = document.getElementById('promoMessage');
    if (!promoMessage) return;
    
    let message = `✓ Promo code "${promoCode}" applied!`;
    
    if (promoDetails.type === 'shipping') {
        message = `✓ Free shipping applied with code "${promoCode}"!`;
    } else if (window.currentDiscount > 0) {
        message = `✓ ₹${window.currentDiscount.toFixed(2)} discount applied with "${promoCode}"!`;
    }
    
    promoMessage.className = 'promo-message success';
    promoMessage.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;">
            <span><i class="fas fa-check-circle"></i> ${message}</span>
            <button onclick="removePromoCode()" 
                    style="background:#155724; color:white; border:none; 
                           padding:4px 12px; border-radius:16px; cursor:pointer;
                           font-size:12px; font-weight:600; margin-left:10px;">
                <i class="fas fa-times"></i> REMOVE
            </button>
        </div>
    `;
    promoMessage.style.display = 'block';
    
    // Don't auto-hide - let user remove manually or keep visible
}


// Calculate and apply discount based on promo type
function applyPromoDiscount(promoDetails, promoCode) {
    let discountValue = 0;
    const promoType = promoDetails.type;
    const total = window.originalTotal - window.shippingCost; // Subtotal without shipping
    
    if (promoType === 'percentage') {
        discountValue = Math.round(total * (promoDetails.value / 100));
        if (typeof promoDetails.maxDiscount === 'number' && promoDetails.maxDiscount > 0 && 
            discountValue > promoDetails.maxDiscount) {
            discountValue = promoDetails.maxDiscount;
        }
    } else if (promoType === 'fixed') {
        discountValue = Math.min(promoDetails.value, total);
    } else if (promoType === 'shipping') {
        discountValue = 0; // No discount on subtotal
        window.shippingCost = 0; // Set shipping to FREE
        window.originalTotal = total; // Recalculate total without shipping
    }
    
    // Apply the discount
    window.currentDiscount = discountValue;
    window.appliedPromoCode = promoCode;
    window.appliedPromoType = promoType;
    
    // Update totals
    updateTotals();
    
    // Update usage count in Firebase (don't wait for it)
    if (typeof db !== 'undefined') {
        db.collection('promoCodes').doc(promoCode).update({
            usedCount: firebase.firestore.FieldValue.increment(1)
        }).catch(err => console.error('Failed to update usage count:', err));
    }
}

// Modified validatePromoCode to handle silent validation
function validatePromoCode(promoDetails, promoCode, isSilent = false) {
    // Check active status
    if (!promoDetails.active) {
        if (!isSilent) showPromoError('This promo code is no longer active');
        return false;
    }
    
    // Check expiry
    if (promoDetails.validUntil) {
        const expiryDate = new Date(promoDetails.validUntil);
        const today = new Date();
        expiryDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        
        if (expiryDate < today) {
            if (!isSilent) showPromoError('This promo code has expired');
            return false;
        }
    }
    
    // For shipping promo, we don't check min order on subtotal
    if (promoDetails.type !== 'shipping') {
        // Check minimum order
        const minOrder = Number(promoDetails.minOrder) || 0;
        if (window.originalTotal < minOrder) {
            if (!isSilent) showPromoError(`Minimum order of ₹${minOrder.toFixed(2)} required`);
            return false;
        }
    }
    
    // Check usage limit
    if (typeof promoDetails.usageLimit === 'number' && promoDetails.usageLimit > 0) {
        const used = Number(promoDetails.usedCount) || 0;
        const limit = promoDetails.usageLimit;
        
        if (used >= limit) {
            if (!isSilent) showPromoError('Promo usage limit reached');
            return false;
        }
    }
    
    return true;
}

// Refresh promo cards when totals/cart change
function refreshPromoCodes() {
    if (document.getElementById('promoCodesGrid')) {
        displayAvailablePromoCodes();
    }
}

// Enhanced displayAvailablePromoCodes function
function displayAvailablePromoCodes() {
    const promoCodesGrid = document.getElementById('promoCodesGrid');
    const noPromoCodes = document.getElementById('noPromoCodes');
    const availablePromoCodes = document.getElementById('availablePromoCodes');
    
    if (!promoCodesGrid || !noPromoCodes) return;
    
    // Filter to ONLY show codes with showOnCheckout = true
    const availableCodes = Object.entries(window.activePromoCodes).filter(
        ([code, details]) => details.showOnCheckout === true
    );
    
    console.log('Displaying promo codes (visible only):', availableCodes);
    console.log('Hidden active codes (can be typed manually):', Object.entries(window.activePromoCodes).filter(
        ([code, details]) => details.showOnCheckout === false
    ));
    
    if (availableCodes.length === 0) {
        promoCodesGrid.style.display = 'none';
        noPromoCodes.style.display = 'block';
        if (availablePromoCodes) availablePromoCodes.style.display = 'none';
        return;
    }
    
    promoCodesGrid.style.display = 'grid';
    noPromoCodes.style.display = 'none';
    if (availablePromoCodes) availablePromoCodes.style.display = 'block';
    promoCodesGrid.innerHTML = '';
    
    availableCodes.forEach(([code, details]) => {
        const discountText = details.type === 'percentage'
            ? `${details.value}% OFF`
            : details.type === 'shipping'
            ? 'FREE SHIPPING'
            : `₹${details.value.toFixed(2)} OFF`;
        
        const isApplicable = window.originalTotal >= (Number(details.minOrder) || 0);
        const isAlreadyApplied = window.appliedPromoCode === code;
        
        const promoCard = document.createElement('div');
        promoCard.className = 'promo-code-card';
        if (isAlreadyApplied) promoCard.classList.add('active');
        if (!isApplicable) promoCard.classList.add('disabled');
        promoCard.setAttribute('data-code', code);
        
        promoCard.innerHTML = `
            <div class="promo-code-header">
                <div class="promo-code-value">${code}</div>
                ${isAlreadyApplied ? 
                    '<div class="applied-badge"><i class="fas fa-check"></i> Applied</div>' : 
                    ''}
            </div>
            <div class="promo-code-desc">${discountText} - ${details.description || ''}</div>
            <div class="promo-code-terms">Min. order: ₹${Number(details.minOrder) || 0}</div>
        `;
        
        if (isApplicable) {
            promoCard.addEventListener('click', () => {
                selectPromoCode(code);
            });
        }
        
        promoCodesGrid.appendChild(promoCard);
    });
}


// Select promo code from available cards
function selectPromoCode(code) {
    const promoInput = document.getElementById('promoCodeInput');
    
    if (!promoInput) return;
    
    // If same code already applied → remove it
    if (window.appliedPromoCode === code) {
        removePromoCode();
        return;
    }
    
    const promoDetails = window.activePromoCodes[code];
    
    // Validate the code first
    if (!validatePromoCode(promoDetails, code, false)) {
        return;
    }
    
    // If there's already a different code applied, remove it first
    if (window.appliedPromoCode && window.appliedPromoCode !== code) {
        window.currentDiscount = 0;
        window.appliedPromoCode = null;
    }
    
    // Apply the discount
    applyPromoDiscount(promoDetails, code);
    
    // Show success message with remove button
    showPromoSuccessWithRemove(promoDetails, code);
    
    // Clear input field
    promoInput.value = '';
}

// Enhanced showPromoSuccess function
function showPromoSuccess(message) {
    const promoMessage = document.getElementById('promoMessage');
    if (!promoMessage) return;
    
    promoMessage.className = 'promo-message success';
    promoMessage.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
            <span>${message}</span>
            ${window.appliedPromoCode ? 
                '<button onclick="removePromoCode()" style="background:none;border:none;color:#155724;cursor:pointer;font-size:12px;text-decoration:underline;padding:0;">Remove</button>' : 
                ''}
        </div>
    `;
    
    setTimeout(() => {
        if (!window.appliedPromoCode) {
            promoMessage.style.display = 'none';
        }
    }, 5000);
}

// Remove applied promo code (user can click REMOVE button)
function removePromoCode() {
    if (!window.appliedPromoCode) {
        showNotification('No promo code applied', 'info');
        return;
    }
    
    console.log('Removing promo code:', window.appliedPromoCode);
    
    // If it was a shipping promo, restore shipping cost
    if (window.appliedPromoType === 'shipping') {
        const subtotal = window.originalTotal; // Current total includes only subtotal
        window.shippingCost = subtotal > 0 ? 59 : 0; // Restore shipping
        window.originalTotal = subtotal + window.shippingCost; // Recalculate total with shipping
    }
    
    // Clear promo data
    window.currentDiscount = 0;
    window.appliedPromoCode = null;
    window.appliedPromoType = null;
    
    // Clear input field
    const promoInput = document.getElementById('promoCodeInput');
    if (promoInput) {
        promoInput.value = '';
    }
    
    // Hide promo message
    const promoMessage = document.getElementById('promoMessage');
    if (promoMessage) {
        promoMessage.style.display = 'none';
    }
    
    // Update totals
    updateTotals();
    
    // Refresh promo cards to show they're available again
    refreshPromoCodes();
    
    // Show confirmation
    showNotification('Promo code removed', 'info', 2000);
}

// Show error message (no remove button)
function showPromoError(message) {
    const promoMessage = document.getElementById('promoMessage');
    if (!promoMessage) return;
    
    promoMessage.className = 'promo-message error';
    promoMessage.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        </div>
    `;
    promoMessage.style.display = 'block';
    
    // Auto-hide errors after 3 seconds
    setTimeout(() => {
        if (promoMessage && promoMessage.classList.contains('error')) {
            promoMessage.style.display = 'none';
        }
    }, 3000);
}

// Hide all promo messages
function hideAllPromoMessages() {
    const promoMessage = document.getElementById('promoMessage');
    if (promoMessage) {
        promoMessage.style.display = 'none';
    }
}

// Show notification (for remove confirmation)
function showNotification(message, type = 'info', duration = 3000) {
    // Create notification element if you don't have one
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 15px;
                    background:${type === 'info' ? '#3498db' : '#27ae60'}; 
                    color:white; border-radius:8px; position:fixed; 
                    top:20px; right:20px; z-index:10000; box-shadow:0 2px 10px rgba(0,0,0,0.2);">
            <i class="fas fa-${type === 'info' ? 'info-circle' : 'check-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, duration);
}


// Handle quantity change in checkout
function handleCheckoutQuantityChange(e) {
    const button = e.target.closest('.quantity-btn-checkout');
    if (!button) return;
    
    const productId = parseInt(button.getAttribute('data-id'));
    const action = button.getAttribute('data-action');
    
    if (action === 'decrease') {
        const item = cartProducts.find(item => item.id === productId);
        if (item && item.quantity <= 1) {
            removeFromCart(productId);
        } else {
            updateCartQuantity(productId, -1);
        }
    } else if (action === 'increase') {
        updateCartQuantity(productId, 1);
    }
}

// Handle quantity input in checkout  
function handleCheckoutQuantityInput(e) {
    const input = e.target;
    const productId = parseInt(input.getAttribute('data-id'));
    const newQuantity = parseInt(input.value) || 0;
    
    if (newQuantity <= 0) {
        removeFromCart(productId);
    } else {
        setCartQuantity(productId, newQuantity);
    }
    
    // Validate promo code after quantity change
    setTimeout(validateAppliedPromoCode, 100);
}

// Validate form field
function validateField(e) {
    const field = e.target;
    const value = field.value.trim();
    
    field.classList.remove('error');
    
    if (field.hasAttribute('required') && !value) {
        showFieldError(field, 'This field is required');
        return false;
    }
    
    if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            showFieldError(field, 'Please enter a valid email address');
            return false;
        }
    }
    
    if (field.id === 'phone' && value) {
        if (!validateIndianPhoneNumber(value)) {
            showFieldError(field, 'Please enter a valid 10-digit Indian phone number');
            return false;
        }
    }
    
    if (field.id === 'zipCode' && value) {
        const zipRegex = /^\d{6}$/;
        if (!zipRegex.test(value)) {
            showFieldError(field, 'Please enter a valid 6-digit PIN code');
            return false;
        }
    }
    
    return true;
}

// Show field error message
function showFieldError(field, message) {
    field.classList.add('error');
    
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    
    const errorElement = document.createElement('div');
    errorElement.className = 'field-error';
    errorElement.style.color = '#e74c3c';
    errorElement.style.fontSize = '12px';
    errorElement.style.marginTop = '5px';
    errorElement.textContent = message;
    
    field.parentNode.appendChild(errorElement);
}

// Clear field error
function clearFieldError(e) {
    const field = e.target;
    field.classList.remove('error');
    
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
}

// Validate Indian phone number
function validateIndianPhoneNumber(phone) {
    if (phone.startsWith('+91')) {
        phone = phone.replace('+91', '').trim();
    }

    const cleanedPhone = phone.replace(/\D/g, '');

    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(cleanedPhone);
}

// Generate order ID
function generateOrderId() {
    const randomNumber = Math.floor(10000 + Math.random() * 90000);
    return `NA-${randomNumber}`;
}

// Enhanced updateOrderSummary function
function updateOrderSummary() {
    const orderItems = document.getElementById('orderItems');
    const checkoutBtn = document.querySelector('.checkout-btn');
    
    if (!orderItems) return;
    
    orderItems.innerHTML = '';
    let subtotal = 0;
    
    if (cartProducts.length === 0) {
        orderItems.innerHTML = `
            <div class="empty-order-state">
                <i class="fas fa-shopping-cart"></i>
                <h3>Your cart is empty</h3>
                <p>Add some delicious honey products to get started</p>
            </div>
        `;
        
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.style.opacity = '0.5';
            checkoutBtn.style.cursor = 'not-allowed';
        }
        
      setTimeout(() => {
            showNotification('Your cart is empty! Redirecting to Home...', 'info');
            
            // Redirect after 3 seconds
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
        }, 1000);
        
        return; 
    } else {
        cartProducts.forEach(item => {
            const product = products.find(p => p.id === item.id);
            if (product) {
                const itemTotal = product.price * item.quantity;
                subtotal += itemTotal;
                
                const orderItem = document.createElement('div');
                orderItem.className = 'order-item';
                orderItem.innerHTML = `
                    <div class="order-item-main">
                        <div class="order-item-image-container">
                            <img src="${product.image}" alt="${product.name}" 
                                 class="order-product-img" 
                                 onerror="this.onerror=null;this.src='https://ik.imagekit.io/hexaanatura/Adobe%20Express%20-%20file%20(8)%20(1).png?updatedAt=1756876605119'">
                        </div>
                        <div class="order-item-content">
                            <div class="order-item-header">
                                <div class="order-item-info">
                                    <div class="order-item-name">${product.name}</div>
                                    <div class="order-item-weight">${product.weight}</div>
                                </div>
<div class="order-item-price">₹${itemTotal.toFixed(2)}</div>
</div>
                            <div class="order-item-footer">
                                <div class="quantity-controls">
                                    <button class="quantity-btn-checkout" data-action="decrease" data-id="${item.id}">
                                        <i class="fas fa-minus"></i>
                                    </button>
                                    <input type="number" class="quantity-input-checkout" 
                                           value="${item.quantity}" min="1" max="99" 
                                           data-id="${item.id}">
                                    <button class="quantity-btn-checkout" data-action="increase" data-id="${item.id}">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                orderItems.appendChild(orderItem);
            }
        });
        
        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.style.opacity = '1';
            checkoutBtn.style.cursor = 'pointer';
        }
    }
    
window.originalTotal = subtotal;
    updateTotals();
    refreshPromoCodes();
    
    let shipping = 0;
if (subtotal > 0 ) {
    shipping = 59;
}
window.shippingCost = shipping;
window.originalTotal = subtotal + shipping;
updateTotals();
}

// Enhanced validateCheckoutForm function
function validateCheckoutForm() {
    const requiredFields = [
        'email', 'firstName', 'lastName', 'address', 
        'city', 'state', 'zipCode', 'phone'
    ];
    
    let isValid = true;
    let errorMessages = [];
    
    // Clear previous errors
    document.querySelectorAll('.field-error').forEach(error => error.remove());
    document.querySelectorAll('.error').forEach(field => field.classList.remove('error'));
    
    // Validate required fields
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            const value = field.value.trim();
            if (field.hasAttribute('required') && !value) {
                field.classList.add('error');
                showFieldError(field, 'This field is required');
                errorMessages.push(`${fieldId} is required`);
                isValid = false;
            }
            
            // Specific validations
            if (fieldId === 'email' && value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    field.classList.add('error');
                    showFieldError(field, 'Please enter a valid email address');
                    errorMessages.push('Invalid email address');
                    isValid = false;
                }
            }
            
            if (fieldId === 'phone' && value) {
                const phoneNumber = value.replace(/\D/g, '');
                if (phoneNumber.length !== 10 || !/^[6-9]\d{9}$/.test(phoneNumber)) {
                    field.classList.add('error');
                    showFieldError(field, 'Please enter a valid 10-digit phone number');
                    errorMessages.push('Invalid phone number');
                    isValid = false;
                }
            }
            
            if (fieldId === 'zipCode' && value) {
                const zipRegex = /^\d{6}$/;
                if (!zipRegex.test(value)) {
                    field.classList.add('error');
                    showFieldError(field, 'Please enter a valid 6-digit PIN code');
                    errorMessages.push('Invalid PIN code');
                    isValid = false;
                }
            }
        }
    });
    
    // Validate cart
    if (cartProducts.length === 0) {
        showNotification('Your cart is empty. Please add items to proceed.', 'error');
        isValid = false;
    }
    
    if (!isValid && errorMessages.length > 0) {
        showNotification('Please fill in the form!', 'error');
    }
    
    return isValid;
}

async function processCheckout() {
    if (isProcessingPayment) return;
    
    isProcessingPayment = true;
    
    if (!validateCheckoutForm()) {
        isProcessingPayment = false;
        return;
    }
    
    const checkoutBtn = document.querySelector('.checkout-btn');
    const originalBtnText = checkoutBtn.innerHTML;
    checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    checkoutBtn.disabled = true;
    
    try {
        // 1. Collect form data
        const email = document.getElementById('email').value.trim();
        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const address = document.getElementById('address').value.trim();
        const apartment = document.getElementById('apartment')?.value.trim() || '';
        const city = document.getElementById('city').value.trim();
        const state = document.getElementById('state').value;
        const zipCode = document.getElementById('zipCode').value.trim();
        const phoneInput = document.getElementById('phone').value.replace(/\D/g, '');
        const phone = phoneInput.length === 10 ? phoneInput : '';
        const isDefaultAddress = document.getElementById('defaultAddress')?.checked || false;
        
        console.log('Form data collected:', { email, firstName, lastName, phone });
        
        // 2. Calculate final amount
        const finalAmount = Math.max(0, window.originalTotal - window.currentDiscount);
        
        if (finalAmount <= 0) {
            throw new Error('Order amount must be greater than 0');
        }
        
        // 3. Generate order ID
        const orderId = generateOrderId();
        
        // 4. Create TEMPORARY ORDER (not final order)
        const tempOrderData = {
            orderId: orderId,
            email: email,
            customerName: `${firstName} ${lastName}`,
            customerEmail: email,
            customerPhone: '+91 ' + phone,
            shippingAddress: {
                firstName: firstName,
                lastName: lastName,
                address: address,
                apartment: apartment,
                city: city,
                state: state,
                zipCode: zipCode,
                phone: '+91 ' + phone,
                country: 'India'
            },
            items: cartProducts.map(item => {
                const product = products.find(p => p.id === item.id);
                return {
                    productId: item.id,
                    name: product ? product.name : 'Unknown Product',
                    weight: product ? product.weight : '',
                    price: product ? product.price : 0,
                    quantity: item.quantity,
                    image: product ? product.image : '',
                    subtotal: (product ? product.price : 0) * item.quantity
                };
            }),
            subtotal: window.originalTotal,
            discount: window.currentDiscount,
            shipping: 0,
            total: finalAmount,
            status: 'payment_initiated',
            paymentStatus: 'initiated',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            // Add 30 minutes expiry
            expiresAt: firebase.firestore.Timestamp.fromDate(
                new Date(Date.now() + 30 * 60 * 1000)
            )
        };
        
        // Add promo code if applied
        if (window.appliedPromoCode) {
            tempOrderData.promoCode = window.appliedPromoCode;
            tempOrderData.promoDiscount = window.currentDiscount;
        }
        
        // Add user info if logged in
        if (currentUser) {
            tempOrderData.userId = currentUser.uid;
            tempOrderData.userEmail = currentUser.email;
            tempOrderData.userName = currentUser.displayName || `${firstName} ${lastName}`;
        }
        
        console.log('Creating temp order:', tempOrderData);
        
        // Save address to profile if needed
        if (currentUser && isDefaultAddress) {
            console.log('Saving address to profile...');
            await window.saveCheckoutAddressToProfile(
                firstName, lastName, address, city, state, zipCode, '+91 ' + phone, isDefaultAddress
            );
        }
        
        // 5. Save temp order to Firestore
        const tempOrderRef = await db.collection('tempOrders').add(tempOrderData);
        const tempOrderId = tempOrderRef.id;
        
        console.log('Temp order created:', tempOrderId);
        
 // Format amount to ensure 2 decimal places
const finalAmountWithDecimals = Math.round(finalAmount * 100) / 100;
console.log('Final amount with decimals:', finalAmountWithDecimals);

// 6. Initialize Razorpay payment with temp order ID
await initializeRazorpayPayment(tempOrderData, finalAmountWithDecimals, tempOrderId);
        
    } catch (error) {
        console.error('Checkout error:', error);
        showNotification(`Payment failed: ${error.message}`, 'error');
        checkoutBtn.innerHTML = originalBtnText;
        checkoutBtn.disabled = false;
        isProcessingPayment = false;
    }
}
async function initializeRazorpayPayment(orderData, amount, tempOrderId) {
    console.log('Initializing Razorpay payment for temp order:', tempOrderId);
    
    try {
        let createOrderResponse;
        
        try {
            // Try Firebase Function
            const createOrder = firebase.functions().httpsCallable('createRazorpayOrder');
            createOrderResponse = await createOrder({
                amount: amount,
                currency: 'INR',
                receipt: `receipt_${Date.now()}`,
                notes: {
                    orderId: orderData.orderId,
                    tempOrderId: tempOrderId,
                    source: 'checkout'
                }
            });
            
            console.log('Firebase Function response:', createOrderResponse.data);
            
        } catch (firebaseError) {
            console.warn('Firebase Function failed:', firebaseError);
            createOrderResponse = await createRazorpayOrderDirect(amount, orderData.orderId, tempOrderId);
        }
        
        if (!createOrderResponse || !createOrderResponse.orderId) {
            throw new Error('Failed to create Razorpay order');
        }
        
        console.log('Razorpay order created:', createOrderResponse.orderId);
        
        // Update temp order with Razorpay order ID
        await db.collection('tempOrders').doc(tempOrderId).update({
            razorpayOrderId: createOrderResponse.orderId,
            razorpayKey: createOrderResponse.razorpayKey,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const options = {
            key: createOrderResponse.razorpayKey,
            amount: Math.round(amount * 100), // FIX 1: Proper rounding for decimals
            currency: "INR",
            description: `Order ${orderData.orderId}`,
            order_id: createOrderResponse.orderId,
            
            handler: async function(response) {
                console.log('Razorpay payment response:', response);
                await processPaymentSuccess(orderData, tempOrderId, response);
            },
            
            prefill: {
                name: `${orderData.shippingAddress.firstName} ${orderData.shippingAddress.lastName}`,
                email: orderData.email,
                contact: orderData.shippingAddress.phone.replace('+91 ', '')
            },
            
            modal: {
                ondismiss: function() {
                    console.log('Payment cancelled for temp order:', tempOrderId);
                    showNotification('Payment was cancelled', 'info'); // FIX 2: Show cancellation message
                    handlePaymentCancellation(tempOrderId);
                }
            },
            
            notes: {
                orderId: orderData.orderId,
                tempOrderId: tempOrderId
            }
        };
        
        const rzp = new Razorpay(options);
        
        rzp.on('payment.failed', async function(response) {
            console.error('Razorpay payment failed:', response.error);
            await handlePaymentFailure(response, tempOrderId);
        });
        
        rzp.open();
        
    } catch (error) {
        console.error('Razorpay initialization error:', error);
        throw error;
    }
}

async function createRazorpayOrderDirect(amount, orderId, tempOrderId) {
  try {
    console.log('Trying direct API call...');
    
    const functionURL = 'https://asia-south1-hexahoney-96aed.cloudfunctions.net/createRazorpayOrder';
    
    const response = await fetch(functionURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': window.location.origin
      },
      body: JSON.stringify({
        data: {
          amount: amount,
          currency: 'INR',
          receipt: `receipt_${Date.now()}`,
          notes: {
            orderId: orderId,
            tempOrderId: tempOrderId, // Add temp order ID
            source: 'direct_fallback'
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Direct API success:', data);
    
    return {
      success: true,
      orderId: data.result.orderId,
      amount: data.result.amount,
      currency: data.result.currency,
      razorpayKey: data.result.razorpayKey
    };
    
  } catch (error) {
    console.error('Direct API failed:', error);

    throw new Error('Payment service unavailable. Please try again.');
  }
}

async function processPaymentSuccess(orderData, tempOrderId, razorpayResponse) {
    console.log('Processing payment success for temp order:', tempOrderId);
    
    try {
        // 1. Get the temp order
        const tempOrderDoc = await db.collection('tempOrders').doc(tempOrderId).get();
        const tempOrderData = tempOrderDoc.data();
        
        if (!tempOrderData) {
            throw new Error('Temp order not found');
        }
        
        // 2. Create final order in Firestore
        const finalOrderData = {
            ...tempOrderData,
            status: 'ordered',
            paymentStatus: 'paid',
            razorpayPaymentId: razorpayResponse.razorpay_payment_id,
            razorpayOrderId: razorpayResponse.razorpay_order_id,
            razorpaySignature: razorpayResponse.razorpay_signature,
            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Remove expiresAt from final order
        delete finalOrderData.expiresAt;
        
        console.log('Creating final order from temp order:', tempOrderId);
        
        // 3. Create final order (this will trigger onOrderCreated)
        const orderRef = await db.collection('orders').add(finalOrderData);
        const finalOrderId = orderRef.id;
        
        console.log('✅ Final order created:', finalOrderId);
        
        // 4. Update user's orders if logged in
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid)
                .collection('orders').doc(finalOrderId).set({
                    ...finalOrderData,
                    id: finalOrderId
                });
        }
        
        // 5. Delete temp order
        await db.collection('tempOrders').doc(tempOrderId).delete();
        console.log('🗑️ Temp order deleted:', tempOrderId);
        
        // 6. Clear cart
        await clearCartAfterOrder();
        
        // 7. Reset payment processing flag
        isProcessingPayment = false;
        
        // 8. Show success popup
        const updatedOrderData = {
            ...finalOrderData,
            id: finalOrderId
        };
        
        if (typeof showOrderSuccessPopup === 'function') {
            showOrderSuccessPopup(updatedOrderData);
        } else {
            console.error('showOrderSuccessPopup function not found!');
            alert(`Order confirmed successfully! Order ID: ${updatedOrderData.orderId}`);
            window.location.href = 'index.html';
        }
        
    } catch (error) {
        console.error('Error processing payment success:', error);
        
        // Update temp order with error
        try {
            await db.collection('tempOrders').doc(tempOrderId).update({
                paymentStatus: 'failed',
                paymentError: error.message,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (updateError) {
            console.error('Failed to update temp order:', updateError);
        }
        
        showNotification('Error completing order. Please contact support.', 'error');
        isProcessingPayment = false;
        throw error;
    }
}

async function handlePaymentFailure(response, tempOrderId) {
    console.error('Payment failed for temp order:', tempOrderId);
    
    // Update temp order with failed status
    if (tempOrderId && db) {
        try {
            await db.collection('tempOrders').doc(tempOrderId).update({
                paymentStatus: 'failed',
                paymentError: response.error,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('Temp order marked as failed:', tempOrderId);
            
        } catch (error) {
            console.error('Error updating failed payment:', error);
        }
    }
    
    // Show error to user
    showNotification(`Payment failed: ${response.error.description}`, 'error');
    
    // Reset payment processing flag
    isProcessingPayment = false;
}

// Handle payment error
function handlePaymentError(error, orderDocId) {
    console.error('Payment error:', error);
    
    let errorMessage = 'Payment failed. ';
    
    if (error.message.includes('cancelled')) {
        errorMessage = 'Payment was cancelled.';
    } else if (error.message.includes('verification')) {
        errorMessage += 'Verification failed. Please contact support.';
    } else {
        errorMessage += error.message;
    }
    
    showNotification(errorMessage, 'error');
    isProcessingPayment = false;
}

async function handlePaymentCancellation(tempOrderId) {
    console.log('Payment cancelled for temp order:', tempOrderId);
    
    // Update temp order status
    if (tempOrderId && db) {
        try {
            await db.collection('tempOrders').doc(tempOrderId).update({
                paymentStatus: 'cancelled',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('Temp order marked as cancelled');
        } catch (error) {
            console.error('Error updating cancelled temp order:', error);
        }
    }
    
    // Reset button state
    const checkoutBtn = document.querySelector('.checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.innerHTML = '<i class="fas fa-lock"></i> Pay Now';
        checkoutBtn.disabled = false;
    }
    
    isProcessingPayment = false;
}


// Enhanced saveOrderToFirestore function
async function saveOrderToFirestore(orderData) {
    return new Promise(async (resolve, reject) => {
        try {
            // Save to main orders collection
            const orderRef = await db.collection('orders').add(orderData);
            console.log('Order saved to main collection:', orderRef.id);
            
            // Save to user's orders if logged in
            if (currentUser) {
                await db.collection('users').doc(currentUser.uid).collection('orders').doc(orderRef.id).set({
                    ...orderData,
                    id: orderRef.id
                }, { merge: true });
                console.log('Order saved to user collection:', orderRef.id);
            }
            
            resolve(orderRef);
        } catch (error) {
            console.error('Error saving order:', error);
            reject(error);
        }
    });
}

// Enhanced clearCartAfterOrder function
async function clearCartAfterOrder() {
    try {
        console.log('Clearing cart after successful order...');
        
        // Clear from localStorage
        localStorage.removeItem('guestCart');
        
        // Clear from Firestore if user is logged in
        if (currentUser && db) {
            try {
                const cartRef = db.collection('users').doc(currentUser.uid).collection('cart');
                const cartSnapshot = await cartRef.get();
                
                if (!cartSnapshot.empty) {
                    const batch = db.batch();
                    cartSnapshot.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    console.log('Cart cleared from Firestore');
                }
            } catch (firestoreError) {
                console.error('Error clearing cart from Firestore:', firestoreError);
                // Continue anyway
            }
        }
        
        // Clear local cart
        cartProducts = [];
        
        // Update UI
        if (typeof updateCartUI === 'function') {
            updateCartUI();
        }
        
        if (typeof updateOrderSummary === 'function') {
            updateOrderSummary();
        }
        
        console.log('Cart cleared successfully');
        
    } catch (error) {
        console.error('Error clearing cart:', error);
        // Don't throw, as this shouldn't prevent order success
    }
}

// Order success popup functions
function showOrderSuccessPopup(orderData) {
    console.log('showOrderSuccessPopup called with:', orderData);
    
    const modal = document.getElementById('orderSuccessModal');
    if (!modal) {
        console.error('Order success modal not found!');
        createOrderSuccessModal();
        setTimeout(() => showOrderSuccessPopup(orderData), 100);
        return;
    }
    
    // Set order details
    const successOrderId = document.getElementById('successOrderId');
    const successOrderDate = document.getElementById('successOrderDate');
    const successOrderTotal = document.getElementById('successOrderTotal');
    
    if (successOrderId) {
        successOrderId.textContent = orderData.orderId || orderData.orderNumber || orderData.id;
    }
    
    if (successOrderDate) {
        successOrderDate.textContent = new Date().toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    if (successOrderTotal) {
        const total = orderData.total || (window.originalTotal - window.currentDiscount);
        successOrderTotal.textContent = `₹${total.toFixed(2)}`;
    }
    
    // Show modal with animation
    modal.classList.add('active');
    
    // Remove any existing event listeners first to avoid duplicates
    const closeBtn = document.getElementById('closeSuccessModal');
    const trackBtn = document.getElementById('trackOrderBtn');
    const continueBtn = document.getElementById('continueShoppingBtn');
    
    // Close button event - REDIRECT TO INDEX.HTML
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        newCloseBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 300);
        });
    }
    
    // Track order button event
    if (trackBtn) {
        const newTrackBtn = trackBtn.cloneNode(true);
        trackBtn.parentNode.replaceChild(newTrackBtn, trackBtn);
        
        newTrackBtn.addEventListener('click', function() {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
            
            if (typeof window.showOrderTracking === 'function' && orderData.id) {
                window.showOrderTracking(orderData.id);
            }
        });
    }
    
    // Continue shopping button event - REDIRECT TO INDEX.HTML
    if (continueBtn) {
        const newContinueBtn = continueBtn.cloneNode(true);
        continueBtn.parentNode.replaceChild(newContinueBtn, continueBtn);
        
        newContinueBtn.addEventListener('click', function() {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
            window.location.href = 'index.html';
        });
    }
    
    // Close when clicking outside the content - REDIRECT TO INDEX.HTML
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 300);
        }
    };
    
    // Close with Escape key - REDIRECT TO INDEX.HTML
    const closeOnEscape = function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 300);
            
            document.removeEventListener('keydown', closeOnEscape);
        }
    };
    
    document.removeEventListener('keydown', closeOnEscape);
    document.addEventListener('keydown', closeOnEscape);
    
    // Disable body scroll
    document.body.style.overflow = 'hidden';
}

function createOrderSuccessModal() {
    console.log('Creating order success modal dynamically');
    
    const modalHTML = `
    <div id="orderSuccessModal" class="order-success-modal">
        <div class="order-success-content">
            <button id="closeSuccessModal" class="close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
            
            <div class="success-header">
                <div class="success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h2>Order Confirmed!</h2>
                <p>Thank you for your purchase</p>
            </div>
            
            <div class="order-details">
                <div class="detail-row">
                    <span class="detail-label">Order ID</span>
                    <span id="successOrderId" class="detail-value">NA-12345</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Order Date</span>
                    <span id="successOrderDate" class="detail-value">${new Date().toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Total Amount</span>
                    <span id="successOrderTotal" class="detail-value">₹0.00</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status</span>
                    <span class="detail-value status-paid">Paid</span>
                </div>
            </div>
            
            <div class="order-actions">
                <button id="trackOrderBtn" class="btn track-order-btn">
                    <i class="fas fa-truck"></i> Track Order
                </button>
                <button id="continueShoppingBtn" class="btn continue-shopping-btn">
                    <i class="fas fa-shopping-cart"></i> Continue Shopping
                </button>
            </div>
            
            <div class="order-tips">
                <div class="tip">
                    <i class="fas fa-envelope"></i>
                    <span>You will receive an order confirmation email shortly.</span>
                </div>
                <div class="tip">
                    <i class="fas fa-phone"></i>
                    <span>Need help? <a href="contact.html">Contact our support</a></span>
                </div>
                <div class="tip">
                    <i class="fas fa-star"></i>
                    <span>Review your products after delivery for special offers!</span>
                </div>
            </div>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Close popup function
function closeOrderSuccessPopup() {
    const modal = document.getElementById('orderSuccessModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `checkout-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
        <button class="close-notification">&times;</button>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-width: 300px;
        max-width: 400px;
        animation: slideIn 0.3s ease;
        font-family: 'Unbounded', sans-serif;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    const closeBtn = notification.querySelector('.close-notification');
    closeBtn.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        margin-left: 15px;
    `;
    
    closeBtn.addEventListener('click', () => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    });
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

// Enhanced setupCheckoutEventListeners function
function setupCheckoutEventListeners() {
    const loginBtnCheckout = document.getElementById('loginBtnCheckout');
    const applyPromoBtn = document.getElementById('applyPromoBtn');
    const checkoutBtn = document.querySelector('.checkout-btn');
    const promoCodeInput = document.getElementById('promoCodeInput');
    
    // Login/Logout button
    if (loginBtnCheckout) {
        loginBtnCheckout.addEventListener('click', function() {
            if (currentUser) {
                if (confirm('Are you sure you want to logout? This will clear your cart.')) {
                    auth.signOut().then(() => {
                        window.location.reload();
                    });
                }
            } else {
                showLoginView();
                loginModal.classList.add('active');
                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    // Apply promo button
    if (applyPromoBtn) {
        applyPromoBtn.addEventListener('click', applyPromoCode);
    }
    
    // Promo code input
    if (promoCodeInput) {
        promoCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                applyPromoCode();
            }
        });
    }
    
    // Checkout button with animation
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Add animation
            addButtonAnimation(this);
            
            // Process checkout
            setTimeout(() => {
                processCheckout();
            }, 300);
        });
        
        // Add hover effects
        checkoutBtn.addEventListener('mouseenter', function() {
            if (!this.disabled) {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 20px rgba(95, 43, 39, 0.4)';
            }
        });
        
        checkoutBtn.addEventListener('mouseleave', function() {
            if (!this.disabled) {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 4px 15px rgba(95, 43, 39, 0.3)';
            }
        });
    }
    
    // Quantity controls
    document.addEventListener('click', handleCheckoutQuantityChange);
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('quantity-input-checkout')) {
            handleCheckoutQuantityInput(e);
        }
    });
    
    // Form validation
    const formInputs = document.querySelectorAll('.checkout-form input, .checkout-form select');
    formInputs.forEach(input => {
        input.addEventListener('blur', validateField);
        input.addEventListener('input', clearFieldError);
        input.addEventListener('focus', function() {
            this.style.borderColor = '#5f2b27';
            this.style.boxShadow = '0 0 0 2px rgba(95, 43, 39, 0.1)';
        });
        input.addEventListener('blur', function() {
            if (!this.classList.contains('error')) {
                this.style.borderColor = '#ddd';
                this.style.boxShadow = 'none';
            }
        });
    });
}

// Add button animation function
function addButtonAnimation(button) {
    button.classList.add('processing');
    button.style.transform = 'scale(0.98)';
    button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    
    // Add ripple effect
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    
    ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.7);
        transform: scale(0);
        animation: ripple 0.6s linear;
        width: ${size}px;
        height: ${size}px;
        left: 0;
        top: 0;
    `;
    
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Make functions available globally
window.updateCheckoutUI = updateCheckoutUI;
window.loadUserDefaultAddress = loadUserDefaultAddress;
window.updateOrderSummary = updateOrderSummary;
window.applyPromoCode = applyPromoCode;
window.removePromoCode = removePromoCode;
window.selectPromoCode = selectPromoCode;
window.processCheckout = processCheckout;
window.showNotification = showNotification;
window.showOrderSuccessPopup = showOrderSuccessPopup;
window.closeOrderSuccessPopup = closeOrderSuccessPopup;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing checkout...');
    
    // Initialize checkout page if on checkout page
    if (document.querySelector('.checkout-section')) {
        console.log('Checkout section found, initializing...');
        initCheckoutPage();
    }
});

// Auto-validate currently applied promo code
function validateAppliedPromoCode() {
    // If no promo applied, nothing to validate
    if (!window.appliedPromoCode) return false;
    
    const promoCode = window.appliedPromoCode;
    const promoDetails = window.activePromoCodes[promoCode];
    
    // If promo no longer exists in active promos
    if (!promoDetails) {
        console.log('Applied promo code no longer exists, removing...');
        removePromoCode();
        showNotification('Promo code no longer available', 'info');
        return false;
    }
    
    // Validate the promo code with current cart state
    if (!validatePromoCode(promoDetails, promoCode, true)) {
        console.log('Applied promo code is no longer valid, removing...');
        removePromoCode();
        showNotification('Promo code conditions no longer met', 'info');
        return false;
    }
    
    return true;
}

function checkFirebaseFunctions() {
    console.log('Checking Firebase setup:');
    console.log('Firebase app:', firebase.apps.length > 0 ? 'Initialized' : 'Not initialized');
    console.log('Firebase functions:', typeof firebase.functions);
    console.log('Functions object:', firebase.functions);
    
    if (typeof firebase.functions === 'function') {
        try {
            const functions = firebase.functions();
            console.log('Functions instance created:', functions);
            console.log('Available methods:', Object.keys(functions));
        } catch (err) {
            console.error('Error creating functions instance:', err);
        }
    }
}
