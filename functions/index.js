const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

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

async function requireCareerAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in as an administrator to continue.");
  }

  const adminSnapshot = await admin.firestore()
    .collection("admins")
    .doc(request.auth.uid)
    .get();
  if (!adminSnapshot.exists || adminSnapshot.data().admin !== true) {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }
}

function readCareerOpening(data) {
  const readText = (value, field, maxLength, required = true) => {
    if (typeof value !== "string") {
      if (!required && (value === undefined || value === null)) return "";
      throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
    }
    const text = value.replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .trim();
    if ((required && !text) || text.length > maxLength) {
      throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
    }
    return text;
  };

  const readList = (value, field) => {
    if (!Array.isArray(value) || value.length > 12) {
      throw new HttpsError("invalid-argument", `Please provide valid ${field}.`);
    }
    return value.map((item) => readText(item, field, 300)).filter(Boolean);
  };

  const status = readText(data.status, "status", 10);
  if (!["draft", "open", "closed"].includes(status)) {
    throw new HttpsError("invalid-argument", "Choose a valid job status.");
  }
  const deadline = readText(data.deadline, "application deadline", 10, false);
  if (deadline) {
    const parsedDeadline = Date.parse(`${deadline}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || !Number.isFinite(parsedDeadline) ||
        new Date(parsedDeadline).toISOString().slice(0, 10) !== deadline) {
      throw new HttpsError("invalid-argument", "Choose a valid application deadline.");
    }
  }

  const employmentType = readText(data.employmentType, "employment type", 40);
  if (!["Full-time", "Part-time", "Contract", "Internship"].includes(employmentType)) {
    throw new HttpsError("invalid-argument", "Choose a valid employment type.");
  }
  const workplace = readText(data.workplace, "work arrangement", 30);
  if (!["On-site", "Hybrid", "Remote"].includes(workplace)) {
    throw new HttpsError("invalid-argument", "Choose a valid work arrangement.");
  }
  const responsibilities = readList(data.responsibilities, "responsibilities");
  if (!responsibilities.length) {
    throw new HttpsError("invalid-argument", "Add at least one job responsibility.");
  }

  return {
    title: readText(data.title, "job title", 120),
    department: readText(data.department, "department", 100),
    location: readText(data.location, "location", 120),
    employmentType,
    workplace,
    salaryRange: readText(data.salaryRange, "salary range", 120, false),
    summary: readText(data.summary, "job summary", 1200),
    responsibilities,
    requirements: readList(data.requirements, "requirements"),
    benefits: readList(data.benefits, "benefits"),
    deadline,
    status
  };
}

function careerDateInThalassery() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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

exports.submitCareerApplication = onCall(
  {
    cors: [
      "https://www.hexahoney.in",
      "https://hexahoney.in",
      "https://hexahoney-96aed.web.app",
      "https://hexahoney-96aed.firebaseapp.com"
    ],
    maxInstances: 5,
    memory: "512MiB",
    timeoutSeconds: 60
  },
  async (request) => {
    const data = request.data || {};

    const readText = (value, field, maxLength, required = true) => {
      if (typeof value !== "string") {
        if (!required && (value === undefined || value === null)) return "";
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }

      const text = value.replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .trim();
      if ((required && !text) || text.length > maxLength) {
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }
      return text;
    };

    if (readText(data.website, "website", 200, false)) {
      throw new HttpsError("invalid-argument", "Unable to process this application.");
    }

    const name = readText(data.name, "name", 120);
    const email = readText(data.email, "email", 254);
    const phone = readText(data.phone, "phone number", 25);
    const location = readText(data.location, "location", 120);
    const message = readText(data.message, "message", 3000, false);

    if (!isValidEmail(email)) {
      throw new HttpsError("invalid-argument", "Please enter a valid email address.");
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (!/^[+()\d\s.-]+$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      throw new HttpsError("invalid-argument", "Please enter a valid phone number.");
    }

    const resume = data.resume;
    if (!resume || typeof resume !== "object") {
      throw new HttpsError("invalid-argument", "Please attach a PDF, DOC, or DOCX resume.");
    }

    const filename = typeof resume.name === "string"
      ? resume.name.replace(/\\/g, "/").split("/").pop().replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120)
      : "";
    const extension = filename.split(".").pop().toLowerCase();
    const expectedTypes = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    };
    if (!filename || !expectedTypes[extension] ||
        (resume.type && resume.type !== expectedTypes[extension]) ||
        typeof resume.data !== "string" ||
        resume.data.length > 7_000_000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(resume.data)) {
      throw new HttpsError("invalid-argument", "Choose a PDF, DOC, or DOCX resume smaller than 5 MB.");
    }

    const resumeBuffer = Buffer.from(resume.data, "base64");
    if (!resumeBuffer.length || resumeBuffer.length > 5 * 1024 * 1024 ||
        resumeBuffer.toString("base64") !== resume.data) {
      throw new HttpsError("invalid-argument", "Choose a resume smaller than 5 MB.");
    }

    const isPdf = extension === "pdf" && resumeBuffer.subarray(0, 5).toString() === "%PDF-";
    const isDoc = extension === "doc" &&
      resumeBuffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    const isDocx = extension === "docx" &&
      resumeBuffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (!isPdf && !isDoc && !isDocx) {
      throw new HttpsError("invalid-argument", "The selected file does not match its document type.");
    }

    const clientIp = request.rawRequest.ip;
    if (!clientIp) {
      throw new HttpsError("failed-precondition", "Unable to verify the application request.");
    }
    const ipHash = crypto.createHash("sha256").update(clientIp).digest("hex");
    const rateLimitRef = admin.firestore().collection("careerApplicationLimits").doc(ipHash);
    const now = Date.now();
    const rateWindowMs = 15 * 60 * 1000;
    await admin.firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateLimitRef);
      const limit = snapshot.data();
      const windowStartedAt = limit?.windowStartedAt || 0;
      const currentCount = now - windowStartedAt < rateWindowMs ? (limit?.count || 0) : 0;
      if (currentCount >= 3) {
        throw new HttpsError("resource-exhausted", "Please wait before submitting another application.");
      }
      transaction.set(rateLimitRef, {
        windowStartedAt: currentCount ? windowStartedAt : now,
        count: currentCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    const jobId = data.jobId === undefined || data.jobId === null ? "" : data.jobId;
    if (typeof jobId !== "string" || (jobId && !/^[A-Za-z0-9_-]{1,128}$/.test(jobId))) {
      throw new HttpsError("invalid-argument", "Choose a valid job opening.");
    }
    let jobRef = null;
    let jobTitle = "General introduction";
    if (jobId) {
      jobRef = admin.firestore().collection("careerOpenings").doc(jobId);
      const jobSnapshot = await jobRef.get();
      if (!jobSnapshot.exists) {
        throw new HttpsError("not-found", "This job opening is no longer available.");
      }
      const job = jobSnapshot.data();
      if (job.status !== "open" || (job.deadline && job.deadline < careerDateInThalassery())) {
        throw new HttpsError("failed-precondition", "Applications for this job are closed.");
      }
      jobTitle = job.title;
    }

    const applicationRef = admin.firestore().collection("careerApplications").doc();
    const storagePath = `career-applications/${applicationRef.id}/${filename}`;
    const resumeFile = admin.storage().bucket().file(storagePath);
    try {
      await resumeFile.save(resumeBuffer, {
        resumable: false,
        metadata: {
          contentType: expectedTypes[extension],
          contentDisposition: `attachment; filename="${filename}"`,
          cacheControl: "private, max-age=0, no-transform"
        }
      });
      await admin.firestore().runTransaction(async (transaction) => {
        if (jobRef) {
          const jobSnapshot = await transaction.get(jobRef);
          const job = jobSnapshot.data();
          if (!jobSnapshot.exists || job.status !== "open" ||
              (job.deadline && job.deadline < careerDateInThalassery())) {
            throw new HttpsError("failed-precondition", "Applications for this job are closed.");
          }
          jobTitle = job.title;
        }

        transaction.set(applicationRef, {
          name,
          email,
          phone,
          location,
          message,
          jobId: jobId || null,
          jobTitle,
          resumeName: filename,
          resumeContentType: expectedTypes[extension],
          resumeSize: resumeBuffer.length,
          resumePath: storagePath,
          submittedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        if (jobRef) {
          transaction.update(jobRef, {
            applicationCount: admin.firestore.FieldValue.increment(1)
          });
        }
      });
    } catch (error) {
      try {
        await applicationRef.delete();
      } catch (cleanupError) {
        console.error("Career application record cleanup failed:", cleanupError);
      }
      try {
        await resumeFile.delete();
      } catch (cleanupError) {
        if (cleanupError.code !== 404) {
          console.error("Career application resume cleanup failed:", cleanupError);
        }
      }
      console.error("Career application storage failed:", error);
      throw new HttpsError("internal", "Unable to save your application right now.");
    }

    const text = [
      "A career introduction was submitted through the Hexa Apiarium careers page.",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Location: ${location}`,
      `Job: ${jobTitle}`,
      "",
      "Note:",
      message || "No note provided."
    ].join("\n");

    try {
      const mailer = transporter();
      await mailer.sendMail({
        from: `"Hexa Apiarium Careers" <${GMAIL_EMAIL.value()}>`,
        to: ADMIN_EMAIL,
        replyTo: email,
        subject: jobId ? `Job application: ${jobTitle}` : "Career introduction - Hexa Apiarium",
        text,
        attachments: [{
          filename,
          content: resumeBuffer,
          contentType: expectedTypes[extension]
        }]
      });
      return { success: true, notificationSent: true };
    } catch (error) {
      console.error("Career application email failed:", error);
      return { success: true, notificationSent: false };
    }
  }
);

