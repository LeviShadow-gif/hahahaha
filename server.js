/**
 * ============================================================
 * ShadowDev Backend
 * Node.js + Express Server
 * ============================================================
 *
 * Main backend entry point.
 *
 * Port:
 *
 *     5000
 *
 * Frontend:
 *
 *     http://localhost:5173
 *
 * API:
 *
 *     http://localhost:5000
 *
 * ============================================================
 */

import express from "express";

import cors from "cors";

import crypto from "node:crypto";

import ENV from "./config/env.js";

import {
    connectDB,
    closeDB
} from "./config/db.js";

import {
    RATE_LIMIT
} from "./utils/constants.js";


/**
 * ============================================================
 * Routes
 * ============================================================
 */

import sendMessageRoute
    from "./routes/sendMessage.js";

import inboxRoute
    from "./routes/inbox.js";

import replyRoute
    from "./routes/reply.js";

import authRoute
    from "./routes/auth.js";

import adminRoute
    from "./routes/admin.js";

import ticketsRoute
    from "./routes/tickets.js";


/**
 * ============================================================
 * Express Application
 * ============================================================
 */

const app =
    express();


/**
 * ============================================================
 * Server Configuration
 * ============================================================
 */

const PORT =
    Number(
        ENV.PORT
    ) || 5000;


const FRONTEND_URL =
    ENV.FRONTEND_URL ||
    "http://localhost:5173";


/**
 * ============================================================
 * Trust Proxy
 * ============================================================
 *
 * Useful when the Node server is behind:
 *
 * - Render
 * - Railway
 * - Nginx
 * - another reverse proxy
 *
 * This also allows Express to determine req.ip correctly.
 *
 * ============================================================
 */

app.set(
    "trust proxy",
    1
);


/**
 * ============================================================
 * CORS
 * ============================================================
 */

app.use(

    cors({

        origin:
            FRONTEND_URL,

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

        credentials:
            true

    })

);


/**
 * ============================================================
 * Body Parser
 * ============================================================
 *
 * JSON:
 *
 *     express.json()
 *
 * URL encoded:
 *
 *     express.urlencoded()
 *
 * ============================================================
 */

app.use(

    express.json({

        limit:
            "1mb"

    })

);


app.use(

    express.urlencoded({

        extended:
            true,

        limit:
            "1mb"

    })

);


/**
 * ============================================================
 * Request ID Middleware
 * ============================================================
 *
 * Every request gets a unique request ID.
 *
 * If the frontend already sends:
 *
 *     X-Request-ID
 *
 * that value is reused.
 *
 * Otherwise a new ID is generated.
 *
 * ============================================================
 */

app.use(

    (
        req,
        res,
        next
    ) => {

        const incomingId =
            req.headers[
                "x-request-id"
            ];


        let requestId;


        if (
            typeof incomingId ===
            "string" &&
            incomingId.trim()
        ) {

            requestId =
                incomingId
                    .trim();

        } else {

            requestId =
                crypto.randomUUID();

        }


        req.requestId =
            requestId;


        res.setHeader(

            "X-Request-ID",

            requestId

        );


        next();

    }

);


/**
 * ============================================================
 * Request Logger
 * ============================================================
 *
 * Logs completed requests only.
 *
 * This keeps the terminal useful without creating timers,
 * listeners or background polling for every request.
 *
 * ============================================================
 */

app.use(

    (
        req,
        res,
        next
    ) => {

        const started =
            Date.now();


        res.on(

            "finish",

            () => {

                const duration =
                    Date.now() -
                    started;


                console.log(

                    `[HTTP] ${req.method} ` +
                    `${req.originalUrl} ` +
                    `${res.statusCode} ` +
                    `${duration}ms`

                );

            }

        );


        next();

    }

);


/**
 * ============================================================
 * Express Rate Limiter
 * ============================================================
 *
 * This is the Node/Express version.
 *
 * It intentionally does NOT use the old Worker-style
 * rateLimit.js because that file expects a Web Request and
 * returns a Web Response.
 *
 * Current constants:
 *
 *     WINDOW_MS   = 1000
 *     MAX_REQUESTS = 5
 *
 * ============================================================
 */

const rateLimitStore =
    new Map();


/**
 * ------------------------------------------------------------
 * Cleanup Rate Limit Store
 * ------------------------------------------------------------
 */

function cleanupRateLimitStore() {

    const now =
        Date.now();


    for (
        const [
            ip,
            record
        ]
        of rateLimitStore.entries()
    ) {

        if (

            now -
            record.firstRequest >=
            RATE_LIMIT.WINDOW_MS

        ) {

            rateLimitStore.delete(
                ip
            );

        }

    }

}


/**
 * ------------------------------------------------------------
 * Get Client IP
 * ------------------------------------------------------------
 */

