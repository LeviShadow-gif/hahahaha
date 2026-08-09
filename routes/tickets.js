/**
 * ============================================================
 * ShadowDev Backend
 * Tickets Route
 * ============================================================
 *
 * Node.js + Express
 *
 * Endpoint:
 *
 * GET /api/tickets
 *
 * Required query parameters:
 *
 *     ticketId
 *     requestId
 *
 * Example:
 *
 * GET /api/tickets?ticketId=SD-XXXXXX&requestId=XXXX
 *
 * ------------------------------------------------------------
 *
 * SECURITY:
 *
 * A ticket can only be accessed when BOTH:
 *
 *     ticketId
 *     requestId
 *
 * match the same MongoDB ticket document.
 *
 * The requestId acts as the shared secret for the ticket.
 *
 * There is currently no user-account ownership system.
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
 *
 * We use Express responses directly here because this route
 * now runs on the Node.js server.
 *
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


function validationError(
    res,
    errors
) {

    return errorResponse(
        res,
        "Validation failed.",
        422,
        errors
    );

}


/**
 * ============================================================
 * Build Ticket Response
 * ============================================================
 *
 * Only expose fields that the frontend actually needs.
 *
 * MongoDB internal _id is never returned.
 *
 * ============================================================
 */

function buildTicketResponse(
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
 * Validate Ticket Lookup
 * ============================================================
 */

function validateTicketLookup(
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
 * Find Ticket
 * ============================================================
 *
 * IMPORTANT:
 *
 * The Mongo query uses BOTH ticketId and requestId.
 *
 * This prevents somebody who knows only a ticket ID from
 * reading the conversation.
 *
 * ============================================================
 */

async function findTicket(
    ticketId,
    requestId
) {

    const tickets =
        await getTicketsCollection();


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

                archived: 1,

                createdAt: 1,

                updatedAt: 1,

                lastActivity: 1,

                messages: 1

            },

            /**
             * ------------------------------------------------
             * Prevent one Mongo read from hanging forever.
             * ------------------------------------------------
             *
             * This is a MongoDB operation timeout, not a
             * Promise.race() timeout.
             *
             * ------------------------------------------------
             */

            maxTimeMS: 5000

        }

    );

}


/**
 * ============================================================
 * Ticket Lookup Handler
 * ============================================================
 */

async function handleTicket(
    req,
    res
) {

    /**
     * --------------------------------------------------------
     * Validate Query
     * --------------------------------------------------------
     */

    const validation =
        validateTicketLookup(
            req.query
        );


    if (
        !validation.valid
    ) {

        return validationError(
            res,
            validation.errors
        );

    }


    /**
     * --------------------------------------------------------
     * Sanitize Query Values
     * --------------------------------------------------------
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
     * --------------------------------------------------------
     * Find Ticket
     * --------------------------------------------------------
     */

    try {

        const ticket =
            await findTicket(
                ticketId,
                requestId
            );


        /**
         * ----------------------------------------------------
         * Ticket Not Found
         * ----------------------------------------------------
         *
         * Deliberately use the same response for:
         *
         * - wrong ticketId
         * - wrong requestId
         * - non-existing ticket
         *
         * This avoids revealing whether a ticket exists when
         * the shared secret is incorrect.
         * ----------------------------------------------------
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
         * ----------------------------------------------------
         * Development Log
         * ----------------------------------------------------
         */

        if (
            ENV.NODE_ENV ===
            "development"
        ) {

            console.log(

                `[TICKETS] Lookup for ${ticketId}.`

            );

        }


        /**
         * ----------------------------------------------------
         * Success
         * ----------------------------------------------------
         */

        return successResponse(

            res,

            buildTicketResponse(
                ticket
            ),

            "Ticket loaded successfully.",

            200

        );

    } catch (
        error
    ) {

        /**
         * ----------------------------------------------------
         * MongoDB Error
         * ----------------------------------------------------
         */

        console.error(

            "[TICKETS] MongoDB read failed:",

            error

        );


        /**
         * ----------------------------------------------------
         * Development Response
         * ----------------------------------------------------
         */

        if (
            ENV.NODE_ENV ===
            "development"
        ) {

            return errorResponse(

                res,

                error?.message ||
                    "Unable to load ticket.",

                503

            );

        }


        /**
         * ----------------------------------------------------
         * Production Response
         * ----------------------------------------------------
         */

        return errorResponse(

            res,

            "Unable to load ticket right now.",

            503

        );

    }

}


/**
 * ============================================================
 * GET /api/tickets
 * ============================================================
 */

router.get(
    "/",
    async (
        req,
        res
    ) => {

        try {

            /**
             * ----------------------------------------------
             * Action
             * ----------------------------------------------
             *
             * Existing frontend uses the default ticket
             * action, so no action is required.
             *
             * ----------------------------------------------
             */

            const action =
                typeof req.query.action ===
                    "string" &&
                req.query.action.trim()
                    ? req.query.action
                        .trim()
                        .toLowerCase()
                    : "ticket";


            /**
             * ----------------------------------------------
             * Ticket Lookup
             * ----------------------------------------------
             */

            if (
                action ===
                "ticket"
            ) {

                return await handleTicket(
                    req,
                    res
                );

            }


            /**
             * ----------------------------------------------
             * Unsupported list/stats
             * ----------------------------------------------
             *
             * There is still no user-account ownership
             * system in the current backend.
             *
             * ----------------------------------------------
             */

            if (
                action === "list" ||
                action === "stats"
            ) {

                return errorResponse(

                    res,

                    "This action requires a user identity system that does not exist yet. Only action=ticket (ticketId + requestId) is supported.",

                    501

                );

            }


            /**
             * ----------------------------------------------
             * Invalid Action
             * ----------------------------------------------
             */

            return errorResponse(

                res,

                "Invalid tickets action.",

                400

            );

        } catch (
            error
        ) {

            /**
             * ----------------------------------------------
             * Unexpected Error
             * ----------------------------------------------
             */

            console.error(
                "[TICKETS]",
                error
            );


            if (
                ENV.NODE_ENV ===
                "development"
            ) {

                return errorResponse(

                    res,

                    error?.message ||
                        "Internal Server Error",

                    500

                );

            }


            return errorResponse(

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