exports.getCareerApplications = onCall(async (request) => {
  await requireCareerAdmin(request);
  let query = admin.firestore().collection("careerApplications");
  const jobId = request.data?.jobId;
  if (jobId !== undefined && jobId !== null) {
    if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
      throw new HttpsError("invalid-argument", "Choose a valid job opening.");
    }
    query = query.where("jobId", "==", jobId);
  }
  const snapshot = await query.orderBy("submittedAt", "desc").limit(100).get();

  return {
    applications: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        location: data.location,
        message: data.message || "",
        jobId: data.jobId || null,
        jobTitle: data.jobTitle || "General introduction",
        resumeName: data.resumeName,
        resumeSize: data.resumeSize,
        submittedAt: data.submittedAt?.toMillis() || null
      };
    })
  };
});

exports.getCareerOpenings = onCall(async () => {
  const today = careerDateInThalassery();
  const snapshot = await admin.firestore()
    .collection("careerOpenings")
    .where("status", "==", "open")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return {
    openings: snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((opening) => !opening.deadline || opening.deadline >= today)
      .map((opening) => ({
        id: opening.id,
        title: opening.title,
        department: opening.department,
        location: opening.location,
        employmentType: opening.employmentType,
        workplace: opening.workplace,
        salaryRange: opening.salaryRange || "",
        summary: opening.summary,
        responsibilities: opening.responsibilities || [],
        requirements: opening.requirements || [],
        benefits: opening.benefits || [],
        deadline: opening.deadline || ""
      }))
  };
});

