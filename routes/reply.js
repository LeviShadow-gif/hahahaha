/**
 * ============================================================
 * ShadowDev Backend
 * Reply Route
 * ============================================================
 *
 * Node.js + Express
 *
 * Endpoint:
 *
 *     POST /api/reply
 *
 * Responsibilities:
 *
 * - Validate reply payload
 * - Verify admin authentication for admin replies
 * - Prevent public admin impersonation
 * - Verify ticket exists
 * - Create message object
 * - Save message into ticket
 * - Update unread flags
 * - Update ticket activity timestamps
 * - Return created message information
 *
 * ============================================================
 */

import express from "express";

import ENV from "../config/env.js";

import {
    getTicketsCollection
} from "../config/db.js";

import {
    validateReplyPayload
} from "../utils/validator.js";

import {
    generateMessageId
} from "../utils/ticketGenerator.js";

import {
    verify
} from "../utils/jwt.js";


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
            success: true,
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
            success: false,
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
 * Create Reply Object
 * ============================================================
 */

function createReply({
    sender,
    message
}) {

    const timestamp =
        now();

    return {
        id:
            generateMessageId(),

        sender,

        message,

        createdAt:
            timestamp,

        edited:
            false,

        deleted:
            false
    };
}


/**
 * ============================================================
 * Extract Bearer Token
 * ============================================================
 *
 * Express request -> Authorization header
 *
 * Expected:
 *
 *     Authorization: Bearer <JWT>
 *
 * ============================================================
 */

function extractBearerToken(req) {

    const header =
        req.headers.authorization;

    if (
        typeof header !==
        "string"
    ) {
        return null;
    }

    const trimmed =
        header.trim();

    if (
        !trimmed
            .toLowerCase()
            .startsWith("bearer ")
    ) {
        return null;
    }

    const token =
        trimmed
            .slice(7)
            .trim();

    if (!token) {
        return null;
    }

    return token;
}


/**
 * ============================================================
 * Verify Admin Authentication
 * ============================================================
 *
 * IMPORTANT:
 *
 * Admin replies MUST have a valid JWT.
 *
 * We intentionally verify the token directly here instead
 * of depending on req.user because the current Express
 * server mounts this file directly as an Express Router.
 *
 * ============================================================
 */

async function verifyAdmin(req) {

    const token =
        extractBearerToken(req);

    if (!token) {

        return {
            authenticated:
                false,

            status:
                401,

            message:
                "Authorization token not found.",

            user:
                null
        };
    }


    const result =
        await verify(token);


    if (
        !result ||
        !result.valid
    ) {

        return {
            authenticated:
                false,

            status:
                401,

            message:
                result?.error ||
                "Invalid authentication token.",

            user:
                null
        };
    }


    const user =
        result.payload;


    if (
        !user ||
        user.role !== "admin"
    ) {

        return {
            authenticated:
                false,

            status:
                403,

            message:
                "Administrator access required.",

            user:
                null
        };
    }


    return {
        authenticated:
            true,

        status:
            200,

        message:
            null,

        user
    };
}


/**
 * ============================================================
 * Verify Sender Permission
 * ============================================================
 *
 * User:
 *
 *     sender === "user"
 *
 * is allowed without admin authentication.
 *
 *
 * Admin:
 *
 *     sender === "admin"
 *
 * requires a valid JWT whose role is "admin".
 *
 *
 * This prevents a public client from simply sending:
 *
 *     {
 *         sender: "admin"
 *     }
 *
 * and impersonating the admin.
 *
 * ============================================================
 */

async function canUseSender(
    req,
    sender
) {

    /**
     * --------------------------------------------------------
     * User messages
     * --------------------------------------------------------
     */

    if (
        sender === "user"
    ) {

        return {
            allowed:
                true,

            auth:
                null
        };
    }


    /**
     * --------------------------------------------------------
     * Admin messages
     * --------------------------------------------------------
     */

    if (
        sender === "admin"
    ) {

        const auth =
            await verifyAdmin(
                req
            );


        return {
            allowed:
                auth.authenticated,

            auth
        };
    }


    /**
     * --------------------------------------------------------
     * Unknown sender
     * --------------------------------------------------------
     */

    return {
        allowed:
            false,

        auth:
            null
    };
}


/**
 * ============================================================
 * Find Ticket
 * ============================================================
 */

