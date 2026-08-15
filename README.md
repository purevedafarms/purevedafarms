# Pure Veda Farm — Ecommerce Starter

A premium responsive ecommerce website for Pure Veda Farm, with:
- Product landing page and professional product gallery
- Interactive Three.js golden ghee droplet
- Cart
- Checkout form
- Demo order creation and order tracking
- Admin order dashboard
- Razorpay test-mode backend endpoint
- Clear extension points for Firebase/Firestore, Razorpay webhooks and WhatsApp/email notifications

## Run locally

1. Install Node.js 18+.
2. Open this folder in VS Code.
3. Run:
   npm install
   npm start
4. Open http://localhost:3000

## Demo mode

Orders are stored in browser localStorage so you can test the complete flow immediately.
Admin: http://localhost:3000/admin.html

## Production setup

For real payments:
- Create Razorpay account and use TEST keys first.
- Put keys in `.env`.
- Create the Razorpay order on the server.
- Verify payment signature on the server.
- Verify Razorpay webhook signatures.
- Store users/orders/payment IDs in Firestore.
- Add Firebase Authentication for customer accounts and admin role protection.
- Connect WhatsApp Business API and/or SMTP for notifications.

Do not put payment secrets in frontend JavaScript.
