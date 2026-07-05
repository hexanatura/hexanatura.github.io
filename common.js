// Add favicon to all pages
function addFavicon() {
    const links = [
        { rel: 'icon', type: 'image/x-icon', href: 'favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: 'favicon-16x16.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: 'favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: 'apple-touch-icon.png' },
        { rel: 'icon', type: 'image/svg+xml', href: 'favicon.svg' }
    ];
    
    links.forEach(linkData => {
        const link = document.createElement('link');
        Object.keys(linkData).forEach(key => {
            link[key] = linkData[key];
        });
        document.head.appendChild(link);
    });
}

function debugFirebaseSetup() {
    console.log('=== FIREBASE DEBUG INFO ===');
    console.log('Firebase app initialized:', firebase.apps.length > 0);
    console.log('Firebase app name:', firebase.apps[0]?.name || 'Not initialized');
    console.log('Available Firebase modules:', {
        auth: typeof firebase.auth,
        firestore: typeof firebase.firestore,
        functions: typeof firebase.functions,
        app: typeof firebase.app
    });
    
    if (typeof firebase.functions === 'function') {
        try {
            const functionsInstance = firebase.functions();
            console.log('Functions instance created:', !!functionsInstance);
            console.log('Functions region property:', functionsInstance.region);
        } catch (e) {
            console.error('Error creating functions instance:', e);
        }
    } else {
        console.error('firebase.functions is not a function!');
        console.error('Check: 1. compat SDK loaded, 2. Correct script order');
    }
}

// Call this when page loads
window.debugFirebaseSetup = debugFirebaseSetup;

const firebaseConfig = {
    apiKey: "AIzaSyDuF6bdqprddsE871GuOablXPYqXI_HJxc",
    authDomain: "hexahoney-96aed.firebaseapp.com",
    projectId: "hexahoney-96aed",
    storageBucket: "hexahoney-96aed.firebasestorage.app",
    messagingSenderId: "700458850837",
    appId: "1:700458850837:web:0eb4fca98a5f4acc2d0c1c",
    measurementId: "G-MQGKK9709H"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Initialize Functions with proper configuration
let functions;
try {
    functions = firebase.app().functions('asia-south1');
    console.log('Firebase Functions initialized with region: asia-south1');
} catch (error) {
    console.error('Error initializing Firebase Functions:', error);
    functions = null;
}

// Make functions available globally
window.functions = functions;

let currentUser = null;
let likedProducts = [];
let cartProducts = [];
let userOrders = [];
let currentModalView = 'login';

window.currentDiscount = 0;
window.originalTotal = 0;
window.appliedPromoCode = null;
window.addressUnsubscribe = null;
window.activePromoCodes = {};

const products = [
    { 
        id: 1, 
        name: "Natura Agmark Honey", 
        price: 420.00, 
        weight: "1Kg",
        image: "https://ik.imagekit.io/hexaanatura/Natura%20Agmark%20Honey%20500g?updatedAt=1766222498725",
        category: "crystal"
    },
    { 
        id: 2, 
        name: "Natura Agmark Honey", 
        price: 230.00, 
        weight: "500g",
        image: "https://ik.imagekit.io/hexaanatura/Natura%20Agmark%20Honey%201kg?updatedAt=1766222517443",
        category: "crystal"
    },
    { 
        id: 3, 
        name: "Natura Agmark Honey", 
        price: 65.00, 
        weight: "100g",
        image: "https://ik.imagekit.io/hexaanatura/Natura%20Agmark%20Honey%20100g?updatedAt=1766222470748",
        category: "crystal"
    },
    { 
        id: 4, 
        name: "Natura Agmark Honey", 
        price: 40.00, 
        weight: "50g",
        image: "https://ik.imagekit.io/hexaanatura/Natura%20Agmark%20Honey%2050g?updatedAt=1766222568792",
        category: "crystal"
    },
    { 
        id: 5, 
        name: "Natura Agmark Honey", 
        price: 370.00, 
        weight: "1Kg",
        image: "https://ik.imagekit.io/hexaanatura/Natura%20Agmark%20Honey%201kg%20pet?updatedAt=1766222544459",
        category: "premium"
    },
    { 
        id: 6, 
        name: "Natura Agmark Honey", 
        price: 200.00, 
        weight: "500g",
        image: "https://ik.imagekit.io/hexaanatura/Natura%20Agmark%20Honey%20500g%20pet?updatedAt=1766223840598",
        category: "premium"
    }
];

// DOM Elements
const notificationBar = document.getElementById('notificationBar');
const navBar = document.getElementById('navBar');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const navLinks = document.getElementById('navLinks');
const likeIcon = document.getElementById('likeIcon');
const likeCount = document.getElementById('likeCount');
const cartIcon = document.getElementById('cartIcon');
const cartCount = document.getElementById('cartCount');
const Icon = document.getElementById('Icon');
const userIcon = document.getElementById('userIcon');
const userDropdown = document.getElementById('userDropdown');
const profileLink = document.getElementById('profileLink');
const logoutLink = document.getElementById('logoutLink');
const likesSidebar = document.getElementById('likesSidebar');
const closeLikes = document.getElementById('closeLikes');
const likesItems = document.getElementById('likesItems');
const emptyLikes = document.getElementById('emptyLikes');
const browseProducts = document.getElementById('browseProducts');
const cartSidebar = document.getElementById('cartSidebar');
const closeCart = document.getElementById('closeCart');
const cartItems = document.getElementById('cartItems');
const emptyCart = document.getElementById('emptyCart');
const cartSummary = document.getElementById('cartSummary');
const checkoutBtn = document.getElementById('checkoutBtn');
const continueShopping = document.getElementById('continueShopping');
const overlay = document.getElementById('overlay');
const loginModal = document.getElementById('loginModal');
const closeLogin = document.getElementById('closeLogin');
const backBtn = document.getElementById('backBtn');
const modalTitle = document.getElementById('modalTitle');
const modalSubtitle = document.getElementById('modalSubtitle');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const forgotForm = document.getElementById('forgotForm');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const resetBtn = document.getElementById('resetBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const forgotPassword = document.getElementById('forgotPassword');
const signUp = document.getElementById('signUp');
const loginFooter = document.getElementById('loginFooter');
const termsCheckbox = document.getElementById('termsCheckbox');

// Helper function to get display order ID (NA-xxxxx format)
function getDisplayOrderId(order) {
    // First try order.orderId (this is the NA-xxxxx from generateOrderId)
    if (order.orderId) return order.orderId;
    
    // Then try order.id (Firestore document ID)
    if (order.id) return order.id.substring(0, 8).toUpperCase();
    
    // Finally fallback to random
    return `ORD${Math.floor(100000 + Math.random() * 900000)}`;
}

// Main auth state listener - UPDATED for checkout support
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        updateUIForUser(user);
        loadUserProfileData(user.uid);
        
        // Check if we're on checkout page and call checkout functions
        if (document.querySelector('.checkout-section')) {
            if (typeof window.updateCheckoutUI === 'function') {
                window.updateCheckoutUI();
            }
            if (typeof window.loadUserDefaultAddress === 'function') {
                window.loadUserDefaultAddress();
            }
        }
    } else {
        currentUser = null;
        // Unsubscribe from address updates if user logs out
        if (window.addressUnsubscribe) {
            window.addressUnsubscribe();
            window.addressUnsubscribe = null;
        }
        updateUIForGuest();
        const profilePage = document.getElementById('profilePage');
        const mainContent = document.getElementById('mainContent');
        if (profilePage && mainContent) {
            profilePage.classList.remove('active');
            mainContent.style.display = 'block';
        }
        
        // Update checkout UI if on checkout page
        if (document.querySelector('.checkout-section')) {
            if (typeof window.updateCheckoutUI === 'function') {
                window.updateCheckoutUI();
            }
        }
    }
});

