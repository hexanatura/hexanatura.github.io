const mainContent = document.getElementById('mainContent');
const profilePage = document.getElementById('profilePage');
const profileCloseBtn = document.getElementById('profileCloseBtn');

// Review Elements
const reviewsContainer = document.getElementById('reviewsContainer');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const carouselDots = document.getElementById('carouselDots');
const addReviewBtn = document.getElementById('addReviewBtn');
const reviewModal = document.getElementById('reviewModal');
const cancelReview = document.getElementById('cancelReview');
const submitReview = document.getElementById('submitReview');
const reviewProduct = document.getElementById('reviewProduct');

// Quick View Modal Elements
const quickViewModal = document.getElementById('quickViewModal');
const quickViewClose = document.getElementById('quickViewClose');
const quickViewImage = document.getElementById('quickViewImage');
const quickViewTitle = document.getElementById('quickViewTitle');
const quickViewPrice = document.getElementById('quickViewPrice');
const quickViewRating = document.getElementById('quickViewRating');
const quickViewWeight = document.getElementById('quickViewWeight');
const quickViewAddToCartBtn = document.querySelector('.quick-view-add-to-cart');
const quickViewWishlistBtn = document.querySelector('.quick-view-wishlist');

// State variables specific to index.html
let currentCarouselIndex = 0;
let approvedReviews = [];
let currentQuickViewProductId = null;
let carouselAutoplayTimer = null;

// Quick View Modal Functionality
quickViewClose.addEventListener('click', closeQuickView);
quickViewModal.addEventListener('click', (e) => {
    if (e.target === quickViewModal) {
        closeQuickView();
    }
});

