const fs = require("node:fs");
const path = require("node:path");
const { after, before, describe, it } = require("node:test");
require("firebase/compat/app");
require("firebase/compat/firestore");
require("firebase/compat/storage");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require("@firebase/rules-unit-testing");

const projectId = "demo-security-audit";
const firestoreRules = fs.readFileSync(
  path.resolve(__dirname, "../../firestore.rules"),
  "utf8"
);
const storageRules = fs.readFileSync(
  path.resolve(__dirname, "../../storage.rules"),
  "utf8"
);

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules }
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      db.doc("users/alice").set({ displayName: "Alice" }),
      db.doc("users/bob").set({ displayName: "Bob" }),
      db.doc("users/bob/orders/private-order").set({ paymentStatus: "paid" }),
      db.doc("orders/private-order").set({ paymentStatus: "paid" }),
      db.doc("tempOrders/checkout").set({ paymentStatus: "paid" }),
      db.doc("careerApplications/private-application").set({ name: "Private" }),
      db.doc("admins/admin").set({ admin: true }),
      db.doc("admins/alice").set({ admin: false }),
      db.doc("reviews/approved").set({ reviewText: "Approved", status: "approved" }),
      db.doc("reviews/pending").set({ reviewText: "Pending", status: "pending" }),
      db.doc("contactSubmissions/message").set({ message: "Private" })
    ]);
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.storage()
      .ref("career-applications/private-resume.txt")
      .putString("private resume");
  });
});

after(async () => {
  await environment?.cleanup();
});

describe("Firestore security rules", () => {
  it("denies anonymous access to private user and order data", async () => {
    const db = environment.unauthenticatedContext().firestore();
    await assertFails(db.doc("users/alice").get());
    await assertFails(db.doc("orders/private-order").get());
    await assertFails(db.doc("tempOrders/checkout").get());
    await assertFails(db.doc("careerApplications/anonymous-create").set({ name: "Anonymous" }));
    await assertSucceeds(db.doc("reviews/approved").get());
    await assertFails(db.doc("reviews/pending").get());
  });

  it("allows users to read only their own records", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(db.doc("users/alice").get());
    await assertFails(db.doc("users/bob").get());
    await assertFails(db.doc("users/bob/orders/private-order").get());
  });

  it("denies users from modifying another user's records", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    await assertFails(db.doc("users/alice").update({ admin: true }));
    await assertFails(db.doc("users/bob").set({ displayName: "Changed" }));
    await assertFails(db.doc("users/bob/addresses/forged").set({ name: "Changed" }));
    await assertFails(db.doc("users/bob/orders/forged").set({ paymentStatus: "paid" }));
  });

  it("restricts admin-only data to users with an admin record", async () => {
    const userDb = environment.authenticatedContext("alice").firestore();
    const adminDb = environment.authenticatedContext("admin").firestore();
    await assertFails(userDb.doc("careerApplications/private-application").get());
    await assertFails(userDb.doc("orders/private-order").get());
    await assertFails(userDb.doc("admins/admin").get());
    await assertSucceeds(adminDb.doc("careerApplications/private-application").get());
    await assertSucceeds(adminDb.doc("orders/private-order").get());
    await assertSucceeds(adminDb.doc("admins/admin").get());
  });

  it("prevents clients from creating paid or temporary orders", async () => {
    const db = environment.authenticatedContext("alice").firestore();
    await assertFails(db.doc("orders/forged").set({ paymentStatus: "paid" }));
    await assertFails(db.doc("tempOrders/forged").set({ paymentStatus: "paid" }));
    await assertFails(db.doc("users/alice/orders/forged").set({ paymentStatus: "paid" }));
  });

  it("allows only admins to create reviews and contact records", async () => {
    const userDb = environment.authenticatedContext("alice").firestore();
    const adminDb = environment.authenticatedContext("admin").firestore();
    await assertFails(userDb.doc("reviews/forged").set({ reviewText: "Fake" }));
    await assertFails(userDb.doc("contactSubmissions/forged").set({ message: "Spam" }));
    await assertSucceeds(adminDb.doc("reviews/admin-created").set({ reviewText: "Valid" }));
    await assertSucceeds(adminDb.doc("contactSubmissions/admin-created").set({ message: "Valid" }));
    await assertFails(userDb.doc("activities/forged").set({
      type: "PROMO_USED",
      timestamp: Date.now()
    }));
    await assertSucceeds(adminDb.doc("activities/admin-created").set({
      type: "PROMO_USED",
      timestamp: Date.now()
    }));
  });
});

describe("Storage security rules", () => {
  it("denies client uploads for anonymous and authenticated users", async () => {
    const anonymousStorage = environment.unauthenticatedContext().storage();
    const userStorage = environment.authenticatedContext("alice").storage();
    await assertFails(anonymousStorage.ref("career-applications/resume.txt").putString("file"));
    await assertFails(userStorage.ref("career-applications/resume.txt").putString("file"));
    await assertFails(anonymousStorage.ref("career-applications/private-resume.txt").getDownloadURL());
    await assertFails(userStorage.ref("career-applications/private-resume.txt").getDownloadURL());
  });
});