// Edit Profile Functionality
function EditProfile() {
    // Check if edit profile button exists
    const editProfileBtn = document.getElementById('edit-profile-btn');
    if (!editProfileBtn) return;
    
    // Check if modal already exists to avoid duplicates
    if (document.getElementById('editProfileModal')) {
        return;
    }
    
    // Create the edit profile modal dynamically
    const modal = document.createElement('div');
    modal.id = 'editProfileModal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        align-items: center;
        justify-content: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 15px; padding: 30px; width: 90%; max-width: 500px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 2px solid #e7d90f;">
                <h2 style="font-family: 'Akira Expanded', sans-serif; font-size: 22px; color: #5f2b27; margin: 0;">Edit Profile</h2>
                <button id="closeEditProfileModal" style="background: none; border: none; font-size: 28px; color: #777; cursor: pointer;">&times;</button>
            </div>
            
            <div style="padding: 10px 0;">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-family: 'Unbounded', sans-serif; font-weight: 600; margin-bottom: 8px; color: #333; font-size: 14px;">
                        Full Name
                    </label>
                    <input type="text" id="editProfileName" 
                           style="width: 100%; padding: 12px 15px; border: 1px solid #ddd; border-radius: 8px; font-family: 'Unbounded', sans-serif; font-size: 15px;"
                           placeholder="Enter your full name">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-family: 'Unbounded', sans-serif; font-weight: 600; margin-bottom: 8px; color: #333; font-size: 14px;">
                        Email Address
                    </label>
                    <input type="email" id="editProfileEmail" disabled
                           style="width: 100%; padding: 12px 15px; border: 1px solid #ddd; border-radius: 8px; 
                                  font-family: 'Unbounded', sans-serif; font-size: 15px;
                                  background-color: #f5f5f5; color: #666; cursor: not-allowed; opacity: 0.7;"
                           placeholder="your@email.com">
                    <p style="font-size: 12px; color: #777; margin-top: 5px; font-family: 'Quicksand', sans-serif; font-style: italic;">
                        Email cannot be changed
                    </p>
                </div>
                
                <div style="display: flex; gap: 12px; margin-top: 25px; justify-content: flex-end;">
                    <button id="saveProfileBtn" 
                            style="background: #5f2b27; color: white; border: none; padding: 12px 24px; 
                                   border-radius: 8px; font-family: 'Unbounded', sans-serif; font-weight: 600; 
                                   cursor: pointer; font-size: 15px;">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                    <button id="cancelProfileEdit" 
                            style="background: transparent; color: #5f2b27; border: 1px solid #5f2b27; padding: 12px 24px; 
                                   border-radius: 8px; font-family: 'Unbounded', sans-serif; font-weight: 600; 
                                   cursor: pointer; font-size: 15px;">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event Listeners
    editProfileBtn.addEventListener('click', function(e) {
        e.preventDefault();
        openEditProfileModal();
    });
    
    function openEditProfileModal() {
        if (!currentUser) return;
        
        // Populate fields with current user data
        document.getElementById('editProfileName').value = currentUser.displayName || '';
        document.getElementById('editProfileEmail').value = currentUser.email || '';
        
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    function closeEditProfileModal() {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    
    // Close modal buttons
    document.getElementById('closeEditProfileModal').addEventListener('click', closeEditProfileModal);
    document.getElementById('cancelProfileEdit').addEventListener('click', closeEditProfileModal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeEditProfileModal();
        }
    });
    
    // Save profile changes
    document.getElementById('saveProfileBtn').addEventListener('click', async function() {
        const newName = document.getElementById('editProfileName').value.trim();
        
        if (!newName) {
            alert('Please enter your name');
            return;
        }
        
        const saveBtn = this;
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;
        
        try {
            // Update profile in Firebase
            await currentUser.updateProfile({
                displayName: newName
            });
            
            // Update in Firestore
            await db.collection('users').doc(currentUser.uid).set({
                displayName: newName,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Update UI
            const userNameElement = document.getElementById('user-name');
            if (userNameElement) {
                userNameElement.textContent = newName;
            }
            
            // Show success
            alert('Profile updated successfully!');
            closeEditProfileModal();
            
        } catch (error) {
            console.error("Error updating profile:", error);
            alert('Error updating profile. Please try again.');
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    });
}

// Save checkout address to user's profile - MOVED TO COMMON.JS
function saveCheckoutAddressToProfile(firstName, lastName, address, city, state, zipCode, phone, isDefault) {
    if (!currentUser || !db) return;
    
    const fullName = `${firstName} ${lastName}`.trim();
    
    const newAddress = {
        label: 'Home',
        name: fullName,
        address: address,
        phone: phone.replace('+91 ', ''),
        pincode: zipCode,
        city: city,
        state: state,
        country: 'India',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isDefault: isDefault
    };
    
    console.log('Saving checkout address to profile:', newAddress);
    
    if (isDefault) {
        db.collection('users').doc(currentUser.uid).collection('addresses').get()
            .then((querySnapshot) => {
                const batch = db.batch();
                
                querySnapshot.forEach((doc) => {
                    const addressRef = db.collection('users').doc(currentUser.uid).collection('addresses').doc(doc.id);
                    batch.update(addressRef, { isDefault: false });
                });
                
                return batch.commit();
            })
            .then(() => {
                return db.collection('users').doc(currentUser.uid).collection('addresses').add(newAddress);
            })
            .then((docRef) => {
                console.log('Default address saved with ID:', docRef.id);
                showNotification('Address saved as default in your profile!', 'success');
            })
            .catch((error) => {
                console.error("Error saving default address:", error);
                showNotification('Error saving address to profile: ' + error.message, 'error');
            });
    } else {
        db.collection('users').doc(currentUser.uid).collection('addresses').add(newAddress)
            .then((docRef) => {
                console.log('Address saved with ID:', docRef.id);
                showNotification('Address saved to your profile!', 'success');
            })
            .catch((error) => {
                console.error("Error saving address:", error);
                showNotification('Error saving address to profile: ' + error.message, 'error');
            });
    }
}

// Make this function available globally
window.saveCheckoutAddressToProfile = saveCheckoutAddressToProfile;

// Enhanced helper function for form fields (for checkout)
function safeSetFormField(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (field && value) {
        if (field.tagName === 'SELECT') {
            const options = field.options;
            for (let i = 0; i < options.length; i++) {
                if (options[i].value === value) {
                    field.selectedIndex = i;
                    return true;
                }
            }
            for (let i = 0; i < options.length; i++) {
                if (options[i].value.toLowerCase() === value.toLowerCase()) {
                    field.selectedIndex = i;
                    return true;
                }
            }
        } else {
            field.value = value;
            return true;
        }
    }
    return false;
}

// Make this function available globally
window.safeSetFormField = safeSetFormField;


function showOrderTracking(orderId) {
    console.log('showOrderTracking called with:', orderId);
    
    // Close the success popup if it's open
    const successModal = document.getElementById('orderSuccessModal');
    if (successModal) {
        successModal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
    
    const orderTrackingSection = document.getElementById('orderTrackingSection');
    
    if (!orderTrackingSection) {
        console.error('Order tracking section not found');
        return;
    }
    
    // Hide other sections
    const mainContent = document.getElementById('mainContent');
    const profilePage = document.getElementById('profilePage');
    const checkoutSection = document.querySelector('.checkout-section');
    
    if (mainContent) mainContent.style.display = 'none';
    if (profilePage) profilePage.classList.remove('active');
    
    // Close sidebars
    if (typeof closeAllSidebars === 'function') {
        closeAllSidebars();
    }
    
    // Show tracking section
    orderTrackingSection.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Load order data
    loadOrderTrackingData(orderId);
}

function closeOrderTracking() {
    const orderTrackingSection = document.getElementById('orderTrackingSection');
    const mainContent = document.getElementById('mainContent');
    const profilePage = document.getElementById('profilePage');
    
    if (orderTrackingSection) {
        orderTrackingSection.classList.remove('active');
    }
    
    if (profilePage && profilePage.classList.contains('active')) {
        // Keep profile page open if it was active
        profilePage.classList.add('active');
        if (mainContent) mainContent.style.display = 'none';
    } else if (mainContent) {
        // Otherwise show main content
        mainContent.style.display = 'block';
    }
    
    document.body.style.overflow = 'auto';
}

function loadOrderTrackingData(orderId) {
    if (!orderId) {
        showTrackingError("No order ID provided");
        return;
    }
    
    if (!currentUser) {
        showTrackingError("Please log in to view order details");
        return;
    }
    
    const itemsContainer = document.getElementById('tracking-order-items');
    if (itemsContainer) {
        itemsContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading order details...</p></div>';
    }
    
    const totalElement = document.getElementById('tracking-total');
    if (totalElement) {
        totalElement.textContent = '₹0.00';
    }
    
    const db = firebase.firestore();
    
    db.collection("users").doc(currentUser.uid).collection("orders").doc(orderId).get()
        .then((doc) => {
            if (doc.exists) {
                const orderData = doc.data();
                orderData.id = doc.id;
                displayOrderTrackingData(orderData);
            } else {
                searchOrderByNumber(orderId);
            }
        })
        .catch((error) => {
            console.error("Error loading order:", error);
            searchOrderByNumber(orderId);
        });
}

function updateStepDates(orderData) {
    const stepDates = {
        'ordered': orderData.createdAt || orderData.orderDate,
        'confirmed': orderData.confirmedAt || (orderData.status === 'confirmed' ? orderData.updatedAt : null),
        'shipped': orderData.shippedAt || (orderData.status === 'shipped' ? orderData.updatedAt : null),
        'out-for-delivery': orderData.outForDeliveryAt || (orderData.status === 'out-for-delivery' ? orderData.updatedAt : null),
        'delivered': orderData.deliveredAt || (orderData.status === 'delivered' ? orderData.updatedAt : null)
    };
    
    Object.keys(stepDates).forEach(step => {
        const dateElement = document.getElementById(`step-${step}-date`);
        if (dateElement) {
            const date = stepDates[step];
            if (date) {
                try {
                    let dateObj;
                    if (date.toDate) {
                        dateObj = date.toDate();
                    } else if (date instanceof Date) {
                        dateObj = date;
                    } else {
                        dateObj = new Date(date);
                    }
                    dateElement.textContent = formatDate(dateObj);
                } catch (e) {
                    console.error("Error formatting date for step", step, e);
                    dateElement.textContent = 'Date not available';
                }
            } else {
                dateElement.textContent = 'Ordered';
            }
        }
    });
}

function formatDate(date) {
    if (!date) return 'N/A';
    
    try {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
        if (isNaN(date.getTime())) {
            return 'Invalid date';
        }
        
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (e) {
        console.error("Error formatting date:", e);
        return 'N/A';
    }
}

function updateProgressBar(status) {
    const progressBar = document.getElementById('order-progress-bar');
    if (!progressBar) return;
    
    // Remove all existing progress classes
    progressBar.classList.remove('step-0', 'step-25', 'step-50', 'step-75', 'step-100');
    
    // Map status to CSS class
    const progressClassMap = {
        'ordered': 'step-0',
        'confirmed': 'step-25',
        'processing': 'step-25',
        'shipped': 'step-50',
        'out-for-delivery': 'step-75',
        'out for delivery': 'step-75',
        'delivered': 'step-100'
    };
    
    const progressClass = progressClassMap[status] || 'step-0';
    progressBar.classList.add(progressClass);
}

window.addEventListener('resize', function() {
    const status = document.querySelector('.status-step.active .step-label')?.textContent?.toLowerCase();
    if (status) {
        updateProgressBar(status);
    }
});

function handleResize() {
    const activeStep = document.querySelector('.status-step.active');
    if (activeStep) {
        const stepId = activeStep.id;
        let status = '';
        
        if (stepId.includes('ordered')) status = 'ordered';
        else if (stepId.includes('confirmed')) status = 'confirmed';
        else if (stepId.includes('shipped')) status = 'shipped';
        else if (stepId.includes('out-for-delivery')) status = 'out-for-delivery';
        else if (stepId.includes('delivered')) status = 'delivered';
        
        if (status) {
            updateProgressBar(status);
        }
    }
}

window.addEventListener('resize', handleResize);

function updateStatusTimeline(orderData) {
    const status = orderData.status || 'ordered';
    
    const statuses = ['ordered', 'confirmed', 'shipped', 'out-for-delivery', 'delivered'];
    
    statuses.forEach((step) => {
        const stepElement = document.getElementById(`step-${step}`);
        if (stepElement) {
            stepElement.classList.remove('completed', 'active');
        }
    });
    
    let activeStepIndex = -1;
    
    switch(status.toLowerCase()) {
        case 'ordered':
            activeStepIndex = 0;
            break;
        case 'confirmed':
        case 'processing':
            activeStepIndex = 1;
            break;
        case 'shipped':
            activeStepIndex = 2;
            break;
        case 'out-for-delivery':
            activeStepIndex = 3;
            break;
        case 'delivered':
            activeStepIndex = 4;
            break;
        default:
            activeStepIndex = 0;
    }
    
    for (let i = 0; i <= activeStepIndex; i++) {
        const stepElement = document.getElementById(`step-${statuses[i]}`);
        if (stepElement) {
            stepElement.classList.add('completed');
        }
    }
    
    if (activeStepIndex >= 0) {
        const activeStepElement = document.getElementById(`step-${statuses[activeStepIndex]}`);
        if (activeStepElement) {
            activeStepElement.classList.add('active');
        }
    }
    
    updateProgressBar(status);
}

function searchOrderByNumber(orderNumber) {
    const db = firebase.firestore();
    
    const cleanOrderNumber = orderNumber.replace('#', '').toUpperCase();
    
    db.collection("users").doc(currentUser.uid).collection("orders")
        .where("orderNumber", "==", cleanOrderNumber)
        .get()
        .then((querySnapshot) => {
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                const orderData = doc.data();
                orderData.id = doc.id;
                displayOrderTrackingData(orderData);
            } else {
                searchAllOrders(orderNumber);
            }
        })
        .catch((error) => {
            console.error("Error searching by order number:", error);
            searchAllOrders(orderNumber);
        });
}

function searchAllOrders(searchTerm) {
    const db = firebase.firestore();
    
    db.collection("users").doc(currentUser.uid).collection("orders").get()
        .then((querySnapshot) => {
            let foundOrder = null;
            let foundOrderId = null;
            
            querySnapshot.forEach((doc) => {
                const orderData = doc.data();
                
                if (doc.id === searchTerm || 
                    doc.id.includes(searchTerm) ||
                    (orderData.orderNumber && orderData.orderNumber.includes(searchTerm)) ||
                    (orderData.orderId && orderData.orderId.includes(searchTerm)) ||
                    (orderData.id && orderData.id === searchTerm)) {
                    
                    foundOrder = orderData;
                    foundOrderId = doc.id;
                }
            });
            
            if (foundOrder) {
                foundOrder.id = foundOrderId;
                displayOrderTrackingData(foundOrder);
            } else {
                showTrackingError("Order not found. Please check your order ID.");
            }
        })
        .catch((error) => {
            console.error("Error searching all orders:", error);
            showTrackingError("Error loading order: " + error.message);
        });
}

function loadFooter() {
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        fetch("footer.html")
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.text();
            })
            .then(html => {
                footerPlaceholder.innerHTML = html;
                console.log('Footer loaded successfully');
            })
            .catch(err => {
                console.error("Footer load failed", err);
                // Create a simple fallback footer
                footerPlaceholder.innerHTML = `
                `;
            });
    }
}

function displayOrderTrackingData(orderData) {
    if (!orderData) {
        showTrackingError("No order data available");
        return;
    }
    
    const orderIdElement = document.getElementById('tracking-order-id');
    const orderDateElement = document.getElementById('tracking-order-date');
    const orderTotalElement = document.getElementById('tracking-order-total');
    
    // Use the helper function to get display order ID
    const displayOrderId = getDisplayOrderId(orderData);
    orderIdElement.textContent = displayOrderId;
    
    let orderDate;
    if (orderData.createdAt) {
        if (orderData.createdAt.toDate) {
            orderDate = orderData.createdAt.toDate();
        } else if (orderData.createdAt instanceof Date) {
            orderDate = orderData.createdAt;
        } else {
            orderDate = new Date(orderData.createdAt);
        }
    } else if (orderData.orderDate) {
        if (orderData.orderDate.toDate) {
            orderDate = orderData.orderDate.toDate();
        } else if (orderData.orderDate instanceof Date) {
            orderDate = orderData.orderDate;
        } else {
            orderDate = new Date(orderData.orderDate);
        }
    } else if (orderData.timestamp) {
        if (orderData.timestamp.toDate) {
            orderDate = orderData.timestamp.toDate();
        } else if (orderData.timestamp instanceof Date) {
            orderDate = orderData.timestamp;
        } else {
            orderDate = new Date(orderData.timestamp);
        }
    } else {
        orderDate = new Date();
    }
    
    orderDateElement.textContent = formatDate(orderDate);
    
    if (orderTotalElement) {
        if (orderData.total !== undefined && orderData.total !== null) {
            orderTotalElement.textContent = `₹${parseFloat(orderData.total).toFixed(2)}`;
        } else {
            orderTotalElement.textContent = '₹0.00';
        }
    }
    
    updateStatusTimeline(orderData);
    updateStepDates(orderData);
    const status = orderData.status || 'ordered';
    updateProgressBar(status);
    updateOrderDetails(orderData);
}

function showStepNotification(step, date) {
    const toast = document.createElement('div');
    toast.className = 'step-toast';
    toast.innerHTML = `
        <strong>${step}</strong><br>
        <small>${date}</small>
    `;
    
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #5f2b27;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: fadeInUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOutDown 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function updateOrderDetails(orderData) {
    const itemsContainer = document.getElementById('tracking-items-list');
    const subtotalElement = document.getElementById('tracking-subtotal');
    const shippingElement = document.getElementById('tracking-shipping');
    const totalElement = document.getElementById('tracking-total');
    const estimatedDeliveryElement = document.getElementById('tracking-estimated-delivery');
    
    if (!itemsContainer) {
        console.error("Items container not found!");
        return;
    }
    
    itemsContainer.innerHTML = '';
    
    let subtotal = 0;
    
    if (orderData.items && Array.isArray(orderData.items) && orderData.items.length > 0) {
        orderData.items.forEach(item => {
            const product = products.find(p => p.id === item.productId) || 
                          products.find(p => p.id === item.id) || 
                          { 
                              name: item.name || 'Honey Product', 
                              price: item.price || 0, 
                              weight: item.weight || '',
                              image: 'https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022'
                          };
            
            const itemTotal = (item.price || product.price || 0) * (item.quantity || 1);
            subtotal += itemTotal;
            
            const itemHTML = `
                <div class="tracking-item-card">
                    <div class="tracking-item-img">
                        <img src="${product.image}" alt="${product.name}" 
                             onerror="this.src='https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022'">
                    </div>
                    <div class="tracking-item-details">
                        <div class="tracking-item-name">${product.name}</div>
                        <div class="tracking-item-meta">
                            <span>${product.weight || ''}</span>
                            <span>•</span>
                            <span>Qty: ${item.quantity || 1}</span>
                        </div>
                        <div class="tracking-item-price">₹${itemTotal.toFixed(2)}</div>
                    </div>
                </div>
            `;
            itemsContainer.innerHTML += itemHTML;
        });
    }
    
    if (subtotalElement) {
        subtotalElement.textContent = `₹${subtotal.toFixed(2)}`;
    }
    
    const shipping = orderData.shipping || orderData.shippingCost || 0;
    if (shippingElement) {
        shippingElement.textContent = `FREE`;
    }
    
    const total = (orderData.total !== undefined && orderData.total !== null) 
        ? parseFloat(orderData.total) 
        : (parseFloat(subtotal) + parseFloat(shipping));
    
    if (totalElement) {
        totalElement.textContent = `₹${total.toFixed(2)}`;
    }
    
    const headerTotalElement = document.getElementById('tracking-order-total');
    if (headerTotalElement) {
        headerTotalElement.textContent = `₹${total.toFixed(2)}`;
    }
    
    if (estimatedDeliveryElement) {
        let orderDate;
        if (orderData.createdAt) {
            orderDate = orderData.createdAt.toDate ? orderData.createdAt.toDate() : new Date(orderData.createdAt);
        } else if (orderData.orderDate) {
            orderDate = orderData.orderDate.toDate ? orderData.orderDate.toDate() : new Date(orderData.orderDate);
        } else {
            orderDate = new Date();
        }
        
        const estimatedDate = new Date(orderDate);
        estimatedDate.setDate(estimatedDate.getDate() + 7);
        
        estimatedDeliveryElement.textContent = estimatedDate.toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
}

function showTrackingError(message) {
    console.error("Tracking Error:", message);
    
    const trackingOrderId = document.getElementById('tracking-order-id');
    const trackingOrderDate = document.getElementById('tracking-order-date');
    
    if (trackingOrderId) trackingOrderId.textContent = 'Error';
    if (trackingOrderDate) trackingOrderDate.textContent = 'N/A';
    
    const itemsContainer = document.getElementById('tracking-order-items');
    if (itemsContainer) {
        itemsContainer.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-circle"></i>
                <div>${message}</div>
            </div>
        `;
    }
    
    const totalElement = document.getElementById('tracking-total');
    if (totalElement) {
        totalElement.textContent = '₹0.00';
    }
    
    if (typeof alert !== 'undefined') {
        setTimeout(() => {
            alert('Tracking Error: ' + message);
        }, 500);
    }
}

function formatDateTime(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function initOrderTracking() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderIdFromUrl = urlParams.get('orderId') || urlParams.get('track');
    
    const orderTrackingSection = document.getElementById('orderTrackingSection');
    
    if (orderIdFromUrl && orderTrackingSection) {
        const mainContent = document.getElementById('mainContent');
        const profilePage = document.getElementById('profilePage');
        
        if (mainContent) mainContent.style.display = 'none';
        if (profilePage) profilePage.classList.remove('active');
        
        orderTrackingSection.classList.add('active');
        
        const cleanOrderId = orderIdFromUrl.replace('#', '');
        loadOrderTrackingData(cleanOrderId);
    }
}

function updateUIForUser(user) {
    userIcon.classList.add('logged-in');
    profileLink.style.display = 'block';
    
    const userNameElement = document.getElementById('user-name');
    const userEmailElement = document.getElementById('user-email');
    const editNameElement = document.getElementById('edit-name');
    const editEmailElement = document.getElementById('edit-email');
    const memberSinceElement = document.getElementById('member-since');
    
    if (userNameElement) userNameElement.textContent = user.displayName || 'User';
    if (userEmailElement) userEmailElement.textContent = user.email;
    if (editNameElement) editNameElement.value = user.displayName || '';
    if (editEmailElement) editEmailElement.value = user.email;
    
    if (memberSinceElement) {
        const memberSince = user.metadata.creationTime;
        memberSinceElement.textContent = new Date(memberSince).toLocaleDateString();
    }
}

function updateUIForGuest() {
    userIcon.classList.remove('logged-in');
    profileLink.style.display = 'block';
    
    const userNameElement = document.getElementById('user-name');
    const userEmailElement = document.getElementById('user-email');
    
    if (userNameElement) userNameElement.textContent = 'User Name';
    if (userEmailElement) userEmailElement.textContent = 'user@example.com';
}

function loadUserProfileData(userId) {
    loadUserAddresses(userId);
    EditProfile();

    const ordersContainer = document.getElementById('orders-container');
    if (ordersContainer) {
        db.collection('users').doc(userId).collection('orders').get()
            .then((querySnapshot) => {
                ordersContainer.innerHTML = '';
                userOrders = [];
                
                if (querySnapshot.empty) {
                    ordersContainer.innerHTML = `
                        <div class="no-orders">
                            <i class="fas fa-shopping-bag"></i>
                            <h3>No Orders Yet</h3>
                            <p>You haven't placed any orders yet. Start shopping to see your order history here.</p>
                            <button class="btn" onclick="window.location.href='shop.html'">Browse Products</button>
                        </div>
                    `;
                    return;
                }
                
                querySnapshot.forEach((doc) => {
                    const order = doc.data();
                    order.id = doc.id;
                    userOrders.push(order);
                    displayOrder(order);
                });
            })
            .catch((error) => {
                console.error("Error loading orders:", error);
                ordersContainer.innerHTML = `
                    <div class="no-orders">
                        <i class="fas fa-exclamation-circle"></i>
                        <h3>Error Loading Orders</h3>
                        <p>${error.message}</p>
                        <button class="btn" onclick="loadUserProfileData('${userId}')">Try Again</button>
                    </div>
                `;
            });
    }
}

function displayOrder(order) {
    const ordersContainer = document.getElementById('orders-container');
    if (!ordersContainer) return;
    
    const noOrdersState = ordersContainer.querySelector('.no-orders');
    if (noOrdersState) {
        noOrdersState.remove();
    }
    
    const orderCard = document.createElement('div');
    orderCard.className = 'order-card compact';
    
    const orderId = order.id || order.orderId;
    
    let status = order.status || 'ordered';
    let statusLower = status.toLowerCase();
    const isCancelled = statusLower.includes('cancelled');
    
    let statusClass = 'status-ordered';
    let statusDisplayText = status.charAt(0).toUpperCase() + status.slice(1);
    
    if (statusLower.includes('ordered')) {
        statusClass = 'status-ordered';
        statusDisplayText = 'ordered';
    } else if (statusLower.includes('confirmed') || statusLower.includes('processing')) {
        statusClass = 'status-confirmed';
        statusDisplayText = 'Confirmed';
    } else if (statusLower.includes('shipped')) {
        statusClass = 'status-shipped';
        statusDisplayText = 'Shipped';
    } else if (statusLower.includes('out for delivery') || statusLower.includes('out-for-delivery')) {
        statusClass = 'status-out-for-delivery';
        statusDisplayText = 'Out for Delivery';
    } else if (statusLower.includes('delivered')) {
        statusClass = 'status-delivered';
        statusDisplayText = 'Delivered';
    } else if (isCancelled) {
        statusClass = 'status-cancelled';
        statusDisplayText = 'Cancelled';
        orderCard.classList.add('cancelled-order');
    }
    
    const orderDate = order.createdAt ? 
        (order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt)) : 
        new Date();
    
    let previewItemsHTML = '';
    if (order.items && Array.isArray(order.items)) {
        const firstItem = order.items[0];
        const product = products.find(p => p.id === firstItem.productId);
        
        if (product) {
            previewItemsHTML = `
                <div class="order-preview">
                    <div class="preview-item">
                        <div class="preview-image" style="${isCancelled ? 'opacity: 0.7;' : ''}">
                            <img src="${product.image}" alt="${product.name}" loading="lazy"
                                 onerror="this.src='https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022'"
                                 style="${isCancelled ? 'opacity: 0.7;' : ''}">
                        </div>
                        <div class="preview-details">
                            <span class="preview-name" style="${isCancelled ? 'opacity: 0.7;' : ''}">${product.name}</span>
                            <div class="preview-meta" style="${isCancelled ? 'opacity: 0.7;' : ''}">
                                <span class="preview-weight">${product.weight}</span>
                                <span>•</span>
                                <span class="preview-qty">Qty: ${firstItem.quantity || 1}</span>
                            </div>
                        </div>
                    </div>
                    ${order.items.length > 1 ? 
                        `<div class="preview-more" style="${isCancelled ? 'opacity: 0.7;' : ''}">
                            +${order.items.length - 1} more item${order.items.length > 2 ? 's' : ''}
                        </div>` 
                        : ''}
                </div>
            `;
        }
    }
    
    // Use the helper function to get display order ID
    const displayOrderId = getDisplayOrderId(order);
    
    // Create action buttons based on order status
    let actionButtonsHTML = '';
    if (isCancelled) {
        actionButtonsHTML = `
            <button class="btn btn-outline contact-support-btn" onclick="window.location.href='contact.html'}">
                <i class="fas fa-headset"></i>
                <span class="action-text">Contact Support</span>
            </button>
            <button class="btn btn-sm reorder-btn" data-id="${orderId}">
                <i class="fas fa-redo"></i>
                <span class="action-text">Reorder</span>
            </button>
        `;
    } else {
        actionButtonsHTML = `
            <button class="btn btn-outline btn-sm track-order-btn" data-id="${orderId}">
                <i class="fas fa-truck"></i>
                <span class="action-text">Track</span>
            </button>
            <button class="btn btn-sm reorder-btn" data-id="${orderId}">
                <i class="fas fa-redo"></i>
                <span class="action-text">Reorder</span>
            </button>
        `;
    }
    
    // Add strike-through styling ONLY for total amount in cancelled orders
    const totalAmountStyle = isCancelled ? 'text-decoration: line-through; opacity: 0.7;' : '';
    
    // Hide status badge for cancelled orders (remove status from right)
    const statusBadgeHTML = isCancelled ? 
    `<span class="order-status-badge ${statusClass}">${statusDisplayText}</span>` : 
    `<span class="order-status-badge ${statusClass}">${statusDisplayText}</span>`;
    
    orderCard.innerHTML = `
        <div class="order-header-compact" style="${isCancelled ? 'opacity: 0.8;' : ''}">
            <div class="order-info-row">
                <div class="order-id-date">
                    <span class="order-id-small">${displayOrderId}</span>
                    <span class="order-date-small">${orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                ${statusBadgeHTML}
            </div>
        </div>
        ${previewItemsHTML}
        <div class="order-footer-compact">
            <div class="order-total-compact">
                <span class="total-label" style="${isCancelled ? 'opacity: 0.7;' : ''}">Total:</span>
                <span class="total-amount" style="${totalAmountStyle}">₹${order.total ? order.total.toFixed(2) : '0.00'}</span>
            </div>
            <div class="order-actions-compact" style="${isCancelled ? 'opacity: 0.9;' : ''}">
                ${actionButtonsHTML}
            </div>
        </div>
    `;
    
    ordersContainer.appendChild(orderCard);
    
    // Add event listeners for BOTH cancelled and non-cancelled orders
    setTimeout(() => {
        // For cancelled orders, only add reorder button listener
        if (isCancelled) {
            const reorderBtn = orderCard.querySelector('.reorder-btn');
            const contactSupportBtn = orderCard.querySelector('.contact-support-btn');
            
            if (reorderBtn) {
                reorderBtn.addEventListener('click', function() {
                    reorderItems(order.items || []);
                });
            }
            
            // Fix contact support button onclick
            if (contactSupportBtn) {
                // Remove existing onclick and add proper event listener
                contactSupportBtn.removeAttribute('onclick');
                contactSupportBtn.addEventListener('click', function() {
                    window.location.href = 'contact.html';
                });
            }
        } else {
            // For non-cancelled orders, add both track and reorder listeners
            const trackBtn = orderCard.querySelector('.track-order-btn');
            const reorderBtn = orderCard.querySelector('.reorder-btn');
            
            if (trackBtn) {
                trackBtn.addEventListener('click', function() {
                    showOrderTracking(orderId);
                });
            }
            
            if (reorderBtn) {
                reorderBtn.addEventListener('click', function() {
                    reorderItems(order.items || []);
                });
            }
        }
    }, 100);
}

function reorderItems(items) {
    items.forEach(item => {
        addToCart(item.productId, item.quantity);
    });
    alert('Items added to cart!');
}

function loadUserAddresses(userId) {
    const addressesContainer = document.getElementById('addresses-container');
    if (!addressesContainer) {
        return;
    }
    
    addressesContainer.innerHTML = '<div class="loading">Loading addresses...</div>';
    
    setTimeout(() => {
        db.collection('users').doc(userId).collection('addresses')
            .orderBy('createdAt', 'desc')
            .get()
            .then((querySnapshot) => {
                addressesContainer.innerHTML = '';
                
                if (querySnapshot.empty) {
                    addressesContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-map-marker-alt"></i> No addresses saved
                        </div>
                    `;
                    return;
                }
                
                querySnapshot.forEach((doc) => {
                    const address = doc.data();
                    displayAddress(doc.id, address);
                });
            })
            .catch((error) => {
                console.error("Error loading addresses:", error);
                
                if (error.code === 'permission-denied') {
                    addressesContainer.innerHTML = `
                        <div class="error-state">
                            <i class="fas fa-shield-alt"></i>
                            <h3>Permission Denied</h3>
                            <p>Please check Firebase Firestore rules</p>
                            <button class="btn btn-sm" onclick="loadUserAddresses('${userId}')">Retry</button>
                        </div>
                    `;
                } else {
                    addressesContainer.innerHTML = `
                        <div class="error-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <h3>Error loading addresses</h3>
                            <p>${error.message}</p>
                            <button class="btn btn-sm" onclick="loadUserAddresses('${userId}')">Retry</button>
                        </div>
                    `;
                }
            });
    }, 100);
}