function closeQuickView() {
    quickViewModal.style.display = 'none';
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// In the quick view initialization, update the add to cart button based on stock status
quickViewAddToCartBtn.addEventListener('click', function() {
    if (currentQuickViewProductId) {
        // Check if product is out of stock
        const productCard = document.querySelector(`.product-card[data-id="${currentQuickViewProductId}"]`);
        const isOutOfStock = productCard ? productCard.getAttribute('data-out-of-stock') === 'true' : false;
        
        if (isOutOfStock) {
            alert('This product is currently out of stock!');
            return;
        }
        
        // Add visual feedback
        this.classList.add('adding');
        
        // Add to cart (this will now auto-open the cart sidebar)
        addToCart(currentQuickViewProductId, 1);
        
        // Remove adding class after animation
        setTimeout(() => {
            this.classList.remove('adding');
        }, 400);
    }
});

// Quick View Wishlist functionality
quickViewWishlistBtn.addEventListener('click', function() {
    if (currentQuickViewProductId) {
        if (likedProducts.includes(currentQuickViewProductId)) {
            removeFromLikes(currentQuickViewProductId);
            updateQuickViewWishlistButton(false);
        } else {
            addToLikes(currentQuickViewProductId); // This will now auto-open the likes sidebar
            updateQuickViewWishlistButton(true);
        }
    }
});

// Update quick view wishlist button state
function updateQuickViewWishlistButton(isLiked) {
    if (isLiked) {
        quickViewWishlistBtn.innerHTML = '<i class="fas fa-heart"></i>';
        quickViewWishlistBtn.style.background = '#ff4d4d';
        quickViewWishlistBtn.style.color = 'white';
    } else {
        quickViewWishlistBtn.innerHTML = '<i class="far fa-heart"></i>';
        quickViewWishlistBtn.style.background = '#f1f1f1';
        quickViewWishlistBtn.style.color = '#333';
    }
}

// Update product card wishlist button state
function updateProductCardWishlistButton(productId, isLiked) {
    const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
    if (productCard) {
        const wishlistBtn = productCard.querySelector('.wishlist-btn');
        if (wishlistBtn) {
            const weight = productCard.querySelector('.product-weight')?.textContent.trim();
            const category = productCard.dataset.category === 'premium' ? ' PET' : '';
            wishlistBtn.classList.toggle('is-active', isLiked);
            wishlistBtn.setAttribute('aria-pressed', String(isLiked));
            wishlistBtn.setAttribute(
                'aria-label',
                `${isLiked ? 'Remove' : 'Add'} Natura Agmark Honey ${weight}${category} ${isLiked ? 'from' : 'to'} wishlist`
            );
            wishlistBtn.innerHTML = `<i class="${isLiked ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i>`;
        }
    }
}

// In index.js, update the addToCart function to check for out-of-stock status

function addToCart(productId, quantity = 1) {
    // Check if product is out of stock
    const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
    const isOutOfStock = productCard ? productCard.getAttribute('data-out-of-stock') === 'true' : false;
    
    if (isOutOfStock) {
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

// Also update the product initialization in initializeProductCards to handle out-of-stock buttons
function initializeProductCards() {
    const productCards = document.querySelectorAll('.product-card');
    
    productCards.forEach((card, index) => {
        // Get the product based on category and position
        let productId;
        const category = card.getAttribute('data-category');
        
        if (category === 'crystal') {
            // Crystal products are first 4 cards (index 0-3)
            productId = index + 1;
        } else {
            // Premium products are last 2 cards (index 4-5)
            productId = index + 1; // This will give IDs 5 and 6
        }
        
        card.setAttribute('data-id', productId);
        
        // Check if product is out of stock
        const isOutOfStock = card.getAttribute('data-out-of-stock') === 'true';
        
        const addToCartBtn = card.querySelector('.add-to-cart-btn');
        
        if (!isOutOfStock) {
            addToCartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                addToCartBtn.classList.add('adding');
                
                // Add to cart (this will now auto-open the cart sidebar)
                addToCart(productId, 1);
                
                setTimeout(() => {
                    addToCartBtn.classList.remove('adding');
                }, 400);
            });
        } else {
            // Disable the button and change text for out of stock products
            addToCartBtn.innerHTML = '<i class="fas fa-ban" aria-hidden="true"></i><span>Out of Stock</span>';
            addToCartBtn.setAttribute('aria-label', 'This product is out of stock');
            addToCartBtn.disabled = true;
            addToCartBtn.style.background = '#ccc';
            addToCartBtn.style.color = '#666';
            addToCartBtn.style.cursor = 'not-allowed';
        }
        
        const wishlistBtn = card.querySelector('.wishlist-btn');
        wishlistBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (likedProducts.includes(productId)) {
                removeFromLikes(productId);
            } else {
                // Add to likes (this will now auto-open the likes sidebar)
                addToLikes(productId);
            }
        });
        
        // Initialize wishlist button state
        updateProductCardWishlistButton(productId, likedProducts.includes(productId));
        
        // Quick view functionality
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.add-to-cart-btn') && !e.target.closest('.wishlist-btn')) {
                const product = products.find(p => p.id === productId);
                if (product) {
                    quickViewImage.src = product.image;
                    quickViewImage.alt = product.name;
                    quickViewTitle.textContent = product.name;
                    quickViewPrice.textContent = `₹${product.price.toFixed(2)}`;
                    quickViewWeight.textContent = product.weight;
                    
                    // Get rating from the product card
                    const ratingStars = card.querySelector('.rating-stars').innerHTML;
                    const ratingCount = card.querySelector('.rating-count').textContent;
                    
                    quickViewRating.innerHTML = `
                        <div class="rating-stars">
                            ${ratingStars}
                        </div>
                        <span class="rating-count">${ratingCount}</span>
                    `;
                    
                    // Update quick view add to cart button based on stock status
                    if (isOutOfStock) {
                        quickViewAddToCartBtn.textContent = 'Out of Stock';
                        quickViewAddToCartBtn.classList.add('out-of-stock-btn');
                        quickViewAddToCartBtn.disabled = true;
                        quickViewAddToCartBtn.style.background = '#ccc';
                        quickViewAddToCartBtn.style.color = '#666';
                        quickViewAddToCartBtn.style.cursor = 'not-allowed';
                    } else {
                        quickViewAddToCartBtn.textContent = 'Add to Cart';
                        quickViewAddToCartBtn.classList.remove('out-of-stock-btn');
                        quickViewAddToCartBtn.disabled = false;
                        quickViewAddToCartBtn.style.background = '';
                        quickViewAddToCartBtn.style.color = '';
                        quickViewAddToCartBtn.style.cursor = '';
                    }
                    
                    // Set current product ID for quick view
                    currentQuickViewProductId = productId;
                    
                    // Update quick view wishlist button state
                    updateQuickViewWishlistButton(likedProducts.includes(productId));
                    
                    quickViewModal.style.display = 'flex';
                    overlay.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }
        });
    });
}