async function findTicket(
    tickets,
    ticketId
) {

    return await tickets.findOne(
        {
            ticketId
        },
        {
            projection: {
                _id: 1,
                ticketId: 1
            },

            maxTimeMS:
                5000
        }
    );
}


/**
 * ============================================================
 * POST /api/reply
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
                validateReplyPayload(
                    body
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
             * Validated Data
             * ------------------------------------------------
             */

            const {
                ticketId,
                message,
                sender
            } =
                validation.data;


            /**
             * ------------------------------------------------
             * Sender Authorization
             * ------------------------------------------------
             *
             * Admin sender:
             *
             *     JWT required
             *     role must be "admin"
             *
             * User sender:
             *
             *     allowed
             *
             * ------------------------------------------------
             */

            const senderPermission =
                await canUseSender(
                    req,
                    sender
                );


            if (
                !senderPermission.allowed
            ) {

                if (
                    sender ===
                    "admin"
                ) {

                    const auth =
                        senderPermission.auth;


                    return errorResponse(
                        res,

                        auth?.message ||
                        "Administrator authentication required.",

                        auth?.status ||
                        403
                    );
                }


                return errorResponse(
                    res,
                    "Invalid sender.",
                    403
                );
            }


            /**
             * ------------------------------------------------
             * MongoDB Collection
             * ------------------------------------------------
             */

            const tickets =
                await getTicketsCollection();


            /**
             * ------------------------------------------------
             * Verify Ticket Exists
             * ------------------------------------------------
             */

            const ticket =
                await findTicket(
                    tickets,
                    ticketId
                );


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
             * Create Reply
             * ------------------------------------------------
             */

            const replyMessage =
                createReply({
                    sender,
                    message
                });


            /**
             * ------------------------------------------------
             * Unread Flags
             * ------------------------------------------------
             *
             * User sends message:
             *
             *     unreadAdmin = true
             *     unreadUser  = false
             *
             * Admin sends message:
             *
             *     unreadAdmin = false
             *     unreadUser  = true
             *
             * ------------------------------------------------
             */

            const unreadAdmin =
                sender === "user";

            const isUserUnreadMessage =
                sender === "admin" ||
                sender === "system";


            /**
             * ------------------------------------------------
             * One Timestamp For This Update
             * ------------------------------------------------
             */

            const timestamp =
                now();


            /**
             * ------------------------------------------------
             * Save Reply
             * ------------------------------------------------
             */

            const result =
                await tickets.updateOne(
                    {
                        ticketId
                    },

                    {
                        $push: {
                            messages:
                                replyMessage
                        },

                        $set: {
                            updatedAt:
                                timestamp,

                            lastActivity:
                                timestamp,

                            unreadAdmin,

                            ...(isUserUnreadMessage
                                ? {
                                    unreadUser: true
                                  }
                                : {})
                        },

                        ...(isUserUnreadMessage
                            ? {
                                $inc: {
                                    unreadUserCount: 1
                                }
                              }
                            : {})
                    },

                    {
                        maxTimeMS:
                            5000
                    }
                );


            /**
             * ------------------------------------------------
             * Update Failed
             * ------------------------------------------------
             */

            if (
                !result ||
                result.matchedCount !== 1 ||
                result.modifiedCount !== 1
            ) {

                throw new Error(
                    "Unable to save reply."
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
                    "[REPLY] " +
                    `${ticket.ticketId} ` +
                    `replied by ${sender}.`
                );
            }


            /**
             * ------------------------------------------------
             * Success
             * ------------------------------------------------
             */

            return successResponse(
                res,

                {
                    ticketId,

                    messageId:
                        replyMessage.id,

                    sender,

                    message:
                        replyMessage.message,

                    createdAt:
                        replyMessage.createdAt,

                    updatedAt:
                        timestamp
                },

                "Reply sent successfully.",

                200
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
                "[REPLY]",
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

                return errorResponse(
                    res,

                    error?.message ||
                    "Unable to send your message right now.",

                    503
                );
            }


            /**
             * ----------------------------------------------
             * Production
             * ----------------------------------------------
             */

            return errorResponse(
                res,

                "Unable to send your message right now.",

                503
            );
        }
    }
);


/**
 * ============================================================
 * Reject Other HTTP Methods
 * ============================================================
 *
 * Because server.js mounts this router at:
 *
 *     /api/reply
 *
 * this catches unsupported methods such as:
 *
 *     GET
 *     PUT
 *     PATCH
 *     DELETE
 *
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