function displayAddress(addressId, address) {
    const addressesContainer = document.getElementById('addresses-container');
    if (!addressesContainer) {
        return;
    }
    
    const loadingState = addressesContainer.querySelector('.loading, .empty-state, .error-state');
    if (loadingState) {
        loadingState.remove();
    }
    
    const addressCard = document.createElement('div');
    addressCard.className = 'address-card';
    addressCard.innerHTML = `
        <div class="address-header">
            <h3>
                ${address.label || 'Address'}
                ${address.isDefault ? '<span class="default-badge">Default</span>' : ''}
            </h3>
            <span class="address-pincode">Pincode: ${address.pincode || 'N/A'}</span>
        </div>
        <div class="address-details">
            <p><strong>${address.name || 'No name'}</strong></p>
            <p><strong>Address:</strong> ${address.address || 'No address provided'}</p>
            <p><strong>City:</strong> ${address.city || 'N/A'}</p>
            <p><strong>State:</strong> ${address.state || 'N/A'}</p>
            <p><strong>Country:</strong> ${address.country || 'India'}</p>
            <p><strong>Phone:</strong> ${address.phone || 'N/A'}</p>
        </div>
        <div class="address-actions">
            ${!address.isDefault ? `
                <button class="btn btn-sm set-default-address-btn" data-id="${addressId}">
                    <i class="fas fa-star"></i> Set Default
                </button>
            ` : ''}
            <button class="btn btn-sm edit-address-btn" data-id="${addressId}">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-sm btn-danger delete-address-btn" data-id="${addressId}">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
        <div class="address-form edit-address-form" id="edit-address-form-${addressId}" style="display: none;">
            <h4>Edit Address</h4>
            <div class="form-row">
                <div class="form-group">
                    <label for="edit-label-${addressId}">Address Label</label>
                    <input type="text" id="edit-label-${addressId}" value="${address.label || ''}" placeholder="Home, Work, etc.">
                </div>
                <div class="form-group">
                    <label for="edit-pincode-${addressId}">Pincode</label>
                    <input type="text" id="edit-pincode-${addressId}" value="${address.pincode || ''}" maxlength="6">
                </div>
            </div>
            <div class="form-group">
                <label for="edit-name-${addressId}">Full Name</label>
                <input type="text" id="edit-name-${addressId}" value="${address.name || ''}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="edit-country-${addressId}">Country</label>
                    <select id="edit-country-${addressId}" required>
                        <option value="">Select Country</option>
                        <option value="India" ${address.country === 'India' ? 'selected' : ''}>India</option>
                        <option value="United States" ${address.country === 'United States' ? 'selected' : ''}>United States</option>
                        <option value="United Kingdom" ${address.country === 'United Kingdom' ? 'selected' : ''}>United Kingdom</option>
                        <option value="Canada" ${address.country === 'Canada' ? 'selected' : ''}>Canada</option>
                        <option value="Australia" ${address.country === 'Australia' ? 'selected' : ''}>Australia</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="edit-state-${addressId}">State</label>
                    <select id="edit-state-${addressId}" required>
                        <option value="">Select State</option>
                        <option value="Kerala" ${address.state === 'Kerala' ? 'selected' : ''}>Kerala</option>
                        <option value="Tamil Nadu" ${address.state === 'Tamil Nadu' ? 'selected' : ''}>Tamil Nadu</option>
                        <option value="Karnataka" ${address.state === 'Karnataka' ? 'selected' : ''}>Karnataka</option>
                        <option value="Maharashtra" ${address.state === 'Maharashtra' ? 'selected' : ''}>Maharashtra</option>
                        <option value="Delhi" ${address.state === 'Delhi' ? 'selected' : ''}>Delhi</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="edit-city-${addressId}">City</label>
                    <input type="text" id="edit-city-${addressId}" value="${address.city || ''}" placeholder="Enter city" required>
                </div>
                <div class="form-group">
                    <label for="edit-phone-${addressId}">Phone</label>
                    <input type="text" id="edit-phone-${addressId}" value="${address.phone || ''}" maxlength="10">
                </div>
            </div>
            <div class="form-group">
                <label for="edit-address-${addressId}">Address</label>
                <textarea id="edit-address-${addressId}" rows="3">${address.address || ''}</textarea>
            </div>
            <div class="form-actions">
                <button class="btn save-edit-address-btn" data-id="${addressId}">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button class="btn btn-outline cancel-edit-address-btn" data-id="${addressId}">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    addressesContainer.appendChild(addressCard);
    
    attachAddressEventListeners(addressId);
}

function closeAllSidebars() {
    likesSidebar.classList.remove('active');
    cartSidebar.classList.remove('active');
    loginModal.classList.remove('active');
    
    const filterSidebar = document.getElementById('filterSidebar');
    if (filterSidebar) {
        filterSidebar.classList.remove('active');
    }
    
    const quickViewModal = document.getElementById('quickViewModal');
    if (quickViewModal) {
        quickViewModal.style.display = 'none';
    }
    
    const reviewModal = document.getElementById('reviewModal');
    if (reviewModal) {
        reviewModal.style.display = 'none';
    }
    
    const orderTrackingSection = document.getElementById('orderTrackingSection');
    if (orderTrackingSection) {
        orderTrackingSection.classList.remove('active');
    }
    
    navLinks.classList.remove('active');
    userDropdown.classList.remove('active');
    
    const icon = mobileMenuBtn.querySelector('i');
    icon.classList.remove('fa-times');
    icon.classList.add('fa-bars');
    
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
}

mobileMenuBtn.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : 'auto';
    
    const icon = mobileMenuBtn.querySelector('i');
    if (navLinks.classList.contains('active')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
    } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    }
});

document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        const icon = mobileMenuBtn.querySelector('i');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
    });
});

overlay.addEventListener('click', () => {
    closeAllSidebars();
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
});

userIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentUser) {
        userDropdown.classList.toggle('active');
    } else {
        closeAllSidebars();
        showLoginView();
        loginModal.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
});

document.addEventListener('click', () => {
    userDropdown.classList.remove('active');
});

profileLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    userDropdown.classList.remove('active');
    if (currentUser) {
        const profilePage = document.getElementById('profilePage');
        const mainContent = document.getElementById('mainContent');
        if (profilePage && mainContent) {
            mainContent.style.display = 'none';
            profilePage.classList.add('active');
            loadUserProfileData(currentUser.uid);
        } else {
            alert('Profile page would open here');
        }
    } else {
        closeAllSidebars();
        showLoginView();
        loginModal.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
});

logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
        userDropdown.classList.remove('active');
    auth.signOut().then(() => {
        alert('You have been logged out successfully!');
    }).catch((error) => {
        console.error("Error signing out:", error);
    });
});

likeIcon.addEventListener('click', () => {
    closeAllSidebars();
    likesSidebar.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
});

closeLikes.addEventListener('click', () => {
    closeAllSidebars();
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
});

function updateLikeUI() {
    if (likedProducts.length > 0) {
        likeCount.textContent = likedProducts.length;
        likeCount.classList.remove('hidden');
    } else {
        likeCount.classList.add('hidden');
    }
    
    if (likedProducts.length === 0) {
        emptyLikes.style.display = 'flex';
        likesItems.innerHTML = '';
    } else {
        emptyLikes.style.display = 'none';
        likesItems.innerHTML = '';
        
        likedProducts.forEach(productId => {
            const product = products.find(p => p.id === productId);
            if (product) {
                const likeItem = document.createElement('div');
                likeItem.className = 'like-item';
                
                // Check if product is out of stock
                const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
                const isOutOfStock = productCard ? productCard.getAttribute('data-out-of-stock') === 'true' : false;
                
                // Determine button text and classes based on stock status
                const addToCartText = isOutOfStock ? 'Out of Stock' : 'Add to Cart';
                const addToCartClass = isOutOfStock ? 'add-to-cart-btn out-of-stock-btn' : 'add-to-cart-btn';
                const addToCartDisabled = isOutOfStock ? 'disabled' : '';
                
                likeItem.innerHTML = `
                    <img src="${product.image}" alt="${product.name}">
                    <div class="like-item-details">
                        <div class="like-item-title">${product.name}</div>
                        <div class="like-item-price">₹${product.price.toFixed(2)}</div>
                        <div class="like-item-actions">
                            <button class="${addToCartClass}" data-id="${productId}" ${addToCartDisabled}>
                                ${addToCartText} <!-- REMOVED: <i class="fas fa-cart-plus"></i> -->
                            </button>
                            <button class="remove-like" data-id="${productId}">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                `;
                likesItems.appendChild(likeItem);
            }
        });
        
        document.querySelectorAll('.remove-like').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = parseInt(e.currentTarget.getAttribute('data-id'));
                removeFromLikes(productId);
            });
        });
        
        document.querySelectorAll('.likes-items .add-to-cart-btn:not(.out-of-stock-btn)').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = parseInt(e.currentTarget.getAttribute('data-id'));
                addToCart(productId, 1);
            });
        });
    }
}

function addToLikes(productId) {
    if (!likedProducts.includes(productId)) {
        likedProducts.push(productId);
        
        localStorage.setItem('guestLikes', JSON.stringify(likedProducts));
        
        updateLikeUI();
        
        const heartIcon = likeIcon.querySelector('i');
        heartIcon.classList.remove('far');
        heartIcon.classList.add('fas');
        heartIcon.style.color = '#ff4d4d';
        
        closeAllSidebars();
        likesSidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function removeFromLikes(productId) {
    likedProducts = likedProducts.filter(id => id !== productId);
    
    localStorage.setItem('guestLikes', JSON.stringify(likedProducts));
    
    updateLikeUI();
    
    if (likedProducts.length === 0) {
        const heartIcon = likeIcon.querySelector('i');
        heartIcon.classList.remove('fas');
        heartIcon.classList.add('far');
        heartIcon.style.color = '';
    }
}

cartIcon.addEventListener('click', () => {
    closeAllSidebars();
    cartSidebar.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
});

closeCart.addEventListener('click', () => {
    closeAllSidebars();
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
});

function updateCartUI() {
    const totalItems = cartProducts.reduce((total, item) => total + item.quantity, 0);
    
    if (totalItems > 0) {
        cartCount.textContent = totalItems;
        cartCount.classList.remove('hidden');
    } else {
        cartCount.classList.add('hidden');
    }
    
    if (cartProducts.length === 0) {
        emptyCart.style.display = 'flex';
        cartItems.innerHTML = '';
        cartSummary.style.display = 'none';
    } else {
        emptyCart.style.display = 'none';
        cartItems.innerHTML = '';
        cartSummary.style.display = 'block';
        
        let subtotal = 0;
        
        cartProducts.forEach(item => {
            const product = products.find(p => p.id === item.id);
            if (product) {
                const itemTotal = product.price * item.quantity;
                subtotal += itemTotal;
                
                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item';
                cartItem.innerHTML = `
                    <img src="${product.image}" alt="${product.name}">
                    <div class="cart-item-details">
                        <div class="cart-item-title">${product.name}</div>
    <div class="cart-item-price">₹${product.price.toFixed(2)}</div>
    <div class="cart-item-controls">
                            <div class="cart-item-quantity">
                                <button class="quantity-btn minus" data-id="${product.id}">-</button>
                                <input type="text" class="quantity-input" value="${item.quantity}" data-id="${product.id}">
                                <button class="quantity-btn plus" data-id="${product.id}">+</button>
                            </div>
                            <button class="delete-item" data-id="${product.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
                cartItems.appendChild(cartItem);
            }
        });
        
        const cartSubtotal = document.querySelector('.cart-subtotal span:last-child');
        const cartTotal = document.querySelector('.cart-total span:last-child');
        
      if (cartSubtotal) cartSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
