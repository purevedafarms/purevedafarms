// ============================================================
// PURE VEDA FARM
// COMPLETE BACKEND - server.js
// Firebase + Orders + Single Order Tracking + Razorpay
// ============================================================

require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;

// ============================================================
// OPTIONAL CORS
// ============================================================

let cors;

try {
  cors = require("cors");
  app.use(cors());

  console.log("CORS enabled.");
} catch (error) {
  console.log(
    "CORS package not installed. Continuing without CORS."
  );
}

// ============================================================
// RAZORPAY
// ============================================================

let Razorpay = null;

try {
  Razorpay = require("razorpay");

  console.log(
    "Razorpay package loaded."
  );
} catch (error) {
  console.log(
    "Razorpay package not installed. Running in demo payment mode."
  );
}

// ============================================================
// FIREBASE ADMIN
// ============================================================

let admin = null;
let db = null;
let firebaseReady = false;

try {
  admin = require("firebase-admin");

  let serviceAccount = null;

  // ----------------------------------------------------------
  // OPTION 1:
  // firebase-service-account.json
  // ----------------------------------------------------------

  const serviceAccountPath = path.join(
    __dirname,
    "firebase-service-account.json"
  );

  if (fs.existsSync(serviceAccountPath)) {
    try {
      serviceAccount = require(serviceAccountPath);

      console.log(
        "Firebase service account loaded from firebase-service-account.json"
      );
    } catch (error) {
      console.error(
        "Unable to load firebase-service-account.json:",
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // OPTION 2:
  // FIREBASE_SERVICE_ACCOUNT_JSON
  // ----------------------------------------------------------

  if (
    !serviceAccount &&
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ) {
    try {
      serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      );

      console.log(
        "Firebase service account loaded from environment variable."
      );
    } catch (error) {
      console.error(
        "Invalid FIREBASE_SERVICE_ACCOUNT_JSON:",
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // INITIALIZE FIREBASE
  // ----------------------------------------------------------

  if (serviceAccount) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          serviceAccount
        )
      });
    }

    db = admin.firestore();

    firebaseReady = true;

    console.log(
      "Firebase Firestore connected."
    );
  } else {
    console.log(
      "Firebase service account not found."
    );

    console.log(
      "Server will run in demo/local mode."
    );
  }
} catch (error) {
  console.error(
    "Firebase initialization error:",
    error.message
  );

  firebaseReady = false;
}

// ============================================================
// RAZORPAY INITIALIZATION
// ============================================================

let razorpay = null;
let razorpayReady = false;

if (
  Razorpay &&
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET
) {
  try {
    razorpay = new Razorpay({
      key_id:
        process.env.RAZORPAY_KEY_ID,

      key_secret:
        process.env.RAZORPAY_KEY_SECRET
    });

    razorpayReady = true;

    console.log(
      "Razorpay configured."
    );
  } catch (error) {
    console.error(
      "Razorpay initialization failed:",
      error.message
    );
  }
} else {
  console.log(
    "Razorpay keys not configured."
  );

  console.log(
    "Running in DEMO payment mode."
  );
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

// ============================================================
// STATIC FRONTEND
// ============================================================

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      success: true,

      message:
        "Pure Veda Farm backend is running.",

      serverTime:
        new Date().toISOString(),

      firebase:
        firebaseReady,

      razorpay:
        razorpayReady,

      mode:
        firebaseReady &&
        razorpayReady
          ? "production"
          : "demo"
    });
  }
);

// ============================================================
// HOME
// ============================================================

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// ============================================================
// ADMIN PAGE
// ============================================================

app.get(
  "/admin",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "admin.html"
      )
    );
  }
);

// ============================================================
// HELPER - GENERATE ORDER NUMBER
// ============================================================

function generateOrderNumber() {
  const now = new Date();

  const date =
    now
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

  const random =
    Math.floor(
      1000 +
      Math.random() * 9000
    );

  return `PVF-${date}-${random}`;
}

// ============================================================
// HELPER - CLEAN CUSTOMER
// ============================================================

function cleanCustomer(
  customer = {}
) {
  return {
    name:
      String(
        customer.name || ""
      ).trim(),

    phone:
      String(
        customer.phone || ""
      ).trim(),

    email:
      String(
        customer.email || ""
      ).trim(),

    pincode:
      String(
        customer.pincode || ""
      ).trim(),

    city:
      String(
        customer.city || ""
      ).trim(),

    state:
      String(
        customer.state || ""
      ).trim(),

    address:
      String(
        customer.address || ""
      ).trim()
  };
}

