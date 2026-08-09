/**
 * --------------------------------------------------------
 * ShadowDev Backend
 * Authentication Route
 * --------------------------------------------------------
 *
 * Node.js + Express
 *
 * Endpoints:
 *
 * POST /api/auth?action=login
 * POST /api/auth?action=verify
 * POST /api/auth?action=logout
 *
 * --------------------------------------------------------
 */

import express from "express";

import ENV from "../config/env.js";

import {
    validateLogin
} from "../utils/validator.js";

import {
    sign,
    verify,
    extractBearerToken
} from "../utils/jwt.js";


/**
 * --------------------------------------------------------
 * Router
 * --------------------------------------------------------
 */

const router = express.Router();


/**
 * --------------------------------------------------------
 * JSON Success Response
 * --------------------------------------------------------
 *
 * Keeps the same response structure used by the old
 * Cloudflare backend:
 *
 * {
 *     success: true,
 *     message: "...",
 *     data: {},
 *     timestamp: "..."
 * }
 *
 * --------------------------------------------------------
 */

function sendSuccess(
    res,
    data = null,
    message = "Success.",
    status = 200
) {

    return res
        .status(status)
        .json({

            success: true,

            message,

            data,

            timestamp:
                new Date().toISOString()

        });

}


/**
 * --------------------------------------------------------
 * JSON Error Response
 * --------------------------------------------------------
 *
 * Keeps the same response structure used previously.
 * --------------------------------------------------------
 */

function sendError(
    res,
    message = "Something went wrong.",
    status = 500,
    errors = null
) {

    return res
        .status(status)
        .json({

            success: false,

            message,

            errors,

            timestamp:
                new Date().toISOString()

        });

}


/**
 * --------------------------------------------------------
 * Verify Admin Credentials
 * --------------------------------------------------------
 *
 * Credentials are read from ENV.
 *
 * No request-provided environment object is used anymore
 * because Node.js uses the backend environment directly.
 *
 * --------------------------------------------------------
 */

function verifyCredentials(
    username,
    password
) {

    const adminUsername =
        ENV.ADMIN_USERNAME;

    const adminPassword =
        ENV.ADMIN_PASSWORD;


    return (
        username === adminUsername &&
        password === adminPassword
    );

}


/**
 * --------------------------------------------------------
 * Login Handler
 * --------------------------------------------------------
 */

async function handleLogin(
    req,
    res
) {

    /**
     * ----------------------------------------------
     * Request Body
     * ----------------------------------------------
     */

    const body =
        req.body &&
        typeof req.body === "object"
            ? req.body
            : {};


    /**
     * ----------------------------------------------
     * Validate Login
     * ----------------------------------------------
     */

    const validation =
        validateLogin(
            body.username,
            body.password
        );


    if (
        !validation.valid
    ) {

        return sendError(
            res,
            "Validation failed.",
            422,
            validation.errors
        );

    }


    /**
     * ----------------------------------------------
     * Verify Credentials
     * ----------------------------------------------
     */

    const authorized =
        verifyCredentials(
            body.username,
            body.password
        );


    if (
        !authorized
    ) {

        return sendError(
            res,
            "Invalid username or password.",
            401
        );

    }


    /**
     * ----------------------------------------------
     * Generate JWT
     * ----------------------------------------------
     *
     * IMPORTANT:
     * jwt.js is the central JWT implementation.
     *
     * Payload intentionally remains compatible with the
     * existing authentication system.
     *
     * ----------------------------------------------
     */

    const token =
        await sign({

            username:
                body.username,

            role:
                "admin"

        });


    /**
     * ----------------------------------------------
     * Development Log
     * ----------------------------------------------
     */

    if (
        ENV.NODE_ENV === "development"
    ) {

        console.log(
            `[AUTH] Admin login successful: ${body.username}`
        );

    }


    /**
     * ----------------------------------------------
     * Success
     * ----------------------------------------------
     */

    return sendSuccess(

        res,

        {

            token,

            user: {

                username:
                    body.username,

                role:
                    "admin"

            }

        },

        "Login successful.",

        200

    );

}


/**
 * --------------------------------------------------------
 * Verify Token Handler
 * --------------------------------------------------------
 */

