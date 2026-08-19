import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { activityTracker } from "./middleware/activityTracker.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { mfaRouter } from "./modules/mfa/mfa.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { salesRouter } from "./modules/sales/sales.routes.js";
import { customerRouter } from "./modules/customer/customer.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { supplierRouter } from "./modules/supplier/supplier.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { deliveryRouter } from "./modules/delivery/delivery.routes.js";
import { financeRouter } from "./modules/finance/finance.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { securityRouter } from "./modules/security/security.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { systemRouter } from "./modules/system/systemReset.routes.js";
import { loanRouter } from "./modules/loans/loan.routes.js";
import { hrRouter } from "./modules/hr/hr.routes.js";

export const app = express();

const LOCALHOST_ORIGIN = /^http:\/\/localhost:\d+$/;

app.use(helmet());
app.use(
  cors({
    // Vite auto-increments past its default port if one is already taken, so
    // hardcoding a single allowed origin breaks the moment that happens.
    // Any localhost port is fine to allow in development; production still
    // pins to the one configured origin.
    origin:
      env.nodeEnv === "development"
        ? (origin, callback) => callback(null, !origin || LOCALHOST_ORIGIN.test(origin))
        : (origin, callback) => callback(null, !origin || env.corsOrigins.includes(origin)),
    credentials: true,
  }),
);
app.use(express.json());
// "combined" (the previous production format) never logs response time at
// all — the exact number needed to tell "slow request" from "server never
// got hit," e.g. while diagnosing a slow login. This format includes it in
// both environments; :status is empty until the response actually finishes,
// so it also flags a request that's still hanging.
app.use(morgan(":method :url :status :response-time ms - :res[content-length]b"));
app.use(activityTracker);

app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", env: env.nodeEnv } });
});

app.use("/api/auth", authRouter);
app.use("/api/mfa", mfaRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/sales", salesRouter);
app.use("/api/customer", customerRouter);
app.use("/api/customers", customersRouter);
app.use("/api/supplier", supplierRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/delivery", deliveryRouter);
app.use("/api/finance", financeRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/security", securityRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/system", systemRouter);
app.use("/api/loans", loanRouter);
app.use("/api/hr", hrRouter);

app.use(notFoundHandler);
app.use(errorHandler);
