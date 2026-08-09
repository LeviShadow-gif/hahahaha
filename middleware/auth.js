/**
 * --------------------------------------------------------
 * ShadowDev Backend
 * Authentication Middleware
 * --------------------------------------------------------
 *
 * Node.js + Express compatible
 *
 * Responsibilities:
 * - Read JWT from incoming request
 * - Verify JWT using existing utils/jwt.js
 * - Attach authenticated user to req.user
 * - Provide admin-role protection
 * - Keep existing verifyRequest() JWT logic
 * --------------------------------------------------------
 */

import ENV from "../config/env.js";

import {
    verifyRequest
} from "../utils/jwt.js";

import {
    errorResponse
} from "../utils/response.js";


/**
 * --------------------------------------------------------
 * Unauthorized Response
 * --------------------------------------------------------
 */

function unauthorized(
    res,
    message = "Unauthorized."
) {

    return res.status(401).json(
        errorResponse(
            message,
            401
        )
    );

}


/**
 * --------------------------------------------------------
 * Forbidden Response
 * --------------------------------------------------------
 */

function forbidden(
    res,
    message = "Forbidden."
) {

    return res.status(403).json(
        errorResponse(
            message,
            403
        )
    );

}


/**
 * --------------------------------------------------------
 * Build Web Request For Existing JWT Utility
 * --------------------------------------------------------
 *
 * Existing jwt.js was originally written around the
 * Web Request API used by Cloudflare Workers.
 *
 * Node.js provides the Web Request API as well, so we
 * create a small compatible Request object from Express.
 *
 * This allows us to keep the existing JWT verification
 * implementation instead of rewriting it here.
 * --------------------------------------------------------
 */

function createVerificationRequest(req) {

    const headers = new Headers();

    for (
        const [key, value]
        of Object.entries(req.headers)
    ) {

        if (
            Array.isArray(value)
        ) {

            headers.set(
                key,
                value.join(", ")
            );

        } else if (
            value !== undefined
        ) {

            headers.set(
                key,
                String(value)
            );

        }

    }

    const protocol =
        req.protocol || "http";

    const host =
        req.get("host") ||
        "localhost";

    const originalUrl =
        req.originalUrl ||
        req.url ||
        "/";

    const url =
        `${protocol}://${host}${originalUrl}`;

    return new Request(
        url,
        {
            method:
                req.method || "GET",

            headers
        }
    );

}


/**
 * --------------------------------------------------------
 * Authenticate Request
 * --------------------------------------------------------
 *
 * Express middleware.
 *
 * On success:
 *
 *     req.user
 *
 * will contain the verified JWT payload.
 *
 * On failure:
 *
 *     401 Unauthorized
 *
 * is returned and next() is NOT called.
 * --------------------------------------------------------
 */

export async function authenticate(
    req,
    res,
    next
) {

    try {

        /**
         * ----------------------------------------------
         * Create Web-compatible request
         * ----------------------------------------------
         */

        const verificationRequest =
            createVerificationRequest(
                req
            );


        /**
         * ----------------------------------------------
         * Verify JWT
         * ----------------------------------------------
         */

        const result =
            await verifyRequest(
                verificationRequest
            );


        /**
         * ----------------------------------------------
         * Invalid / Missing Token
         * ----------------------------------------------
         */

        if (
            !result ||
            !result.valid
        ) {

            return unauthorized(
                res,
                result?.error ||
                "Invalid authentication token."
            );

        }


        /**
         * ----------------------------------------------
         * Verify Payload
         * ----------------------------------------------
         */

        if (
            !result.payload ||
            typeof result.payload !== "object"
        ) {

            return unauthorized(
                res,
                "Invalid authentication payload."
            );

        }


        /**
         * ----------------------------------------------
         * Attach User To Express Request
         * ----------------------------------------------
         */

        req.user =
            result.payload;


        /**
         * ----------------------------------------------
         * Development Logging
         * ----------------------------------------------
         */

        if (
            ENV.NODE_ENV ===
            "development"
        ) {

            const username =
                result.payload.username ||
                result.payload.email ||
                result.payload.userId ||
                "unknown";

            console.log(
                `[AUTH] ${username} authenticated.`
            );

        }


        /**
         * ----------------------------------------------
         * Continue
         * ----------------------------------------------
         */

        return next();

    } catch (error) {

        console.error(
            "[AUTH] Authentication error:",
            error
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
 *
 * Protects routes that require:
 *
 *     req.user.role === "admin"
 *
 * Authentication is performed first.
 * --------------------------------------------------------
 */

export async function requireAdmin(
    req,
    res,
    next
) {

    try {

        /**
         * ----------------------------------------------
         * Authenticate First
         * ----------------------------------------------
         */

        const verificationRequest =
            createVerificationRequest(
                req
            );

        const result =
            await verifyRequest(
                verificationRequest
            );


        /**
         * ----------------------------------------------
         * Invalid Authentication
         * ----------------------------------------------
         */

        if (
            !result ||
            !result.valid
        ) {

            return unauthorized(
                res,
                result?.error ||
                "Invalid authentication token."
            );

        }


        /**
         * ----------------------------------------------
         * Validate Payload
         * ----------------------------------------------
         */

        if (
            !result.payload ||
            typeof result.payload !== "object"
        ) {

            return unauthorized(
                res,
                "Invalid authentication payload."
            );

        }


        /**
         * ----------------------------------------------
         * Attach User
         * ----------------------------------------------
         */

        req.user =
            result.payload;


        /**
         * ----------------------------------------------
         * Verify Admin Role
         * ----------------------------------------------
         */

        if (
            result.payload.role !==
            "admin"
        ) {

            return forbidden(
                res,
                "Administrator access required."
            );

        }


        /**
         * ----------------------------------------------
         * Development Logging
         * ----------------------------------------------
         */

        if (
            ENV.NODE_ENV ===
            "development"
        ) {

            const username =
                result.payload.username ||
                result.payload.email ||
                result.payload.userId ||
                "unknown";

            console.log(
                `[AUTH] Admin ${username} authenticated.`
            );

        }


        /**
         * ----------------------------------------------
         * Continue
         * ----------------------------------------------
         */

        return next();

    } catch (error) {

        console.error(
            "[AUTH] Admin authentication error:",
            error
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