/**
 * --------------------------------------------------------
 * ShadowDev Backend
 * CORS Middleware
 * --------------------------------------------------------
 *
 * Node.js + Express compatible
 *
 * Responsibilities:
 * - Allow frontend requests from configured origins
 * - Handle CORS preflight requests
 * - Allow API methods used by ShadowDev
 * - Allow Content-Type and Authorization headers
 * - Support credentials
 * - Reject unknown browser origins
 * --------------------------------------------------------
 */

import ENV from "../config/env.js";


/**
 * --------------------------------------------------------
 * Allowed Origins
 * --------------------------------------------------------
 *
 * ENV.FRONTEND_URL is the primary frontend origin.
 *
 * Local development origins are also explicitly allowed.
 *
 * IMPORTANT:
 * Do not use "*" together with credentials.
 * --------------------------------------------------------
 */

const allowedOrigins = [
    ENV.FRONTEND_URL,

    "http://localhost:5173",

    "http://127.0.0.1:5173"
]
    .filter(Boolean)
    .map(
        origin =>
            String(origin).replace(
                /\/+$/,
                ""
            )
    );


/**
 * --------------------------------------------------------
 * Allowed Methods
 * --------------------------------------------------------
 */

const allowedMethods = [
    "GET",
    "POST",
    "PATCH",
    "PUT",
    "DELETE",
    "OPTIONS"
].join(", ");


/**
 * --------------------------------------------------------
 * Allowed Headers
 * --------------------------------------------------------
 */

const allowedHeaders = [
    "Content-Type",
    "Authorization"
].join(", ");


/**
 * --------------------------------------------------------
 * Exposed Headers
 * --------------------------------------------------------
 */

const exposedHeaders = [
    "Content-Length",
    "Content-Type"
].join(", ");


/**
 * --------------------------------------------------------
 * Credentials
 * --------------------------------------------------------
 */

const allowCredentials = true;


/**
 * --------------------------------------------------------
 * Normalize Origin
 * --------------------------------------------------------
 */

function normalizeOrigin(
    origin
) {

    if (
        !origin
    ) {

        return "";

    }

    return String(
        origin
    ).replace(
        /\/+$/,
        ""
    );

}


/**
 * --------------------------------------------------------
 * Check Allowed Origin
 * --------------------------------------------------------
 */

function isAllowedOrigin(
    origin
) {

    const normalizedOrigin =
        normalizeOrigin(
            origin
        );

    return (
        normalizedOrigin &&
        allowedOrigins.includes(
            normalizedOrigin
        )
    );

}


/**
 * --------------------------------------------------------
 * Build CORS Headers
 * --------------------------------------------------------
 *
 * This function is kept exported so existing code that
 * imports buildCorsHeaders() does not immediately break.
 *
 * It now returns a normal Express/Node header object.
 * --------------------------------------------------------
 */

export function buildCorsHeaders(
    req
) {

    const origin =
        normalizeOrigin(
            req?.headers?.origin
        );


    const headers = {

        "Access-Control-Allow-Methods":
            allowedMethods,

        "Access-Control-Allow-Headers":
            allowedHeaders,

        "Access-Control-Allow-Credentials":
            String(
                allowCredentials
            ),

        "Access-Control-Expose-Headers":
            exposedHeaders,

        "Vary":
            "Origin"

    };


    /**
     * ----------------------------------------------------
     * Only send Access-Control-Allow-Origin when the
     * requesting origin is explicitly allowed.
     * ----------------------------------------------------
     */

    if (
        isAllowedOrigin(
            origin
        )
    ) {

        headers[
            "Access-Control-Allow-Origin"
        ] = origin;

    }


    return headers;

}


/**
 * --------------------------------------------------------
 * Apply CORS Headers
 * --------------------------------------------------------
 */

function applyCorsHeaders(
    req,
    res
) {

    const headers =
        buildCorsHeaders(
            req
        );


    for (
        const [
            name,
            value
        ]
        of Object.entries(
            headers
        )
    ) {

        res.setHeader(
            name,
            value
        );

    }

}


/**
 * --------------------------------------------------------
 * Check Preflight Request
 * --------------------------------------------------------
 */

export function isPreflight(
    req
) {

    return (
        req?.method ===
        "OPTIONS"
    );

}


/**
 * --------------------------------------------------------
 * Handle Preflight
 * --------------------------------------------------------
 *
 * Browser sends:
 *
 * OPTIONS /api/...
 *
 * before requests such as:
 *
 * POST /api/reply
 *
 * when CORS rules require a preflight.
 * --------------------------------------------------------
 */

export function handlePreflight(
    req,
    res
) {

    applyCorsHeaders(
        req,
        res
    );


    /**
     * ----------------------------------------------------
     * Unknown browser origin
     * ----------------------------------------------------
     *
     * If an Origin header exists but is not allowed,
     * do not approve the preflight.
     * ----------------------------------------------------
     */

    const origin =
        normalizeOrigin(
            req?.headers?.origin
        );


    if (
        origin &&
        !isAllowedOrigin(
            origin
        )
    ) {

        return res
            .status(403)
            .json({

                success: false,

                message:
                    "CORS origin not allowed."

            });

    }


    /**
     * ----------------------------------------------------
     * Valid preflight
     * ----------------------------------------------------
     */

    return res
        .status(204)
        .end();

}


/**
 * --------------------------------------------------------
 * CORS Middleware
 * --------------------------------------------------------
 *
 * Usage:
 *
 * app.use(corsMiddleware);
 * --------------------------------------------------------
 */

export function corsMiddleware(
    req,
    res,
    next
) {

    try {

        /**
         * ----------------------------------------------
         * Apply normal CORS headers
         * ----------------------------------------------
         */

        applyCorsHeaders(
            req,
            res
        );


        /**
         * ----------------------------------------------
         * Handle OPTIONS / preflight
         * ----------------------------------------------
         */

        if (
            isPreflight(
                req
            )
        ) {

            return handlePreflight(
                req,
                res
            );

        }


        /**
         * ----------------------------------------------
         * Normal request
         * ----------------------------------------------
         */

        const origin =
            normalizeOrigin(
                req?.headers?.origin
            );


        /**
         * ------------------------------------------------
         * Browser request from an unknown origin
         * ------------------------------------------------
         *
         * Do not block requests that have no Origin
         * header. This keeps direct server-to-server,
         * curl and health-check requests working.
         *
         * Browser requests with an Origin must be from
         * an explicitly allowed origin.
         * ------------------------------------------------
         */

        if (
            origin &&
            !isAllowedOrigin(
                origin
            )
        ) {

            return res
                .status(403)
                .json({

                    success: false,

                    message:
                        "CORS origin not allowed."

                });

        }


        /**
         * ----------------------------------------------
         * Continue to route
         * ----------------------------------------------
         */

        return next();

    } catch (error) {

        console.error(
            "[CORS] Middleware error:",
            error
        );


        return res
            .status(500)
            .json({

                success: false,

                message:
                    "CORS middleware error."

            });

    }

}


/**
 * --------------------------------------------------------
 * Default Export
 * --------------------------------------------------------
 */

export default corsMiddleware;