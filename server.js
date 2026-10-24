/**
 * ============================================================
 * ShadowSMM Backend
 * Express + MongoDB + JWT
 * ============================================================
 */

import crypto from "crypto";
import express from "express";
import cors from "cors";

import ENV from "./config/env.js";

import {
    connectDB,
    closeDB
} from "./config/db.js";

import corsMiddleware from "./middleware/cors.js";

import authRoute from "./routes/auth.js";
import userAuthRoute from "./routes/userAuth.js";
import fundsRoute from "./routes/funds.js";
import notificationRoute from "./routes/notificationRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();

const PORT = Number(ENV.PORT) || 5000;

/**
 * ============================================================
 * Proxy Configuration
 * ============================================================
 */

app.set("trust proxy", 1);

/**
 * ============================================================
 * CORS
 * ============================================================
 */

app.use(corsMiddleware);

app.use(
    cors({
        origin: [
            ENV.FRONTEND_URL,
            "http://localhost:5173",
            "http://127.0.0.1:5173"
        ].filter(Boolean),

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Request-ID"
        ],

        credentials: true
    })
);

/**
 * ============================================================
 * Body Parsing
 * ============================================================
 */

app.use(express.json({ limit: "1mb" }));

app.use(
    express.urlencoded({
        extended: true,
        limit: "1mb"
    })
);

/**
 * ============================================================
 * Request ID
 * ============================================================
 */

app.use((req, res, next) => {
    const requestId =
        req.headers["x-request-id"] ||
        crypto.randomUUID();

    req.requestId = String(requestId);

    res.setHeader(
        "X-Request-ID",
        req.requestId
    );

    next();
});

/**
 * ============================================================
 * Health Check
 * ============================================================
 */

app.get("/health", async (req, res) => {
    try {
        await connectDB();

        return res.status(200).json({
            success: true,
            status: "ok",
            database: "connected",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(
            "❌ [HEALTH CHECK] MongoDB error:",
            error.message
        );

        return res.status(503).json({
            success: false,
            status: "error",
            database: "disconnected",
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * ============================================================
 * API Root
 * ============================================================
 */

app.get("/", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "ShadowSMM API is running",
        timestamp: new Date().toISOString()
    });
});

/**
 * ============================================================
 * User Authentication Routes
 * ============================================================
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * POST /api/auth/logout
 * ============================================================
 */

app.use("/api/auth", userAuthRoute);

/**
 * ============================================================
 * Existing Authentication Routes
 * ============================================================
 */

app.use("/api/auth", authRoute);

/**
 * ============================================================
 * Account Settings Routes
 * ============================================================
 *
 * PATCH /api/account/email
 * PATCH /api/account/password
 *
 * Authentication is handled by accountRoutes.js.
 * Username updates are not supported.
 * ============================================================
 */

app.use("/api/account", accountRoutes);

app.use("/api/referral", referralRoutes);

app.use("/api/orders", orderRoutes);

/**
 * ============================================================
 * Funds / Add Funds Routes
 * ============================================================
 *
 * POST  /api/funds/upi
 * POST  /api/funds/crypto
 * GET   /api/funds/my-requests
 * GET   /api/funds/admin
 * PATCH /api/funds/admin/:id/approve
 * PATCH /api/funds/admin/:id/reject
 *
 * Existing deposit notification logic remains unchanged.
 * ============================================================
 */

app.use("/api/funds", fundsRoute);

/**
 * ============================================================
 * Admin Routes (stats + users)
 * ============================================================
 *
 * GET   /api/admin/stats
 * GET   /api/admin/users
 * PATCH /api/admin/users/:id
 *
 * Must stay ABOVE app.use("/api", notificationRoute) below.
 * Authentication and admin check are handled inside
 * adminRoutes.js and its controllers.
 * ============================================================
 */

app.use("/api/admin", adminRoutes);

/**
 * ============================================================
 * Notifications Routes
 * ============================================================
 *
 * User routes:
 * GET    /api/notification
 * DELETE /api/notification/:id
 * DELETE /api/notification
 *
 * Admin routes:
 * GET    /api/admin/notifications
 * POST   /api/admin/notifications
 * DELETE /api/admin/notifications/:id
 *
 * Authentication and admin authorization are handled
 * inside notificationRoutes.js.
 * ============================================================
 */

app.use("/api", notificationRoute);

/**
 * ============================================================
 * 404 Handler
 * ============================================================
 */

app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});

/**
 * ============================================================
 * Global Error Handler
 * ============================================================
 */

app.use((error, req, res, next) => {
    console.error(
        "🔥 [SERVER ERROR]",
        error
    );

    if (res.headersSent) {
        return next(error);
    }

    const status =
        Number(error.statusCode || error.status) || 500;

    return res.status(
        status >= 400 && status <= 599
            ? status
            : 500
    ).json({
        success: false,

        message:
            ENV.NODE_ENV === "development"
                ? error.message
                : "Internal Server Error",

        requestId: req.requestId,

        timestamp: new Date().toISOString()
    });
});

/**
 * ============================================================
 * Start Server
 * ============================================================
 */

const server = app.listen(PORT, () => {
    console.log("======================================");
    console.log("🚀 ShadowSMM Backend Started");
    console.log(`🌐 API: http://localhost:${PORT}`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log("======================================");
});

/**
 * ============================================================
 * Graceful Shutdown
 * ============================================================
 */

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;

    shuttingDown = true;

    console.log(
        `🛑 [SERVER] ${signal} received. Closing server...`
    );

    server.close(async () => {
        try {
            await closeDB();

            console.log(
                "🔌 [SERVER] MongoDB connection closed."
            );
        } catch (error) {
            console.error(
                "❌ [SERVER] Shutdown error:",
                error
            );
        }

        console.log(
            "👋 [SERVER] Shutdown complete."
        );

        process.exit(0);
    });

    setTimeout(() => {
        console.error(
            "⚠️ [SERVER] Forced shutdown."
        );

        process.exit(1);
    }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;