exports.getCareerOpeningsAdmin = onCall(async (request) => {
  await requireCareerAdmin(request);
  const snapshot = await admin.firestore()
    .collection("careerOpenings")
    .orderBy("updatedAt", "desc")
    .limit(200)
    .get();

  return {
    openings: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  };
});

exports.manageCareerOpening = onCall(async (request) => {
  await requireCareerAdmin(request);
  const data = request.data || {};
  if (data.action === "delete") {
    if (typeof data.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id)) {
      throw new HttpsError("invalid-argument", "Choose a valid job opening.");
    }
    await admin.firestore().collection("careerOpenings").doc(data.id).delete();
    return { success: true };
  }
  if (data.action !== "save") {
    throw new HttpsError("invalid-argument", "Choose a valid job action.");
  }

  const opening = readCareerOpening(data.opening || {});
  const collection = admin.firestore().collection("careerOpenings");
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (data.id !== undefined && data.id !== null) {
    if (typeof data.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id)) {
      throw new HttpsError("invalid-argument", "Choose a valid job opening.");
    }
    const reference = collection.doc(data.id);
    const existing = await reference.get();
    if (!existing.exists) throw new HttpsError("not-found", "This job opening no longer exists.");
    await reference.set({ ...opening, updatedAt: now }, { merge: true });
    return { success: true, id: data.id };
  }

  const reference = collection.doc();
  await reference.set({
    ...opening,
    applicationCount: 0,
    createdAt: now,
    updatedAt: now
  });
  return { success: true, id: reference.id };
});

exports.getCareerApplicationResume = onCall(async (request) => {
  await requireCareerAdmin(request);
  const applicationId = request.data?.applicationId;
  if (typeof applicationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(applicationId)) {
    throw new HttpsError("invalid-argument", "Choose a valid application.");
  }

  const applicationSnapshot = await admin.firestore()
    .collection("careerApplications")
    .doc(applicationId)
    .get();
  if (!applicationSnapshot.exists) {
    throw new HttpsError("not-found", "This application could not be found.");
  }

  const application = applicationSnapshot.data();
  if (typeof application.resumePath !== "string" ||
      !application.resumePath.startsWith(`career-applications/${applicationId}/`)) {
    throw new HttpsError("failed-precondition", "This application has no available resume.");
  }

  try {
    const [resumeBuffer] = await admin.storage()
      .bucket()
      .file(application.resumePath)
      .download();
    return {
      fileName: application.resumeName,
      contentType: application.resumeContentType,
      data: resumeBuffer.toString("base64")
    };
  } catch (error) {
    console.error("Career application resume retrieval failed:", error);
    throw new HttpsError("internal", "This resume could not be opened right now.");
  }
});