// Function to mark product as out of stock on index page
function setProductOutOfStockIndex(productId, isOutOfStock) {
    const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
    if (productCard) {
        productCard.setAttribute('data-out-of-stock', isOutOfStock.toString());
        
        const addToCartBtn = productCard.querySelector('.add-to-cart-btn');
        if (isOutOfStock) {
            addToCartBtn.innerHTML = '<i class="fas fa-ban" aria-hidden="true"></i><span>Out of Stock</span>';
            addToCartBtn.setAttribute('aria-label', 'This product is out of stock');
            addToCartBtn.classList.add('out-of-stock-btn');
            addToCartBtn.disabled = true;
            addToCartBtn.style.background = '#ccc';
            addToCartBtn.style.color = '#666';
            addToCartBtn.style.cursor = 'not-allowed';
            addToCartBtn.onclick = null;
        } else {
            const product = products.find(item => item.id === productId);
            addToCartBtn.innerHTML = '<i class="fas fa-cart-plus" aria-hidden="true"></i><span>Add to Cart</span>';
            addToCartBtn.setAttribute('aria-label', `Add ${product?.name || 'product'} ${product?.weight || ''} to cart`);
            addToCartBtn.classList.remove('out-of-stock-btn');
            addToCartBtn.disabled = false;
            addToCartBtn.style.background = '';
            addToCartBtn.style.color = '';
            addToCartBtn.style.cursor = '';
            
            // Reattach click event
            addToCartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                addToCartBtn.classList.add('adding');
                addToCart(productId, 1);
                
                setTimeout(() => {
                    addToCartBtn.classList.remove('adding');
                }, 400);
            });
        }
    }
    
    // Also update the likes sidebar if this product is in favorites
    const likeItemBtn = document.querySelector(`.like-item .add-to-cart-btn[data-id="${productId}"]`);
    if (likeItemBtn) {
        if (isOutOfStock) {
            likeItemBtn.innerHTML = '<i class="fas fa-ban" aria-hidden="true"></i><span>Out of Stock</span>';
            likeItemBtn.setAttribute('aria-label', 'This product is out of stock');
            likeItemBtn.classList.add('out-of-stock-btn');
            likeItemBtn.disabled = true;
            likeItemBtn.style.background = '#ccc';
            likeItemBtn.style.color = '#666';
            likeItemBtn.style.cursor = 'not-allowed';
            
            // Remove existing click event
            const newBtn = likeItemBtn.cloneNode(true);
            likeItemBtn.parentNode.replaceChild(newBtn, likeItemBtn);
        } else {
            const product = products.find(item => item.id === productId);
            likeItemBtn.innerHTML = '<i class="fas fa-cart-plus" aria-hidden="true"></i><span>Add to Cart</span>';
            likeItemBtn.setAttribute('aria-label', `Add ${product?.name || 'product'} ${product?.weight || ''} to cart`);
            likeItemBtn.classList.remove('out-of-stock-btn');
            likeItemBtn.disabled = false;
            likeItemBtn.style.background = '';
            likeItemBtn.style.color = '';
            likeItemBtn.style.cursor = '';
            
            // Add click event
            likeItemBtn.addEventListener('click', (e) => {
                const productId = parseInt(e.currentTarget.getAttribute('data-id'));
                addToCart(productId, 1);
            });
        }
    }
}

// Make this function available globally
window.setProductOutOfStockIndex = setProductOutOfStockIndex;



function initializeProductCatalog() {
    document.querySelectorAll('.product-card').forEach(card => {
        card.style.display = "flex";
    });
}

