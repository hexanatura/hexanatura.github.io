window.orderDataUtils = (() => {
  const getTimestampMillis = (value) => {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getUniqueOrders = (snapshot) => {
    const ordersById = new Map();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const userRef = doc.ref.parent.parent;
      const isUserOrder = Boolean(userRef && userRef.parent.id === "users");
      const order = {
        id: doc.id,
        data,
        ref: doc.ref,
        source: isUserOrder ? "user" : "main",
        userId: isUserOrder ? userRef.id : data.userId || null,
        createdAtMillis: getTimestampMillis(data.createdAt || data.orderDate || data.timestamp)
      };
      const key = String(data.orderId || doc.id);
      const existing = ordersById.get(key);

      if (!existing || (existing.source !== "main" && order.source === "main")) {
        ordersById.set(key, order);
      }
    });

    return [...ordersById.values()].sort((a, b) => b.createdAtMillis - a.createdAtMillis);
  };

  const isPaidOrder = (order) => {
    const paymentStatus = String(order?.paymentStatus || "").toLowerCase();
    return paymentStatus === "paid" || paymentStatus === "completed";
  };

  return {
    collection: () => firebase.firestore().collectionGroup("orders"),
    getUniqueOrders,
    isPaidOrder,
    getTimestampMillis
  };
})();
