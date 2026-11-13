const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString, defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

setGlobalOptions({ region: "asia-south1" });
initializeApp();

/* ===== SIMPLE PARAMS SETUP ===== */
const GMAIL_EMAIL = defineString("GMAIL_EMAIL");
const GMAIL_PASS = defineSecret("GMAIL_PASS");
const RAZORPAY_KEY_ID = defineString("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
const RAZORPAY_WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");

const ADMIN_EMAIL = "hexanatura.info@gmail.com";
const DASHBOARD_URL = "https://www.hexahoney.in/dashboard.html";
const SITE_URL = "https://www.hexahoney.in/";
const TRACK_URL = "https://www.hexahoney.in/trackorder.html";
const SITE_CORS_ORIGINS = [
  "https://www.hexahoney.in",
  "https://hexahoney.in",
  "https://hexahoney-96aed.web.app",
  "https://hexahoney-96aed.firebaseapp.com"
];
const DEFAULT_PRODUCT_PRICES = {
  "1": 420,
  "2": 230,
  "3": 65,
  "4": 40,
  "5": 370,
  "6": 200
};
const DEFAULT_PRODUCTS = {
  "1": { name: "Natura AGMARK Honey - 1 kg Glass Pack", weight: "1Kg" },
  "2": { name: "Natura AGMARK Honey - 500 g Glass Pack", weight: "500g" },
  "3": { name: "Natura AGMARK Honey - 100 g Glass Pack", weight: "100g" },
  "4": { name: "Natura AGMARK Honey - 50 g Glass Pack", weight: "50g" },
  "5": { name: "Natura AGMARK Honey - 1 kg PET Pack", weight: "1Kg" },
  "6": { name: "Natura AGMARK Honey - 500 g PET Pack", weight: "500g" }
};

async function enforceIpRateLimit(request, idPrefix, maxAttempts, windowMs, message) {
  const ipAddress = request.rawRequest.ip;
  if (!ipAddress) {
    throw new HttpsError("failed-precondition", "Unable to verify this request.");
  }

  const limitId = idPrefix + crypto.createHash("sha256").update(ipAddress).digest("hex");
  const limitRef = getFirestore().collection("orderTrackingLimits").doc(limitId);
  const now = Timestamp.now();
  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(limitRef);
    const data = snapshot.data() || {};
    const windowStartedAt = data.windowStartedAt?.toMillis?.() || 0;
    const attempts = windowStartedAt > now.toMillis() - windowMs ? data.attempts || 0 : 0;
    if (attempts >= maxAttempts) {
      throw new HttpsError("resource-exhausted", message);
    }
    transaction.set(limitRef, {
      windowStartedAt: windowStartedAt > now.toMillis() - windowMs ? data.windowStartedAt : now,
      attempts: attempts + 1,
      updatedAt: now
    });
  });
}

const {
  deleteTempOrderAndReleasePromo,
  hasPromoUsageAvailable,
  isPromoExpired,
  reservePromoUse
} = require("./promoReservations");

async function priceCheckoutOrder(tempOrder, db) {
  if (!Array.isArray(tempOrder.items) || !tempOrder.items.length || tempOrder.items.length > 30) {
    throw new HttpsError("invalid-argument", "Checkout items are invalid.");
  }

  const pricedItems = await Promise.all(tempOrder.items.map(async (item) => {
    const productId = String(item?.productId ?? "");
    const quantity = item?.quantity;
    if (!/^\d{1,8}$/.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpsError("invalid-argument", "Checkout items are invalid.");
    }

    const productSnapshot = await db.collection("products").doc(productId).get();
    const product = productSnapshot.data() || {};
    if (product.inStock === false) {
      throw new HttpsError("failed-precondition", "An item in your cart is no longer available.");
    }

    const price = Number.isFinite(product.price) ? product.price : DEFAULT_PRODUCT_PRICES[productId];
    if (!Number.isFinite(price) || price < 0) {
      throw new HttpsError("failed-precondition", "An item in your cart is unavailable.");
    }
    const priceCents = Math.round(price * 100);
    return {
      productId,
      name: typeof product.name === "string"
        ? product.name.slice(0, 200)
        : DEFAULT_PRODUCTS[productId]?.name || "Product",
      weight: typeof product.weight === "string"
        ? product.weight.slice(0, 50)
        : DEFAULT_PRODUCTS[productId]?.weight || "",
      image: "",
      price: priceCents / 100,
      quantity,
      subtotal: priceCents * quantity / 100
    };
  }));
  const subtotalCents = pricedItems.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);

  const settingsSnapshot = await db.collection("settings").doc("storefront").get();
  const settings = settingsSnapshot.data() || {};
  const freeShippingThreshold = Number.isFinite(settings.freeShippingThreshold)
    ? Math.max(0, settings.freeShippingThreshold)
    : 299;
  const deliveryFee = Number.isFinite(settings.deliveryFee) ? Math.max(0, settings.deliveryFee) : 59;
  let shippingCents = settings.autoApplyFreeShipping !== false &&
    subtotalCents >= Math.round(freeShippingThreshold * 100)
    ? 0
    : Math.round(deliveryFee * 100);

  let discountCents = 0;
  let promoCodeId = null;
  const promoCode = typeof tempOrder.promoCode === "string"
    ? tempOrder.promoCode.trim().toUpperCase()
    : "";
  if (promoCode) {
    let promoSnapshot = await db.collection("promoCodes")
      .where("code", "==", promoCode)
      .limit(1)
      .get();
    let promoDocument = promoSnapshot.docs[0];
    if (!promoDocument) {
      const byId = await db.collection("promoCodes").doc(promoCode).get();
      if (byId.exists) promoDocument = byId;
    }
    const promo = promoDocument?.data();
    const validUntil = promo?.validUntil;
    const promoExpired = isPromoExpired(validUntil, careerDateInThalassery());
    if (!promo || promo.active !== true ||
        promoExpired ||
        (Number(promo.minOrder) > 0 && subtotalCents < Math.round(Number(promo.minOrder) * 100)) ||
        (!tempOrder.promoReserved && !hasPromoUsageAvailable(promo))) {
      throw new HttpsError("failed-precondition", "The promo code is no longer valid.");
    }

    const type = promo.type || "fixed";
    if (type === "shipping") {
      shippingCents = 0;
    } else if (type === "percentage" && Number.isFinite(promo.value) && promo.value > 0) {
      discountCents = Math.round((subtotalCents + shippingCents) * (promo.value / 100));
      if (Number.isFinite(promo.maxDiscount) && promo.maxDiscount > 0) {
        discountCents = Math.min(discountCents, Math.round(promo.maxDiscount * 100));
      }
    } else if (type === "fixed" && Number.isFinite(promo.value) && promo.value > 0) {
      discountCents = Math.min(Math.round(promo.value * 100), subtotalCents + shippingCents);
    } else if (type !== "shipping") {
      throw new HttpsError("failed-precondition", "The promo code is not configured correctly.");
    }
    promoCodeId = promoDocument.id;
  }

  const totalCents = subtotalCents + shippingCents - discountCents;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new HttpsError("failed-precondition", "Checkout total must be greater than zero.");
  }

  return {
    items: pricedItems,
    subtotal: subtotalCents / 100,
    shipping: shippingCents / 100,
    discount: discountCents / 100,
    total: totalCents / 100,
    promoCode: promoCode || null,
    promoCodeId
  };
}

