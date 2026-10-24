/**
 * --------------------------------------------------------
 * ShadowDev Backend
 * Authentication Middleware
 * --------------------------------------------------------
 *
 * Node.js + Express
 * JWT verification using existing utils/jwt.js
 *
 * Exports:
 * - authenticate
 * - requireAdmin
 *
 * No dependency on utils/response.js
 * --------------------------------------------------------
 */

import ENV from "../config/env.js";

import {
    verifyRequest
} from "../utils/jwt.js";

/**
 * --------------------------------------------------------
 * Error Responses
 * --------------------------------------------------------
 */

function unauthorized(res, message = "Unauthorized.") {
    return res.status(401).json({
        success: false,
        message,
        timestamp: new Date().toISOString()
    });
}

function forbidden(res, message = "Forbidden.") {
    return res.status(403).json({
        success: false,
        message,
        timestamp: new Date().toISOString()
    });
}

/**
 * --------------------------------------------------------
 * Build Web Request For Existing JWT Utility
 * --------------------------------------------------------
 */

function createVerificationRequest(req) {
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            headers.set(key, value.join(", "));
        } else if (value !== undefined) {
            headers.set(key, String(value));
        }
    }

    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost";
    const originalUrl = req.originalUrl || req.url || "/";

    return new Request(
        `${protocol}://${host}${originalUrl}`,
        {
            method: req.method || "GET",
            headers
        }
    );
}

/**
 * --------------------------------------------------------
 * Authenticate
 * --------------------------------------------------------
 */

export async function authenticate(req, res, next) {
    try {
        const verificationRequest =
            createVerificationRequest(req);

        const result = await verifyRequest(
            verificationRequest
        );

        if (!result || !result.valid) {
            return unauthorized(
                res,
                result?.error ||
                    "Invalid authentication token."
            );
        }

        if (
            !result.payload ||
            typeof result.payload !== "object"
        ) {
            return unauthorized(
                res,
                "Invalid authentication payload."
            );
        }

        req.user = result.payload;

        if (ENV.NODE_ENV === "development") {
            const username =
                result.payload.username ||
                result.payload.email ||
                result.payload.userId ||
                "unknown";

            console.log(
                `[AUTH] ${username} authenticated.`
            );
        }

        return next();
    } catch (error) {
        console.error(
            "[AUTH] Authentication error:",
            error.message
        );

        return unauthorized(
            res,
            "Authentication failed."
        );
    }
}

/**
 * --------------------------------------------------------
 * Require Admin
 * --------------------------------------------------------
 */

export async function requireAdmin(req, res, next) {
    try {
        const verificationRequest =
            createVerificationRequest(req);

        const result = await verifyRequest(
            verificationRequest
        );

        if (!result || !result.valid) {
            return unauthorized(
                res,
                result?.error ||
                    "Invalid authentication token."
            );
        }

        if (
            !result.payload ||
            typeof result.payload !== "object"
        ) {
            return unauthorized(
                res,
                "Invalid authentication payload."
            );
        }

        req.user = result.payload;

        if (result.payload.role !== "admin") {
            return forbidden(
                res,
                "Administrator access required."
            );
        }

        if (ENV.NODE_ENV === "development") {
            const username =
                result.payload.username ||
                result.payload.email ||
                result.payload.userId ||
                "unknown";

            console.log(
                `[AUTH] Admin ${username} authenticated.`
            );
        }

        return next();
    } catch (error) {
        console.error(
            "[AUTH] Admin authentication error:",
            error.message
        );

        return unauthorized(
            res,
            "Authentication failed."
        );
    }
}

/**
 * --------------------------------------------------------
 * Default Export
 * --------------------------------------------------------
 */

export default {
    authenticate,
    requireAdmin
};