if (cartTotal) cartTotal.textContent = `₹${subtotal.toFixed(2)}`;
        
        document.querySelectorAll('.quantity-btn.minus').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = parseInt(e.currentTarget.getAttribute('data-id'));
                updateCartQuantity(productId, -1);
            });
        });
        
        document.querySelectorAll('.quantity-btn.plus').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = parseInt(e.currentTarget.getAttribute('data-id'));
                updateCartQuantity(productId, 1);
            });
        });
        
        document.querySelectorAll('.delete-item').forEach(button => {
            button.addEventListener('click', (e) => {
                const productId = parseInt(e.currentTarget.getAttribute('data-id'));
                removeFromCart(productId);
            });
        });
        
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const productId = parseInt(e.currentTarget.getAttribute('data-id'));
                const newQuantity = parseInt(e.currentTarget.value) || 1;
                setCartQuantity(productId, newQuantity);
            });
        });
    }
    
    // Update checkout order summary if on checkout page
    if (document.querySelector('.checkout-section') && typeof window.updateOrderSummary === 'function') {
        window.updateOrderSummary();
        if (typeof window.refreshPromoCodes === 'function') {
            window.refreshPromoCodes();
        }
    }
}

// Find this function in common.js and update it:
function addToCart(productId, quantity = 1) {
    // Check if product is out of stock
    const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
    const isOutOfStock = productCard ? productCard.getAttribute('data-out-of-stock') === 'true' : false;
    
    // Also check the likes sidebar for out-of-stock status
    const likeItem = document.querySelector(`.like-item .add-to-cart-btn[data-id="${productId}"]`);
    const isOutOfStockInLikes = likeItem ? likeItem.classList.contains('out-of-stock-btn') : false;
    
    if (isOutOfStock || isOutOfStockInLikes) {
        alert('This product is currently out of stock!');
        return; // Don't add to cart if out of stock
    }
    
    const existingItem = cartProducts.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cartProducts.push({ id: productId, quantity });
    }
    
    localStorage.setItem('guestCart', JSON.stringify(cartProducts));
    
    updateCartUI();
    addCartVisualFeedback();
    
    closeAllSidebars();
    cartSidebar.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function addCartVisualFeedback() {
    cartIcon.classList.add('cart-icon-bounce');
    cartCount.classList.add('badge-pulse');
    
    setTimeout(() => {
        cartIcon.classList.remove('cart-icon-bounce');
        cartCount.classList.remove('badge-pulse');
    }, 600);
}