// ============================================================
// HELPER - CALCULATE TOTAL
// Supports both qty and quantity
// ============================================================

function calculateTotal(
  items = []
) {
  return items.reduce(
    (total, item) => {
      const price =
        Number(item.price) || 0;

      const quantity =
        Number(
          item.quantity ??
          item.qty ??
          0
        );

      return (
        total +
        price * quantity
      );
    },
    0
  );
}

// ============================================================
// HELPER - VALIDATE ORDER
// ============================================================

function validateOrder(body) {
  const errors = [];

  if (
    !body.customer ||
    typeof body.customer !== "object"
  ) {
    errors.push(
      "Customer information is required."
    );
  }

  if (
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    errors.push(
      "At least one product is required."
    );
  }

  if (
    body.customer &&
    !body.customer.name
  ) {
    errors.push(
      "Customer name is required."
    );
  }

  if (
    body.customer &&
    !body.customer.phone
  ) {
    errors.push(
      "Customer phone is required."
    );
  }

  if (
    body.customer &&
    !body.customer.address
  ) {
    errors.push(
      "Delivery address is required."
    );
  }

  return errors;
}

// ============================================================
// CREATE ORDER
// POST /api/orders
// ============================================================

app.post(
  "/api/orders",
  async (req, res) => {
    try {
      const errors =
        validateOrder(
          req.body
        );

      if (errors.length) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid order.",

          errors
        });
      }

      const customer =
        cleanCustomer(
          req.body.customer
        );

      // ------------------------------------------------------
      // NORMALIZE ITEMS
      // ------------------------------------------------------

      const items =
        req.body.items.map(
          item => {
            const quantity =
              Math.max(
                1,
                Number(
                  item.quantity ??
                  item.qty ??
                  1
                )
              );

            const price =
              Number(
                item.price
              ) || 499;

            return {
              name:
                String(
                  item.name ||
                  "Pure Cow Ghee"
                ),

              size:
                String(
                  item.size ||
                  "500 ml"
                ),

              price,

              quantity,

              // Keep qty also for old frontend compatibility
              qty:
                quantity,

              amount:
                price * quantity
            };
          }
        );

      // ------------------------------------------------------
      // TOTAL
      // ------------------------------------------------------

      const subtotal =
        calculateTotal(
          items
        );

      const shipping =
        Number(
          req.body.shipping
        ) || 0;

      const total =
        subtotal +
        shipping;

      const paymentMethod =
        String(
          req.body.paymentMethod ||
          req.body.payment ||
          "ONLINE"
        ).toUpperCase();

      // ------------------------------------------------------
      // ORDER NUMBER
      // ------------------------------------------------------

      const orderNumber =
        generateOrderNumber();

      // ------------------------------------------------------
      // ORDER OBJECT
      // ------------------------------------------------------

      const order = {
        orderNumber,

        customer,

        items,

        subtotal,

        shipping,

        total,

        amount:
          total,

        currency:
          "INR",

        paymentMethod,

        payment:
          paymentMethod,

        paymentStatus:
          "PENDING",

        orderStatus:
          "PLACED",

        status:
          "PLACED",

        razorpayOrderId:
          null,

        razorpayPaymentId:
          null,

        razorpaySignature:
          null,

        createdAt:
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString()
      };

      // ------------------------------------------------------
      // SAVE FIREBASE
      // ------------------------------------------------------

      if (firebaseReady) {
        const docRef =
          await db
            .collection("orders")
            .add(order);

        console.log(
          `Order saved to Firebase: ${orderNumber}`
        );

        console.log(
          `Firebase document ID: ${docRef.id}`
        );

        return res.status(201).json({
          success: true,

          message:
            "Order created successfully.",

          orderId:
            docRef.id,

          orderNumber,

          order: {
            ...order,

            id:
              docRef.id
          },

          firebase:
            true,

          paymentMode:
            razorpayReady
              ? "razorpay"
              : "demo"
        });
      }

      // ------------------------------------------------------
      // DEMO MODE
      // ------------------------------------------------------

      console.log(
        `Demo order created: ${orderNumber}`
      );

      return res.status(201).json({
        success: true,

        message:
          "Order created in demo mode.",

        orderId:
          orderNumber,

        orderNumber,

        order: {
          ...order,

          id:
            orderNumber
        },

        firebase:
          false,

        paymentMode:
          "demo"
      });
    } catch (error) {
      console.error(
        "Create order error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to create order.",

        error:
          error.message
      });
    }
  }
);

