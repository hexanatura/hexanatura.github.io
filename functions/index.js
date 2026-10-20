const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

setGlobalOptions({ region: "asia-south1" });
admin.initializeApp();

/* ===== SIMPLE PARAMS SETUP ===== */
const GMAIL_EMAIL = defineString("GMAIL_EMAIL");
const GMAIL_PASS = defineString("GMAIL_PASS");
const RAZORPAY_KEY_ID = defineString("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineString("RAZORPAY_KEY_SECRET");
const RAZORPAY_WEBHOOK_SECRET = defineString("RAZORPAY_WEBHOOK_SECRET");

const ADMIN_EMAIL = "hexanatura.info@gmail.com";
const DASHBOARD_URL = "https://www.hexahoney.in/dashboard.html";
const SITE_URL = "https://www.hexahoney.in/";
const TRACK_URL = "https://www.hexahoney.in/trackorder.html";

/* ===== EMAIL VALIDATION ===== */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  // Basic email regex - checks for @ and . and proper format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Additional checks
  const trimmed = email.trim();
  return emailRegex.test(trimmed) && 
         trimmed.length <= 254 && // Max email length
         !trimmed.includes('..') && // No consecutive dots
         !trimmed.startsWith('.') && // No dot at start
         !trimmed.endsWith('.'); // No dot at end
}

/* ===== MAIL TRANSPORTER ===== */
function transporter() {
  const email = GMAIL_EMAIL.value();
  const pass = GMAIL_PASS.value();
  
  console.log("Email config:", {
    email: email || "MISSING",
    pass: pass ? "***" + pass.slice(-4) : "MISSING"
  });
  
  if (!email || !pass) {
    throw new Error("Gmail credentials not configured!");
  }
  
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: pass,
    },
  });
}