function updateCartQuantity(productId, change) {
    const item = cartProducts.find(item => item.id === productId);
    
    if (item) {
        item.quantity += change;
        
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            localStorage.setItem('guestCart', JSON.stringify(cartProducts));
            
            updateCartUI();
        }
    }
}

function setCartQuantity(productId, quantity) {
    const item = cartProducts.find(item => item.id === productId);
    
    if (item) {
        if (quantity <= 0) {
            removeFromCart(productId);
        } else {
            item.quantity = quantity;
            
            localStorage.setItem('guestCart', JSON.stringify(cartProducts));
            
            updateCartUI();
        }
    }
}

function removeFromCart(productId) {
    cartProducts = cartProducts.filter(item => item.id !== productId);
    
    localStorage.setItem('guestCart', JSON.stringify(cartProducts));
    
    updateCartUI();
}

whatsappIcon.addEventListener('click', () => {
    const phoneNumber = "919495928394"; 
    const message = "Hello, I'm interested in your honey products!";
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
});

closeLogin.addEventListener('click', () => {
    closeAllSidebars();
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
});

backBtn.addEventListener('click', () => {
    showLoginView();
});

function showLoginView() {
    currentModalView = 'login';
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
    forgotForm.classList.remove('active');
    backBtn.classList.remove('active');
    modalTitle.textContent = 'Welcome Back';
    modalSubtitle.textContent = 'Sign in to your account';
    loginFooter.style.display = 'block';
}