// Banner rotating images functionality
function initializeBannerImages() {
    const bannerWrapper = document.querySelector(".banner-wrapper");
    if (!bannerWrapper) return;
    
    const rotatingImage = document.createElement("img");
    rotatingImage.className = "banner-overlay-outside";
    bannerWrapper.appendChild(rotatingImage);

    const imagesConfig = [
        {
            src: "https://ik.imagekit.io/hexaanatura/Adobe%20Express%20-%20file%20(9)%20(1).png?updatedAt=1756992468273",
            top: "10px",
            alt: "Artistic honey jar with honeycomb pattern and golden glow"
        },
        {
            src: "https://ik.imagekit.io/hexaanatura/Adobe%20Express%20-%20file%20(2).png?updatedAt=1756995663739",
            top: "-15px",
            alt: "Honey dipper dripping golden honey with honeycomb background"
        },
        {
            src: "https://ik.imagekit.io/hexaanatura/Adobe%20Express%20-%20file%20(4).png?updatedAt=1756995663681",
            top: "-15px",
            alt: "Close-up of honeycomb cells filled with golden honey"
        },
        {
            src: "https://ik.imagekit.io/hexaanatura/Adobe%20Express%20-%20file%20(3).png?updatedAt=1756995663635",
            top: "-18px",
            alt: "Honey jar with honeycomb and floral decoration"
        }
    ];

    let index = 0;
    function showImage(i) {
        const config = imagesConfig[i];
        rotatingImage.style.opacity = 0;
        setTimeout(() => {
            rotatingImage.src = config.src;
            rotatingImage.alt = config.alt;
            rotatingImage.style.top = config.top;
            rotatingImage.style.opacity = 1;
        }, 800);
    }
    showImage(index);
    setInterval(() => {
        index = (index + 1) % imagesConfig.length;
        showImage(index);
    }, 4000);
}

function formatReviewDate(d) {
    if (!d) return "—";
    const x = d.toDate ? d.toDate() : new Date(d);

    const dd = String(x.getDate()).padStart(2, "0");
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const yyyy = x.getFullYear();

    return `${dd}/${mm}/${yyyy}`;
}


function loadApprovedReviews() {
    db.collection('reviews')
        .where('status', '==', 'approved')
        .orderBy('createdAt', 'desc')
        .get()
        .then((querySnapshot) => {
            approvedReviews = [];
            reviewsContainer.innerHTML = '';
            carouselDots.innerHTML = '';

            if (querySnapshot.empty) {
                reviewsContainer.innerHTML =
                    '<p style="text-align: center; color: #777; padding: 40px;">No approved reviews yet.</p>';
                return;
            }

            querySnapshot.forEach((doc) => {
                const review = doc.data();
                review.id = doc.id;
                approvedReviews.push(review);
                displayReview(review);
            });

            initializeCarousel();
        })
        .catch((error) => {
            console.error("Error loading reviews:", error);
            reviewsContainer.innerHTML =
                '<p style="text-align: center; color: #777; padding: 40px;">Unable to load reviews.</p>';
        });
}


// Display a review in the carousel
function displayReview(review) {
    const reviewCard = document.createElement('div');
    reviewCard.className = 'review-card';
    
    // Format date
const reviewDate = review.createdAt ? formatReviewDate(review.createdAt) : '—';
    reviewCard.innerHTML = `
        <div class="customer-info">
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(review.userName)}&background=5f2b27&color=fff" alt="Customer photo" class="customer-avatar">
            <div>
                <div class="customer-name">${review.userName}</div>
                <div class="customer-location">${review.userLocation || 'Happy Customer'}</div>
            </div>
        </div>
        <div class="rating">
            ${generateStarRating(review.rating)}
        </div>
        <p class="review-text">${review.reviewText}</p>
        <div class="review-date">${reviewDate}</div>
    `;
    
    reviewsContainer.appendChild(reviewCard);
}

// Generate star rating HTML
function generateStarRating(value) {
    const rating = Number(value) || 0;
    let html = "";

    for (let i = 1; i <= 5; i++) {
        if (rating >= i) {
            html += `<i class="fas fa-star"></i>`;
        } else if (rating >= i - 0.5) {
            html += `<i class="fas fa-star-half-stroke"></i>`;
        } else {
            html += `<i class="far fa-star"></i>`;
        }
    }

    return html;
}