// ============================================================
// GET ALL ORDERS
// GET /api/orders
// ============================================================

app.get(
  "/api/orders",
  async (req, res) => {
    try {
      if (!firebaseReady) {
        return res.json({
          success: true,

          orders: [],

          count: 0,

          message:
            "Firebase is not configured.",

          firebase: false
        });
      }

      const snapshot =
        await db
          .collection("orders")
          .orderBy(
            "createdAt",
            "desc"
          )
          .get();

      const orders =
        snapshot.docs.map(
          doc => {
            const data =
              doc.data();

            return {
              ...data,

              id:
                data.id ||
                doc.id
            };
          }
        );

      return res.json({
        success: true,

        orders,

        count:
          orders.length,

        firebase:
          true
      });
    } catch (error) {
      console.error(
        "Get orders error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to fetch orders.",

        error:
          error.message
      });
    }
  }
);

// ============================================================
// GET SINGLE ORDER
//
// IMPORTANT:
// This route supports:
//
// 1. Firebase document ID
//    /api/orders/2O4G2qr3WoGEtsO1UrZV
//
// 2. Order Number
//    /api/orders/PVF-20260815-7240
//
// ============================================================

app.get(
  "/api/orders/:id",
  async (req, res) => {
    try {
      const requestedId =
        String(
          req.params.id || ""
        ).trim();

      if (!requestedId) {
        return res.status(400).json({
          success: false,

          message:
            "Order ID is required."
        });
      }

      if (!firebaseReady) {
        return res.status(503).json({
          success: false,

          message:
            "Order tracking is unavailable because Firebase is not configured.",

          firebase:
            false
        });
      }

      // ======================================================
      // STEP 1
      // TRY FIREBASE DOCUMENT ID
      // ======================================================

      const directDoc =
        await db
          .collection("orders")
          .doc(requestedId)
          .get();

      if (directDoc.exists) {
        const data =
          directDoc.data();

        return res.json({
          success: true,

          order: {
            ...data,

            id:
              data.id ||
              directDoc.id
          },

          firebase:
            true,

          matchedBy:
            "documentId"
        });
      }

      // ======================================================
      // STEP 2
      // TRY orderNumber
      //
      // Example:
      // PVF-20260815-7240
      // ======================================================

      const snapshot =
        await db
          .collection("orders")
          .where(
            "orderNumber",
            "==",
            requestedId
          )
          .limit(1)
          .get();

      if (!snapshot.empty) {
        const doc =
          snapshot.docs[0];

        const data =
          doc.data();

        return res.json({
          success: true,

          order: {
            ...data,

            id:
              data.id ||
              doc.id
          },

          firebase:
            true,

          matchedBy:
            "orderNumber"
        });
      }

      // ======================================================
      // STEP 3
      // OLD DATA SUPPORT
      //
      // Some old documents may have:
      // id: "PVF-...."
      // instead of orderNumber.
      // ======================================================

      const idSnapshot =
        await db
          .collection("orders")
          .where(
            "id",
            "==",
            requestedId
          )
          .limit(1)
          .get();

      if (!idSnapshot.empty) {
        const doc =
          idSnapshot.docs[0];

        const data =
          doc.data();

        return res.json({
          success: true,

          order: {
            ...data,

            id:
              data.id ||
              doc.id
          },

          firebase:
            true,

          matchedBy:
            "legacyId"
        });
      }

      // ======================================================
      // NOT FOUND
      // ======================================================

      return res.status(404).json({
        success: false,

        message:
          "Order not found.",

        orderId:
          requestedId
      });
    } catch (error) {
      console.error(
        "Get single order error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to fetch order.",

        error:
          error.message
      });
    }
  }
);

// ============================================================
// UPDATE ORDER STATUS
// PATCH /api/orders/:id/status
// ============================================================