/* ===== SIMPLE ADMIN NOTIFICATION ===== */
function adminMail(title, emoji) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;padding:20px">
      <h2>${emoji} ${title}</h2>
      <p>🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
      <a href="${DASHBOARD_URL}"
         style="display:inline-block;margin-top:16px;
                padding:10px 18px;
                background:#16a34a;
                color:#fff;
                text-decoration:none;
                border-radius:6px;
                font-weight:600">
        Open Dashboard
      </a>
    </div>
  `;
}

/* ===== PAYMENT METHOD DISPLAY NAMES ===== */
function getPaymentMethodDisplay(method) {
  const methodMap = {
    'card': 'Credit/Debit Card',
    'netbanking': 'Net Banking',
    'upi': 'UPI',
    'wallet': 'Wallet',
    'emi': 'EMI',
    'cardless_emi': 'Cardless EMI'
  };
  return methodMap[method] || method || 'Razorpay';
}

/* ===== SUCCESS EMAIL TEMPLATE ===== */
function successOrderEmail(order, payment) {
  // Use order.orderId first (this is your "NA-xxxxx"), then fallback to order.id
  const orderNumber = order.orderId || order.id || `ORD-${Date.now().toString().slice(-8)}`;
  
  const customerName = order.shippingAddress ? 
    `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim() : 
    order.email;
  
  // Payment details
  const paymentMethod = getPaymentMethodDisplay(payment?.method);
  const transactionId = payment?.id || order.razorpayPaymentId || '';
  const fullTransactionId = transactionId || '—';
  const paymentDate = new Date(payment?.created_at * 1000 || Date.now()).toLocaleString('en-IN');
  
  const itemsList = (order.items || [])
    .map(item => {
      const qty = item.quantity || 1;
      const price = item.price || 0;
      const itemTotal = qty * price;

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <div style="font-weight:600;color:#111827;font-size:14px;margin-bottom:4px;">
              ${item.name || "Product"}
            </div>
            ${item.weight ? `
            <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">
              Weight: ${item.weight}
            </div>` : ''}
            <div style="font-size:12px;color:#6b7280;">Qty: ${qty}</div>
          </td>
          <td align="right" style="padding:12px 0;border-bottom:1px solid #e5e7eb;
            font-weight:600;color:#111827;font-size:14px;">₹${itemTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  // Totals
  const subtotal = order.subtotal || order.total || 0;
  const discount = order.discount || 0;
  const shipping = order.shipping || 0;
  const total = order.total || (subtotal - discount + shipping);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful - Order Confirmed</title>
</head>

<body style="margin:0;padding:0;background:#f3f4f6;font-family:Poppins,Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
<tr><td align="center">

<table width="100%" cellpadding="0" cellspacing="0"
style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">

<!-- HEADER -->
<tr>
<td style="padding:28px;background:linear-gradient(90deg,#120f14 0%,#fd1d1d 50%,#fcb045 100%);text-align:center;">
  <img src="https://ik.imagekit.io/hexaanatura/Adobe%20Express%20-%20file%20(8)%20(1).png"
    alt="Natura Honey" style="max-height:64px;display:block;margin:0 auto;">
  <div style="height:8px;"></div>
  <div style="font-size:13px;letter-spacing:2px;color:#fff;opacity:0.85;">THE TASTE OF HUNDREDS</div>
  <div style="font-size:10px;letter-spacing:2px;color:#fff;opacity:0.85;">www.hexahoney.in</div>
</td>
</tr>

<tr><td style="height:4px;background:#e7d90f;"></td></tr>

<!-- SUCCESS MESSAGE -->
<tr>
<td align="center" style="padding:28px 24px 12px;">
  <img src="https://ik.imagekit.io/hexaanatura/Success.gif" alt="Confirmed" style="width:110px;">
  <h1 style="margin:14px 0 4px;font-size:22px;color:#111827;">Payment Successful! 🎉</h1>
  <p style="margin:0;font-size:14px;color:#6b7280;">Your order has been placed successfully.</p>
  
  <div style="margin-top:12px;padding:8px 16px;background:#22c55e20;border:1px solid #22c55e;border-radius:20px;display:inline-block;">
    <span style="font-size:13px;font-weight:600;color:#22c55e;">✅ Payment Completed</span>
  </div>
</td>
</tr>

<!-- ORDER ID -->
<tr>
<td style="padding:0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;">
    <tr><td style="padding:16px;text-align:center;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">ORDER ID</div>
      <div style="font-size:20px;font-weight:600;color:#5f2b27;font-family:monospace;margin-bottom:6px;">
        ${orderNumber}
      </div>
      <div style="font-size:11px;color:#9ca3af;">Tap & hold to copy</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">${paymentDate}</div>
    </td></tr>
  </table>
</td>
</tr>

<!-- PAYMENT DETAILS -->
<tr>
<td style="padding:20px 24px 8px;">
  <h3 style="margin:0 0 12px 0;font-size:16px;color:#111827;">Payment Details</h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;padding:16px;border:1px solid #e5e7eb;">
    <tr>
      <td style="font-size:14px;color:#1f2937;line-height:1.7;">
        <strong>Transaction ID:</strong> ${fullTransactionId}<br>
        <strong>Payment Method:</strong> ${paymentMethod}<br>
        <strong>Amount Paid:</strong> ₹${total.toFixed(2)}<br>
        <strong>Payment Date:</strong> ${paymentDate}<br>
        <strong>Status:</strong> <span style="color:#22c55e;font-weight:600;">Completed</span>
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- CUSTOMER DETAILS -->
<tr>
<td style="padding:0 24px 8px;">
  <h3 style="margin:0 0 12px 0;font-size:16px;color:#111827;">Customer Details</h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;padding:16px;border:1px solid #e5e7eb;">
    <tr>
      <td style="font-size:14px;color:#1f2937;line-height:1.7;">
        <strong>Name:</strong> ${customerName}<br>
        <strong>Email:</strong> ${order.email || '—'}<br>
        <strong>Phone:</strong> ${order.shippingAddress?.phone || '—'}
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- ORDER SUMMARY -->
<tr>
<td style="padding:8px 24px;">
  <h3 style="margin:8px 0;font-size:16px;color:#111827;">Order Summary</h3>
  <table width="100%" cellpadding="0" cellspacing="0">${itemsList}</table>
  
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:12px;">
    <tr>
      <td style="font-size:14px;color:#374151;">Total Amount</td>
      <td align="right" style="font-size:18px;font-weight:700;color:#5f2b27;">₹${total.toFixed(2)}</td>
    </tr>
  </table>
</td>
</tr>

<!-- INFO MESSAGE -->

<tr>
  <td style="padding:16px 24px;">
    <div style="background:#f0f9ff;border-left:4px solid #0284c7;
      padding:14px;border-radius:6px;font-size:13px;color:#0f172a;">
      <strong>Important!</strong><br>
      • Your payment of ₹${total.toFixed(2)} via ${paymentMethod} was successful.<br>
      • Our team will verify and confirm the order<br>
      • Status will change to <strong>CONFIRMED</strong> once approved<br>
      • You can track your order status anytime.
    </div>
  </td>
</tr>

<!-- CTA BUTTONS -->
<tr>
<td align="center" style="padding:26px 24px;">
  <a href="${TRACK_URL}"
     style="background:#5f2b27;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:30px;font-size:14px;display:inline-block;margin:6px;">
    Track Order
  </a>
  <a href="${SITE_URL}"
     style="color:#5f2b27;text-decoration:none;font-size:14px;display:block;margin-top:14px;">
    Return to Homepage →
  </a>
</td>
</tr>

<tr><td style="height:4px;background:#e7d90f;"></td></tr>

<!-- FOOTER -->
<tr>
<td style="padding:18px;text-align:center;background:linear-gradient(90deg,#120f14 0%,#fd1d1d 50%,#fcb045 100%);color:#ffffff;font-size:12px;">
  © ${new Date().getFullYear()} Hexa Honey<br>Sent to <span style="color:#000000;">${order.email}</span>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>
  `;
}

/* ===== FAILURE EMAIL TEMPLATE ===== */
function failureOrderEmail(order, paymentError) {
  // Use order.orderId first (this is your "NA-xxxxx"), then fallback to order.id
  const orderNumber = order.orderId || order.id || `ORD-${Date.now().toString().slice(-8)}`;
  
  const customerName = order.shippingAddress ? 
    `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim() : 
    order.email;
  
  const errorDescription = paymentError?.description || 'Payment processing failed';
  const errorCode = paymentError?.code || 'Unknown error';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed</title>
</head>

<body style="margin:0;padding:0;background:#f3f4f6;font-family:Poppins,Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
<tr><td align="center">

<table width="100%" cellpadding="0" cellspacing="0"
style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">

<!-- HEADER -->
<tr>
<td style="padding:28px;background:linear-gradient(90deg,#120f14 0%,#fd1d1d 50%,#fcb045 100%);text-align:center;">
  <img src="https://ik.imagekit.io/hexaanatura/Adobe%20Express%20-%20file%20(8)%20(1).png"
    alt="Natura Honey" style="max-height:64px;display:block;margin:0 auto;">
  <div style="height:8px;"></div>
  <div style="font-size:13px;letter-spacing:2px;color:#fff;opacity:0.85;">THE TASTE OF HUNDREDS</div>
  <div style="font-size:10px;letter-spacing:2px;color:#fff;opacity:0.85;">www.hexahoney.in</div>
</td>
</tr>

<tr><td style="height:4px;background:#e7d90f;"></td></tr>

<!-- FAILURE MESSAGE -->
<tr>
<td align="center" style="padding:28px 24px 12px;">
  <img src="https://ik.imagekit.io/hexaanatura/Error.gif" alt="Payment Failed" style="width:110px;">
  <h1 style="margin:14px 0 4px;font-size:22px;color:#111827;">Payment Failed ⚠️</h1>
  <p style="margin:0;font-size:14px;color:#6b7280;">We couldn't process your payment</p>
  
  <div style="margin-top:12px;padding:8px 16px;background:#ef444420;border:1px solid #ef4444;border-radius:20px;display:inline-block;">
    <span style="font-size:13px;font-weight:600;color:#ef4444;">❌ Payment Failed</span>
  </div>
</td>
</tr>

<!-- ORDER ID -->
<tr>
<td style="padding:0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;">
    <tr><td style="padding:16px;text-align:center;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">ORDER ID</div>
      <div style="font-size:20px;font-weight:600;color:#5f2b27;font-family:monospace;margin-bottom:6px;">
        ${orderNumber}
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">${new Date().toLocaleDateString('en-IN')}</div>
    </td></tr>
  </table>
</td>
</tr>

<!-- ERROR DETAILS -->
<tr>
<td style="padding:20px 24px 8px;">
  <h3 style="margin:0 0 12px 0;font-size:16px;color:#111827;">Payment Error Details</h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f5;border:1px solid #fed7d7;border-radius:10px;padding:16px;">
    <tr>
      <td style="font-size:14px;color:#1f2937;line-height:1.7;">
        <strong>Error Code:</strong> ${errorCode}<br>
        <strong>Description:</strong> ${errorDescription}<br>
        <strong>Order Amount:</strong> ₹${order.total ? order.total.toFixed(2) : '0.00'}<br>
        <strong>Date:</strong> ${new Date().toLocaleString('en-IN')}
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- CUSTOMER DETAILS -->
<tr>
<td style="padding:0 24px 8px;">
  <h3 style="margin:0 0 12px 0;font-size:16px;color:#111827;">Customer Details</h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;padding:16px;border:1px solid #e5e7eb;">
    <tr>
      <td style="font-size:14px;color:#1f2937;line-height:1.7;">
        <strong>Name:</strong> ${customerName}<br>
        <strong>Email:</strong> ${order.email || '—'}<br>
        <strong>Phone:</strong> ${order.shippingAddress?.phone || '—'}
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- SOLUTION MESSAGE -->
<tr>
<td style="padding:16px 24px;">
  <div style="background:#fff7ed;border-left:4px solid #f97316;padding:14px;border-radius:6px;font-size:13px;color:#111827;">
    <strong>What to do next:</strong><br>
    1. Check your payment method details<br>
    2. Ensure sufficient balance/limit<br>
    3. Try again with a different payment method<br>
    4. Contact your bank if issue persists
  </div>
</td>
</tr>

<!-- RETRY BUTTON -->
<tr>
<td align="center" style="padding:26px 24px;">
  <a href="${SITE_URL}/checkout.html"
     style="background:#5f2b27;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:30px;font-size:14px;display:inline-block;margin:6px;">
    Try Payment Again
  </a>
  <a href="${SITE_URL}/contact.html"
     style="color:#5f2b27;text-decoration:none;font-size:14px;display:block;margin-top:14px;">
    Need Help? Contact Support →
  </a>
</td>
</tr>

<tr><td style="height:4px;background:#e7d90f;"></td></tr>

<!-- FOOTER -->
<tr>
<td style="padding:18px;text-align:center;background:linear-gradient(90deg,#120f14 0%,#fd1d1d 50%,#fcb045 100%);color:#ffffff;font-size:12px;">
  © ${new Date().getFullYear()} Hexa Honey<br>Sent to <span style="color:#000000;">${order.email}</span>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>
  `;
}

/* ===== SEND FAILURE EMAIL FOR TEMP ORDERS ===== */
async function sendFailureEmailToCustomer(tempOrder, paymentError) {
    try {
        if (!tempOrder || !tempOrder.email) {
            console.log('⚠️ No email found for failure email');
            return;
        }
        
        // Validate email before sending
        if (!isValidEmail(tempOrder.email)) {
            console.log(`⚠️ Invalid email address: ${tempOrder.email}, skipping failure email for temp order`);
            return;
        }
        
        const mailer = transporter();
        
        const failureEmailHTML = failureOrderEmail(tempOrder, paymentError);
        
        await mailer.sendMail({
            from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
            to: tempOrder.email,
            subject: `⚠️ Payment Incomplete – Order ${tempOrder.orderId || 'N/A'}`,
            html: failureEmailHTML,
        });
        
        console.log(`⚠️ Payment failure email sent to: ${tempOrder.email}`);
        
    } catch (error) {
        console.error('🔥 Error sending failure email:', error);
    }
}

/* ===== RAZORPAY WEBHOOK VERIFICATION ===== */
exports.razorpayWebhook = require("firebase-functions/v2").https.onRequest(
  {
    region: "asia-south1",
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (req, res) => {
    try {
      console.log('🔔 Razorpay webhook received');
      
      if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
      }
      
      const razorpaySignature = req.headers['x-razorpay-signature'];
      const webhookSecret = RAZORPAY_WEBHOOK_SECRET.value();
      
      if (!razorpaySignature) {
        console.error('❌ No signature in headers');
        return res.status(400).json({ error: 'No signature provided' });
      }
      
      // Verify signature
      const crypto = require('crypto');
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');
      
      if (expectedSignature !== razorpaySignature) {
        console.error('❌ Invalid signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
      
      console.log('✅ Signature verified');
      
      const event = req.body.event;
      const payload = req.body.payload;
      
      console.log('Webhook event:', event);
      
      switch (event) {
        case 'payment.captured':
          await handlePaymentCaptured(payload);
          break;
          
        case 'payment.failed':
          await handlePaymentFailed(payload);
          break;
          
        case 'payment.incomplete':
          await handlePaymentIncomplete(payload);
          break;
          
        default:
          console.log(`ℹ️ Unhandled event: ${event}`);
      }
      
      res.status(200).json({ status: 'success' });
      
    } catch (error) {
      console.error('🔥 Webhook error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/* ===== PAYMENT CAPTURED HANDLER ===== */
async function handlePaymentCaptured(payload) {
  try {
    const payment = payload.payment.entity;
    const orderId = payment.notes?.orderId || payment.order_id;
    
    console.log('💰 Payment captured:', {
      paymentId: payment.id,
      orderId: orderId,
      amount: payment.amount / 100,
      currency: payment.currency,
      method: payment.method,
      bank: payment.bank,
      cardId: payment.card_id,
      wallet: payment.wallet
    });
    
    if (!orderId) {
      console.error('❌ No orderId in payment notes');
      return;
    }
    
    // Find order in Firestore by orderId
    const ordersSnapshot = await admin.firestore()
      .collection("orders")
      .where("orderId", "==", orderId)
      .get();
    
    if (ordersSnapshot.empty) {
      console.error(`❌ Order ${orderId} not found in database`);
      return;
    }
    
    const orderDoc = ordersSnapshot.docs[0];
    const orderData = orderDoc.data();
    
    // Update order with payment details
    await orderDoc.ref.update({
      paymentStatus: 'paid',
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      paymentMethod: payment.method || 'Razorpay',
      paymentBank: payment.bank || null,
      paymentCardId: payment.card_id || null,
      paymentWallet: payment.wallet || null,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Order ${orderId} marked as paid`);
    
    // Update user's orders if exists
    if (orderData.userId) {
      await admin.firestore()
        .collection("users")
        .doc(orderData.userId)
        .collection("orders")
        .doc(orderDoc.id)
        .update({
          paymentStatus: 'paid',
          razorpayPaymentId: payment.id,
          razorpayOrderId: payment.order_id,
          paymentMethod: payment.method || 'Razorpay',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    
    // SEND SUCCESS EMAIL TO CUSTOMER
    if (orderData.email) {
      await sendSuccessEmail(orderDoc.id, payment);
    }
    
    // Send admin notification
    await sendAdminNotification(orderId, payment, 'success');
    
  } catch (error) {
    console.error('🔥 Error in handlePaymentCaptured:', error);
    throw error;
  }
}

/* ===== PAYMENT FAILED HANDLER ===== */
async function handlePaymentFailed(payload) {
  try {
    const payment = payload.payment.entity;
    const orderId = payment.notes?.orderId || payment.order_id;
    
    console.log('❌ Payment failed:', {
      paymentId: payment.id,
      orderId: orderId,
      errorCode: payment.error_code,
      errorDescription: payment.error_description
    });
    
    if (!orderId) return;
    
    // Find order in Firestore
    const ordersSnapshot = await admin.firestore()
      .collection("orders")
      .where("orderId", "==", orderId)
      .get();
    
    if (ordersSnapshot.empty) return;
    
    const orderDoc = ordersSnapshot.docs[0];
    const orderData = orderDoc.data();
    
    const paymentError = {
      code: payment.error_code,
      description: payment.error_description,
      source: payment.error_source,
      step: payment.error_step,
      reason: payment.error_reason
    };
    
    // Update order with failed status
    await orderDoc.ref.update({
      paymentStatus: 'failed',
      razorpayPaymentId: payment.id,
      paymentError: paymentError,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`⚠️ Order ${orderId} marked as failed`);
    
    // SEND FAILURE EMAIL TO CUSTOMER
    if (orderData.email) {
      await sendFailureEmail(orderDoc.id, paymentError);
    }
    
    // Send admin notification
    await sendAdminNotification(orderId, payment, 'failed');
    
  } catch (error) {
    console.error('🔥 Error in handlePaymentFailed:', error);
  }
}

/* ===== PAYMENT INCOMPLETE HANDLER ===== */
async function handlePaymentIncomplete(payload) {
  try {
    const payment = payload.payment.entity;
    const orderId = payment.notes?.orderId;
    
    console.log('❓ Payment incomplete:', {
      paymentId: payment.id,
      orderId: orderId,
      status: payment.status
    });
    
    if (!orderId) return;
    
    // Find and delete temp order
    const tempOrdersSnapshot = await admin.firestore()
      .collection("tempOrders")
      .where("orderId", "==", orderId)
      .get();
    
    if (!tempOrdersSnapshot.empty) {
      const batch = admin.firestore().batch();
      tempOrdersSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`🗑️ Deleted temp order ${orderId}`);
    }
    
    // Send failure email if we have customer email
    const tempOrder = tempOrdersSnapshot.docs[0]?.data();
    if (tempOrder?.email) {
      const paymentError = {
        code: 'payment_incomplete',
        description: 'Payment was not completed',
        reason: 'User closed payment window'
      };
      
      await sendFailureEmailToCustomer(tempOrder, paymentError);
    }
    
  } catch (error) {
    console.error('🔥 Error in handlePaymentIncomplete:', error);
  }
}

/* ===== SEND SUCCESS EMAIL ===== */
async function sendSuccessEmail(orderDocId, payment) {
  try {
    const orderDoc = await admin.firestore()
      .collection("orders")
      .doc(orderDocId)
      .get();
    
    const order = orderDoc.data();
    
    if (!order || !order.email) {
      console.log('⚠️ No order or email found');
      return;
    }
    
    // Validate email before sending
    if (!isValidEmail(order.email)) {
      console.log(`⚠️ Invalid email address: ${order.email}, skipping customer email`);
      return;
    }
    
    if (order.paymentStatus !== 'paid') {
      console.log('⚠️ Order not paid, skipping email');
      return;
    }
    
    const mailer = transporter();
    
    const displayOrderId = order.orderId || orderDocId;
    console.log(`Sending success email for order: ${displayOrderId} to ${order.email}`);
    
    await mailer.sendMail({
      from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
      to: order.email,
      subject: `🎉 Payment Successful – Order ${displayOrderId}`,
      html: successOrderEmail(order, payment),
    });
    
    console.log(`✅ Success email sent to: ${order.email} for order ${displayOrderId}`);
    
    await orderDoc.ref.update({
      successEmailSent: true,
      successEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
  } catch (error) {
    console.error('🔥 Error sending success email:', error);
  }
}

/* ===== SEND FAILURE EMAIL ===== */
async function sendFailureEmail(orderDocId, paymentError) {
  try {
    const orderDoc = await admin.firestore()
      .collection("orders")
      .doc(orderDocId)
      .get();
    
    const order = orderDoc.data();
    
    if (!order || !order.email) {
      console.log('⚠️ No order or email found for failure email');
      return;
    }
    
    // Validate email before sending
    if (!isValidEmail(order.email)) {
      console.log(`⚠️ Invalid email address: ${order.email}, skipping failure email`);
      return;
    }
    
    const mailer = transporter();
    
    const displayOrderId = order.orderId || orderDocId;
    console.log(`Sending failure email for order: ${displayOrderId} to ${order.email}`);
    
    await mailer.sendMail({
      from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
      to: order.email,
      subject: `⚠️ Payment Failed – Order ${displayOrderId}`,
      html: failureOrderEmail(order, paymentError),
    });
    
    console.log(`⚠️ Failure email sent to: ${order.email} for order ${displayOrderId}`);
    
    await orderDoc.ref.update({
      failureEmailSent: true,
      failureEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
  } catch (error) {
    console.error('🔥 Error sending failure email:', error);
  }
}

/* ===== SEND ADMIN NOTIFICATION ===== */
async function sendAdminNotification(orderId, payment, status) {
  try {
    const mailer = transporter();
    
    const subject = status === 'success' 
      ? `💰 Payment Received – Order ${orderId}`
      : `❌ Payment Failed – Order ${orderId}`;
    
    const emoji = status === 'success' ? '💰' : '❌';
    
    await mailer.sendMail({
      from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
      to: ADMIN_EMAIL,
      subject: subject,
      html: adminMail(`${status === 'success' ? 'Payment received' : 'Payment failed'} for order ${orderId}`, emoji)
    });
    
    console.log(`✅ Admin ${status} notification sent for order ${orderId}`);
    
  } catch (error) {
    console.error(`🔥 Error sending admin ${status} notification:`, error);
  }
}

/* ===== CREATE RAZORPAY ORDER ===== */
exports.createRazorpayOrder = onCall(
  {
    region: "asia-south1",
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 10,
    invoker: "public"
  },
  async (request) => {
    try {
      const origin = request.rawRequest.headers.origin || 'unknown';
      console.log('🚀 createRazorpayOrder called from origin:', origin);
      console.log('Request data:', JSON.stringify(request.data));
      
      const { amount, currency = "INR", receipt, notes } = request.data;
      
      if (!amount || amount <= 0) {
        console.error('❌ Invalid amount:', amount);
        throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
      }
      
      const keyId = RAZORPAY_KEY_ID.value();
      const keySecret = RAZORPAY_KEY_SECRET.value();
      
      console.log('🔑 Razorpay config:', {
        hasKeyId: !!keyId,
        hasKeySecret: !!keySecret,
        keyIdPrefix: keyId ? keyId.substring(0, 8) + '...' : 'missing'
      });
      
      if (!keyId || !keySecret) {
        console.error('❌ Razorpay keys not configured');
        throw new functions.https.HttpsError('failed-precondition', 'Payment gateway not configured');
      }
      
      const Razorpay = require('razorpay');
      
      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
      
      const amountInPaise = Math.round(amount * 100);
      
      console.log('💳 Creating Razorpay order:', {
        amountInPaise,
        currency,
        receipt: receipt || `receipt_${Date.now()}`,
        notes
      });
      
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: currency,
        receipt: receipt || `receipt_${Date.now()}`,
        notes: notes || {},
        payment_capture: 1
      });
      
      console.log('✅ Razorpay order created:', {
        id: order.id,
        amount: order.amount,
        status: order.status,
        currency: order.currency
      });
      
      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        razorpayKey: keyId
      };
      
    } catch (error) {
      console.error('🔥 Error in createRazorpayOrder:', {
        message: error.message,
        stack: error.stack,
        errorCode: error.error_code,
        errorDescription: error.error_description
      });
      
      throw new functions.https.HttpsError('internal', error.message);
    }
  }
);

/* 🧪 TEST RAZORPAY CONFIG */
exports.testRazorpayConfig = require("firebase-functions/v2").https.onRequest(
  async (req, res) => {
    try {
      const keyId = RAZORPAY_KEY_ID.value();
      const keySecret = RAZORPAY_KEY_SECRET.value();
      
      const Razorpay = require('razorpay');
      
      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
      
      // Test by creating a small order
      const testOrder = await razorpay.orders.create({
        amount: 100, // 1 INR
        currency: "INR",
        receipt: `test_${Date.now()}`,
        payment_capture: 0
      });
      
      res.json({
        success: true,
        message: "Razorpay configuration is working",
        testOrder: {
          id: testOrder.id,
          amount: testOrder.amount,
          status: testOrder.status
        },
        config: {
          keyIdPresent: !!keyId,
          keySecretPresent: !!keySecret,
          keyIdPrefix: keyId ? keyId.substring(0, 8) + '...' : 'missing',
          region: "asia-south1"
        }
      });
      
    } catch (error) {
      console.error('Razorpay test error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack,
        config: {
          keyIdPresent: !!RAZORPAY_KEY_ID.value(),
          keySecretPresent: !!RAZORPAY_KEY_SECRET.value()
        }
      });
    }
  }
);

/* ===== VERIFY PAYMENT ===== */
exports.verifyPayment = require("firebase-functions/v2").https.onCall(
  {
    region: "asia-south1",
    cors: true,
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (request) => {
    try {
      const { razorpayPaymentId, razorpayOrderId, razorpaySignature, orderId } = request.data;
      
      if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new Error("Missing payment verification data");
      }
      
      const crypto = require('crypto');
      const keySecret = RAZORPAY_KEY_SECRET.value();
      
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(razorpayOrderId + "|" + razorpayPaymentId)
        .digest('hex');
      
      if (expectedSignature !== razorpaySignature) {
        throw new Error("Invalid payment signature");
      }
      
      console.log('✅ Payment verified successfully');
      
      return {
        success: true,
        message: 'Payment verified successfully'
      };
      
    } catch (error) {
      console.error('🔥 Payment verification error:', error);
      throw new Error(`Payment verification failed: ${error.message}`);
    }
  }
);

/* ===== ORDER CREATED - ONLY FOR PAID ORDERS ===== */
exports.onOrderCreated = onDocumentCreated(
  {
    document: "orders/{id}",
    region: "asia-south1",
  },
  async (event) => {
    try {
      const orderId = event.params.id;
      console.log(`📦 Order created: ${orderId}`);
      
      const orderDoc = await admin.firestore()
        .collection("orders")
        .doc(orderId)
        .get();
      
      const order = orderDoc.data();
      
      if (!order) {
        console.error(`❌ Order ${orderId} not found`);
        return;
      }
      
      // ONLY send notifications for PAID orders
      if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'completed') {
        console.log(`⚠️ Order ${orderId} not paid, skipping notifications`);
        return;
      }
      
      // Get the display order ID - orderId from the document ID or from order.orderId field
      const displayOrderId = order.orderId || orderId;
      
      console.log('✅ Paid order created, sending notifications:', {
        orderId: displayOrderId,
        email: order.email,
        total: order.total,
        paymentStatus: order.paymentStatus
      });
      
      const mailer = transporter();
      
      // Send admin notification
      await mailer.sendMail({
        from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
        to: ADMIN_EMAIL,
        subject: `💰 New PAID Order - ${displayOrderId}`,
        html: adminMail(`New PAID order received: ${displayOrderId}`, "💰"),
      });
      console.log('✅ Admin notification sent for paid order');
      
      // Send customer confirmation email (payment success email)
      if (order.email && isValidEmail(order.email)) {
        // Get payment details if available
        let paymentDetails = {
          id: order.razorpayPaymentId || '—',
          method: order.paymentMethod || 'Razorpay',
          created_at: Math.floor(Date.now() / 1000)
        };
        
        await mailer.sendMail({
          from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
          to: order.email,
          subject: `🎉 Payment Successful – Order ${displayOrderId}`,
          html: successOrderEmail(order, paymentDetails),
        });
        console.log(`✅ Success email sent to: ${order.email}`);
      } else if (order.email) {
        console.log(`⚠️ Invalid email address: ${order.email}, skipping customer email`);
      }
      
      // Clean up temp order if exists
      if (order.orderId) {
        const tempOrdersSnapshot = await admin.firestore()
          .collection('tempOrders')
          .where('orderId', '==', order.orderId)
          .get();
        
        if (!tempOrdersSnapshot.empty) {
          const batch = admin.firestore().batch();
          tempOrdersSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          console.log('🗑️ Cleaned up temp orders');
        }
      }
      
    } catch (error) {
      console.error('🔥 Error in onOrderCreated:', error);
    }
  }
);

/* ⭐ REVIEW SUBMITTED */
exports.onNewReview = onDocumentCreated("reviews/{id}", async () => {
  const mailer = transporter();
  await mailer.sendMail({
    from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
    to: ADMIN_EMAIL,
    subject: "⭐ New Review Submitted",
    html: adminMail("New review submitted", "⭐"),
  });
});

/* 👤 CUSTOMER REGISTERED */
exports.onNewCustomer = onDocumentCreated("users/{id}", async () => {
  const mailer = transporter();
  await mailer.sendMail({
    from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
    to: ADMIN_EMAIL,
    subject: "👤 New Customer Registered",
    html: adminMail("New customer registered", "👤"),
  });
});

/* 📩 NEW MESSAGE */
exports.onNewMessage = onDocumentCreated("contactSubmissions/{id}", async () => {
  const mailer = transporter();
  await mailer.sendMail({
    from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
    to: ADMIN_EMAIL,
    subject: "📩 New Message Received",
    html: adminMail("New contact message received", "📩"),
  });
});

/* 🔧 MANUAL EMAIL RESEND FUNCTION */
exports.resendOrderEmail = require("firebase-functions/v2").https.onCall(
  {
    region: "asia-south1",
  },
  async (request) => {
    const { orderId } = request.data;
    
    if (!orderId) {
      throw new Error("Order ID is required");
    }
    
    try {
      // Get order data
      const orderDoc = await admin.firestore()
        .collection("orders")
        .doc(orderId)
        .get();
      
      const order = orderDoc.data();
      
      if (!order) throw new Error("Order not found");
      if (!order.email) throw new Error("No customer email");
      
      // Validate email before sending
      if (!isValidEmail(order.email)) {
        throw new Error(`Invalid email address: ${order.email}`);
      }
      
      // Resend customer email
      const mailer = transporter();
      
      const displayOrderId = order.orderId || orderId;
      
      await mailer.sendMail({
        from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
        to: order.email,
        subject: `Your Order Has Been Confirmed – Natura Honey (${displayOrderId})`,
        html: successOrderEmail(order, {}),
      });
      
      // Update timestamp
      await admin.firestore()
        .collection("orders")
        .doc(orderId)
        .update({
          emailResentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailResentCount: admin.firestore.FieldValue.increment(1)
        });
      
      return { 
        success: true, 
        message: `Email resent to ${order.email}`,
        orderNumber: order.orderId || orderId
      };
      
    } catch (error) {
      console.error('Resend error:', error);
      throw new Error(`Failed: ${error.message}`);
    }
  }
);

/* 🧪 TEST FUNCTION */
exports.testEmailConfig = require("firebase-functions/v2").https.onRequest(
  async (req, res) => {
    try {
      const email = GMAIL_EMAIL.value();
      const pass = GMAIL_PASS.value();
      
      res.json({
        success: true,
        config: {
          email: email || "MISSING",
          passConfigured: !!pass,
          passLength: pass ? pass.length : 0
        },
        message: "Using direct GMAIL_EMAIL and GMAIL_PASS params"
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Add this to your index.js - HTTP endpoint with proper CORS
exports.createRazorpayOrderHttp = require("firebase-functions/v2").https.onRequest(
  {
    region: "asia-south1",
    cors: true,  // This enables CORS for HTTP calls
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 10
  },
  async (req, res) => {
    // Set CORS headers manually (v2 onRequest with cors: true should handle this)
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    // Handle preflight (OPTIONS) requests
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).json({ 
        success: false, 
        error: 'Method not allowed. Use POST.' 
      });
      return;
    }
    
    try {
      console.log('🚀 HTTP createRazorpayOrder called');
      
      // Extract data from request body
      const requestData = req.body.data || req.body;
      const { amount, currency = "INR", receipt, notes } = requestData;
      
      console.log('Request data:', { amount, currency, receipt, notes });
      
      if (!amount || amount <= 0) {
        res.status(400).json({ 
          success: false, 
          error: 'Amount must be a positive number' 
        });
        return;
      }
      
      const keyId = RAZORPAY_KEY_ID.value();
      const keySecret = RAZORPAY_KEY_SECRET.value();
      
      console.log('🔑 Razorpay config:', {
        hasKeyId: !!keyId,
        hasKeySecret: !!keySecret,
        keyIdPrefix: keyId ? keyId.substring(0, 8) + '...' : 'missing'
      });
      
      if (!keyId || !keySecret) {
        console.error('❌ Razorpay keys not configured');
        res.status(500).json({ 
          success: false, 
          error: 'Payment gateway not configured' 
        });
        return;
      }
      
      const Razorpay = require('razorpay');
      
      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret
      });
      
      const amountInPaise = Math.round(amount * 100);
      
      console.log('💳 Creating Razorpay order:', {
        amountInPaise,
        currency,
        receipt: receipt || `receipt_${Date.now()}`
      });
      
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: currency,
        receipt: receipt || `receipt_${Date.now()}`,
        notes: notes || {},
        payment_capture: 1
      });
      
      console.log('✅ Razorpay order created:', {
        id: order.id,
        amount: order.amount,
        status: order.status,
        currency: order.currency
      });
      
      res.status(200).json({
        success: true,
        result: {
          orderId: order.id,
          amount: order.amount / 100,
          currency: order.currency,
          razorpayKey: keyId
        }
      });
      
    } catch (error) {
      console.error('🔥 Error in createRazorpayOrderHttp:', {
        message: error.message,
        stack: error.stack,
        errorCode: error.error_code,
        errorDescription: error.error_description
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to create payment order: ' + error.message
      });
    }
  }
);

/* ===== CLEANUP EXPIRED TEMP ORDERS ===== */
exports.cleanupTempOrders = require("firebase-functions/v2").scheduler.onSchedule({
  schedule: "every 1 hours",
  region: "asia-south1",
  timeZone: "Asia/Kolkata"
}, async () => {
  try {
    const now = admin.firestore.Timestamp.now();
    
    const expiredOrders = await admin.firestore()
      .collection("tempOrders")
      .where("expiresAt", "<", now)
      .get();
    
    if (expiredOrders.empty) {
      console.log("No expired temp orders to clean up");
      return;
    }
    
    const batch = admin.firestore().batch();
    expiredOrders.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`🗑️ Cleaned up ${expiredOrders.size} expired temp orders`);
    
  } catch (error) {
    console.error("Error cleaning up temp orders:", error);
  }
});