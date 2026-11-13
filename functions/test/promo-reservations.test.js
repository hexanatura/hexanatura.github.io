const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { after, test } = require("node:test");
const { deleteTempOrderAndReleasePromo, reservePromoUse } = require("../promoReservations");

const app = admin.initializeApp(
  { projectId: process.env.GCLOUD_PROJECT || "demo-security-audit" },
  `promo-reservations-${process.pid}`
);
const db = getFirestore(app);

after(async () => {
  await app.delete();
});

test("promo reservation enforces the usage limit transactionally", async () => {
  const suffix = crypto.randomBytes(8).toString("hex");
  const promoRef = db.collection("promoCodes").doc(`limited-${suffix}`);
  const firstTempOrderRef = db.collection("tempOrders").doc(`first-${suffix}`);
  const secondTempOrderRef = db.collection("tempOrders").doc(`second-${suffix}`);
  const expiresAt = Timestamp.fromMillis(Date.now() + 60_000);

  await promoRef.set({ active: true, usageLimit: 1, usedCount: 0 });
  await Promise.all([firstTempOrderRef, secondTempOrderRef].map(ref => ref.set({
    status: "payment_initiated",
    promoCodeId: promoRef.id,
    subtotal: 100,
    expiresAt
  })));

  const results = await Promise.allSettled([
    reservePromoUse(db, firstTempOrderRef, 10_000, "2026-01-01"),
    reservePromoUse(db, secondTempOrderRef, 10_000, "2026-01-01")
  ]);
  assert.equal(
    results.filter(result => result.status === "fulfilled").length,
    1,
    results.map(result => result.status === "rejected" ? result.reason.stack : "reserved").join("\n")
  );
  assert.equal(results.filter(result => result.status === "rejected").length, 1);

  const promo = await promoRef.get();
  const tempOrders = await Promise.all([firstTempOrderRef.get(), secondTempOrderRef.get()]);
  assert.equal(promo.data().usedCount, 1);
  assert.equal(tempOrders.filter(snapshot => snapshot.data().promoReserved === true).length, 1);
});

test("releasing an expired reservation decrements usage once", async () => {
  const suffix = crypto.randomBytes(8).toString("hex");
  const promoRef = db.collection("promoCodes").doc(`release-${suffix}`);
  const tempOrderRef = db.collection("tempOrders").doc(`release-${suffix}`);

  await promoRef.set({ active: true, usageLimit: 2, usedCount: 1 });
  await tempOrderRef.set({
    status: "payment_initiated",
    promoCodeId: promoRef.id,
    promoReserved: true
  });

  assert.equal(await deleteTempOrderAndReleasePromo(db, tempOrderRef), true);
  assert.equal(await deleteTempOrderAndReleasePromo(db, tempOrderRef), false);
  assert.equal((await promoRef.get()).data().usedCount, 0);
  assert.equal((await tempOrderRef.get()).exists, false);
});