// Reviews Carousel Functionality
function getCarouselMetrics() {
    const firstCard = reviewsContainer.querySelector('.review-card');
    if (!firstCard) {
        return { cardsPerView: 1, cardWidth: 0 };
    }

    const cardStyle = getComputedStyle(firstCard);
    const cardWidth = firstCard.getBoundingClientRect().width
        + parseFloat(cardStyle.marginLeft)
        + parseFloat(cardStyle.marginRight);

    let cardsPerView;
    if (window.innerWidth <= 767) {
        cardsPerView = 1;
    } else if (window.innerWidth <= 1023) {
        cardsPerView = 2;
    } else {
        cardsPerView = Math.max(1, Math.floor(reviewsContainer.clientWidth / cardWidth));
    }

    return { cardsPerView, cardWidth };
}

function initializeCarousel() {
    const reviewCards = document.querySelectorAll('.review-card');
    
    // Handle case when no reviews exist
    if (reviewCards.length === 0) {
        clearInterval(carouselAutoplayTimer);
        carouselAutoplayTimer = null;
        carouselDots.innerHTML = '';
        return;
    }
    
    const { cardsPerView } = getCarouselMetrics();
    
    const totalSlides = Math.ceil(reviewCards.length / cardsPerView);
    currentCarouselIndex = Math.min(currentCarouselIndex, totalSlides - 1);
    
    carouselDots.innerHTML = '';
    for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement('div');
        dot.classList.add('dot');
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', () => {
            goToSlide(i);
            resetCarouselAutoplay();
        });
        carouselDots.appendChild(dot);
    }
    
    updateCarousel();
    resetCarouselAutoplay();
}

function updateCarousel() {
    const reviewCards = document.querySelectorAll('.review-card');
    
    if (reviewCards.length === 0) return;
    
    const { cardsPerView, cardWidth } = getCarouselMetrics();
    
    const offset = -currentCarouselIndex * cardWidth * cardsPerView;
    reviewsContainer.style.transform = `translateX(${offset}px)`;
    
    document.querySelectorAll('.dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === currentCarouselIndex);
    });
}

function goToSlide(index) {
    const reviewCards = document.querySelectorAll('.review-card');
    const { cardsPerView } = getCarouselMetrics();
    const maxIndex = Math.ceil(reviewCards.length / cardsPerView) - 1;
    currentCarouselIndex = Math.max(0, Math.min(index, maxIndex));
    updateCarousel();
}

function resetCarouselAutoplay() {
    clearInterval(carouselAutoplayTimer);
    carouselAutoplayTimer = null;

    const totalSlides = carouselDots.children.length;
    if (totalSlides < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    carouselAutoplayTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        const nextIndex = currentCarouselIndex + 1;
        goToSlide(nextIndex < totalSlides ? nextIndex : 0);
    }, 5000);
}

function pauseCarouselAutoplay() {
    clearInterval(carouselAutoplayTimer);
    carouselAutoplayTimer = null;
}

function resumeCarouselAutoplay() {
    if (
        carouselAutoplayTimer === null
        && document.visibilityState === 'visible'
        && !reviewsContainer.matches(':hover')
        && !reviewsContainer.contains(document.activeElement)
    ) {
        resetCarouselAutoplay();
    }
}

prevBtn.addEventListener('click', () => {
    goToSlide(currentCarouselIndex - 1);
    resetCarouselAutoplay();
});

nextBtn.addEventListener('click', () => {
    goToSlide(currentCarouselIndex + 1);
    resetCarouselAutoplay();
});

reviewsContainer.addEventListener('mouseenter', pauseCarouselAutoplay);
reviewsContainer.addEventListener('mouseleave', resumeCarouselAutoplay);
reviewsContainer.addEventListener('focusin', pauseCarouselAutoplay);
reviewsContainer.addEventListener('focusout', (event) => {
    if (!reviewsContainer.contains(event.relatedTarget)) {
        resumeCarouselAutoplay();
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        resumeCarouselAutoplay();
    } else {
        pauseCarouselAutoplay();
    }
});

// Add touch swipe support for mobile
let touchStartX = 0;
let touchEndX = 0;

reviewsContainer.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
});

reviewsContainer.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    const swipeThreshold = 50;
    let changedSlide = false;
    
    if (touchEndX < touchStartX - swipeThreshold) {
        // Swipe left - next slide
        goToSlide(currentCarouselIndex + 1);
        changedSlide = true;
    }
    
    if (touchEndX > touchStartX + swipeThreshold) {
        // Swipe right - previous slide
        goToSlide(currentCarouselIndex - 1);
        changedSlide = true;
    }

    if (changedSlide) {
        resetCarouselAutoplay();
    }
}