function getClientIP(
    req
) {

    const forwarded =
        req.headers[
            "x-forwarded-for"
        ];


    if (
        typeof forwarded ===
            "string" &&
        forwarded.trim()
    ) {

        const firstIP =
            forwarded
                .split(",")[0]
                .trim();


        if (
            firstIP
        ) {

            return firstIP;

        }

    }


    return (
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown"
    );

}


/**
 * ------------------------------------------------------------
 * Rate Limit Middleware
 * ------------------------------------------------------------
 */

function rateLimitMiddleware(
    req,
    res,
    next
) {

    /**
     * --------------------------------------------------------
     * Disable
     * --------------------------------------------------------
     */

    if (
        ENV.RATE_LIMIT_ENABLED ===
        false ||
        ENV.RATE_LIMIT_ENABLED ===
        "false"
    ) {

        return next();

    }


    cleanupRateLimitStore();


    const ip =
        getClientIP(
            req
        );


    const now =
        Date.now();


    let record =
        rateLimitStore.get(
            ip
        );


    /**
     * --------------------------------------------------------
     * First Request
     * --------------------------------------------------------
     */

    if (
        !record
    ) {

        record = {

            count:
                1,

            firstRequest:
                now

        };


        rateLimitStore.set(

            ip,

            record

        );


        return next();

    }


    /**
     * --------------------------------------------------------
     * New Window
     * --------------------------------------------------------
     */

    const elapsed =
        now -
        record.firstRequest;


    if (
        elapsed >=
        RATE_LIMIT.WINDOW_MS
    ) {

        record = {

            count:
                1,

            firstRequest:
                now

        };


        rateLimitStore.set(

            ip,

            record

        );


        return next();

    }


    /**
     * --------------------------------------------------------
     * Limit Reached
     * --------------------------------------------------------
     */

    if (
        record.count >=
        RATE_LIMIT.MAX_REQUESTS
    ) {

        const retryAfter =
            Math.max(

                1,

                Math.ceil(

                    (
                        RATE_LIMIT.WINDOW_MS -
                        elapsed

                    ) / 1000

                )

            );


        res.setHeader(

            "Retry-After",

            String(
                retryAfter
            )

        );


        res.setHeader(

            "X-RateLimit-Limit",

            String(
                RATE_LIMIT.MAX_REQUESTS
            )

        );


        res.setHeader(

            "X-RateLimit-Window",

            String(
                RATE_LIMIT.WINDOW_MS
            )

        );


        res.setHeader(

            "X-RateLimit-Remaining",

            "0"

        );


        return res
            .status(429)
            .json({

                success:
                    false,

                message:
                    "Too many requests. Please try again later.",

                requestId:
                    req.requestId,

                timestamp:
                    new Date()
                        .toISOString()

            });

    }


    /**
     * --------------------------------------------------------
     * Increase Count
     * --------------------------------------------------------
     */

    record.count++;


    return next();

}


/**
 * ============================================================
 * Apply Rate Limiting
 * ============================================================
 *
 * Apply after request ID so rate-limit responses also contain
 * X-Request-ID.
 *
 * ============================================================
 */

app.use(
    rateLimitMiddleware
);


/**
 * ============================================================
 * Health Check
 * ============================================================
 *
 * This does NOT touch MongoDB.
 *
 * ============================================================
 */

app.get(

    "/health",

    (
        req,
        res
    ) => {

        return res
            .status(200)
            .json({

                success:
                    true,

                status:
                    "ok",

                service:
                    "ShadowDev API",

                version:
                    "1.0.0",

                requestId:
                    req.requestId,

                timestamp:
                    new Date()
                        .toISOString()

            });

    }

);


/**
 * ============================================================
 * API Root
 * ============================================================
 */

app.get(

    "/",

    (
        req,
        res
    ) => {

        return res
            .status(200)
            .json({

                success:
                    true,

                message:
                    "ShadowDev Backend API",

                status:
                    "online",

                requestId:
                    req.requestId,

                timestamp:
                    new Date()
                        .toISOString()

            });

    }

);


/**
 * ============================================================
 * API ROUTES
 * ============================================================
 *
 * IMPORTANT:
 *
 * All route files are now Express Router modules.
 *
 * Therefore:
 *
 *     app.use()
 *
 * is used directly.
 *
 * There is NO Worker adapter.
 *
 * ============================================================
 */


/**
 * ------------------------------------------------------------
 * Send Message
 * ------------------------------------------------------------
 *
 * POST /api/send-message
 *
 * ------------------------------------------------------------
 */

app.use(

    "/api/send-message",

    sendMessageRoute

);


/**
 * ------------------------------------------------------------
 * Inbox
 * ------------------------------------------------------------
 *
 * GET /api/inbox
 *
 * ------------------------------------------------------------
 */

app.use(

    "/api/inbox",

    inboxRoute

);


/**
 * ------------------------------------------------------------
 * Reply
 * ------------------------------------------------------------
 *
 * POST /api/reply
 *
 * ------------------------------------------------------------
 */