app.patch(
  "/api/orders/:id/status",
  async (req, res) => {
    try {
      const requestedId =
        String(
          req.params.id || ""
        ).trim();

      const status =
        String(
          req.body.status || ""
        )
          .trim()
          .toUpperCase();

      const allowedStatuses = [
        "PLACED",
        "PAYMENT CONFIRMED",
        "PROCESSING",
        "PACKED",
        "SHIPPED",
        "OUT FOR DELIVERY",
        "DELIVERED",
        "CANCELLED"
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid order status.",

          allowedStatuses
        });
      }

      if (!firebaseReady) {
        return res.status(503).json({
          success: false,

          message:
            "Firebase is not configured."
        });
      }

      // ------------------------------------------------------
      // FIND ORDER
      // ------------------------------------------------------

      let orderRef =
        db
          .collection("orders")
          .doc(requestedId);

      let orderDoc =
        await orderRef.get();

      // ------------------------------------------------------
      // If document ID not found,
      // search orderNumber
      // ------------------------------------------------------

      if (!orderDoc.exists) {
        const snapshot =
          await db
            .collection("orders")
            .where(
              "orderNumber",
              "==",
              requestedId
            )
            .limit(1)
            .get();

        if (!snapshot.empty) {
          orderDoc =
            snapshot.docs[0];

          orderRef =
            orderDoc.ref;
        }
      }

      if (!orderDoc.exists) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found."
        });
      }

      // ------------------------------------------------------
      // UPDATE
      // ------------------------------------------------------

      await orderRef.update({
        status,

        orderStatus:
          status,

        updatedAt:
          new Date().toISOString()
      });

      return res.json({
        success: true,

        message:
          "Order status updated.",

        orderId:
          orderDoc.id,

        orderNumber:
          orderDoc.data().orderNumber ||
          null,

        status
      });
    } catch (error) {
      console.error(
        "Update status error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to update order status.",

        error:
          error.message
      });
    }
  }
);

// ============================================================
// CREATE RAZORPAY PAYMENT ORDER
// POST /api/create-payment-order
// ============================================================

app.post(
  "/api/create-payment-order",
  async (req, res) => {
    try {
      const amount =
        Number(
          req.body.amount
        );

      const orderId =
        req.body.orderId ||
        req.body.orderNumber;

      if (
        !amount ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Valid payment amount is required."
        });
      }

      if (!orderId) {
        return res.status(400).json({
          success: false,

          message:
            "Order ID is required."
        });
      }

      // ------------------------------------------------------
      // DEMO
      // ------------------------------------------------------

      if (!razorpayReady) {
        return res.json({
          success: true,

          demo: true,

          message:
            "Razorpay is not configured. Running in demo mode.",

          razorpayOrder: {
            id:
              `demo_${Date.now()}`,

            amount:
              Math.round(
                amount * 100
              ),

            currency:
              "INR"
          },

          key:
            null
        });
      }

      // ------------------------------------------------------
      // REAL RAZORPAY
      // ------------------------------------------------------

      const razorpayOrder =
        await razorpay.orders.create({
          amount:
            Math.round(
              amount * 100
            ),

          currency:
            "INR",

          receipt:
            String(
              orderId
            ).slice(0, 40),

          notes: {
            pureVedaOrderId:
              orderId
          }
        });

      // ------------------------------------------------------
      // UPDATE FIREBASE
      // ------------------------------------------------------

      if (firebaseReady) {
        let orderRef =
          db
            .collection("orders")
            .doc(orderId);

        let orderDoc =
          await orderRef.get();

        if (!orderDoc.exists) {
          const snapshot =
            await db
              .collection("orders")
              .where(
                "orderNumber",
                "==",
                orderId
              )
              .limit(1)
              .get();

          if (!snapshot.empty) {
            orderRef =
              snapshot.docs[0].ref;

            orderDoc =
              snapshot.docs[0];
          }
        }

        if (orderDoc.exists) {
          await orderRef.update({
            razorpayOrderId:
              razorpayOrder.id,

            updatedAt:
              new Date().toISOString()
          });
        }
      }

      return res.json({
        success: true,

        demo: false,

        key:
          process.env.RAZORPAY_KEY_ID,

        razorpayOrder
      });
    } catch (error) {
      console.error(
        "Create Razorpay order error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to create payment order.",

        error:
          error.message
      });
    }
  }
);

// ============================================================
// VERIFY RAZORPAY PAYMENT
// POST /api/verify-payment
// ============================================================