function showSignupView() {
    currentModalView = 'signup';
    loginForm.classList.remove('active');
    signupForm.classList.add('active');
    forgotForm.classList.remove('active');
    backBtn.classList.add('active');
    modalTitle.textContent = 'Create Account';
    modalSubtitle.textContent = 'Join Natura Honey today';
    loginFooter.style.display = 'none';
}

function showForgotView() {
    currentModalView = 'forgot';
    loginForm.classList.remove('active');
    signupForm.classList.remove('active');
    forgotForm.classList.add('active');
    backBtn.classList.add('active');
    modalTitle.textContent = 'Reset Password';
    modalSubtitle.textContent = 'Enter your email to reset your password';
    loginFooter.style.display = 'none';
}

loginBtn.addEventListener('click', () => {
    const email = loginForm.querySelector('input[type="email"]').value;
    const password = loginForm.querySelector('input[type="password"]').value;
    
    if (!email || !password) {
        alert('Please fill in all fields');
        return;
    }
    
    auth.signInWithEmailAndPassword(email, password)
    .then(async (userCredential) => {
        const user = userCredential.user;

        await db.collection("users").doc(user.uid).set({
            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
            phone: user.phoneNumber || null
        }, { merge: true });

        closeAllSidebars();
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
        alert('Login successful!');
    })
        .catch((error) => {
            console.error("Error signing in:", error);
            alert('Error signing in: ' + error.message);
        });
});

