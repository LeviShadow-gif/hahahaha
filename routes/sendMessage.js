/**
 * ============================================================
 * ShadowDev Backend
 * Send Message Route
 * ============================================================
 *
 * Node.js + Express
 *
 * Endpoint:
 *
 * POST /api/send-message
 *
 * Responsibilities:
 *
 * - Validate landing-page inquiry
 * - Prevent duplicate inquiry spam
 * - Generate ticket ID
 * - Generate request ID when necessary
 * - Create default system welcome message
 * - Create first user conversation message
 * - Save ticket to MongoDB
 * - Return ticket information to frontend
 *
 * ============================================================
 */

import express from "express";

import ENV from "../config/env.js";

import {
    getTicketsCollection
} from "../config/db.js";

import {
    validateSendMessagePayload
} from "../utils/validator.js";

import {
    generateTicketId,
    generateMessageId
} from "../utils/ticketGenerator.js";


/**
 * ============================================================
 * Router
 * ============================================================
 */

const router =
    express.Router();


/**
 * ============================================================
 * Current Timestamp
 * ============================================================
 */

function now() {

    return new Date();

}


/**
 * ============================================================
 * Create Request ID
 * ============================================================
 *
 * Normally server.js already creates req.requestId.
 *
 * This fallback guarantees that ticket creation still has
 * a request ID if this route is ever mounted independently.
 *
 * ============================================================
 */

function getRequestId(
    req
) {

    if (
        req.requestId
    ) {

        return String(
            req.requestId
        );

    }


    if (
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID ===
            "function"
    ) {

        return globalThis.crypto.randomUUID();

    }


    return (
        `${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2, 12)
    );

}


/**
 * ============================================================
 * Create System Welcome Message
 * ============================================================
 *
 * This message is created only once when a brand-new ticket
 * is created.
 *
 * It is stored permanently inside MongoDB.
 *
 * The frontend does NOT need to generate this message.
 *
 * ============================================================
 */

function createWelcomeMessage(
    ticketId,
    service
) {

    const safeTicketId =
        String(ticketId || "")
            .trim();

    const safeService =
        String(service || "Support")
            .trim();


    return {

        id:
            generateMessageId(),

        sender:
            "system",

        message:
            `👋 Welcome to ShadowDev Support! 🚀\n\n` +
            `Thanks for reaching out to us. Your request has been received successfully. 💙\n\n` +
            `🎫 Your ticket ID is ${safeTicketId}.\n` +
            `🛠️ Service: ${safeService}\n\n` +
            `Our team will review your request and reply here shortly. 💬\n\n` +
            `You can continue the conversation in this chat anytime. We're happy to help! ✨`,

        createdAt:
            now(),

        edited:
            false,

        deleted:
            false

    };

}


/**
 * ============================================================
 * Create First Conversation Message
 * ============================================================
 */

function createFirstMessage(
    message
) {

    return {

        id:
            generateMessageId(),

        sender:
            "user",

        message,

        createdAt:
            now(),

        edited:
            false,

        deleted:
            false

    };

}


/**
 * ============================================================
 * Create Ticket Document
 * ============================================================
 */

function createTicket({
    ticketId,
    requestId,
    service,
    message
}) {

    const timestamp =
        now();


    return {

        ticketId,

        requestId,

        service,

        status:
            "open",

        unreadAdmin:
            true,

        unreadUser:
            true,

        unreadUserCount:
            1,

        archived:
            false,

        createdAt:
            timestamp,

        updatedAt:
            timestamp,

        lastActivity:
            timestamp,

        messages: [

            createWelcomeMessage(
                ticketId,
                service
            ),

            createFirstMessage(
                message
            )

        ]

    };

}


/**
 * ============================================================
 * Duplicate Inquiry Check
 * ============================================================
 *
 * Prevents the exact same service + message combination from
 * being submitted again within 10 minutes.
 *
 * IMPORTANT:
 *
 * The duplicate-check query uses MongoDB maxTimeMS so the
 * database operation does not remain uncontrolled after the
 * timeout.
 *
 * If the duplicate-check query fails or times out, the check
 * fails open so that a temporary DB read problem does NOT stop
 * creation of a new inquiry.
 *
 * ============================================================
 */

async function isDuplicateInquiry(
    tickets,
    service,
    message
) {

    const lastTenMinutes =
        new Date(
            Date.now() -
            10 * 60 * 1000
        );


    try {

        const duplicate =
            await tickets.findOne(

                {

                    service,

                    "messages.message":
                        message,

                    createdAt: {

                        $gte:
                            lastTenMinutes

                    }

                },

                {

                    projection: {

                        _id: 1

                    },

                    maxTimeMS: 700

                }

            );


        return Boolean(
            duplicate
        );

    } catch (
        error
    ) {

        console.warn(

            "[DUPLICATE_CHECK] " +
            "Skipping duplicate check:",

            error?.message ||
            error

        );


        /**
         * ------------------------------------------------
         * Fail Open
         * ------------------------------------------------
         *
         * A temporary read problem should not prevent the
         * customer from submitting an inquiry.
         *
         * The main insert operation below remains the
         * authoritative ticket creation operation.
         * ------------------------------------------------
         */

        return false;

    }

}