app.post(
  "/api/verify-payment",
  async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        orderId
      } = req.body;

      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature
      ) {
        return res.status(400).json({
          success: false,

          message:
            "Incomplete Razorpay payment information."
        });
      }

      // ------------------------------------------------------
      // DEMO
      // ------------------------------------------------------

      if (!razorpayReady) {
        return res.json({
          success: true,

          verified: true,

          demo: true,

          message:
            "Demo payment accepted."
        });
      }

      // ------------------------------------------------------
      // SIGNATURE
      // ------------------------------------------------------

      const generatedSignature =
        crypto
          .createHmac(
            "sha256",
            process.env.RAZORPAY_KEY_SECRET
          )
          .update(
            razorpay_order_id +
            "|" +
            razorpay_payment_id
          )
          .digest("hex");

      const isValid =
        crypto.timingSafeEqual(
          Buffer.from(
            generatedSignature
          ),

          Buffer.from(
            razorpay_signature
          )
        );

      if (!isValid) {
        return res.status(400).json({
          success: false,

          verified: false,

          message:
            "Invalid Razorpay payment signature."
        });
      }

      // ------------------------------------------------------
      // UPDATE FIREBASE
      // ------------------------------------------------------

      if (
        firebaseReady &&
        orderId
      ) {
        let orderRef =
          db
            .collection("orders")
            .doc(orderId);

        let orderDoc =
          await orderRef.get();

        if (!orderDoc.exists) {
          const snapshot =
            await db
              .collection("orders")
              .where(
                "orderNumber",
                "==",
                orderId
              )
              .limit(1)
              .get();

          if (!snapshot.empty) {
            orderRef =
              snapshot.docs[0].ref;

            orderDoc =
              snapshot.docs[0];
          }
        }

        if (orderDoc.exists) {
          await orderRef.update({
            status:
              "PAYMENT CONFIRMED",

            orderStatus:
              "PAYMENT CONFIRMED",

            paymentStatus:
              "PAID",

            razorpayOrderId:
              razorpay_order_id,

            razorpayPaymentId:
              razorpay_payment_id,

            razorpaySignature:
              razorpay_signature,

            updatedAt:
              new Date().toISOString()
          });
        }
      }

      return res.json({
        success: true,

        verified: true,

        message:
          "Payment verified successfully.",

        orderId
      });
    } catch (error) {
      console.error(
        "Payment verification error:",
        error
      );

      return res.status(500).json({
        success: false,

        verified: false,

        message:
          "Payment verification failed.",

        error:
          error.message
      });
    }
  }
);

// ============================================================
// RAZORPAY WEBHOOK
// ============================================================

app.post(
  "/api/razorpay/webhook",
  express.raw({
    type: "application/json"
  }),
  async (req, res) => {
    try {
      const webhookSecret =
        process.env.RAZORPAY_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.log(
          "Razorpay webhook secret is not configured."
        );

        return res.status(200).json({
          success: true,

          message:
            "Webhook received in demo mode."
        });
      }

      const receivedSignature =
        req.headers[
          "x-razorpay-signature"
        ];

      if (!receivedSignature) {
        return res.status(400).json({
          success: false,

          message:
            "Missing webhook signature."
        });
      }

      const expectedSignature =
        crypto
          .createHmac(
            "sha256",
            webhookSecret
          )
          .update(req.body)
          .digest("hex");

      const valid =
        crypto.timingSafeEqual(
          Buffer.from(
            expectedSignature
          ),

          Buffer.from(
            receivedSignature
          )
        );

      if (!valid) {
        return res.status(400).json({
          success: false,

          message:
            "Invalid webhook signature."
        });
      }

      const event =
        JSON.parse(
          req.body.toString()
        );

      console.log(
        "Razorpay webhook:",
        event.event
      );

      // ------------------------------------------------------
      // PAYMENT CAPTURED
      // ------------------------------------------------------

      if (
        event.event ===
        "payment.captured"
      ) {
        const payment =
          event.payload &&
          event.payload.payment &&
          event.payload.payment.entity;

        if (
          payment &&
          firebaseReady
        ) {
          const razorpayOrderId =
            payment.order_id;

          const snapshot =
            await db
              .collection("orders")
              .where(
                "razorpayOrderId",
                "==",
                razorpayOrderId
              )
              .limit(1)
              .get();

          if (!snapshot.empty) {
            const doc =
              snapshot.docs[0];

            await doc.ref.update({
              paymentStatus:
                "PAID",

              status:
                "PAYMENT CONFIRMED",

              orderStatus:
                "PAYMENT CONFIRMED",

              razorpayPaymentId:
                payment.id,

              updatedAt:
                new Date().toISOString()
            });

            console.log(
              `Payment updated for order: ${doc.id}`
            );
          }
        }
      }

      // ------------------------------------------------------
      // PAYMENT FAILED
      // ------------------------------------------------------

      if (
        event.event ===
        "payment.failed"
      ) {
        const payment =
          event.payload &&
          event.payload.payment &&
          event.payload.payment.entity;

        if (
          payment &&
          firebaseReady
        ) {
          const razorpayOrderId =
            payment.order_id;

          const snapshot =
            await db
              .collection("orders")
              .where(
                "razorpayOrderId",
                "==",
                razorpayOrderId
              )
              .limit(1)
              .get();

          if (!snapshot.empty) {
            const doc =
              snapshot.docs[0];

            await doc.ref.update({
              paymentStatus:
                "FAILED",

              updatedAt:
                new Date().toISOString()
            });
          }
        }
      }

      return res.status(200).json({
        success: true
      });
    } catch (error) {
      console.error(
        "Webhook error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Webhook processing failed."
      });
    }
  }
);

