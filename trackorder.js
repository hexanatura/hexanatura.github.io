// Track Order JavaScript
document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const trackBtn = document.getElementById('trackBtn');
  const orderIdInput = document.getElementById('orderId');
  const orderEmailInput = document.getElementById('orderEmail');
  const trackError = document.getElementById('trackError');
  const errorText = document.getElementById('errorText');
  const loading = document.getElementById('loading');
  const emptyState = document.getElementById('emptyState');
  const orderStatus = document.getElementById('orderStatus');
  const orderStatusSection = document.querySelector('.order-status-section');

  window.currentOrder = null;

  const timelineSteps = [
    { id: 'ordered', label: 'Ordered', icon: 'fas fa-shopping-cart' },
    { id: 'confirmed', label: 'Confirmed', icon: 'fas fa-check-circle' },
    { id: 'shipped', label: 'Shipped', icon: 'fas fa-shipping-fast' },
    { id: 'out-for-delivery', label: 'Out for Delivery', icon: 'fas fa-truck' },
    { id: 'delivered', label: 'Delivered', icon: 'fas fa-home' }
  ];

  const statusMap = {
    'ordered': 0,
    'confirmed': 1,
    'shipped': 2,
    'out-for-delivery': 3,
    'out for delivery': 3,
    'delivered': 4,
    'cancelled': -1
  };

  // Event Listeners
  trackBtn.addEventListener('click', trackOrder);
  orderIdInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') trackOrder();
  });
  orderEmailInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') trackOrder();
  });

  // Track Order Function
  async function trackOrder() {
    const orderId = orderIdInput.value.trim();
    const email = orderEmailInput.value.trim().toLowerCase();

    // Validation
    if (!orderId || !email) {
      showError('Please enter both order ID and email address');
      return;
    }

    if (!validateEmail(email)) {
      showError('Please enter a valid email address');
      return;
    }

    // Hide error and empty state
    hideError();
    emptyState.classList.remove('active');
    orderStatusSection.classList.remove('active');

    // Show loading
    loading.classList.add('active');

    try {
      // Fetch real order data from Firebase
      const orderData = await fetchOrderFromFirebase(orderId, email);
      
      // Hide loading
      loading.classList.remove('active');
      
      if (orderData && orderData.success !== false) {
        // Store order globally for resize handling
        window.currentOrder = orderData;
        
        // Show order status
        renderOrderStatus(orderData);
        orderStatusSection.classList.add('active');
        
        // Focus the Track Another button for accessibility
        setTimeout(() => {
          const trackAnotherBtn = document.getElementById('trackAnotherBtn');
          if (trackAnotherBtn) {
            trackAnotherBtn.focus();
          }
        }, 100);
      } else {
        // Show empty state if no order found
        emptyState.classList.add('active');
        orderStatusSection.classList.remove('active');
        
        // Show specific error message if provided
        if (orderData && orderData.message) {
          showError(orderData.message);
        } else {
          showError('No order found with the provided ID and email. Please check your details.');
        }
      }
    } catch (error) {
      console.error('Error tracking order:', error);
      loading.classList.remove('active');
      showError('Failed to track order. Please try again.');
    }
  }

  // Function to reset form and show tracking form again
  function resetTrackForm() {
    // Clear inputs
    orderIdInput.value = '';
    orderEmailInput.value = '';
    
    // Hide order status section
    orderStatusSection.classList.remove('active');
    
    // Show empty state
    emptyState.classList.add('active');
    
    // Clear any errors
    hideError();
    
    // Clear current order
    window.currentOrder = null;
    
    // Focus on order ID input for better UX
    orderIdInput.focus();
    
    // Scroll to top of form for better visibility
    const trackOrderPage = document.querySelector('.track-order-page');
    if (trackOrderPage) {
      trackOrderPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Tracking is served by a callable so private order documents are never public.
  async function fetchOrderFromFirebase(orderId, email) {
    const getOrderTracking = window.functions.httpsCallable('getOrderTracking');
    const response = await getOrderTracking({ orderId, email });
    if (!response.data?.success || !response.data.order) {
      return {
        success: false,
        message: 'No order found with the provided ID and email. Please check your details.'
      };
    }

    return processOrderData(response.data.order);
  }

  // Process order data to match expected format
  function processOrderData(order) {
    // Format dates for timeline
    const timelineDates = {};
    
    // Map Firebase timestamps to timeline dates
    if (order.createdAt) {
      timelineDates.ordered = formatFirebaseDate(order.createdAt, true);
    }
    
    if (order.confirmedAt) {
      timelineDates.confirmed = formatFirebaseDate(order.confirmedAt, true);
    } else if (order.status === 'confirmed' || order.status === 'shipped' || 
               order.status === 'delivered' || order.status === 'out-for-delivery') {
      timelineDates.confirmed = timelineDates.ordered || formatFirebaseDate(new Date(), true);
    }
    
    if (order.shippedAt) {
      timelineDates.shipped = formatFirebaseDate(order.shippedAt, true);
    } else if (order.status === 'shipped' || order.status === 'delivered' || 
               order.status === 'out-for-delivery') {
      timelineDates.shipped = timelineDates.confirmed || timelineDates.ordered || formatFirebaseDate(new Date(), true);
    }
    
    if (order.outForDeliveryAt) {
      timelineDates['out-for-delivery'] = formatFirebaseDate(order.outForDeliveryAt, true);
    } else if (order.status === 'out-for-delivery' || order.status === 'delivered') {
      timelineDates['out-for-delivery'] = timelineDates.shipped || timelineDates.confirmed || timelineDates.ordered || formatFirebaseDate(new Date(), true);
    }
    
    if (order.deliveredAt) {
      timelineDates.delelled = formatFirebaseDate(order.deliveredAt, true);
    } else if (order.status === 'delivered') {
      timelineDates.delivered = timelineDates['out-for-delivery'] || timelineDates.shipped || timelineDates.confirmed || timelineDates.ordered || formatFirebaseDate(new Date(), true);
    }

    // Calculate totals if not present
    let subtotal = order.subtotal || 0;
    let shipping = order.shipping || 0;
    let total = order.total || 0;

    if (!subtotal && order.items && order.items.length > 0) {
      subtotal = order.items.reduce((sum, item) => {
        const price = item.price || 0;
        const quantity = item.quantity || 1;
        return sum + (price * quantity);
      }, 0);
    }

    if (!total && subtotal) {
      total = subtotal + shipping;
    }

    // Get customer name from shipping address
    const customerName = order.shippingAddress
      ? `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim()
      : order.customerName || 'Customer';

    // Format shipping address
    const shippingAddress = order.shippingAddress
      ? [
          order.shippingAddress.address,
          order.shippingAddress.city,
          order.shippingAddress.state,
          order.shippingAddress.zipCode,
          order.shippingAddress.country
        ].filter(Boolean).join(', ')
      : 'No address provided';

    // Ensure items have proper structure (same as profile page)
    const items = (order.items || []).map(item => ({
      name: item.name || 'Product',
      quantity: item.quantity || 1,
      price: item.price || 0,
      image: item.image || item.productImage || getDefaultProductImage(item.name),
      weight: item.weight || '',
      productId: item.productId || item.id
    }));

    return {
      id: order.orderId || order.id,
      orderId: order.orderId || order.id,
      date: formatFirebaseDate(order.createdAt, false),
      status: order.status || 'ordered',
      customerName: customerName,
      customerEmail: order.email || '',
      customerPhone: order.shippingAddress?.phone || '',
      shippingAddress: shippingAddress,
      items: items,
      subtotal: subtotal,
      shipping: shipping,
      total: total,
      paymentMethod: order.paymentMethod || 'Cash on Delivery',
      notes: order.notes || '',
      timelineDates: timelineDates,
      _created: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || Date.now())
    };
  }

  // Format Firebase date
  function formatFirebaseDate(firebaseDate, includeTime = false) {
    if (!firebaseDate) return null;
    
    try {
      const date = firebaseDate.toDate ? firebaseDate.toDate() : new Date(firebaseDate);
      
      if (includeTime) {
        return date.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }) + ' ' + date.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        return date.toLocaleDateString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    } catch (e) {
      console.error('Date formatting error:', e);
      return null;
    }
  }

  // Get default product image
  function getDefaultProductImage(productName) {
    const productImages = {
      'natura agmark honey': 'https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022',
      'honey': 'https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022',
      'crystal pack': 'https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_i8jo3di8jo3di8jo.jpg?updatedAt=1757217705022',
      'premium pet': 'https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_cbat36cbat36cbat.jpg?updatedAt=1757217705022'
    };
    
    if (!productName) return 'https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022';
    
    const name = productName.toLowerCase();
    for (const [key, image] of Object.entries(productImages)) {
      if (name.includes(key)) {
        return image;
      }
    }
    
    return 'https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022';
  }

  // Render Order Status
  function renderOrderStatus(order) {
    // Validate order data structure
    if (!order || !order.id) {
      showError('Invalid order data received');
      return;
    }

    const statusIndex = statusMap[order.status] || 0;
    const isCancelled = order.status === 'cancelled';

    // Generate timeline HTML based on screen size
    const timelineHTML = window.innerWidth >= 769 
      ? generateHorizontalTimeline(order, statusIndex, isCancelled)
      : generateVerticalTimeline(order, statusIndex, isCancelled);

    // Generate order summary HTML (same as profile page)
    const summaryHTML = generateOrderSummaryHTML(order);

    // Construct the complete order status HTML
    orderStatus.innerHTML = `
      <div class="order-header">
        <div class="order-info-left">
          <div class="order-id-display">${escapeHtml(order.orderId || order.id)}</div>
          <div class="order-date-display">Order Date: ${escapeHtml(order.date || 'N/A')}</div>
          <div class="customer-info">
            <div class="customer-info-row">
              <i class="fas fa-user"></i>
              <span>${escapeHtml(order.customerName || 'Customer')}</span>
            </div>
            ${order.customerEmail ? `
            <div class="customer-info-row">
              <i class="fas fa-envelope"></i>
              <span>${escapeHtml(order.customerEmail)}</span>
            </div>
            ` : ''}
          </div>
        </div>
        <div class="order-info-right">
          <div class="order-status-right">
            <div class="status-label">Current Status</div>
            <div class="status-badge ${order.status}">${getStatusText(order.status)}</div>
          </div>
        </div>
      </div>

      <div class="order-timeline-wrapper">
        <div class="order-timeline">
          ${timelineHTML}
        </div>
      </div>

      <div class="order-summary-section">
        <h3>Order Summary</h3>
        <div class="order-summary-container">
          ${summaryHTML}
        </div>
      </div>

      <div class="order-actions">
        <button class="btn-action btn-outline" id="trackAnotherBtn">
          <i class="fas fa-redo"></i> Track Another
        </button>
        <button class="btn-action btn-outline" onclick="window.print()">
          <i class="fas fa-print"></i> Print Invoice
        </button>
        <button class="btn-action btn-primary" onclick="window.location.href='contact.html'">
        <i class="fas fa-headset"></i> Contact Support
      </button>
    </div>
    `;

    // Add event listener to the Track Another button
    setTimeout(() => {
      const trackAnotherBtn = document.getElementById('trackAnotherBtn');
      if (trackAnotherBtn) {
        trackAnotherBtn.addEventListener('click', resetTrackForm);
        
        // Also add keyboard support
        trackAnotherBtn.addEventListener('keypress', function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            resetTrackForm();
          }
        });
      }
    }, 100);

    // Update timeline progress after rendering
    setTimeout(() => {
      updateTimelineProgress(statusIndex, isCancelled);
    }, 100);
  }

  // Get formatted status text
  function getStatusText(status) {
    if (!status) return 'Unknown';
    const statusMap = {
      'ordered': 'Ordered',
      'confirmed': 'Confirmed',
      'processing': 'Processing',
      'shipped': 'Shipped',
      'out-for-delivery': 'Out for Delivery',
      'delivered': 'Delivered',
      'cancelled': 'Cancelled'
    };
    return statusMap[status.toLowerCase()] || status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ');
  }

  // Generate Horizontal Timeline HTML
  function generateHorizontalTimeline(order, statusIndex, isCancelled) {
    let timelineHTML = `
      <div class="timeline-horizontal">
        <div class="timeline-progress">
          <div class="timeline-progress-fill" id="timelineProgressFill"></div>
        </div>
        <div class="timeline-steps">
    `;

    timelineSteps.forEach((step, index) => {
      const stepDate = order.timelineDates ? order.timelineDates[step.id] : null;
      const isCompleted = index <= statusIndex;
      const isActive = index === statusIndex;
      const stepClass = isCancelled ? 'cancelled' : 
                       isActive ? 'active' : 
                       isCompleted ? 'completed' : '';

      timelineHTML += `
        <div class="timeline-step ${stepClass}" data-step="${step.id}">
          <div class="timeline-step-circle">
            <i class="${step.icon}"></i>
          </div>
          <div class="timeline-step-content">
            <div class="timeline-step-label">${step.label}</div>
            <div class="timeline-step-date">${stepDate || 'Pending'}</div>
          </div>
        </div>
      `;
    });

    timelineHTML += `
        </div>
      </div>
    `;

    return timelineHTML;
  }

  // Generate Vertical Timeline HTML
  function generateVerticalTimeline(order, statusIndex, isCancelled) {
    let timelineHTML = `
      <div class="timeline-vertical">
        <div class="timeline-vertical-line"></div>
        <div class="timeline-vertical-fill" id="timelineVerticalFill"></div>
    `;

    timelineSteps.forEach((step, index) => {
      const stepDate = order.timelineDates ? order.timelineDates[step.id] : null;
      const isCompleted = index <= statusIndex;
      const isActive = index === statusIndex;
      const stepClass = isCancelled ? 'cancelled' : 
                       isActive ? 'active' : 
                       isCompleted ? 'completed' : '';

      timelineHTML += `
        <div class="timeline-step-vertical ${stepClass}" data-step="${step.id}">
          <div class="timeline-step-circle-vertical">
            <i class="${step.icon}"></i>
          </div>
          <div class="timeline-step-content-vertical">
            <div class="timeline-step-label-vertical">${step.label}</div>
            <div class="timeline-step-date-vertical">${stepDate || 'Pending'}</div>
          </div>
        </div>
      `;
    });

    timelineHTML += `</div>`;
    return timelineHTML;
  }

  // Update Timeline Progress
  function updateTimelineProgress(statusIndex, isCancelled) {
    if (isCancelled) return;

    const totalSteps = timelineSteps.length;
    const progressPercentage = (statusIndex / (totalSteps - 1)) * 100;

    // Update horizontal progress
    const progressFill = document.getElementById('timelineProgressFill');
    if (progressFill) {
      setTimeout(() => {
        progressFill.style.width = `${progressPercentage}%`;
      }, 300);
    }

    // Update vertical progress
    const verticalFill = document.getElementById('timelineVerticalFill');
    if (verticalFill) {
      setTimeout(() => {
        verticalFill.style.height = `${progressPercentage}%`;
      }, 300);
    }
  }

  // Generate Order Summary HTML (same as profile page)
  function generateOrderSummaryHTML(order) {
    if (!order.items || !order.items.length) {
      return `
        <div class="no-items" style="padding:20px;text-align:center;color:#666;font-style:italic">
          No items found in this order
        </div>
      `;
    }

    // Generate items summary - same compact view as profile
    const itemsHTML = order.items.map(item => {
      const itemTotal = (item.quantity || 1) * (item.price || 0);
      
      return `
        <div class="tracking-item-card">
          <div class="tracking-item-img">
            <img src="${escapeHtml(item.image)}" 
                 alt="${escapeHtml(item.name)}" 
                 onerror="this.onerror=null; this.src='https://ik.imagekit.io/hexaanatura/Gemini_Generated_Image_gyalrfgyalrfgyal.jpg?updatedAt=1757217705022'">
          </div>
          <div class="tracking-item-details">
            <div class="tracking-item-name">${escapeHtml(item.name)}</div>
            <div class="tracking-item-meta">
              <span>${item.weight || ''}</span>
              <span>•</span>
              <span>Qty: ${item.quantity || 1}</span>
            </div>
            <div class="tracking-item-price">₹${itemTotal.toFixed(2)}</div>
          </div>
        </div>
      `;
    }).join('');

    // Calculate subtotal
    const subtotal = order.items.reduce((sum, item) => {
      return sum + ((item.price || 0) * (item.quantity || 1));
    }, 0);

    return `
      <div class="order-items-summary">
        ${itemsHTML}
      </div>
      <div class="order-summary-total">
        <div class="summary-row">
          <span>Subtotal</span>
          <span>₹${(subtotal || 0).toFixed(2)}</span>
        </div>
        <div class="summary-row">
          <span>Shipping</span>
          <span>FREE</span>
        </div>
        <div class="summary-row total">
          <span>Total</span>
          <span>₹${(order.total || 0).toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  // Helper Functions
  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function showError(message) {
    errorText.textContent = message;
    trackError.classList.add('active');
    orderStatusSection.classList.remove('active');
    emptyState.classList.remove('active');
  }

  function hideError() {
    trackError.classList.remove('active');
  }


  // Handle window resize for timeline switching
  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      // If order status is currently displayed, re-render it with appropriate timeline
      if (orderStatusSection.classList.contains('active') && window.currentOrder) {
        const order = window.currentOrder;
        const statusIndex = statusMap[order.status] || 0;
        const isCancelled = order.status === 'cancelled';
        
        const timelineHTML = window.innerWidth >= 769 
          ? generateHorizontalTimeline(order, statusIndex, isCancelled)
          : generateVerticalTimeline(order, statusIndex, isCancelled);
        
        const timelineElement = document.querySelector('.order-timeline');
        if (timelineElement) {
          timelineElement.innerHTML = timelineHTML;
          setTimeout(() => {
            updateTimelineProgress(statusIndex, isCancelled);
          }, 50);
        }
      }
    }, 250);
  });

  // Initialize page
  emptyState.classList.add('active');
  
  // Add keyboard shortcut for resetting (Alt + R)
  document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key === 'r' && orderStatusSection.classList.contains('active')) {
      e.preventDefault();
      resetTrackForm();
    }
  });
});