async function handleVerify(
    req,
    res
) {

    /**
     * ----------------------------------------------
     * Extract Bearer Token
     * ----------------------------------------------
     */

    const token =
        extractBearerToken(
            req
        );


    /**
     * ----------------------------------------------
     * Missing Token
     * ----------------------------------------------
     */

    if (
        !token
    ) {

        return sendError(
            res,
            "Authentication token is required.",
            401
        );

    }


    /**
     * ----------------------------------------------
     * Verify JWT
     * ----------------------------------------------
     */

    const result =
        await verify(
            token
        );


    /**
     * ----------------------------------------------
     * Invalid Token
     * ----------------------------------------------
     */

    if (
        !result ||
        !result.valid
    ) {

        return sendError(

            res,

            result?.error ||
                "Invalid token.",

            401

        );

    }


    /**
     * ----------------------------------------------
     * Development Log
     * ----------------------------------------------
     */

    

    /**
     * ----------------------------------------------
     * Success
     * ----------------------------------------------
     */

    return sendSuccess(

        res,

        result.payload,

        "Token verified.",

        200

    );

}


/**
 * --------------------------------------------------------
 * Logout Handler
 * --------------------------------------------------------
 *
 * JWT authentication is stateless.
 *
 * Therefore logout does not need to modify MongoDB.
 * The frontend removes its stored token.
 *
 * --------------------------------------------------------
 */

async function handleLogout(
    req,
    res
) {

    /**
     * ----------------------------------------------
     * Development Log
     * ----------------------------------------------
     */




    return sendSuccess(

        res,

        {},

        "Logout successful.",

        200

    );

}


/**
 * --------------------------------------------------------
 * Authentication Route
 * --------------------------------------------------------
 *
 * Default action:
 *
 *     login
 *
 * Supported actions:
 *
 *     login
 *     verify
 *     logout
 *
 * --------------------------------------------------------
 */

router.post(
    "/",
    async (
        req,
        res
    ) => {

        try {

            /**
             * ------------------------------------------
             * Get Action
             * ------------------------------------------
             */

            const action =
                typeof req.query.action === "string" &&
                req.query.action.trim()
                    ? req.query.action
                        .trim()
                        .toLowerCase()
                    : "login";


            /**
             * ------------------------------------------
             * Login
             * ------------------------------------------
             */

            if (
                action === "login"
            ) {

                return await handleLogin(
                    req,
                    res
                );

            }


            /**
             * ------------------------------------------
             * Verify
             * ------------------------------------------
             */

            if (
                action === "verify"
            ) {

                return await handleVerify(
                    req,
                    res
                );

            }


            /**
             * ------------------------------------------
             * Logout
             * ------------------------------------------
             */

            if (
                action === "logout"
            ) {

                return await handleLogout(
                    req,
                    res
                );

            }


            /**
             * ------------------------------------------
             * Invalid Action
             * ------------------------------------------
             */

            return sendError(

                res,

                "Invalid authentication action.",

                400

            );

        } catch (
            error
        ) {

            /**
             * ------------------------------------------
             * Server Error Log
             * ------------------------------------------
             */

            console.error(
                "[AUTH] Authentication route error:",
                error
            );


            /**
             * ------------------------------------------
             * Development Response
             * ------------------------------------------
             */

            if (
                ENV.NODE_ENV ===
                "development"
            ) {

                return sendError(

                    res,

                    error?.message ||
                        "Authentication request failed.",

                    500

                );

            }


            /**
             * ------------------------------------------
             * Production Response
             * ------------------------------------------
             */

            return sendError(

                res,

                "Internal Server Error",

                500

            );

        }

    }
);


/**
 * --------------------------------------------------------
 * Reject Non-POST Requests
 * --------------------------------------------------------
 *
 * This keeps the old route behavior:
 *
 * POST only.
 *
 * --------------------------------------------------------
 */

router.use(
    (
        req,
        res
    ) => {

        return sendError(

            res,

            "Method Not Allowed.",

            405

        );

    }
);


/**
 * --------------------------------------------------------
 * Default Export
 * --------------------------------------------------------
 */

export default router;