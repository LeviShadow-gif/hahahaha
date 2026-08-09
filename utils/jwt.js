/**
 * --------------------------------------------------------
 * ShadowDev Backend
 * JWT Utility
 * --------------------------------------------------------
 *
 * Node.js + Express
 * JWT implementation using jose
 *
 * --------------------------------------------------------
 */

import {
    SignJWT,
    jwtVerify
} from "jose";

import ENV from "../config/env.js";


/**
 * --------------------------------------------------------
 * Secret Key
 * --------------------------------------------------------
 *
 * JWT_SECRET must be configured in the environment.
 *
 * We intentionally use the existing ENV configuration
 * system instead of reading process.env directly here.
 *
 * --------------------------------------------------------
 */

const JWT_SECRET =
    ENV.JWT_SECRET;


/**
 * --------------------------------------------------------
 * Validate Secret
 * --------------------------------------------------------
 */

if (
    !JWT_SECRET ||
    typeof JWT_SECRET !== "string"
) {

    throw new Error(
        "JWT_SECRET is missing or invalid."
    );

}


/**
 * --------------------------------------------------------
 * Encode Secret
 * --------------------------------------------------------
 */

const encoder =
    new TextEncoder();

const SECRET =
    encoder.encode(
        JWT_SECRET
    );


/**
 * --------------------------------------------------------
 * Current Unix Timestamp
 * --------------------------------------------------------
 *
 * Returns seconds instead of milliseconds.
 *
 * Example:
 *
 * Date.now()
 *     -> milliseconds
 *
 * Unix time
 *     -> seconds
 *
 * --------------------------------------------------------
 */

function unixTime() {

    return Math.floor(
        Date.now() / 1000
    );

}


/**
 * --------------------------------------------------------
 * Create JWT
 * --------------------------------------------------------
 *
 * Payload example:
 *
 * {
 *     username: "admin",
 *     role: "admin"
 * }
 *
 * --------------------------------------------------------
 */

export async function sign(
    payload = {}
) {

    /**
     * ----------------------------------------------
     * Validate Payload
     * ----------------------------------------------
     */

    if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)
    ) {

        throw new TypeError(
            "JWT payload must be an object."
        );

    }


    /**
     * ----------------------------------------------
     * Create Token
     * ----------------------------------------------
     *
     * IMPORTANT:
     *
     * We intentionally do not add an expiration here.
     * This preserves the behavior of the existing JWT
     * implementation.
     *
     * ----------------------------------------------
     */

    const token =
        await new SignJWT(
            payload
        )

            .setProtectedHeader({

                alg: "HS256",

                typ: "JWT"

            })

            .setIssuedAt(
                unixTime()
            )

            .sign(
                SECRET
            );


    return token;

}


/**
 * --------------------------------------------------------
 * Extract Bearer Token
 * --------------------------------------------------------
 *
 * Supports:
 *
 * 1. Express request
 *
 *     req.headers.authorization
 *
 * 2. Fetch / Web Request
 *
 *     request.headers.get("Authorization")
 *
 * This makes the JWT utility compatible with the new
 * Express backend while remaining backward compatible
 * with the old Request-style usage.
 *
 * --------------------------------------------------------
 */

export function extractBearerToken(
    request
) {

    /**
     * ----------------------------------------------
     * Validate Request
     * ----------------------------------------------
     */

    if (
        !request ||
        typeof request !== "object"
    ) {

        return null;

    }


    /**
     * ----------------------------------------------
     * Authorization Header
     * ----------------------------------------------
     */

    let header = null;


    /**
     * ----------------------------------------------
     * Express Request
     * ----------------------------------------------
     *
     * Express:
     *
     * req.headers.authorization
     *
     * Header names are already normalized to lowercase.
     *
     * ----------------------------------------------
     */

    if (
        request.headers &&
        typeof request.headers === "object" &&
        typeof request.headers.get !== "function"
    ) {

        header =
            request.headers.authorization ||
            request.headers.Authorization ||
            null;

    }


    /**
     * ----------------------------------------------
     * Fetch / Web Request
     * ----------------------------------------------
     *
     * Old Cloudflare Worker compatible path.
     *
     * ----------------------------------------------
     */

    if (
        !header &&
        request.headers &&
        typeof request.headers.get === "function"
    ) {

        header =
            request.headers.get(
                "Authorization"
            );

    }


    /**
     * ----------------------------------------------
     * Header Missing
     * ----------------------------------------------
     */

    if (
        !header ||
        typeof header !== "string"
    ) {

        return null;

    }


    /**
     * ----------------------------------------------
     * Bearer Prefix
     * ----------------------------------------------
     */

    const trimmedHeader =
        header.trim();


    if (
        !trimmedHeader
    ) {

        return null;

    }


    /**
     * ----------------------------------------------
     * Validate Bearer Scheme
     * ----------------------------------------------
     */

    const parts =
        trimmedHeader.split(/\s+/);


    if (
        parts.length !== 2 ||
        parts[0].toLowerCase() !== "bearer"
    ) {

        return null;

    }


    /**
     * ----------------------------------------------
     * Token
     * ----------------------------------------------
     */

    const token =
        parts[1].trim();


    if (
        !token
    ) {

        return null;

    }


    return token;

}


/**
 * --------------------------------------------------------
 * Verify JWT
 * --------------------------------------------------------
 */

export async function verify(
    token
) {

    try {

        /**
         * ------------------------------------------
         * Token Validation
         * ------------------------------------------
         */

        if (
            !token ||
            typeof token !== "string"
        ) {

            return {

                valid: false,

                payload: null,

                error:
                    "Token is required."

            };

        }


        /**
         * ------------------------------------------
         * Remove Accidental Whitespace
         * ------------------------------------------
         */

        const cleanToken =
            token.trim();


        if (
            !cleanToken
        ) {

            return {

                valid: false,

                payload: null,

                error:
                    "Token is required."

            };

        }


        /**
         * ------------------------------------------
         * Verify Signature
         * ------------------------------------------
         */

        const {
            payload
        } =
            await jwtVerify(

                cleanToken,

                SECRET,

                {

                    algorithms: [
                        "HS256"
                    ]

                }

            );


        /**
         * ------------------------------------------
         * Success
         * ------------------------------------------
         */

        return {

            valid: true,

            payload,

            error: null

        };

    }

    catch (
        error
    ) {

        /**
         * ------------------------------------------
         * JWT Verification Error
         * ------------------------------------------
         */

        return {

            valid: false,

            payload: null,

            error:
                error?.message ||
                "Invalid or expired token."

        };

    }

}


/**
 * --------------------------------------------------------
 * Verify Request
 * --------------------------------------------------------
 *
 * Extracts the Authorization Bearer token from the
 * incoming request and verifies it.
 *
 * Used by:
 *
 *     middleware/auth.js
 *
 * --------------------------------------------------------
 */

export async function verifyRequest(
    request
) {

    /**
     * ----------------------------------------------
     * Extract Token
     * ----------------------------------------------
     */

    const token =
        extractBearerToken(
            request
        );


    /**
     * ----------------------------------------------
     * Missing Token
     * ----------------------------------------------
     */

    if (
        !token
    ) {

        return {

            valid: false,

            payload: null,

            error:
                "Authorization token not found."

        };

    }


    /**
     * ----------------------------------------------
     * Verify Token
     * ----------------------------------------------
     */

    return await verify(
        token
    );

}


/**
 * --------------------------------------------------------
 * Default Export
 * --------------------------------------------------------
 */

export default {

    sign,

    verify,

    verifyRequest,

    extractBearerToken

};