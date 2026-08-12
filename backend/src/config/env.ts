import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim()),
  procurementApprovalThreshold: Number(process.env.PROCUREMENT_APPROVAL_THRESHOLD ?? 1000),
  deliveryFee: Number(process.env.DELIVERY_FEE ?? 5),
  // Pickup point used as the dropoff-to-pickup leg's origin when a delivery
  // is auto-created for an online order — not a real GPS pickup workflow,
  // just the address shown to the driver as "where to collect the order."
  storePickupAddress: {
    label: process.env.STORE_PICKUP_LABEL ?? "Main Store",
    line1: process.env.STORE_PICKUP_LINE1 ?? "Store address not configured",
    city: process.env.STORE_PICKUP_CITY ?? "—",
  },
  // WebAuthn credentials are bound to the RP ID (bare domain, no scheme) they
  // were registered against, so this must match whatever origin the admin
  // actually logs in from — override via env var if the domain changes again.
  webauthn: {
    rpId: process.env.WEBAUTHN_RP_ID ?? (process.env.NODE_ENV === "production" ? "hantistock.vercel.app" : "localhost"),
    rpName: "Hantistock",
  },
  firebase: {
    projectId: required("FIREBASE_PROJECT_ID"),
    clientEmail: required("FIREBASE_CLIENT_EMAIL"),
    privateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  },
  cloudinary: {
    cloudName: required("CLOUDINARY_CLOUD_NAME"),
    apiKey: required("CLOUDINARY_API_KEY"),
    apiSecret: required("CLOUDINARY_API_SECRET"),
  },
};