// Update the window resize event listener
window.addEventListener('resize', () => {
    initializeCarousel();
});


    // Review modal functionality
addReviewBtn.addEventListener('click', () => {
    if (!currentUser) {
        alert('Please login to add a review');
        showLoginView();
        loginModal.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        return;
    }
    
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = today.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    
    // Set the date field
    const dateField = document.getElementById('reviewDate');
    if (dateField) {
        dateField.value = formattedDate;
    }
    
    // Auto-fill user's name if available
    const nameField = document.getElementById('reviewName');
    if (nameField && currentUser && currentUser.displayName) {
        nameField.value = currentUser.displayName;
    } else if (nameField) {
        nameField.value = ''; // Clear if no name
    }
    
    // Clear other fields
    const locationField = document.getElementById('reviewLocation');
    const textField = document.getElementById('reviewText');
    
    if (locationField) locationField.value = '';
    if (textField) textField.value = '';
    
    // Uncheck all rating stars
    const ratingInputs = document.querySelectorAll('input[name="rating"]');
    ratingInputs.forEach(input => input.checked = false);
    
    if (reviewModal) {
        reviewModal.style.display = 'flex';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
});

if (cancelReview) {
    cancelReview.addEventListener('click', () => {
        if (reviewModal) {
            reviewModal.style.display = 'none';
            overlay.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });
}

if (submitReview) {
    submitReview.addEventListener('click', () => {
        const userName = document.getElementById('reviewName')?.value.trim() || '';
        const userLocation = document.getElementById('reviewLocation')?.value.trim() || '';
        const rating = document.querySelector('input[name="rating"]:checked');
        const reviewText = document.getElementById('reviewText')?.value.trim() || '';
        
        // Validation
        if (!userName) {
            alert('Please enter your name');
            return;
        }
        
        if (!userLocation) {
            alert('Please enter your location (city)');
            return;
        }
        
        if (!rating) {
            alert('Please provide a rating by selecting stars');
            return;
        }
        
        if (!reviewText) {
            alert('Please write your review');
            return;
        }
        
        if (reviewText.length < 10) {
            alert('Please write a more detailed review (minimum 10 characters)');
            return;
        }
        
        const review = {
            userName: userName,
            userLocation: userLocation,
            rating: parseInt(rating.value),
            reviewText: reviewText,
            status: 'pending', // All user reviews start as pending
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            userId: currentUser.uid
        };
        

        db.collection('reviews').add(review)
            .then(() => {
                alert('Thank you for your review!');
                if (reviewModal) {
                    reviewModal.style.display = 'none';
                    overlay.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
                
                // Reload reviews to show pending message
                loadApprovedReviews();
            })
            .catch((error) => {
                console.error("Error submitting review:", error);
                alert('Error submitting review. Please try again.');
            });
    });
}

if (reviewModal) {
    reviewModal.addEventListener('click', (e) => {
        if (e.target === reviewModal) {
            reviewModal.style.display = 'none';
            overlay.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });
}


// Override the removeFromLikes function to update UI
const originalRemoveFromLikes = window.removeFromLikes;
window.removeFromLikes = function(productId) {
    originalRemoveFromLikes(productId);
    
    // Update product card wishlist button
    updateProductCardWishlistButton(productId, false);
    
    // Update quick view wishlist button if this product is currently being viewed
    if (currentQuickViewProductId === productId) {
        updateQuickViewWishlistButton(false);
    }
};

// Override the addToLikes function to update UI
const originalAddToLikes = window.addToLikes;
window.addToLikes = function(productId) {
    originalAddToLikes(productId);
    
    // Update product card wishlist button
    updateProductCardWishlistButton(productId, true);
    
    // Update quick view wishlist button if this product is currently being viewed
    if (currentQuickViewProductId === productId) {
        updateQuickViewWishlistButton(true);
    }
};

function initIndexPage() {
    initializeProductCards();
    initializeProductCatalog();
    initializeBannerImages();
    loadApprovedReviews();

    // No need to modify loadUserData anymore
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initIndexPage();
});
