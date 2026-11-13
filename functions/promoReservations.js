const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

function isPromoExpired(validUntil, today, nowMillis = Date.now()) {
  if (!validUntil) return false;
  if (typeof validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return validUntil < today;
  }
  const expiryDate = typeof validUntil.toDate === "function"
    ? validUntil.toDate()
    : new Date(validUntil);
  return !Number.isFinite(expiryDate.getTime()) || expiryDate.getTime() < nowMillis;
}

function hasPromoUsageAvailable(promo) {
  const usageLimit = Number(promo.usageLimit);
  const usedCount = promo.usedCount === undefined || promo.usedCount === null
    ? 0
    : Number(promo.usedCount);
  return !(Number.isFinite(usageLimit) && usageLimit > 0 &&
    (!Number.isSafeInteger(usedCount) || usedCount < 0 || usedCount >= usageLimit));
}

async function reservePromoUse(db, tempOrderRef, subtotalCents, today) {
  await db.runTransaction(async transaction => {
    const tempOrderSnapshot = await transaction.get(tempOrderRef);
    if (!tempOrderSnapshot.exists) {
      throw new HttpsError("not-found", "Checkout order not found.");
    }

    const tempOrder = tempOrderSnapshot.data();
    if (!tempOrder.promoCodeId || tempOrder.promoReserved) return;

    if (tempOrder.status !== "payment_initiated" ||
        (tempOrder.expiresAt?.toMillis?.() && tempOrder.expiresAt.toMillis() < Date.now())) {
      throw new HttpsError("failed-precondition", "Checkout order cannot be paid.");
    }

    const promoRef = db.collection("promoCodes").doc(tempOrder.promoCodeId);
    const promoSnapshot = await transaction.get(promoRef);
    const promo = promoSnapshot.exists ? promoSnapshot.data() : null;
    const minOrder = Number(promo?.minOrder);

    if (!promo || promo.active !== true ||
        isPromoExpired(promo.validUntil, today) ||
        (minOrder > 0 && subtotalCents < Math.round(minOrder * 100)) ||
        !hasPromoUsageAvailable(promo)) {
      throw new HttpsError("failed-precondition", "The promo code is no longer available.");
    }

    transaction.update(promoRef, {
      usedCount: FieldValue.increment(1)
    });
    transaction.update(tempOrderRef, {
      promoReserved: true,
      promoReservedAt: FieldValue.serverTimestamp()
    });
  });
}

async function deleteTempOrderAndReleasePromo(db, tempOrderRef) {
  return db.runTransaction(async transaction => {
    const tempOrderSnapshot = await transaction.get(tempOrderRef);
    if (!tempOrderSnapshot.exists) return false;

    const tempOrder = tempOrderSnapshot.data();
    if (tempOrder.promoReserved) {
      if (!tempOrder.promoCodeId) {
        throw new Error("Cannot release a promo reservation without a promo code ID.");
      }

      const promoRef = db.collection("promoCodes").doc(tempOrder.promoCodeId);
      const promoSnapshot = await transaction.get(promoRef);
      if (!promoSnapshot.exists) {
        throw new Error("Cannot release a reservation for a missing promo code.");
      }

      const usedCount = Number(promoSnapshot.data().usedCount);
      if (!Number.isSafeInteger(usedCount) || usedCount < 1) {
        throw new Error("Cannot release a promo reservation with an invalid usage count.");
      }

      transaction.update(promoRef, { usedCount: usedCount - 1 });
    }

    transaction.delete(tempOrderRef);
    return true;
  });
}

module.exports = {
  deleteTempOrderAndReleasePromo,
  hasPromoUsageAvailable,
  isPromoExpired,
  reservePromoUse
};
