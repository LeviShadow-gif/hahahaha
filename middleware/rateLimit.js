/**
 * ============================================================
 * ShadowDev Backend
 * Express Rate Limit Middleware
 * ============================================================
 *
 * Purpose:
 *
 *     Protect API endpoints from excessive requests.
 *
 * Current configuration comes from:
 *
 *     utils/constants.js
 *
 *     RATE_LIMIT.WINDOW_MS
 *     RATE_LIMIT.MAX_REQUESTS
 *
 * Example:
 *
 *     5 requests
 *     within 1 second
 *     per IP address
 *
 * ============================================================
 */

import ENV from "../config/env.js";

import {
    RATE_LIMIT
} from "../utils/constants.js";


/**
 * ============================================================
 * In-Memory Rate Limit Store
 * ============================================================
 *
 * Key:
 *
 *     IP address
 *
 * Value:
 *
 *     {
 *         count,
 *         firstRequest
 *     }
 *
 * ============================================================
 */

const store =
    new Map();


/**
 * ============================================================
 * Get Client IP
 * ============================================================
 *
 * Priority:
 *
 * 1. Cloudflare IP
 * 2. X-Forwarded-For
 * 3. Express req.ip
 * 4. Socket address
 *
 * ============================================================
 */

export function getClientIP(
    req
) {

    /**
     * --------------------------------------------------------
     * Cloudflare
     * --------------------------------------------------------
     */

    const cloudflareIP =
        req.headers[
            "cf-connecting-ip"
        ];


    if (
        typeof cloudflareIP ===
            "string" &&
        cloudflareIP.trim()
    ) {

        return cloudflareIP
            .trim();

    }


    /**
     * --------------------------------------------------------
     * Reverse Proxy
     * --------------------------------------------------------
     */

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


    /**
     * --------------------------------------------------------
     * Express IP
     * --------------------------------------------------------
     */

    if (
        typeof req.ip ===
            "string" &&
        req.ip.trim()
    ) {

        return req.ip
            .trim();

    }


    /**
     * --------------------------------------------------------
     * Socket fallback
     * --------------------------------------------------------
 */

    const socketIP =
        req.socket?.remoteAddress;


    if (
        typeof socketIP ===
            "string" &&
        socketIP.trim()
    ) {

        return socketIP
            .trim();

    }


    return "unknown";

}


/**
 * ============================================================
 * Cleanup Old Entries
 * ============================================================
 *
 * Removes expired IP records.
 *
 * ============================================================
 */

export function cleanupStore() {

    const now =
        Date.now();


    for (
        const [
            ip,
            record
        ]
        of store.entries()
    ) {

        if (

            now -
            record.firstRequest >=
            RATE_LIMIT.WINDOW_MS

        ) {

            store.delete(
                ip
            );

        }

    }

}


/**
 * ============================================================
 * Get Existing Record
 * ============================================================
 */

export function getRecord(
    ip
) {

    return store.get(
        ip
    );

}


/**
 * ============================================================
 * Create New Record
 * ============================================================
 */

export function createRecord(
    ip
) {

    const record = {

        count:
            1,

        firstRequest:
            Date.now()

    };


    store.set(

        ip,

        record

    );


    return record;

}


/**
 * ============================================================
 * Reset Window
 * ============================================================
 */

export function resetWindow(
    ip
) {

    const record = {

        count:
            1,

        firstRequest:
            Date.now()

    };


    store.set(

        ip,

        record

    );


    return record;

}


/**
 * ============================================================
 * Increase Request Count
 * ============================================================
 */

export function increaseCount(
    record
) {

    record.count++;


    return record;

}


/**
 * ============================================================
 * Check Rate Limit
 * ============================================================
 *
 * Returns:
 *
 * {
 *     allowed: true,
 *     retryAfter: 0
 * }
 *
 * OR
 *
 * {
 *     allowed: false,
 *     retryAfter: seconds
 * }
 *
 * ============================================================
 */

export function checkRateLimit(
    ip
) {

    cleanupStore();


    const now =
        Date.now();


    const record =
        getRecord(
            ip
        );


    /**
     * --------------------------------------------------------
     * First request
     * --------------------------------------------------------
     */

    if (
        !record
    ) {

        createRecord(
            ip
        );


        return {

            allowed:
                true,

            retryAfter:
                0

        };

    }


    /**
     * --------------------------------------------------------
     * Current window
     * --------------------------------------------------------
 */

    const elapsed =
        now -
        record.firstRequest;


    /**
     * --------------------------------------------------------
     * Window expired
     * --------------------------------------------------------
     */

    if (
        elapsed >=
        RATE_LIMIT.WINDOW_MS
    ) {

        resetWindow(
            ip
        );


        return {

            allowed:
                true,

            retryAfter:
                0

        };

    }


    /**
     * --------------------------------------------------------
     * Limit reached
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


        return {

            allowed:
                false,

            retryAfter

        };

    }


    /**
     * --------------------------------------------------------
     * Request allowed
     * --------------------------------------------------------
     */

    increaseCount(
        record
    );


    return {

        allowed:
            true,

        retryAfter:
            0

    };

}


/**
 * ============================================================
 * Express Rate Limit Middleware
 * ============================================================
 */

export function rateLimit(
    req,
    res,
    next
) {

    /**
     * --------------------------------------------------------
     * Rate limiter disabled
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


    const ip =
        getClientIP(
            req
        );


    const result =
        checkRateLimit(
            ip
        );


    /**
     * --------------------------------------------------------
     * Allowed
     * --------------------------------------------------------
 */

    if (
        result.allowed
    ) {

        /**
         * Helpful rate-limit headers.
         */

        const record =
            getRecord(
                ip
            );


        const remaining =
            Math.max(

                0,

                RATE_LIMIT.MAX_REQUESTS -
                (record?.count || 0)

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

            String(
                remaining
            )

        );


        return next();

    }


    /**
     * --------------------------------------------------------
     * Blocked
     * --------------------------------------------------------
 */

    res.setHeader(

        "Retry-After",

        String(
            result.retryAfter
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
                req.requestId || null,

            retryAfter:
                result.retryAfter,

            timestamp:
                new Date()
                    .toISOString()

        });

}


/**
 * ============================================================
 * Clear Rate Limit Store
 * ============================================================
 *
 * Useful during development/testing.
 *
 * ============================================================
 */

export function clearRateLimitStore() {

    store.clear();

}


/**
 * ============================================================
 * Get Store Size
 * ============================================================
 */

export function getStoreSize() {

    return store.size;

}


/**
 * ============================================================
 * Default Export
 * ============================================================
 */

export default {

    rateLimit,

    checkRateLimit,

    getClientIP,

    cleanupStore,

    getRecord,

    createRecord,

    resetWindow,

    increaseCount,

    clearRateLimitStore,

    getStoreSize

};