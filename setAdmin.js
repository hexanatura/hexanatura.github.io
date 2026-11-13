const { createRequire } = require("node:module");
const requireFunctions = createRequire(require.resolve("./functions/package.json"));
const { initializeApp } = requireFunctions("firebase-admin/app");
const { getAuth } = requireFunctions("firebase-admin/auth");
const { FieldValue, getFirestore } = requireFunctions("firebase-admin/firestore");

initializeApp();

async function setAdmin() {
  const uid = process.env.ADMIN_UID;
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new Error("Set ADMIN_UID to the intended Firebase Auth user ID.");
  }

  const user = await getAuth().getUser(uid);
  await getAuth().setCustomUserClaims(uid, { ...user.customClaims, admin: true });
  await getFirestore().collection("admins").doc(uid).set({
    admin: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  console.log("Administrator access configured.");
}

setAdmin().catch((error) => {
  console.error("Unable to configure administrator access:", error.message);
  process.exitCode = 1;
});