signupBtn.addEventListener('click', () => {
    const name = signupForm.querySelector('input[type="text"]').value;
    const email = signupForm.querySelector('input[type="email"]').value;
    const password = signupForm.querySelectorAll('input[type="password"]')[0].value;
    const confirmPassword = signupForm.querySelectorAll('input[type="password"]')[1].value;
    
    if (!name || !email || !password || !confirmPassword) {
        alert('Please fill in all fields');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (!termsCheckbox.checked) {
        alert('Please agree to the Terms & Conditions and Privacy Policy');
        return;
    }
    
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            
            return user.updateProfile({
                displayName: name
            }).then(() => {
                return user.sendEmailVerification();
            }).then(() => {
                return db.collection('users').doc(user.uid).set({
                    displayName: name,
                    email: email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
        })
        .then(() => {
            closeAllSidebars();
            overlay.classList.remove('active');
            document.body.style.overflow = 'auto';
            alert('Account created successfully! Please check your email for verification.');
        })
        .catch((error) => {
            console.error("Error creating account:", error);
            alert('Error creating account: ' + error.message);
        });
});

resetBtn.addEventListener('click', () => {
    const email = forgotForm.querySelector('input[type="email"]').value;
    
    if (!email) {
        alert('Please enter your email address');
        return;
    }
    
    auth.sendPasswordResetEmail(email)
        .then(() => {
            closeAllSidebars();
            overlay.classList.remove('active');
            document.body.style.overflow = 'auto';
            alert('Password reset link sent to your email!');
        })
        .catch((error) => {
            console.error("Error sending reset email:", error);
            alert('Error sending reset email: ' + error.message);
        });
});

googleLoginBtn.addEventListener('click', () => {
    if (window.location.protocol !== 'https:' && window.location.protocol !== 'http:' && !window.location.hostname.includes('localhost')) {
        alert('Google login is not supported in this environment. Please use email/password login instead.');
        return;
    }
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        
        auth.signInWithPopup(provider)
            .then(async (result) => {
                const user = result.user;
                
                // Use merge: true to avoid permission issues
                const userRef = db.collection("users").doc(user.uid);
                
                try {
                    // First check if user document exists
                    const userDoc = await userRef.get();
                    
                    if (!userDoc.exists()) {
                        // Document doesn't exist - CREATE it
                        await userRef.set({
                            displayName: user.displayName,
                            email: user.email,
                            phone: user.phoneNumber || null,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        console.log("New user document created");
                    } else {
                        // Document exists - UPDATE it
                        await userRef.set({
                            displayName: user.displayName,
                            email: user.email,
                            lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        console.log("Existing user document updated");
                    }
                    
                    // Close modal
                    closeAllSidebars();
                    overlay.classList.remove('active');
                    document.body.style.overflow = 'auto';
                    
                    // Show success message
                    alert('Google login successful!');
                    
                } catch (error) {
                    console.error("Error with user document:", error);
                    
                    // Even if Firestore fails, continue with auth success
                    closeAllSidebars();
                    overlay.classList.remove('active');
                    document.body.style.overflow = 'auto';
                    
                    alert('Signed in with Google!');
                }
            })
            .catch((error) => {
                console.error("Error with Google login:", error);
                
                if (error.code === 'auth/operation-not-supported-in-this-environment') {
                    alert('Google login is not supported in this environment. Please use email/password login instead.');
                } else if (error.code === 'auth/popup-blocked') {
                    alert('Popup was blocked by your browser. Please allow popups for this site.');
                } else if (error.code === 'auth/cancelled-popup-request') {
                    // User cancelled, no need to show error
                } else {
                    alert('Error with Google login: ' + error.message);
                }
            });
    } catch (error) {
        console.error("Error with Google login:", error);
        alert('Google login is not available in this environment. Please use email/password login instead.');
    }
});

forgotPassword.addEventListener('click', (e) => {
    e.preventDefault();
    showForgotView();
});

signUp.addEventListener('click', (e) => {
    e.preventDefault();
    showSignupView();
});

if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
        if (cartProducts.length === 0) {
            alert('Your cart is empty!');
            return;
        }
        
        localStorage.setItem('checkoutCart', JSON.stringify(cartProducts));
        
        window.location.href = 'checkout.html';
    });
}

if (continueShopping) {
    continueShopping.addEventListener('click', function() {
        window.location.href = "shop.html";
    });
}

browseProducts.addEventListener('click', () => {
    closeAllSidebars();
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
});

function loadGuestData() {
    const guestLikes = localStorage.getItem('guestLikes');
    if (guestLikes) {
        likedProducts = JSON.parse(guestLikes);
        updateLikeUI();
    }
    
    const guestCart = localStorage.getItem('guestCart');
    if (guestCart) {
        cartProducts = JSON.parse(guestCart);
        updateCartUI();
    }
}


// Save new address to user's profile in Firestore - UPDATED for new fields
function saveNewAddressToProfile() {
    const label = document.getElementById('new-label').value.trim();
    const name = document.getElementById('new-name').value.trim();
    const address = document.getElementById('new-address').value.trim();
    const phone = document.getElementById('new-phone').value.trim();
    const pincode = document.getElementById('new-pincode').value.trim();
    const city = document.getElementById('new-city').value.trim();
    const state = document.getElementById('new-state').value;
    const country = document.getElementById('new-country').value;
    
    console.log('Saving new address with data:', { label, name, address, phone, pincode, city, state, country });
    
    if (!label || !name || !address || !phone || !pincode || !city || !state || !country) {
        alert('Please fill in all fields');
        return;
    }
    
    // Validate phone number
    if (phone.length < 10 || !/^\d+$/.test(phone)) {
        alert('Please enter a valid 10-digit phone number');
        return;
    }
    
    // Validate pincode
    if (pincode.length < 6 || !/^\d+$/.test(pincode)) {
        alert('Please enter a valid 6-digit pincode');
        return;
    }
    
    if (!currentUser) {
        alert('Please log in to save addresses');
        showLoginView();
        loginModal.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        return;
    }
    
    const newAddress = {
        label: label,
        name: name,
        address: address,
        phone: phone,
        pincode: pincode,
        city: city,
        state: state,
        country: country,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        isDefault: false
    };
    
    console.log('Saving new address to Firestore:', newAddress);
    
    // Save to Firestore under user's addresses collection
    db.collection('users').doc(currentUser.uid).collection('addresses').add(newAddress)
        .then((docRef) => {
            console.log('Address saved with ID:', docRef.id);
            
            // Refresh addresses display
            const addressesContainer = document.getElementById('addresses-container');
            if (addressesContainer) {
                addressesContainer.innerHTML = '';
                loadUserAddresses(currentUser.uid);
            }
            
            // Reset the form
            const addAddressForm = document.getElementById('add-address-form');
            if (addAddressForm) {
                addAddressForm.style.display = 'none';
            }
            
            // Reset form fields
            document.getElementById('new-label').value = '';
            document.getElementById('new-name').value = '';
            document.getElementById('new-address').value = '';
            document.getElementById('new-phone').value = '';
            document.getElementById('new-pincode').value = '';
            document.getElementById('new-city').value = '';
            document.getElementById('new-state').value = '';
            document.getElementById('new-country').value = 'India';
            
            // Show success message
            showNotification('Address saved successfully!', 'success');
        })
        .catch((error) => {
            console.error("Error adding address:", error);
            showNotification('Error saving address: ' + error.message, 'error');
        });
}

// Save edited address to Firestore - UPDATED for new fields
function saveEditedAddressToFirestore(addressId) {
    const label = document.getElementById(`edit-label-${addressId}`).value.trim();
    const name = document.getElementById(`edit-name-${addressId}`).value.trim();
    const address = document.getElementById(`edit-address-${addressId}`).value.trim();
    const phone = document.getElementById(`edit-phone-${addressId}`).value.trim();
    const pincode = document.getElementById(`edit-pincode-${addressId}`).value.trim();
    const city = document.getElementById(`edit-city-${addressId}`).value.trim();
    const state = document.getElementById(`edit-state-${addressId}`).value;
    const country = document.getElementById(`edit-country-${addressId}`).value;
    
    console.log('Editing address:', addressId, { label, name, address, phone, pincode, city, state, country });
    
    if (!label || !name || !address || !phone || !pincode || !city || !state || !country) {
        alert('Please fill in all fields');
        return;
    }
    
    const updatedAddress = {
        label: label,
        name: name,
        address: address,
        phone: phone,
        pincode: pincode,
        city: city,
        state: state,
        country: country,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('users').doc(currentUser.uid).collection('addresses').doc(addressId).update(updatedAddress)
        .then(() => {
            console.log('Address updated successfully');
            
            // Refresh addresses display
            const addressesContainer = document.getElementById('addresses-container');
            if (addressesContainer) {
                addressesContainer.innerHTML = '';
                loadUserAddresses(currentUser.uid);
            }
            showNotification('Address updated successfully!', 'success');
        })
        .catch((error) => {
            console.error("Error updating address:", error);
            showNotification('Error updating address: ' + error.message, 'error');
        });
}

// Delete address from Firestore
function deleteAddressFromFirestore(addressId) {
    if (!confirm('Are you sure you want to delete this address?')) {
        return;
    }
    
    console.log('Deleting address:', addressId);
    
    db.collection('users').doc(currentUser.uid).collection('addresses').doc(addressId).delete()
        .then(() => {
            console.log('Address deleted successfully');
            
            // Refresh addresses display
            const addressesContainer = document.getElementById('addresses-container');
            if (addressesContainer) {
                addressesContainer.innerHTML = '';
                loadUserAddresses(currentUser.uid);
            }
            showNotification('Address deleted successfully!', 'success');
        })
        .catch((error) => {
            console.error("Error deleting address:", error);
            showNotification('Error deleting address: ' + error.message, 'error');
        });
}

// Set default address - UPDATED to trigger real-time update
function setDefaultAddress(addressId) {
    console.log('Setting default address:', addressId);
    
    // First, remove default from all addresses
    db.collection('users').doc(currentUser.uid).collection('addresses').get()
        .then((querySnapshot) => {
            const batch = db.batch();
            
            querySnapshot.forEach((doc) => {
                const addressRef = db.collection('users').doc(currentUser.uid).collection('addresses').doc(doc.id);
                if (doc.id === addressId) {
                    batch.update(addressRef, { isDefault: true });
                } else {
                    batch.update(addressRef, { isDefault: false });
                }
            });
            
            return batch.commit();
        })
        .then(() => {
            console.log('Default address set successfully');
            
            // Refresh addresses display
            const addressesContainer = document.getElementById('addresses-container');
            if (addressesContainer) {
                addressesContainer.innerHTML = '';
                loadUserAddresses(currentUser.uid);
            }
            showNotification('Default address set successfully!', 'success');
            
            // The real-time listener in loadUserDefaultAddress will automatically update checkout form
        })
        .catch((error) => {
            console.error("Error setting default address:", error);
            showNotification('Error setting default address: ' + error.message, 'error');
        });
}

// Updated attachAddressEventListeners function
function attachAddressEventListeners(addressId) {
    setTimeout(() => {
        // Edit button
        const editBtn = document.querySelector(`.edit-address-btn[data-id="${addressId}"]`);
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                document.getElementById(`edit-address-form-${addressId}`).style.display = 'block';
            });
        }
        
        // Delete button
        const deleteBtn = document.querySelector(`.delete-address-btn[data-id="${addressId}"]`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                deleteAddressFromFirestore(addressId);
            });
        }
        
        // Save edited address button
        const saveBtn = document.querySelector(`.save-edit-address-btn[data-id="${addressId}"]`);
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                saveEditedAddressToFirestore(addressId);
            });
        }
        
        // Cancel edit button
        const cancelBtn = document.querySelector(`.cancel-edit-address-btn[data-id="${addressId}"]`);
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                document.getElementById(`edit-address-form-${addressId}`).style.display = 'none';
            });
        }
        
        // Set default address button
        const setDefaultBtn = document.querySelector(`.set-default-address-btn[data-id="${addressId}"]`);
        if (setDefaultBtn) {
            setDefaultBtn.addEventListener('click', function() {
                setDefaultAddress(addressId);
            });
        }
    }, 100);
}