async function requireCareerAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in as an administrator to continue.");
  }

  const adminSnapshot = await getFirestore()
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

exports.submitContactMessage = onCall(
  {
    region: "asia-south1",
    cors: SITE_CORS_ORIGINS,
    maxInstances: 5
  },
  async (request) => {
    await enforceIpRateLimit(
      request,
      "contact_",
      5,
      15 * 60 * 1000,
      "Too many messages were submitted. Try again later."
    );

    const data = request.data || {};
    const readText = (value, field, maxLength, required = true) => {
      if (typeof value !== "string") {
        if (!required && (value === undefined || value === null)) return "";
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }
      const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if ((required && !text) || text.length > maxLength) {
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }
      return text;
    };

    const name = readText(data.name, "name", 120);
    const email = readText(data.email, "email", 254).toLowerCase();
    const phone = readText(data.phone, "phone number", 30, false);
    const subject = readText(data.subject, "subject", 160);
    const message = readText(data.message, "message", 4000);
    if (!isValidEmail(email) || (phone && !/^[+()\d\s.-]+$/.test(phone))) {
      throw new HttpsError("invalid-argument", "Please provide valid contact details.");
    }

    const submission = {
      name,
      email,
      phone: phone || "Not provided",
      subject,
      message,
      userId: request.auth?.uid || "guest",
      createdAt: FieldValue.serverTimestamp(),
      page: "contact",
      status: "new"
    };
    const reference = await getFirestore().collection("contactSubmissions").add(submission);
    return { success: true, id: reference.id };
  }
);