/**
 * ============================================================
 * Success Response
 * ============================================================
 */

function sendSuccess(
    res,
    data,
    message,
    status = 200
) {

    return res
        .status(status)
        .json({

            success:
                true,

            message,

            data,

            timestamp:
                new Date().toISOString()

        });

}


/**
 * ============================================================
 * Error Response
 * ============================================================
 */

function sendError(
    res,
    message,
    status = 500,
    errors = null
) {

    return res
        .status(status)
        .json({

            success:
                false,

            message,

            errors,

            timestamp:
                new Date().toISOString()

        });

}


/**
 * ============================================================
 * POST /api/send-message
 * ============================================================
 */

router.post(
    "/",
    async (
        req,
        res
    ) => {

        try {

            /**
             * ------------------------------------------------
             * Request Body
             * ------------------------------------------------
             */

            const body =
                req.body &&
                typeof req.body ===
                    "object"
                    ? req.body
                    : {};


            /**
             * ------------------------------------------------
             * Validate Payload
             * ------------------------------------------------
             */

            const validation =
                validateSendMessagePayload(
                    body
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
             * ------------------------------------------------
             * Validated Data
             * ------------------------------------------------
             */

            const {
                service,
                message
            } =
                validation.data;


            /**
             * ------------------------------------------------
             * Request ID
             * ------------------------------------------------
             */

            const requestId =
                getRequestId(
                    req
                );


            /**
             * ------------------------------------------------
             * MongoDB Collection
             * ------------------------------------------------
             */

            const tickets =
                await getTicketsCollection();


            /**
             * ------------------------------------------------
             * Duplicate Check
             * ------------------------------------------------
             */

            const duplicate =
                await isDuplicateInquiry(

                    tickets,

                    service,

                    message

                );


            if (
                duplicate
            ) {

                return sendError(

                    res,

                    "Duplicate inquiry detected. Please wait before sending the same message again.",

                    409

                );

            }


            /**
             * ------------------------------------------------
             * Generate Ticket ID
             * ------------------------------------------------
             */

            const ticketId =
                await generateTicketId(
                    tickets
                );


            /**
             * ------------------------------------------------
             * Create Ticket
             * ------------------------------------------------
             *
             * The ticket now contains:
             *
             * 1. System welcome message
             * 2. User's first message
             *
             * Both are stored together in MongoDB.
             *
             * ------------------------------------------------
             */

            const ticket =
                createTicket({

                    ticketId,

                    requestId,

                    service,

                    message

                });


            /**
             * ------------------------------------------------
             * Save Ticket
             * ------------------------------------------------
             */

            const result =
                await tickets.insertOne(
                    ticket
                );


            /**
             * ------------------------------------------------
             * Verify Insert
             * ------------------------------------------------
             */

            if (
                !result ||
                !result.insertedId
            ) {

                throw new Error(
                    "Unable to create ticket."
                );

            }


            /**
             * ------------------------------------------------
             * Development Log
             * ------------------------------------------------
             */

            if (
                ENV.NODE_ENV ===
                "development"
            ) {

                console.log(

                    `[SEND_MESSAGE] ` +
                    `${ticket.ticketId} ` +
                    `created successfully.`

                );

            }


            /**
             * ------------------------------------------------
             * Success
             * ------------------------------------------------
             */

            return sendSuccess(

                res,

                {

                    ticketId:
                        ticket.ticketId,

                    status:
                        ticket.status,

                    service:
                        ticket.service,

                    createdAt:
                        ticket.createdAt,

                    lastActivity:
                        ticket.lastActivity,

                    requestId:
                        ticket.requestId

                },

                "Inquiry submitted successfully.",

                201

            );

        } catch (
            error
        ) {

            /**
             * ----------------------------------------------
             * Error Log
             * ----------------------------------------------
             */

            console.error(
                "[SEND_MESSAGE]",
                error
            );


            /**
             * ----------------------------------------------
             * Development
             * ----------------------------------------------
             */

            if (
                ENV.NODE_ENV ===
                "development"
            ) {

                return sendError(

                    res,

                    error?.message ||
                    "Internal Server Error",

                    500

                );

            }


            /**
             * ----------------------------------------------
             * Production
             * ----------------------------------------------
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
 * ============================================================
 * Reject Other HTTP Methods
 * ============================================================
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
 * ============================================================
 * Export
 * ============================================================
 */

export default router;