let lastScrollTop = 0;
window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    if (scrollTop > 5) {
        if (!notificationBar.classList.contains('hidden')) {
            notificationBar.classList.add('hidden');
            navBar.style.top = '0';
            document.querySelector('.content-wrapper').style.marginTop = '130px';
        }
    } else {
        if (notificationBar.classList.contains('hidden')) {
            notificationBar.classList.remove('hidden');
            navBar.style.top = '40px';
            document.querySelector('.content-wrapper').style.marginTop = '165px';
        }
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
}, { passive: true });

function initCommon() {
    addFavicon();
    loadGuestData();
    initOrderTracking();
    loadFooter();
    loadProfile();
        EditProfile();
    
    
        // Profile close button - Use event delegation instead
    document.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'profileCloseBtn') {
            const profilePage = document.getElementById('profilePage');
            const mainContent = document.getElementById('mainContent');
            if (profilePage && mainContent) {
                profilePage.classList.remove('active');
                mainContent.style.display = 'block';
                window.scrollTo(0, 0);
            }
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Also check if the click is on the close icon inside the button
        if (e.target && e.target.closest && e.target.closest('#profileCloseBtn')) {
            const profilePage = document.getElementById('profilePage');
            const mainContent = document.getElementById('mainContent');
            if (profilePage && mainContent) {
                profilePage.classList.remove('active');
                mainContent.style.display = 'block';
                window.scrollTo(0, 0);
            }
            e.preventDefault();
            e.stopPropagation();
        }
    });
    
    function loadProfile() {
    const profilePlaceholder = document.getElementById('profile-placeholder');
    if (profilePlaceholder) {
        fetch("profile.html")
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.text();
            })
            .then(html => {
                profilePlaceholder.innerHTML = html;
                console.log('Profile loaded successfully');
                
                // Setup profile close button AFTER profile is loaded
                setupProfileCloseButton();
            })
            .catch(err => {
                console.error("Profile load failed", err);
                profilePlaceholder.innerHTML = ``;
            });
    }
}


function setupProfileCloseButton() {
    const profileCloseBtn = document.getElementById('profileCloseBtn');
    if (profileCloseBtn) {
        console.log('Setting up profile close button');
        
        // Remove any existing event listeners first
        const newProfileCloseBtn = profileCloseBtn.cloneNode(true);
        profileCloseBtn.parentNode.replaceChild(newProfileCloseBtn, profileCloseBtn);
        
        // Add fresh event listener
        newProfileCloseBtn.addEventListener('click', function(e) {
            console.log('Profile close button clicked');
            const profilePage = document.getElementById('profilePage');
            const mainContent = document.getElementById('mainContent');
            if (profilePage && mainContent) {
                profilePage.classList.remove('active');
                mainContent.style.display = 'block';
                window.scrollTo(0, 0);
            }
            e.preventDefault();
            e.stopPropagation();
        });
    }
}
    
    const orderTrackingCloseBtn = document.getElementById('orderTrackingCloseBtn');
    if (orderTrackingCloseBtn) {
        orderTrackingCloseBtn.addEventListener('click', closeOrderTracking);
    }
    
    const refreshTrackingBtn = document.getElementById('refreshTrackingBtn');
    if (refreshTrackingBtn) {
        refreshTrackingBtn.addEventListener('click', function() {
            const currentOrderId = document.getElementById('tracking-order-id').textContent.replace('#', '');
            if (currentOrderId && currentOrderId !== 'Loading...') {
                loadOrderTrackingData(currentOrderId);
            }
        });
    }
    
    const supportTrackingBtn = document.getElementById('supportTrackingBtn');
    if (supportTrackingBtn) {
        supportTrackingBtn.addEventListener('click', function() {
            window.location.href = 'contact.html';
        });
    }
    
    const addAddressBtn = document.getElementById('add-address-btn');
    const addAddressForm = document.getElementById('add-address-form');
    const cancelNewAddress = document.getElementById('cancel-new-address');
    const saveNewAddress = document.getElementById('save-new-address');
    
    if (addAddressBtn && addAddressForm) {
        addAddressBtn.addEventListener('click', function() {
            addAddressForm.style.display = 'block';
        });
    }
    
    if (cancelNewAddress && addAddressForm) {
        cancelNewAddress.addEventListener('click', function() {
            addAddressForm.style.display = 'none';
            document.getElementById('new-label').value = '';
            document.getElementById('new-name').value = '';
            document.getElementById('new-address').value = '';
            document.getElementById('new-phone').value = '';
            document.getElementById('new-pincode').value = '';
        });
    }
    
    if (saveNewAddress) {
        saveNewAddress.addEventListener('click', saveNewAddressToProfile);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initCommon();
});

function listAllUserOrders() {
    if (!currentUser) {
        console.log("User not logged in");
        return;
    }
    
    const db = firebase.firestore();
    db.collection("users").doc(currentUser.uid).collection("orders").get()
        .then((querySnapshot) => {
            console.log("=== All User Orders ===");
            console.log("Total orders:", querySnapshot.size);
            querySnapshot.forEach((doc) => {
                console.log("\n--- Order Document ---");
                console.log("Document ID:", doc.id);
                console.log("Order Data:", doc.data());
                console.log("Has 'orderNumber' field:", 'orderNumber' in doc.data());
                console.log("Has 'status' field:", 'status' in doc.data());
                console.log("Has 'createdAt' field:", 'createdAt' in doc.data());
            });
        })
        .catch((error) => {
            console.error("Error listing orders:", error);
        });
}

window.listAllUserOrders = listAllUserOrders;

function debugOrderData() {
    if (!currentUser) {
        console.log("User not logged in");
        return;
    }
    
    const db = firebase.firestore();
    db.collection("users").doc(currentUser.uid).collection("orders").get()
        .then((querySnapshot) => {
            console.log("=== DEBUG: All User Orders ===");
            console.log("Total orders:", querySnapshot.size);
            
            querySnapshot.forEach((doc) => {
                console.log("\n--- Order Document ---");
                console.log("Document ID:", doc.id);
                console.log("Order Data:", doc.data());
                console.log("Has 'orderNumber' field:", 'orderNumber' in doc.data());
                console.log("Has 'status' field:", 'status' in doc.data());
                console.log("Has 'createdAt' field:", 'createdAt' in doc.data());
            });
        })
        .catch((error) => {
            console.error("Debug error:", error);
        });
}

window.debugOrderData = debugOrderData;