exports.submitReview = onCall(
  {
    region: "asia-south1",
    cors: SITE_CORS_ORIGINS,
    maxInstances: 5
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in to submit a review.");
    }

    await enforceIpRateLimit(
      request,
      "review_",
      5,
      60 * 60 * 1000,
      "Too many reviews were submitted. Try again later."
    );

    const data = request.data || {};
    const readText = (value, field, maxLength) => {
      if (typeof value !== "string") {
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }
      const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if (!text || text.length > maxLength) {
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }
      return text;
    };
    const userName = readText(data.userName, "name", 120);
    const userLocation = readText(data.userLocation, "location", 120);
    const reviewText = readText(data.reviewText, "review", 2000);
    if (reviewText.length < 10 || !Number.isInteger(data.rating) ||
        data.rating < 1 || data.rating > 5) {
      throw new HttpsError("invalid-argument", "Please provide a valid rating and review.");
    }

    const limitRef = getFirestore()
      .collection("reviewSubmissionLimits")
      .doc(request.auth.uid);
    const now = Date.now();
    await getFirestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(limitRef);
      const previous = snapshot.data() || {};
      const startedAt = Number(previous.windowStartedAt) || 0;
      const attempts = now - startedAt < 24 * 60 * 60 * 1000
        ? Number(previous.attempts) || 0
        : 0;
      if (attempts >= 3) {
        throw new HttpsError("resource-exhausted", "You have reached the daily review limit.");
      }
      transaction.set(limitRef, {
        windowStartedAt: attempts ? startedAt : now,
        attempts: attempts + 1,
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    const reference = await getFirestore().collection("reviews").add({
      userName,
      userLocation,
      rating: data.rating,
      reviewText,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      userId: request.auth.uid
    });
    return { success: true, id: reference.id };
  }
);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

/* ===== MAIL TRANSPORTER ===== */
function transporter() {
  const email = GMAIL_EMAIL.value();
  const pass = GMAIL_PASS.value();

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
      <h2>${escapeHtml(emoji)} ${escapeHtml(title)}</h2>
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
  const orderNumber = escapeHtml(order.orderId || order.id || `ORD-${Date.now().toString().slice(-8)}`);
  
  const customerName = order.shippingAddress ? 
    escapeHtml(`${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim()) :
    escapeHtml(order.email);
  
  // Payment details
  const paymentMethod = escapeHtml(getPaymentMethodDisplay(payment?.method));
  const transactionId = escapeHtml(payment?.id || order.razorpayPaymentId || '');
  const fullTransactionId = transactionId || '—';
  const paymentDate = escapeHtml(new Date(payment?.created_at * 1000 || Date.now()).toLocaleString('en-IN'));
  
  const itemsList = (order.items || [])
    .map(item => {
      const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
      const price = Number.isFinite(item.price) && item.price >= 0 ? item.price : 0;
      const itemTotal = qty * price;

      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
            <div style="font-weight:600;color:#111827;font-size:14px;margin-bottom:4px;">
              ${escapeHtml(item.name || "Product")}
            </div>
            ${item.weight ? `
            <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">
              Weight: ${escapeHtml(item.weight)}
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
  const subtotal = Number.isFinite(order.subtotal) ? order.subtotal : 0;
  const discount = Number.isFinite(order.discount) ? order.discount : 0;
  const shipping = Number.isFinite(order.shipping) ? order.shipping : 0;
  const total = Number.isFinite(order.total) ? order.total : subtotal - discount + shipping;

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
        <strong>Email:</strong> ${escapeHtml(order.email || '—')}<br>
        <strong>Phone:</strong> ${escapeHtml(order.shippingAddress?.phone || '—')}
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
  © ${new Date().getFullYear()} Hexa Honey<br>Sent to <span style="color:#000000;">${escapeHtml(order.email)}</span>
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
  const orderNumber = escapeHtml(order.orderId || order.id || `ORD-${Date.now().toString().slice(-8)}`);
  
  const customerName = order.shippingAddress ? 
    escapeHtml(`${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim()) :
    escapeHtml(order.email);
  
  const errorDescription = escapeHtml(paymentError?.description || 'Payment processing failed');
  const errorCode = escapeHtml(paymentError?.code || 'Unknown error');
  const total = Number.isFinite(order.total) ? order.total : 0;
  
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
        <strong>Order Amount:</strong> ₹${total.toFixed(2)}<br>
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
        <strong>Email:</strong> ${escapeHtml(order.email || '—')}<br>
        <strong>Phone:</strong> ${escapeHtml(order.shippingAddress?.phone || '—')}
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
  © ${new Date().getFullYear()} Hexa Honey<br>Sent to <span style="color:#000000;">${escapeHtml(order.email)}</span>
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
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [RAZORPAY_WEBHOOK_SECRET, GMAIL_PASS]
  },
  async (req, res) => {
    try {
      console.log('🔔 Razorpay webhook received');
      
      if (req.method !== 'POST') {
        return res.status(405).send('Method not allowed');
      }
      
      const razorpaySignature = req.headers['x-razorpay-signature'];
      const webhookSecret = RAZORPAY_WEBHOOK_SECRET.value();
      
      if (typeof razorpaySignature !== "string") {
        return res.status(400).json({ error: 'No signature provided' });
      }
      if (!webhookSecret) {
        console.error("Razorpay webhook secret is not configured.");
        return res.status(500).json({ error: "Webhook verification unavailable." });
      }
      
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(req.rawBody || Buffer.from(JSON.stringify(req.body)))
        .digest('hex');
      const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");
      const providedSignatureBuffer = Buffer.from(razorpaySignature, "hex");
      
      if (expectedSignatureBuffer.length !== providedSignatureBuffer.length ||
          !crypto.timingSafeEqual(expectedSignatureBuffer, providedSignatureBuffer)) {
        console.error("Razorpay webhook signature verification failed.");
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
      console.error("Razorpay webhook processing failed.", error);
      res.status(500).json({ error: "Webhook processing failed." });
    }
  }
);

function matchesRazorpayOrder(payment, order) {
  const expectedAmount = Math.round(Number(order.total) * 100);
  return typeof payment.order_id === "string" &&
    payment.order_id === order.razorpayOrderId &&
    payment.currency === "INR" &&
    Number.isSafeInteger(payment.amount) &&
    payment.amount === expectedAmount;
}

/* ===== PAYMENT CAPTURED HANDLER ===== */
async function handlePaymentCaptured(payload) {
  try {
    const payment = payload?.payment?.entity;
    if (!payment || payment.status !== "captured") {
      console.error("Ignoring invalid captured-payment webhook payload.");
      return;
    }
    const orderId = payment.notes?.orderId || payment.order_id;
    
    if (!orderId) {
      console.error('❌ No orderId in payment notes');
      return;
    }
    
    // Find order in Firestore by orderId
    const ordersSnapshot = await getFirestore()
      .collection("orders")
      .where("orderId", "==", orderId)
      .limit(1)
      .get();
    
    if (ordersSnapshot.empty) {
      console.error(`❌ Order ${orderId} not found in database`);
      return;
    }
    
    const orderDoc = ordersSnapshot.docs[0];
    const orderData = orderDoc.data();
    if (!matchesRazorpayOrder(payment, orderData)) {
      console.error("Captured payment does not match the stored order.");
      return;
    }

    const db = getFirestore();
    const userOrderRef = orderData.userId
      ? db.collection("users").doc(orderData.userId).collection("orders").doc(orderDoc.id)
      : null;
    const markedPaid = await db.runTransaction(async (transaction) => {
      const currentOrder = await transaction.get(orderDoc.ref);
      if (!currentOrder.exists || currentOrder.data().paymentStatus === "paid" ||
          !matchesRazorpayOrder(payment, currentOrder.data())) {
        return false;
      }
      const userOrder = userOrderRef ? await transaction.get(userOrderRef) : null;
      const paymentUpdate = {
        paymentStatus: "paid",
        razorpayPaymentId: payment.id,
        razorpayOrderId: payment.order_id,
        paymentMethod: payment.method || "Razorpay",
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      transaction.update(orderDoc.ref, paymentUpdate);
      if (userOrder?.exists) transaction.update(userOrderRef, paymentUpdate);
      return true;
    });
    if (!markedPaid) return;
    
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
    const payment = payload?.payment?.entity;
    if (!payment || payment.status !== "failed") {
      console.error("Ignoring invalid failed-payment webhook payload.");
      return;
    }
    const orderId = payment.notes?.orderId || payment.order_id;
    
    if (!orderId) return;
    
    // Find order in Firestore
    const ordersSnapshot = await getFirestore()
      .collection("orders")
      .where("orderId", "==", orderId)
      .limit(1)
      .get();
    
    if (ordersSnapshot.empty) return;
    
    const orderDoc = ordersSnapshot.docs[0];
    const orderData = orderDoc.data();
    if (!matchesRazorpayOrder(payment, orderData)) {
      console.error("Failed payment does not match the stored order.");
      return;
    }

    const paymentError = {
      code: typeof payment.error_code === "string" ? payment.error_code.slice(0, 100) : "",
      description: typeof payment.error_description === "string"
        ? payment.error_description.slice(0, 500)
        : "",
      source: typeof payment.error_source === "string" ? payment.error_source.slice(0, 100) : "",
      step: typeof payment.error_step === "string" ? payment.error_step.slice(0, 100) : "",
      reason: typeof payment.error_reason === "string" ? payment.error_reason.slice(0, 200) : ""
    };
    
    const markedFailed = await getFirestore().runTransaction(async (transaction) => {
      const currentOrder = await transaction.get(orderDoc.ref);
      if (!currentOrder.exists || currentOrder.data().paymentStatus === "paid" ||
          !matchesRazorpayOrder(payment, currentOrder.data())) {
        return false;
      }
      transaction.update(orderDoc.ref, {
        paymentStatus: "failed",
        razorpayPaymentId: payment.id,
        paymentError,
        updatedAt: FieldValue.serverTimestamp()
      });
      return true;
    });
    if (!markedFailed) return;
    
    console.log("Payment failure recorded for order.");
    
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
    const tempOrdersSnapshot = await getFirestore()
      .collection("tempOrders")
      .where("orderId", "==", orderId)
      .get();
    
    if (!tempOrdersSnapshot.empty) {
      await Promise.all(tempOrdersSnapshot.docs.map(doc =>
        deleteTempOrderAndReleasePromo(getFirestore(), doc.ref)
      ));
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
    const orderDoc = await getFirestore()
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
      successEmailSentAt: FieldValue.serverTimestamp(),
    });
    
  } catch (error) {
    console.error('🔥 Error sending success email:', error);
  }
}

/* ===== SEND FAILURE EMAIL ===== */
async function sendFailureEmail(orderDocId, paymentError) {
  try {
    const orderDoc = await getFirestore()
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
      failureEmailSentAt: FieldValue.serverTimestamp(),
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
exports.createCheckout = onCall(
  {
    region: "asia-south1",
    cors: SITE_CORS_ORIGINS,
    maxInstances: 10
  },
  async (request) => {
    await enforceIpRateLimit(
      request,
      "checkout_",
      20,
      15 * 60 * 1000,
      "Too many checkout attempts. Try again later."
    );

    const data = request.data || {};
    const readText = (value, field, maxLength, required = true) => {
      if (typeof value !== "string") {
        if (!required && (value === undefined || value === null)) return "";
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }
      const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
      if ((required && !text) || text.length > maxLength) {
        throw new HttpsError("invalid-argument", `Please provide a valid ${field}.`);
      }
      return text;
    };

    const email = readText(data.email, "email", 254).toLowerCase();
    const firstName = readText(data.firstName, "first name", 100);
    const lastName = readText(data.lastName, "last name", 100);
    const address = readText(data.address, "address", 300);
    const apartment = readText(data.apartment, "apartment", 150, false);
    const city = readText(data.city, "city", 100);
    const state = readText(data.state, "state", 100);
    const zipCode = readText(data.zipCode, "PIN code", 6);
    const phone = readText(data.phone, "phone number", 10);
    if (!isValidEmail(email) || !/^\d{6}$/.test(zipCode) || !/^[6-9]\d{9}$/.test(phone)) {
      throw new HttpsError("invalid-argument", "Please provide valid contact and shipping details.");
    }

    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 30) {
      throw new HttpsError("invalid-argument", "Checkout items are invalid.");
    }
    const items = data.items.map((item) => {
      const productId = String(item?.productId ?? "");
      if (!/^[1-6]$/.test(productId) ||
          !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        throw new HttpsError("invalid-argument", "Checkout items are invalid.");
      }
      return { productId, quantity: item.quantity };
    });
    if (new Set(items.map(item => item.productId)).size !== items.length) {
      throw new HttpsError("invalid-argument", "Checkout items contain duplicates.");
    }

    const promoCode = data.promoCode === undefined || data.promoCode === null
      ? ""
      : readText(data.promoCode, "promo code", 64, false).toUpperCase();
    const tempOrderId = crypto.randomBytes(16).toString("hex");
    const customerName = `${firstName} ${lastName}`.trim();
    const order = {
      orderId: `NA-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
      email,
      customerName,
      customerEmail: email,
      customerPhone: `+91 ${phone}`,
      shippingAddress: {
        firstName,
        lastName,
        address,
        apartment,
        city,
        state,
        zipCode,
        phone: `+91 ${phone}`,
        country: "India"
      },
      items,
      status: "payment_initiated",
      paymentStatus: "initiated",
      userId: request.auth?.uid || null,
      userEmail: request.auth?.token.email || null,
      userName: request.auth?.token.name || customerName,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000)
    };
    if (promoCode) order.promoCode = promoCode;

    const db = getFirestore();
    const pricing = await priceCheckoutOrder(order, db);
    Object.assign(order, pricing);
    await db.collection("tempOrders").doc(tempOrderId).create(order);
    return {
      tempOrderId,
      orderId: order.orderId,
      email: order.email,
      customerName: order.customerName,
      shippingAddress: order.shippingAddress,
      items: order.items,
      total: order.total
    };
  }
);

