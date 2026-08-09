/**
 * ============================================================
 * ShadowDev Backend
 * Inbox Route
 * ============================================================
 *
 * Node.js + Express
 *
 * Endpoint:
 *
 * GET /api/inbox
 *
 * Required query parameters:
 *
 *     ticketId
 *     requestId
 *
 * Example:
 *
 * GET /api/inbox?ticketId=SD-XXXXXX&requestId=XXXX
 *
 * ------------------------------------------------------------
 *
 * SECURITY:
 *
 * The inbox contains the complete private conversation.
 *
 * Therefore BOTH ticketId and requestId are required.
 *
 * ticketId:
 *     Identifies the ticket.
 *
 * requestId:
 *     Acts as the shared secret for the ticket.
 *
 * ============================================================
 */

import express from "express";

import ENV from "../config/env.js";

import {
    getTicketsCollection
} from "../config/db.js";

import {
    validateTicketId,
    isEmpty,
    sanitizeString
} from "../utils/validator.js";


/**
 * ============================================================
 * Router
 * ============================================================
 */

const router =
    express.Router();


/**
 * ============================================================
 * Response Helpers
 * ============================================================
 */

function successResponse(
    res,
    data,
    message = "Success.",
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


function errorResponse(
    res,
    message = "Something went wrong.",
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


function notFoundResponse(
    res,
    message = "Ticket not found."
) {

    return errorResponse(
        res,
        message,
        404
    );

}


/**
 * ============================================================
 * Build Inbox Response
 * ============================================================
 *
 * Only return fields required by the inbox.
 *
 * MongoDB internal _id is never exposed.
 *
 * ============================================================
 */

function buildInboxResponse(
    ticket
) {

    return {

        ticketId:
            ticket.ticketId,

        service:
            ticket.service,

        status:
            ticket.status,

        unreadAdmin:
            Boolean(
                ticket.unreadAdmin
            ),

        unreadUser:
            Boolean(
                ticket.unreadUser
            ),

        unreadUserCount:
            Math.max(
                0,
                Number(
                    ticket.unreadUserCount ||
                    (ticket.unreadUser ? 1 : 0)
                )
            ),

        archived:
            Boolean(
                ticket.archived
            ),

        createdAt:
            ticket.createdAt,

        updatedAt:
            ticket.updatedAt,

        lastActivity:
            ticket.lastActivity,

        messages:
            Array.isArray(
                ticket.messages
            )
                ? ticket.messages
                : []

    };

}


/**
 * ============================================================
 * Validate Inbox Lookup
 * ============================================================
 */

function validateInboxLookup(
    query
) {

    const ticketValidation =
        validateTicketId(
            query.ticketId
        );


    const errors = [

        ...(
            ticketValidation.errors ||
            []
        )

    ];


    /**
     * --------------------------------------------------------
     * Request ID
     * --------------------------------------------------------
     */

    if (
        isEmpty(
            query.requestId
        )
    ) {

        errors.push({

            field:
                "requestId",

            message:
                "Request ID is required."

        });

    }


    return {

        valid:
            errors.length === 0,

        errors

    };

}


/**
 * ============================================================
 * Find Inbox Ticket
 * ============================================================
 *
 * Both ticketId and requestId are used in the Mongo query.
 *
 * This prevents someone from reading another user's
 * conversation by knowing only the ticket ID.
 *
 * ============================================================
 */

async function findInboxTicket(
    tickets,
    ticketId,
    requestId
) {

    return await tickets.findOne(

        {

            ticketId,

            requestId

        },

        {

            projection: {

                _id: 0,

                ticketId: 1,

                service: 1,

                status: 1,

                unreadAdmin: 1,

                unreadUser: 1,

                unreadUserCount: 1,

                archived: 1,

                createdAt: 1,

                updatedAt: 1,

                lastActivity: 1,

                messages: 1

            },

            /**
             * ------------------------------------------------
             * MongoDB operation timeout
             * ------------------------------------------------
             *
             * This is preferable to Promise.race() because
             * MongoDB itself stops the operation.
             *
             * ------------------------------------------------
             */

            maxTimeMS:
                5000

        }

    );

}


/**
 * ============================================================
 * GET /api/inbox
 * ============================================================
 */

router.get(
    "/",
    async (req, res, next) => {
        if (req.query.action !== "count") return next();
        try {
            const validation = validateInboxLookup(req.query);
            if (!validation.valid) return errorResponse(res, "Validation failed.", 422, validation.errors);
            const ticketId = sanitizeString(req.query.ticketId);
            const requestId = sanitizeString(req.query.requestId);
            const tickets = await getTicketsCollection();
            const ticket = await tickets.findOne(
                { ticketId, requestId },
                { projection: { _id: 0, unreadUser: 1, unreadUserCount: 1 }, maxTimeMS: 5000 }
            );
            if (!ticket) return notFoundResponse(res, "Ticket not found.");
            const unreadUserCount = Math.max(0, Number(ticket.unreadUserCount || (ticket.unreadUser ? 1 : 0)));
            return successResponse(res, { unreadUser: unreadUserCount > 0, unreadUserCount }, "Unread count loaded successfully.", 200);
        } catch (error) {
            console.error("[INBOX] Unread count failed:", error);
            return errorResponse(res, ENV.NODE_ENV === "development" ? error?.message || "Unable to load unread count." : "Unable to load unread count right now.", 503);
        }
    },
    (req, res) => errorResponse(res, "Method Not Allowed.", 405)
);


router.get(
    "/",
    async (
        req,
        res
    ) => {

        try {

            /**
             * ------------------------------------------------
             * Validate Query
             * ------------------------------------------------
             */

            const validation =
                validateInboxLookup(
                    req.query
                );


            if (
                !validation.valid
            ) {

                return errorResponse(

                    res,

                    "Validation failed.",

                    422,

                    validation.errors

                );

            }


            /**
             * ------------------------------------------------
             * Sanitize Values
             * ------------------------------------------------
             */

            const ticketId =
                sanitizeString(
                    req.query.ticketId
                );


            const requestId =
                sanitizeString(
                    req.query.requestId
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
             * Find Ticket
             * ------------------------------------------------
             */

            const ticket =
                await findInboxTicket(

                    tickets,

                    ticketId,

                    requestId

                );


            /**
             * ------------------------------------------------
             * Ticket Not Found
             * ------------------------------------------------
             *
             * Deliberately return the same result for:
             *
             * - wrong ticketId
             * - wrong requestId
             * - nonexistent ticket
             *
             * ------------------------------------------------
             */

            if (
                !ticket
            ) {

                return notFoundResponse(

                    res,

                    "Ticket not found."

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

                    `[INBOX] Ticket ${ticket.ticketId} opened.`

                );

            }


            /**
             * ------------------------------------------------
             * Success
             * ------------------------------------------------
             */

            return successResponse(

                res,

                buildInboxResponse(
                    ticket
                ),

                "Inbox loaded successfully.",

                200

            );

        } catch (
            error
        ) {

            /**
             * ------------------------------------------------
             * MongoDB / Server Error
             * ------------------------------------------------
             */

            console.error(

                "[INBOX] MongoDB read failed:",

                error

            );


            /**
             * ------------------------------------------------
             * Development Response
             * ------------------------------------------------
             */

            if (
                ENV.NODE_ENV ===
                "development"
            ) {

                return errorResponse(

                    res,

                    error?.message ||
                        "Unable to load inbox.",

                    503

                );

            }


            /**
             * ------------------------------------------------
             * Production Response
             * ------------------------------------------------
             */

            return errorResponse(

                res,

                "Unable to load inbox right now.",

                503

            );

        }

    }
);


/**
 * ============================================================
 * POST /api/inbox — Mark User Inbox Read
 * ============================================================
 */

router.post(
    "/",
    async (req, res) => {
        try {
            const body = req.body && typeof req.body === "object" ? req.body : {};
            if (body.action !== "markRead") return errorResponse(res, "Invalid action.", 422);
            const validation = validateInboxLookup(body);
            if (!validation.valid) return errorResponse(res, "Validation failed.", 422, validation.errors);
            const ticketId = sanitizeString(body.ticketId);
            const requestId = sanitizeString(body.requestId);
            const tickets = await getTicketsCollection();
            const result = await tickets.updateOne(
                { ticketId, requestId },
                { $set: { unreadUser: false, unreadUserCount: 0 } },
                { maxTimeMS: 5000 }
            );
            if (!result || result.matchedCount !== 1) return notFoundResponse(res, "Ticket not found.");
            return successResponse(res, { ticketId, unreadUser: false, unreadUserCount: 0 }, "Inbox marked as read.", 200);
        } catch (error) {
            console.error("[INBOX] Mark read failed:", error);
            return errorResponse(res, ENV.NODE_ENV === "development" ? error?.message || "Unable to mark inbox as read." : "Unable to mark inbox as read right now.", 503);
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

        return errorResponse(

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