app.use(

    "/api/reply",

    replyRoute

);


/**
 * ------------------------------------------------------------
 * Authentication
 * ------------------------------------------------------------
 *
 * POST /api/auth
 *
 * ------------------------------------------------------------
 */

app.use(

    "/api/auth",

    authRoute

);


/**
 * ------------------------------------------------------------
 * Admin
 * ------------------------------------------------------------
 *
 * GET  /api/admin
 * POST /api/admin
 *
 * ------------------------------------------------------------
 */

app.use(

    "/api/admin",

    adminRoute

);


/**
 * ------------------------------------------------------------
 * Tickets
 * ------------------------------------------------------------
 *
 * GET /api/tickets
 *
 * ------------------------------------------------------------
 */

app.use(

    "/api/tickets",

    ticketsRoute

);


/**
 * ============================================================
 * 404 Handler
 * ============================================================
 *
 * Runs only when no route matched.
 *
 * ============================================================
 */

app.use(

    (
        req,
        res
    ) => {

        return res
            .status(404)
            .json({

                success:
                    false,

                message:
                    "Route not found.",

                path:
                    req.originalUrl,

                requestId:
                    req.requestId,

                timestamp:
                    new Date()
                        .toISOString()

            });

    }

);


/**
 * ============================================================
 * Global Error Handler
 * ============================================================
 *
 * Express requires four arguments:
 *
 *     error
 *     req
 *     res
 *     next
 *
 * ============================================================
 */

app.use(

    (
        error,
        req,
        res,
        next
    ) => {

        console.error(

            "[SERVER ERROR]",

            error

        );


        /**
         * ----------------------------------------------------
         * Headers Already Sent
         * ----------------------------------------------------
         */

        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }


        const isDevelopment =
            ENV.NODE_ENV ===
            "development";


        let status =
            Number(
                error?.statusCode ||
                error?.status ||
                500
            );


        /**
         * ----------------------------------------------------
         * Protect Against Invalid Status Codes
         * ----------------------------------------------------
         */

        if (
            !Number.isInteger(
                status
            ) ||
            status < 400 ||
            status > 599
        ) {

            status =
                500;

        }


        return res
            .status(status)
            .json({

                success:
                    false,

                message:
                    isDevelopment

                        ? (
                            error?.message ||
                            "Internal Server Error"
                        )

                        : "Internal Server Error",

                requestId:
                    req.requestId,

                timestamp:
                    new Date()
                        .toISOString()

            });

    }

);


/**
 * ============================================================
 * Start Server
 * ============================================================
 */

const server =
    app.listen(

        PORT,

        () => {

            console.log("");

            console.log(
                "========================================"
            );

            console.log(
                "🚀 ShadowDev Node Backend"
            );

            console.log(
                "========================================"
            );

            console.log(
                `📡 API:      http://localhost:${PORT}`
            );

            console.log(
                `❤️ Health:   http://localhost:${PORT}/health`
            );

            console.log(
                `🌐 Frontend: ${FRONTEND_URL}`
            );

            console.log(
                `🗄️ MongoDB:  Lazy connection enabled`
            );

            console.log(
                "========================================"
            );

            console.log("");

        }

);


/**
 * ============================================================
 * Graceful Shutdown
 * ============================================================
 */

let shuttingDown =
    false;


async function shutdown(
    signal
) {

    if (
        shuttingDown
    ) {

        return;

    }


    shuttingDown =
        true;


    console.log(

        `\n[SERVER] ${signal} received. Shutting down...`

    );


    /**
     * --------------------------------------------------------
     * Stop accepting new HTTP connections.
     * --------------------------------------------------------
     */

    server.close(

        async () => {

            try {

                await closeDB();

                console.log(
                    "[SERVER] MongoDB connection closed."
                );

            } catch (
                error
            ) {

                console.error(

                    "[SERVER] MongoDB shutdown error:",

                    error

                );

            }


            console.log(
                "[SERVER] HTTP server closed."
            );


            process.exit(
                0
            );

        }

    );


    /**
     * --------------------------------------------------------
     * Forced Shutdown Safety
     * --------------------------------------------------------
     */

    setTimeout(

        () => {

            console.error(
                "[SERVER] Forced shutdown."
            );


            process.exit(
                1
            );

        },

        10000

    ).unref();

}


/**
 * ============================================================
 * Process Signals
 * ============================================================
 */

process.on(

    "SIGINT",

    () => {

        shutdown(
            "SIGINT"
        );

    }

);


process.on(

    "SIGTERM",

    () => {

        shutdown(
            "SIGTERM"
        );

    }

);


/**
 * ============================================================
 * Export App
 * ============================================================
 *
 * Exporting the app makes it possible to use the same Express
 * application in tests without starting another server.
 *
 * ============================================================
 */

export default app;