exports.createRazorpayOrder = onCall(
  {
    region: "asia-south1",
    cors: SITE_CORS_ORIGINS,
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 10,
    invoker: "public",
    secrets: [RAZORPAY_KEY_SECRET]
  },
  async (request) => {
    try {
      const { tempOrderId } = request.data || {};
      if (typeof tempOrderId !== "string" || !tempOrderId || tempOrderId.length > 128) {
        throw new HttpsError("invalid-argument", "A valid checkout order is required.");
      }

      await enforceIpRateLimit(
        request,
        "payment_",
        10,
        15 * 60 * 1000,
        "Too many payment attempts. Try again later."
      );

      const db = getFirestore();
      const tempOrderRef = db.collection("tempOrders").doc(tempOrderId);
      const tempOrderSnapshot = await tempOrderRef.get();
      if (!tempOrderSnapshot.exists) {
        throw new HttpsError("not-found", "Checkout order not found.");
      }

      const tempOrder = tempOrderSnapshot.data();
      if (tempOrder.status !== "payment_initiated" ||
          !isValidEmail(tempOrder.email) ||
          !tempOrder.orderId ||
          tempOrder.razorpayOrderId ||
          (tempOrder.expiresAt?.toMillis?.() && tempOrder.expiresAt.toMillis() < Date.now()) ||
          (tempOrder.userId && request.auth?.uid !== tempOrder.userId)) {
        throw new HttpsError("failed-precondition", "Checkout order cannot be paid.");
      }
      const pricing = await priceCheckoutOrder(tempOrder, db);
      await reservePromoUse(
        db,
        tempOrderRef,
        Math.round(pricing.subtotal * 100),
        careerDateInThalassery()
      );
      
      const keyId = RAZORPAY_KEY_ID.value();
      const keySecret = RAZORPAY_KEY_SECRET.value();
      if (!keyId || !keySecret) {
        throw new HttpsError("failed-precondition", "Payment gateway not configured.");
      }

      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const amountInPaise = Math.round(pricing.total * 100);
      const verifiedOrderId = `NA-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
      if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
        throw new HttpsError("invalid-argument", "Checkout order amount is invalid.");
      }

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `checkout_${tempOrderId.slice(0, 31)}`,
        notes: {
          orderId: verifiedOrderId,
          tempOrderId
        },
        payment_capture: 1
      });

      await tempOrderRef.update({
        ...pricing,
        orderId: verifiedOrderId,
        razorpayOrderId: order.id,
        updatedAt: FieldValue.serverTimestamp()
      });

      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        razorpayKey: keyId
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Failed to create Razorpay order.", error);
      throw new HttpsError("internal", "Unable to initialize payment.");
    }
  }
);

exports.testRazorpayConfig = require("firebase-functions/v2").https.onRequest(
  { region: "asia-south1" },
  async (_req, res) => res.status(404).send("Not found")
);

/* ===== VERIFY AND FINALIZE PAYMENT ===== */
exports.verifyPayment = onCall(
  {
    region: "asia-south1",
    cors: SITE_CORS_ORIGINS,
    timeoutSeconds: 30,
    memory: "256MiB",
    secrets: [RAZORPAY_KEY_SECRET]
  },
  async (request) => {
    try {
      const {
        tempOrderId,
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature
      } = request.data || {};
      if ([tempOrderId, razorpayPaymentId, razorpayOrderId, razorpaySignature]
        .some(value => typeof value !== "string" || !value || value.length > 256)) {
        throw new HttpsError("invalid-argument", "Payment verification data is invalid.");
      }

      await enforceIpRateLimit(
        request,
        "verify_",
        20,
        15 * 60 * 1000,
        "Too many payment verification attempts. Try again later."
      );

      const db = getFirestore();
      const tempOrderRef = db.collection("tempOrders").doc(tempOrderId);
      const tempOrderSnapshot = await tempOrderRef.get();
      if (!tempOrderSnapshot.exists) {
        throw new HttpsError("not-found", "Checkout order not found.");
      }

      const tempOrder = tempOrderSnapshot.data();
      if (tempOrder.razorpayOrderId !== razorpayOrderId ||
          (tempOrder.userId && request.auth?.uid !== tempOrder.userId)) {
        throw new HttpsError("permission-denied", "Payment does not match this checkout.");
      }

      const keySecret = RAZORPAY_KEY_SECRET.value();
      if (!keySecret) {
        throw new HttpsError("failed-precondition", "Payment gateway not configured.");
      }

      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(razorpayOrderId + "|" + razorpayPaymentId)
        .digest('hex');
      const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");
      const providedSignatureBuffer = Buffer.from(razorpaySignature, "hex");
      if (expectedSignatureBuffer.length !== providedSignatureBuffer.length ||
          !crypto.timingSafeEqual(expectedSignatureBuffer, providedSignatureBuffer)) {
        throw new HttpsError("permission-denied", "Payment signature is invalid.");
      }

      const Razorpay = require("razorpay");
      const razorpay = new Razorpay({
        key_id: RAZORPAY_KEY_ID.value(),
        key_secret: keySecret
      });
      const payment = await razorpay.payments.fetch(razorpayPaymentId);
      const expectedAmount = Math.round(tempOrder.total * 100);
      if (payment.order_id !== razorpayOrderId ||
          payment.status !== "captured" ||
          payment.amount !== expectedAmount ||
          payment.currency !== "INR") {
        throw new HttpsError("failed-precondition", "Payment is not captured for this order.");
      }

      const orderRef = db.collection("orders").doc(tempOrderId);
      const userOrderRef = tempOrder.userId
        ? db.collection("users").doc(tempOrder.userId).collection("orders").doc(tempOrderId)
        : null;
      const promoCodeRef = tempOrder.promoCodeId
        ? db.collection("promoCodes").doc(tempOrder.promoCodeId)
        : null;
      const now = FieldValue.serverTimestamp();
      const finalOrder = {
        ...tempOrder,
        id: tempOrderId,
        status: "ordered",
        paymentStatus: "paid",
        razorpayPaymentId,
        razorpayOrderId,
        paymentMethod: payment.method || "Razorpay",
        paidAt: now,
        updatedAt: now
      };
      delete finalOrder.expiresAt;
      delete finalOrder.razorpaySignature;

      await db.runTransaction(async (transaction) => {
        const [currentTempOrder, existingOrder, promoCodeSnapshot] = await Promise.all([
          transaction.get(tempOrderRef),
          transaction.get(orderRef),
          promoCodeRef ? transaction.get(promoCodeRef) : Promise.resolve(null)
        ]);
        if (existingOrder.exists) {
          if (existingOrder.data().razorpayPaymentId === razorpayPaymentId) return;
          throw new HttpsError("already-exists", "This checkout has already been completed.");
        }
        if (!currentTempOrder.exists ||
            currentTempOrder.data().razorpayOrderId !== razorpayOrderId) {
          throw new HttpsError("failed-precondition", "Checkout order is no longer available.");
        }

        transaction.create(orderRef, finalOrder);
        if (userOrderRef) transaction.create(userOrderRef, finalOrder);
        if (promoCodeRef) {
          const currentTempOrderData = currentTempOrder.data();
          if (!currentTempOrderData.promoReserved) {
            if (!promoCodeSnapshot?.exists || !hasPromoUsageAvailable(promoCodeSnapshot.data())) {
              throw new HttpsError("failed-precondition", "The promo code is no longer available.");
            }
            transaction.update(promoCodeRef, {
              usedCount: FieldValue.increment(1)
            });
          }
        }
        transaction.delete(tempOrderRef);
      });

      return {
        success: true,
        order: {
          id: tempOrderId,
          orderId: tempOrder.orderId,
          status: "ordered",
          paymentStatus: "paid",
          email: tempOrder.email,
          customerName: tempOrder.customerName,
          shippingAddress: tempOrder.shippingAddress || {},
          items: tempOrder.items || [],
          subtotal: tempOrder.subtotal || 0,
          discount: tempOrder.discount || 0,
          shipping: tempOrder.shipping || 0,
          total: tempOrder.total,
          paymentMethod: payment.method || "Razorpay"
        },
        profileOrderSaved: Boolean(userOrderRef)
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Payment verification failed.", error);
      throw new HttpsError("internal", "Unable to verify payment.");
    }
  }
);

exports.getOrderTracking = onCall(
  {
    region: "asia-south1",
    cors: SITE_CORS_ORIGINS,
    maxInstances: 10
  },
  async (request) => {
    const data = request.data || {};
    const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!orderId || orderId.length > 64 || !isValidEmail(email)) {
      throw new HttpsError("invalid-argument", "Provide a valid order ID and email.");
    }

    await enforceIpRateLimit(
      request,
      "tracking_",
      20,
      15 * 60 * 1000,
      "Too many tracking attempts. Try again later."
    );

    const db = getFirestore();
    const matches = await db.collectionGroup("orders")
      .where("orderId", "==", orderId)
      .limit(20)
      .get();
    let matchedOrder = matches.docs.find((doc) =>
      typeof doc.data().email === "string" &&
      doc.data().email.trim().toLowerCase() === email
    );
    if (!matchedOrder) {
      const legacyOrder = await db.collection("orders").doc(orderId).get();
      if (legacyOrder.exists &&
          typeof legacyOrder.data().email === "string" &&
          legacyOrder.data().email.trim().toLowerCase() === email) {
        matchedOrder = legacyOrder;
      }
    }
    if (!matchedOrder) return { success: false };

    const order = matchedOrder.data();
    const status = ["ordered", "confirmed", "processing", "shipped", "out-for-delivery", "delivered", "cancelled"]
      .includes(String(order.status || "").toLowerCase())
      ? String(order.status).toLowerCase()
      : "ordered";
    const items = Array.isArray(order.items) ? order.items.slice(0, 100).map((item) => ({
      name: typeof item.name === "string" ? item.name.slice(0, 200) : "Product",
      quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
      price: Number.isFinite(item.price) ? item.price : 0,
      weight: typeof item.weight === "string" ? item.weight.slice(0, 50) : "",
      image: typeof item.image === "string" && item.image.startsWith("https://")
        ? item.image
        : ""
    })) : [];
    return {
      success: true,
      order: {
        id: order.orderId || matchedOrder.id,
        orderId: order.orderId || matchedOrder.id,
        status,
        createdAt: order.createdAt?.toMillis?.() || null,
        confirmedAt: order.confirmedAt?.toMillis?.() || null,
        shippedAt: order.shippedAt?.toMillis?.() || null,
        outForDeliveryAt: order.outForDeliveryAt?.toMillis?.() || null,
        deliveredAt: order.deliveredAt?.toMillis?.() || null,
        customerName: typeof order.customerName === "string" ? order.customerName.slice(0, 200) : "Customer",
        items,
        subtotal: Number.isFinite(order.subtotal) ? order.subtotal : 0,
        shipping: Number.isFinite(order.shipping) ? order.shipping : 0,
        total: Number.isFinite(order.total) ? order.total : 0
      }
    };
  }
);

async function sendPaidOrderNotifications(order, orderId) {
  const displayOrderId = order.orderId || orderId;
  console.log('✅ Paid order created, sending notifications:', {
    orderId: displayOrderId,
    email: order.email,
    total: order.total,
    paymentStatus: order.paymentStatus
  });

  const mailer = transporter();
  await mailer.sendMail({
    from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
    to: ADMIN_EMAIL,
    subject: `💰 New PAID Order - ${displayOrderId}`,
    html: adminMail(`New PAID order received: ${displayOrderId}`, "💰"),
  });

  if (order.email && isValidEmail(order.email)) {
    const paymentDetails = {
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

  if (order.orderId) {
    const tempOrdersSnapshot = await getFirestore()
      .collection('tempOrders')
      .where('orderId', '==', order.orderId)
      .get();

    if (!tempOrdersSnapshot.empty) {
      const batch = getFirestore().batch();
      tempOrdersSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log('🗑️ Cleaned up temp orders');
    }
  }
}

/* ===== ORDER CREATED - ONLY FOR PAID ORDERS ===== */
exports.onOrderCreated = onDocumentCreated(
  {
    document: "orders/{id}",
    region: "asia-south1",
    secrets: [GMAIL_PASS]
  },
  async (event) => {
    try {
      const orderId = event.params.id;
      const order = event.data?.data();

      if (!order) {
        console.error(`❌ Order ${orderId} not found`);
        return;
      }

      if (!['paid', 'completed'].includes(String(order.paymentStatus || '').toLowerCase())) {
        console.log(`⚠️ Order ${orderId} not paid, skipping notifications`);
        return;
      }

      await sendPaidOrderNotifications(order, orderId);
    } catch (error) {
      console.error('🔥 Error in onOrderCreated:', error);
    }
  }
);

/* ===== USER-SUBCOLLECTION ORDER CREATED ===== */
exports.onUserOrderCreated = onDocumentCreated(
  {
    document: "users/{userId}/orders/{id}",
    region: "asia-south1",
    secrets: [GMAIL_PASS]
  },
  async (event) => {
    try {
      const orderId = event.params.id;
      const order = event.data?.data();

      if (!order || !['paid', 'completed'].includes(String(order.paymentStatus || '').toLowerCase())) {
        return;
      }

      const db = getFirestore();
      const rootOrder = await db.collection("orders").doc(orderId).get();
      if (rootOrder.exists) {
        console.log(`ℹ️ Order ${orderId} already exists globally; notification handled by onOrderCreated`);
        return;
      }

      const externalOrderId = order.orderId;
      if (externalOrderId) {
        const matchingRootOrder = await db.collection("orders")
          .where("orderId", "==", externalOrderId)
          .limit(1)
          .get();
        if (!matchingRootOrder.empty) {
          console.log(`ℹ️ Order ${externalOrderId} already exists globally; skipping duplicate notification`);
          return;
        }
      }

      await sendPaidOrderNotifications(order, orderId);
    } catch (error) {
      console.error('🔥 Error in onUserOrderCreated:', error);
    }
  }
);

/* ⭐ REVIEW SUBMITTED */
exports.onNewReview = onDocumentCreated({ document: "reviews/{id}", secrets: [GMAIL_PASS] }, async () => {
  const mailer = transporter();
  await mailer.sendMail({
    from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
    to: ADMIN_EMAIL,
    subject: "⭐ New Review Submitted",
    html: adminMail("New review submitted", "⭐"),
  });
});

/* 👤 CUSTOMER REGISTERED */
exports.onNewCustomer = onDocumentCreated({ document: "users/{id}", secrets: [GMAIL_PASS] }, async () => {
  const mailer = transporter();
  await mailer.sendMail({
    from: `"Natura Honey" <${GMAIL_EMAIL.value()}>`,
    to: ADMIN_EMAIL,
    subject: "👤 New Customer Registered",
    html: adminMail("New customer registered", "👤"),
  });
});

/* 📩 NEW MESSAGE */
exports.onNewMessage = onDocumentCreated({ document: "contactSubmissions/{id}", secrets: [GMAIL_PASS] }, async () => {
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
    secrets: [GMAIL_PASS]
  },
  async (request) => {
    await requireCareerAdmin(request);
    const { orderId } = request.data;
    
    if (!orderId) {
      throw new Error("Order ID is required");
    }
    
    try {
      // Get order data
      const orderDoc = await getFirestore()
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
      await getFirestore()
        .collection("orders")
        .doc(orderId)
        .update({
          emailResentAt: FieldValue.serverTimestamp(),
          emailResentCount: FieldValue.increment(1)
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
  { region: "asia-south1" },
  async (_req, res) => res.status(404).send("Not found")
);

// The callable createRazorpayOrder is the only supported payment-order endpoint.
exports.createRazorpayOrderHttp = require("firebase-functions/v2").https.onRequest(
  {
    region: "asia-south1",
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 10
  },
  async (_req, res) => res.status(404).send("Not found")
);

/* ===== CLEANUP EXPIRED TEMP ORDERS ===== */
exports.cleanupTempOrders = require("firebase-functions/v2").scheduler.onSchedule({
  schedule: "every 1 hours",
  region: "asia-south1",
  timeZone: "Asia/Kolkata"
}, async () => {
  try {
    const now = Timestamp.now();
    const trackingLimitCutoff = Timestamp.fromMillis(
      now.toMillis() - 24 * 60 * 60 * 1000
    );
    const reviewLimitCutoff = Timestamp.fromMillis(
      now.toMillis() - 30 * 24 * 60 * 60 * 1000
    );
    const expiredOrders = await getFirestore()
      .collection("tempOrders")
      .where("expiresAt", "<", now)
      .limit(400)
      .get();

    const expiredTrackingLimits = await getFirestore()
      .collection("orderTrackingLimits")
      .where("updatedAt", "<", trackingLimitCutoff)
      .limit(100)
      .get();
    const expiredReviewLimits = await getFirestore()
      .collection("reviewSubmissionLimits")
      .where("updatedAt", "<", reviewLimitCutoff)
      .limit(400)
      .get();

    for (let offset = 0; offset < expiredOrders.docs.length; offset += 20) {
      await Promise.all(expiredOrders.docs.slice(offset, offset + 20).map(doc =>
        deleteTempOrderAndReleasePromo(getFirestore(), doc.ref)
      ));
    }

    const batch = getFirestore().batch();
    expiredTrackingLimits.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    expiredReviewLimits.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    if (!expiredTrackingLimits.empty || !expiredReviewLimits.empty) {
      await batch.commit();
    }

    console.log(
      `Cleaned up ${expiredOrders.size} expired temp orders, ${expiredTrackingLimits.size} IP limits, and ${expiredReviewLimits.size} review limits.`
    );
    
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
    timeoutSeconds: 60,
    secrets: [GMAIL_PASS]
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
    const rateLimitRef = getFirestore().collection("careerApplicationLimits").doc(ipHash);
    const now = Date.now();
    const rateWindowMs = 15 * 60 * 1000;

    const jobId = data.jobId === undefined || data.jobId === null ? "" : data.jobId;
    if (typeof jobId !== "string" || (jobId && !/^[A-Za-z0-9_-]{1,128}$/.test(jobId))) {
      throw new HttpsError("invalid-argument", "Choose a valid job opening.");
    }
    let jobRef = null;
    let jobTitle = "General introduction";
    if (jobId) {
      jobRef = getFirestore().collection("careerOpenings").doc(jobId);
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

    const applicationRef = getFirestore().collection("careerApplications").doc();
    const storagePath = `career-applications/${applicationRef.id}/${filename}`;
    const resumeFile = getStorage().bucket().file(storagePath);
    try {
      await resumeFile.save(resumeBuffer, {
        resumable: false,
        metadata: {
          contentType: expectedTypes[extension],
          contentDisposition: `attachment; filename="${filename}"`,
          cacheControl: "private, max-age=0, no-transform"
        }
      });
      await getFirestore().runTransaction(async (transaction) => {
        const rateLimitSnapshot = await transaction.get(rateLimitRef);
        const rateLimit = rateLimitSnapshot.data();
        const windowStartedAt = rateLimit?.windowStartedAt || 0;
        const currentCount = now - windowStartedAt < rateWindowMs ? (rateLimit?.count || 0) : 0;
        if (currentCount >= 3) {
          throw new HttpsError("resource-exhausted", "Please wait before submitting another application.");
        }

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
          submittedAt: FieldValue.serverTimestamp()
        });
        transaction.set(rateLimitRef, {
          windowStartedAt: currentCount ? windowStartedAt : now,
          count: currentCount + 1,
          updatedAt: FieldValue.serverTimestamp()
        });
        if (jobRef) {
          transaction.update(jobRef, {
            applicationCount: FieldValue.increment(1)
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
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError("internal", "Unable to save your application right now.");
    }

    const applicationType = jobId ? "Job application" : "General introduction for future opportunities";
    const text = [
      `${applicationType} submitted through the Hexa Apiarium careers page.`,
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Location: ${location}`,
      ...(jobId ? [`Job: ${jobTitle}`] : []),
      "",
      "Note:",
      message || "No note provided.",
      "",
      `Open the dashboard: ${DASHBOARD_URL}`
    ].join("\n");

    try {
      const mailer = transporter();
      await mailer.sendMail({
        from: `"Hexa Apiarium Careers" <${GMAIL_EMAIL.value()}>`,
        to: ADMIN_EMAIL,
        replyTo: email,
        subject: jobId ? `New job application: ${jobTitle}` : "New future-opportunity introduction - Hexa Apiarium",
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
  let query = getFirestore().collection("careerApplications");
  const jobId = request.data?.jobId;
  if (jobId !== undefined && jobId !== null) {
    if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
      throw new HttpsError("invalid-argument", "Choose a valid job opening.");
    }
    query = query.where("jobId", "==", jobId);
  } else {
    query = query.where("jobId", "==", null);
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

exports.checkAdminAccess = onCall(async (request) => {
  await requireCareerAdmin(request);
  return { admin: true };
});

exports.getCareerApplicationsCount = onCall(
  {
    region: "asia-south1",
    cors: [
      "https://www.hexahoney.in",
      "https://hexahoney.in",
      "https://hexahoney-96aed.web.app",
      "https://hexahoney-96aed.firebaseapp.com"
    ]
  },
  async (request) => {
    await requireCareerAdmin(request);
    const since = Number(request.data?.since);
    if (!Number.isFinite(since) || since < 0 || since > Date.now()) {
      throw new HttpsError("invalid-argument", "Choose a valid date for the application count.");
    }

    const result = await getFirestore()
      .collection("careerApplications")
      .where("jobId", "==", null)
      .where("submittedAt", ">", Timestamp.fromMillis(since))
      .count()
      .get();

    return { count: result.data().count };
  }
);

exports.getCareerOpenings = onCall(async () => {
  const today = careerDateInThalassery();
  const snapshot = await getFirestore()
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
  const snapshot = await getFirestore()
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
    await getFirestore().collection("careerOpenings").doc(data.id).delete();
    return { success: true };
  }
  if (data.action !== "save") {
    throw new HttpsError("invalid-argument", "Choose a valid job action.");
  }

  const opening = readCareerOpening(data.opening || {});
  const collection = getFirestore().collection("careerOpenings");
  const now = FieldValue.serverTimestamp();
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

  const applicationSnapshot = await getFirestore()
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
    const [resumeBuffer] = await getStorage()
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