// ============================================================
// CANCEL ORDER
// PATCH /api/orders/:id/cancel
// ============================================================

app.patch(
  "/api/orders/:id/cancel",
  async (req, res) => {
    try {
      const requestedId =
        String(
          req.params.id || ""
        ).trim();

      if (!firebaseReady) {
        return res.status(503).json({
          success: false,

          message:
            "Firebase is not configured."
        });
      }

      // ------------------------------------------------------
      // FIND BY DOCUMENT ID
      // ------------------------------------------------------

      let orderRef =
        db
          .collection("orders")
          .doc(requestedId);

      let orderDoc =
        await orderRef.get();

      // ------------------------------------------------------
      // FIND BY ORDER NUMBER
      // ------------------------------------------------------

      if (!orderDoc.exists) {
        const snapshot =
          await db
            .collection("orders")
            .where(
              "orderNumber",
              "==",
              requestedId
            )
            .limit(1)
            .get();

        if (!snapshot.empty) {
          orderDoc =
            snapshot.docs[0];

          orderRef =
            orderDoc.ref;
        }
      }

      if (!orderDoc.exists) {
        return res.status(404).json({
          success: false,

          message:
            "Order not found."
        });
      }

      // ------------------------------------------------------
      // UPDATE
      // ------------------------------------------------------

      await orderRef.update({
        status:
          "CANCELLED",

        orderStatus:
          "CANCELLED",

        updatedAt:
          new Date().toISOString()
      });

      return res.json({
        success: true,

        message:
          "Order cancelled successfully.",

        orderId:
          orderDoc.id,

        orderNumber:
          orderDoc.data().orderNumber ||
          null
      });
    } catch (error) {
      console.error(
        "Cancel order error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to cancel order.",

        error:
          error.message
      });
    }
  }
);

// ============================================================
// API 404
// ============================================================

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      success: false,

      message:
        "API endpoint not found.",

      path:
        req.originalUrl
    });
  }
);

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "Unhandled server error:",
      error
    );

    res.status(500).json({
      success: false,

      message:
        "Internal server error.",

      error:
        error.message
    });
  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  () => {
    console.log("");

    console.log(
      "=========================================="
    );

    console.log(
      "        PURE VEDA FARM BACKEND"
    );

    console.log(
      "=========================================="
    );

    console.log(
      `Server running at: http://localhost:${PORT}`
    );

    console.log(
      `Website: http://localhost:${PORT}`
    );

    console.log(
      `Admin: http://localhost:${PORT}/admin`
    );

    console.log(
      `Orders API: http://localhost:${PORT}/api/orders`
    );

    console.log(
      `Health: http://localhost:${PORT}/api/health`
    );

    console.log(
      `Firebase: ${
        firebaseReady
          ? "CONNECTED"
          : "DEMO / NOT CONFIGURED"
      }`
    );

    console.log(
      `Razorpay: ${
        razorpayReady
          ? "CONNECTED"
          : "DEMO / NOT CONFIGURED"
      }`
    );

    console.log(
      "=========================================="
    );

    console.log("");
  }
);