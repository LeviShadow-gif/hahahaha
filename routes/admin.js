/**
 * ============================================================
 * ShadowDev Backend
 * Admin Route
 * ============================================================
 *
 * Node.js + Express
 *
 * Base endpoint:
 *
 *     /api/admin
 *
 * Supported GET actions:
 *
 *     ?action=dashboard
 *     ?action=list
 *     ?action=ticket&ticketId=SD-XXXXXX
 *
 * Supported POST actions:
 *
 *     ?action=archive
 *     ?action=unarchive
 *     ?action=close
 *     ?action=reopen
 *     ?action=markRead
 *     ?action=deleteMessage
 *
 * ------------------------------------------------------------
 *
 * IMPORTANT:
 *
 * Every admin endpoint requires authenticated admin access.
 *
 * ============================================================
 */

import express from "express";

import ENV from "../config/env.js";

import {
    getTicketsCollection
} from "../config/db.js";

import {
    requireAdmin
} from "../middleware/auth.js";

import {
    validateTicketId,
    normalizePagination,
    sanitizeString,
    isEmpty
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
 * Current Timestamp
 * ============================================================
 */

function now() {

    return new Date();

}


/**
 * ============================================================
 * Build Ticket Response
 * ============================================================
 *
 * Never expose MongoDB's internal _id.
 *
 * ============================================================
 */

function buildTicketResponse(
    ticket
) {

    return {

        ticketId:
            ticket.ticketId,

        requestId:
            ticket.requestId,

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
 * Parse Boolean Query Value
 * ============================================================
 */

function parseBoolean(
    value
) {

    if (
        value === true ||
        value === "true"
    ) {

        return true;

    }


    if (
        value === false ||
        value === "false"
    ) {

        return false;

    }


    return undefined;

}


/**
 * ============================================================
 * Dashboard Action
 * ============================================================
 */

async function handleDashboard(
    tickets,
    res
) {

    try {

        const [

            totalTickets,

            openTickets,

            closedTickets,

            archivedTickets,

            unreadAdminTickets,

            unreadUserTickets,

            latestTickets

        ] = await Promise.all([

            tickets.countDocuments(
                {},
                {
                    maxTimeMS: 5000
                }
            ),

            tickets.countDocuments(
                {
                    status:
                        "open"
                },
                {
                    maxTimeMS: 5000
                }
            ),

            tickets.countDocuments(
                {
                    status:
                        "closed"
                },
                {
                    maxTimeMS: 5000
                }
            ),

            tickets.countDocuments(
                {
                    archived:
                        true
                },
                {
                    maxTimeMS: 5000
                }
            ),

            tickets.countDocuments(
                {
                    unreadAdmin:
                        true
                },
                {
                    maxTimeMS: 5000
                }
            ),

            tickets.countDocuments(
                {
                    unreadUser:
                        true
                },
                {
                    maxTimeMS: 5000
                }
            ),

            tickets
                .find(
                    {},
                    {

                        projection: {

                            _id:
                                0

                        },

                        maxTimeMS:
                            5000

                    }
                )
                .sort({

                    lastActivity:
                        -1

                })
                .limit(10)
                .toArray()

        ]);


        return successResponse(

            res,

            {

                totalTickets,

                openTickets,

                closedTickets,

                archivedTickets,

                unreadAdminTickets,

                unreadUserTickets,

                latestTickets:
                    latestTickets.map(
                        buildTicketResponse
                    )

            },

            "Dashboard loaded successfully.",

            200

        );

    } catch (
        error
    ) {

        console.error(
            "[ADMIN] Dashboard failed:",
            error
        );

        return errorResponse(

            res,

            ENV.NODE_ENV === "development"
                ? (
                    error?.message ||
                    "Unable to load dashboard."
                )
                : "Unable to load dashboard.",

            503

        );

    }

}


/**
 * ============================================================
 * List Action
 * ============================================================
 */

async function handleList(
    tickets,
    query,
    res
) {

    try {

        /**
         * ----------------------------------------------------
         * Pagination
         * ----------------------------------------------------
         */

        const {

            page,

            limit,

            skip

        } = normalizePagination(

            query.page,

            query.limit

        );


        /**
         * ----------------------------------------------------
         * Base Filter
         * ----------------------------------------------------
         */

        const filter = {};


        /**
         * ----------------------------------------------------
         * Status Filter
         * ----------------------------------------------------
         */

        if (
            !isEmpty(
                query.status
            )
        ) {

            filter.status =
                sanitizeString(
                    query.status
                );

        }


        /**
         * ----------------------------------------------------
         * Archived Filter
         * ----------------------------------------------------
         */

        const archived =
            parseBoolean(
                query.archived
            );


        if (
            archived !== undefined
        ) {

            filter.archived =
                archived;

        }


        /**
         * ----------------------------------------------------
         * Search
         * ----------------------------------------------------
         */

        if (
            !isEmpty(
                query.search
            )
        ) {

            const search =
                sanitizeString(
                    query.search
                );


            /**
             * Escape regex special characters.
             */

            const escapedSearch =
                search.replace(

                    /[.*+?^${}()|[\]\\]/g,

                    "\\$&"

                );


            const regex =
                new RegExp(
                    escapedSearch,
                    "i"
                );


            filter.$or = [

                {

                    ticketId:
                        regex

                },

                {

                    service:
                        regex

                }

            ];

        }


        /**
         * ----------------------------------------------------
         * Database Operations
         * ----------------------------------------------------
         */

        const [

            items,

            total

        ] = await Promise.all([

            tickets
                .find(

                    filter,

                    {

                        projection: {

                            _id:
                                0

                        },

                        maxTimeMS:
                            5000

                    }

                )
                .sort({

                    lastActivity:
                        -1

                })
                .skip(skip)
                .limit(limit)
                .toArray(),

            tickets.countDocuments(

                filter,

                {

                    maxTimeMS:
                        5000

                }

            )

        ]);


        /**
         * ----------------------------------------------------
         * Response
         * ----------------------------------------------------
         */

        return successResponse(

            res,

            {

                items:
                    items.map(
                        buildTicketResponse
                    ),

                page,

                limit,

                total,

                pages:
                    Math.ceil(
                        total / limit
                    ) || 1

            },

            "Tickets loaded successfully.",

            200

        );

    } catch (
        error
    ) {

        console.error(
            "[ADMIN] List failed:",
            error
        );


        return errorResponse(

            res,

            ENV.NODE_ENV === "development"
                ? (
                    error?.message ||
                    "Unable to load tickets."
                )
                : "Unable to load tickets.",

            503

        );

    }

}


/**
 * ============================================================
 * Ticket Action
 * ============================================================
 */

async function handleTicket(
    tickets,
    query,
    res
) {

    /**
     * --------------------------------------------------------
     * Validate Ticket ID
     * --------------------------------------------------------
     */

    const validation =
        validateTicketId(
            query.ticketId
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
     * Sanitize Ticket ID
     * --------------------------------------------------------
     */

    const ticketId =
        sanitizeString(
            query.ticketId
        );


    try {

        /**
         * ----------------------------------------------------
         * Find Ticket
         * ----------------------------------------------------
         */

        const ticket =
            await tickets.findOne(

                {

                    ticketId

                },

                {

                    projection: {

                        _id:
                            0

                    },

                    maxTimeMS:
                        5000

                }

            );


        if (
            !ticket
        ) {

            return notFoundResponse(

                res,

                "Ticket not found."

            );

        }


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

        console.error(
            "[ADMIN] Ticket lookup failed:",
            error
        );


        return errorResponse(

            res,

            ENV.NODE_ENV === "development"
                ? (
                    error?.message ||
                    "Unable to load ticket."
                )
                : "Unable to load ticket.",

            503

        );

    }

}


/**
 * ============================================================
 * Update Ticket Helper
 * ============================================================
 *
 * One timestamp is generated and reused.
 *
 * This avoids slightly different updatedAt and lastActivity
 * values for the same operation.
 *
 * ============================================================
 */

async function updateTicket(
    tickets,
    ticketId,
    set
) {

    const timestamp =
        now();


    const result =
        await tickets.updateOne(

            {

                ticketId

            },

            {

                $set: {

                    ...set,

                    updatedAt:
                        timestamp,

                    lastActivity:
                        timestamp

                }

            },

            {

                maxTimeMS:
                    5000

            }

        );


    return {

        result,

        timestamp

    };

}


/**
 * ============================================================
 * Simple Status Actions
 * ============================================================
 *
 * archive
 * unarchive
 * close
 * reopen
 * markRead
 *
 * ============================================================
 */

async function handleSimpleAction(
    tickets,
    body,
    set,
    successMessage,
    res
) {

    /**
     * --------------------------------------------------------
     * Validate Ticket ID
     * --------------------------------------------------------
     */

    const validation =
        validateTicketId(
            body.ticketId
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
     * Sanitize Ticket ID
     * --------------------------------------------------------
     */

    const ticketId =
        sanitizeString(
            body.ticketId
        );


    try {

        /**
         * ----------------------------------------------------
         * Verify Ticket Exists
         * ----------------------------------------------------
         */

        const ticket =
            await tickets.findOne(

                {

                    ticketId

                },

                {

                    projection: {

                        _id:
                            1

                    },

                    maxTimeMS:
                        5000

                }

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
         * ----------------------------------------------------
         * Update
         * ----------------------------------------------------
         */

        const {

            result,

            timestamp

        } = await updateTicket(

            tickets,

            ticketId,

            set

        );


        /**
         * ----------------------------------------------------
         * Verify Update
         * ----------------------------------------------------
         */

        if (
            !result ||
            result.matchedCount !== 1 ||
            result.modifiedCount !== 1
        ) {

            throw new Error(
                "Unable to update ticket."
            );

        }


        /**
         * ----------------------------------------------------
         * Success
         * ----------------------------------------------------
         */

        return successResponse(

            res,

            {

                ticketId,

                updatedAt:
                    timestamp

            },

            successMessage,

            200

        );

    } catch (
        error
    ) {

        console.error(
            "[ADMIN] Ticket update failed:",
            error
        );


        return errorResponse(

            res,

            ENV.NODE_ENV === "development"
                ? (
                    error?.message ||
                    "Unable to update ticket."
                )
                : "Unable to update ticket.",

            503

        );

    }

}


/**
 * ============================================================
 * Delete Message Action
 * ============================================================
 *
 * IMPORTANT:
 *
 * Message is soft-deleted.
 *
 * The message itself is retained in MongoDB but:
 *
 *     deleted = true
 *     message = ""
 *     edited = false
 *
 * This preserves conversation structure/history.
 *
 * ============================================================
 */

async function handleDeleteMessage(
    tickets,
    body,
    res
) {

    /**
     * --------------------------------------------------------
     * Validate Ticket ID
     * --------------------------------------------------------
     */

    const validation =
        validateTicketId(
            body.ticketId
        );


    const errors = [

        ...(
            validation.errors ||
            []
        )

    ];


    /**
     * --------------------------------------------------------
     * Validate Message ID
     * --------------------------------------------------------
     */

    if (
        isEmpty(
            body.messageId
        )
    ) {

        errors.push({

            field:
                "messageId",

            message:
                "Message ID is required."

        });

    }


    if (
        errors.length > 0
    ) {

        return validationError(
            res,
            errors
        );

    }


    /**
     * --------------------------------------------------------
     * Sanitize Values
     * --------------------------------------------------------
     */

    const ticketId =
        sanitizeString(
            body.ticketId
        );


    const messageId =
        sanitizeString(
            body.messageId
        );


    try {

        /**
         * ----------------------------------------------------
         * Verify Ticket
         * ----------------------------------------------------
         */

        const ticket =
            await tickets.findOne(

                {

                    ticketId

                },

                {

                    projection: {

                        _id:
                            1,

                        messages: 1

                    },

                    maxTimeMS:
                        5000

                }

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
         * ----------------------------------------------------
         * Verify Message
         * ----------------------------------------------------
         */

        const messageExists = (

            Array.isArray(
                ticket.messages
            )
                ? ticket.messages
                : []

        ).some(

            (
                msg
            ) => {

                return (
                    msg &&
                    msg.id === messageId
                );

            }

        );


        if (
            !messageExists
        ) {

            return notFoundResponse(

                res,

                "Message not found."

            );

        }


        /**
         * ----------------------------------------------------
         * One Timestamp
         * ----------------------------------------------------
         */

        const timestamp =
            now();


        /**
         * ----------------------------------------------------
         * Soft Delete Message
         * ----------------------------------------------------
         */

        const result =
            await tickets.updateOne(

                {

                    ticketId

                },

                {

                    $set: {

                        "messages.$[msg].deleted":
                            true,

                        "messages.$[msg].message":
                            "",

                        "messages.$[msg].edited":
                            false,

                        updatedAt:
                            timestamp,

                        lastActivity:
                            timestamp

                    }

                },

                {

                    arrayFilters: [

                        {

                            "msg.id":
                                messageId

                        }

                    ],

                    maxTimeMS:
                        5000

                }

            );


        /**
         * ----------------------------------------------------
         * Verify Update
         * ----------------------------------------------------
         */

        if (
            !result ||
            result.matchedCount !== 1 ||
            result.modifiedCount !== 1
        ) {

            throw new Error(
                "Unable to delete message."
            );

        }


        /**
         * ----------------------------------------------------
         * Success
         * ----------------------------------------------------
         */

        return successResponse(

            res,

            {

                ticketId,

                messageId,

                updatedAt:
                    timestamp

            },

            "Message deleted successfully.",

            200

        );

    } catch (
        error
    ) {

        console.error(
            "[ADMIN] Delete message failed:",
            error
        );


        return errorResponse(

            res,

            ENV.NODE_ENV === "development"
                ? (
                    error?.message ||
                    "Unable to delete message."
                )
                : "Unable to delete message.",

            503

        );

    }

}


/**
 * ============================================================
 * Development Request Logger
 * ============================================================
 */

function logAdminAction(
    req,
    action
) {

    if (
        ENV.NODE_ENV !==
        "development"
    ) {

        return;

    }


    const username =
        req.user?.username ||
        "admin";


    console.log(

        `[ADMIN] ${username} -> ${action}`

    );

}


/**
 * ============================================================
 * ADMIN AUTHENTICATION
 * ============================================================
 *
 * Every route below this middleware requires an authenticated
 * admin.
 *
 * requireAdmin must be the Express-compatible middleware:
 *
 *     (req, res, next)
 *
 * ============================================================
 */

router.use(
    requireAdmin
);


/**
 * ============================================================
 * GET /api/admin
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
             * ------------------------------------------------
             * Action
             * ------------------------------------------------
             */

            const action =
                typeof req.query.action ===
                    "string" &&
                req.query.action.trim()
                    ? req.query.action
                        .trim()
                        .toLowerCase()
                    : "dashboard";


            /**
             * ------------------------------------------------
             * Mongo Collection
             * ------------------------------------------------
             */

            const tickets =
                await getTicketsCollection();


            /**
             * ------------------------------------------------
             * Dashboard
             * ------------------------------------------------
             */

            if (
                action ===
                "dashboard"
            ) {

                logAdminAction(
                    req,
                    action
                );


                return await handleDashboard(

                    tickets,

                    res

                );

            }


            /**
             * ------------------------------------------------
             * List
             * ------------------------------------------------
             */

            if (
                action ===
                "list"
            ) {

                logAdminAction(
                    req,
                    action
                );


                return await handleList(

                    tickets,

                    req.query,

                    res

                );

            }


            /**
             * ------------------------------------------------
             * Single Ticket
             * ------------------------------------------------
             */

            if (
                action ===
                "ticket"
            ) {

                logAdminAction(
                    req,
                    action
                );


                return await handleTicket(

                    tickets,

                    req.query,

                    res

                );

            }


            /**
             * ------------------------------------------------
             * Invalid Action
             * ------------------------------------------------
             */

            return errorResponse(

                res,

                "Invalid admin action.",

                400

            );

        } catch (
            error
        ) {

            console.error(
                "[ADMIN] GET error:",
                error
            );


            return errorResponse(

                res,

                ENV.NODE_ENV === "development"
                    ? (
                        error?.message ||
                        "Internal Server Error"
                    )
                    : "Internal Server Error",

                500

            );

        }

    }
);


/**
 * ============================================================
 * POST /api/admin
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
             * Action
             * ------------------------------------------------
             */

            const action =
                typeof req.query.action ===
                    "string" &&
                req.query.action.trim()
                    ? req.query.action
                        .trim()
                        .toLowerCase()
                    : (
                        typeof body.action ===
                            "string"
                            ? body.action
                                .trim()
                                .toLowerCase()
                            : ""
                    );


            /**
             * ------------------------------------------------
             * Mongo Collection
             * ------------------------------------------------
             */

            const tickets =
                await getTicketsCollection();


            /**
             * =================================================
             * ARCHIVE
             * =================================================
             */

            if (
                action ===
                "archive"
            ) {

                logAdminAction(
                    req,
                    action
                );


                return await handleSimpleAction(

                    tickets,

                    body,

                    {

                        archived:
                            true

                    },

                    "Ticket archived successfully.",

                    res

                );

            }


            /**
             * =================================================
             * UNARCHIVE
             * =================================================
             */

            if (
                action ===
                "unarchive"
            ) {

                logAdminAction(
                    req,
                    action
                );


                return await handleSimpleAction(

                    tickets,

                    body,

                    {

                        archived:
                            false

                    },

                    "Ticket unarchived successfully.",

                    res

                );

            }


            /**
             * =================================================
             * CLOSE
             * =================================================
             */

            if (
                action ===
                "close"
            ) {

                logAdminAction(
                    req,
                    action
                );


                return await handleSimpleAction(

                    tickets,

                    body,

                    {

                        status:
                            "closed"

                    },

                    "Ticket closed successfully.",

                    res

                );

            }


            /**
             * =================================================
             * REOPEN
             * =================================================
             */

            if (
                action ===
                "reopen"
            ) {

                logAdminAction(
                    req,
                    action
                );


                return await handleSimpleAction(

                    tickets,

                    body,

                    {

                        status:
                            "open"

                    },

                    "Ticket reopened successfully.",

                    res

                );

            }


            /**
             * =================================================
             * MARK READ
             * =================================================
             */

            if (
                action ===
                "markread" ||
                action ===
                "markRead"
            ) {

                logAdminAction(
                    req,
                    "markRead"
                );


                return await handleSimpleAction(

                    tickets,

                    body,

                    {

                        unreadAdmin:
                            false

                    },

                    "Ticket marked as read.",

                    res

                );

            }


            /**
             * =================================================
             * DELETE MESSAGE
             * =================================================
             */

            if (
                action ===
                "deletemessage" ||
                action ===
                "deleteMessage"
            ) {

                logAdminAction(
                    req,
                    "deleteMessage"
                );


                return await handleDeleteMessage(

                    tickets,

                    body,

                    res

                );

            }


            /**
             * ------------------------------------------------
             * Invalid Action
             * ------------------------------------------------
             */

            return errorResponse(

                res,

                "Invalid admin action.",

                400

            );

        } catch (
            error
        ) {

            console.error(
                "[ADMIN] POST error:",
                error
            );


            return errorResponse(

                res,

                ENV.NODE_ENV === "development"
                    ? (
                        error?.message ||
                        "Internal Server Error"
                    )
                    : "Internal Server Error",

                500

            );

        }

    }
);


/**
 * ============================================================
 * Method Not Allowed
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