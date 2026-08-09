/**
 * ============================================================
 * ShadowDev Backend
 * Validator Utility
 * ============================================================
 *
 * Node.js compatible
 *
 * Responsibilities:
 *
 * - Validate strings
 * - Sanitize strings
 * - Escape HTML
 * - Validate user messages
 * - Validate services
 * - Validate ticket IDs
 * - Validate login credentials
 * - Validate send-message payload
 * - Validate reply payload
 * - Normalize pagination
 * - Build validation error objects
 *
 * ============================================================
 */

import {
    MESSAGE,
    SERVICES,
    PAGINATION,
    TICKET
} from "./constants.js";


/**
 * ============================================================
 * Check Empty Value
 * ============================================================
 */

export function isEmpty(
    value
) {

    return (

        value === undefined ||

        value === null ||

        String(value).trim() === ""

    );

}


/**
 * ============================================================
 * Check String
 * ============================================================
 */

export function isString(
    value
) {

    return typeof value === "string";

}


/**
 * ============================================================
 * Sanitize String
 * ============================================================
 *
 * - Converts value to string
 * - Removes leading/trailing whitespace
 * - Collapses repeated whitespace
 *
 * ============================================================
 */

export function sanitizeString(
    value = ""
) {

    return String(
        value
    )
        .trim()
        .replace(
            /\s+/g,
            " "
        );

}


/**
 * ============================================================
 * Escape HTML
 * ============================================================
 *
 * Basic HTML/XSS protection for user-controlled text.
 *
 * ============================================================
 */

export function escapeHTML(
    value = ""
) {

    return String(
        value
    )

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#39;"
        );

}


/**
 * ============================================================
 * Sanitize User Message
 * ============================================================
 */

export function sanitizeMessage(
    message = ""
) {

    const cleaned =
        sanitizeString(
            message
        );


    return escapeHTML(
        cleaned
    );

}


/**
 * ============================================================
 * Validate Minimum Length
 * ============================================================
 */

export function hasMinLength(
    value,
    min
) {

    if (
        typeof value !==
        "string"
    ) {

        return false;

    }


    return (
        value.length >=
        min
    );

}


/**
 * ============================================================
 * Validate Maximum Length
 * ============================================================
 */

export function hasMaxLength(
    value,
    max
) {

    if (
        typeof value !==
        "string"
    ) {

        return false;

    }


    return (
        value.length <=
        max
    );

}


/**
 * ============================================================
 * Allowed Service
 * ============================================================
 */

export function isAllowedService(
    service
) {

    return (
        typeof service ===
            "string" &&
        SERVICES.includes(
            service
        )
    );

}


/**
 * ============================================================
 * Validate Ticket Format
 * ============================================================
 *
 * Expected format:
 *
 *     PREFIX-XXXXXXXX
 *
 * The actual prefix and ID length come from constants.js.
 *
 * ============================================================
 */

export function isTicketFormat(
    ticketId
) {

    if (
        typeof ticketId !==
        "string"
    ) {

        return false;

    }


    const regex =
        new RegExp(

            `^${TICKET.PREFIX}-[A-Z2-9]{${TICKET.ID_LENGTH}}$`

        );


    return regex.test(
        ticketId
    );

}


/**
 * ============================================================
 * Pagination
 * ============================================================
 */

export function normalizePagination(
    page,
    limit
) {

    page =
        Number(
            page
        );


    limit =
        Number(
            limit
        );


    /**
     * --------------------------------------------------------
     * Invalid Page
     * --------------------------------------------------------
     */

    if (
        !Number.isFinite(page) ||
        page < 1
    ) {

        page =
            PAGINATION.DEFAULT_PAGE;

    }


    /**
     * --------------------------------------------------------
     * Invalid Limit
     * --------------------------------------------------------
     */

    if (
        !Number.isFinite(limit) ||
        limit < 1
    ) {

        limit =
            PAGINATION.DEFAULT_LIMIT;

    }


    /**
     * --------------------------------------------------------
     * Prevent Decimal Pagination Values
     * --------------------------------------------------------
     */

    page =
        Math.floor(
            page
        );


    limit =
        Math.floor(
            limit
        );


    /**
     * --------------------------------------------------------
     * Maximum Limit
     * --------------------------------------------------------
     */

    if (
        limit >
        PAGINATION.MAX_LIMIT
    ) {

        limit =
            PAGINATION.MAX_LIMIT;

    }


    return {

        page,

        limit,

        skip:
            (page - 1) *
            limit

    };

}


/**
 * ============================================================
 * Create Validation Error
 * ============================================================
 */

export function createValidationError(
    field,
    message
) {

    return {

        field,

        message

    };

}


/**
 * ============================================================
 * Collect Errors
 * ============================================================
 */

export function createErrorBag() {

    return [];

}


/**
 * ============================================================
 * Push Validation Error
 * ============================================================
 */

export function addError(
    errors,
    field,
    message
) {

    if (
        !Array.isArray(
            errors
        )
    ) {

        return;

    }


    errors.push(

        createValidationError(

            field,

            message

        )

    );

}


/**
 * ============================================================
 * Validate Service
 * ============================================================
 */

export function validateService(
    service
) {

    const errors =
        createErrorBag();


    /**
     * --------------------------------------------------------
     * Required
     * --------------------------------------------------------
     */

    if (
        isEmpty(
            service
        )
    ) {

        addError(

            errors,

            "service",

            "Service is required."

        );

    }

    /**
     * --------------------------------------------------------
     * Allowed Service
     * --------------------------------------------------------
     */

    else if (
        !isAllowedService(
            service
        )
    ) {

        addError(

            errors,

            "service",

            "Invalid service selected."

        );

    }


    return {

        valid:
            errors.length === 0,

        errors

    };

}


/**
 * ============================================================
 * Validate Message
 * ============================================================
 */

export function validateMessage(
    message
) {

    const errors =
        createErrorBag();


    /**
     * --------------------------------------------------------
     * Required
     * --------------------------------------------------------
     */

    if (
        isEmpty(
            message
        )
    ) {

        addError(

            errors,

            "message",

            "Message is required."

        );


        return {

            valid:
                false,

            errors,

            value:
                ""

        };

    }


    /**
     * --------------------------------------------------------
     * Sanitize
     * --------------------------------------------------------
     */

    const cleanedMessage =
        sanitizeMessage(
            message
        );


    /**
     * --------------------------------------------------------
     * Minimum Length
     * --------------------------------------------------------
     */

    if (
        !hasMinLength(

            cleanedMessage,

            MESSAGE.MIN_LENGTH

        )
    ) {

        addError(

            errors,

            "message",

            `Message must contain at least ${MESSAGE.MIN_LENGTH} characters.`

        );

    }


    /**
     * --------------------------------------------------------
     * Maximum Length
     * --------------------------------------------------------
     */

    if (
        !hasMaxLength(

            cleanedMessage,

            MESSAGE.MAX_LENGTH

        )
    ) {

        addError(

            errors,

            "message",

            `Message cannot exceed ${MESSAGE.MAX_LENGTH} characters.`

        );

    }


    return {

        valid:
            errors.length === 0,

        errors,

        value:
            cleanedMessage

    };

}


/**
 * ============================================================
 * Validate Ticket ID
 * ============================================================
 */

export function validateTicketId(
    ticketId
) {

    const errors =
        createErrorBag();


    /**
     * --------------------------------------------------------
     * Required
     * --------------------------------------------------------
     */

    if (
        isEmpty(
            ticketId
        )
    ) {

        addError(

            errors,

            "ticketId",

            "Ticket ID is required."

        );

    }

    /**
     * --------------------------------------------------------
     * Format
     * --------------------------------------------------------
     */

    else {

        const cleanTicketId =
            sanitizeString(
                ticketId
            );


        if (
            !isTicketFormat(
                cleanTicketId
            )
        ) {

            addError(

                errors,

                "ticketId",

                "Invalid Ticket ID."

            );

        }

    }


    return {

        valid:
            errors.length === 0,

        errors

    };

}


/**
 * ============================================================
 * Validate Login
 * ============================================================
 */

export function validateLogin(
    username,
    password
) {

    const errors =
        createErrorBag();


    /**
     * --------------------------------------------------------
     * Username
     * --------------------------------------------------------
     */

    if (
        isEmpty(
            username
        )
    ) {

        addError(

            errors,

            "username",

            "Username is required."

        );

    }


    /**
     * --------------------------------------------------------
     * Password
     * --------------------------------------------------------
     */

    if (
        isEmpty(
            password
        )
    ) {

        addError(

            errors,

            "password",

            "Password is required."

        );

    }


    return {

        valid:
            errors.length === 0,

        errors

    };

}


/**
 * ============================================================
 * Validate Send Message Payload
 * ============================================================
 */

export function validateSendMessagePayload(
    body = {}
) {

    /**
     * --------------------------------------------------------
     * Safety
     * --------------------------------------------------------
     */

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {

        body = {};

    }


    const serviceValidation =
        validateService(
            body.service
        );


    const messageValidation =
        validateMessage(
            body.message
        );


    const errors = [

        ...serviceValidation.errors,

        ...messageValidation.errors

    ];


    return {

        valid:
            errors.length === 0,

        errors,

        data: {

            service:
                sanitizeString(
                    body.service
                ),

            message:
                messageValidation.value

        }

    };

}


/**
 * ============================================================
 * Validate Reply Payload
 * ============================================================
 */

export function validateReplyPayload(
    body = {}
) {

    /**
     * --------------------------------------------------------
     * Safety
     * --------------------------------------------------------
     */

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {

        body = {};

    }


    /**
     * --------------------------------------------------------
     * Ticket ID
     * --------------------------------------------------------
     */

    const ticketValidation =
        validateTicketId(
            body.ticketId
        );


    /**
     * --------------------------------------------------------
     * Sender
     * --------------------------------------------------------
     */

    const senderErrors =
        createErrorBag();


    const sender =
        sanitizeString(
            body.sender
        );


    if (
        isEmpty(
            sender
        )
    ) {

        addError(

            senderErrors,

            "sender",

            "Sender is required."

        );

    }

    else if (

        sender !== "user" &&

        sender !== "admin"

    ) {

        addError(

            senderErrors,

            "sender",

            "Sender must be either user or admin."

        );

    }


    /**
     * --------------------------------------------------------
     * Message
     * --------------------------------------------------------
     */

    const messageValidation =
        validateMessage(
            body.message
        );


    /**
     * --------------------------------------------------------
     * Combine Errors
     * --------------------------------------------------------
     */

    const errors = [

        ...ticketValidation.errors,

        ...messageValidation.errors,

        ...senderErrors

    ];


    return {

        valid:
            errors.length === 0,

        errors,

        data: {

            ticketId:
                sanitizeString(
                    body.ticketId
                ),

            message:
                messageValidation.value,

            sender

        }

    };

}


/**
 * ============================================================
 * Default Export
 * ============================================================
 */

export default {

    isEmpty,

    isString,

    sanitizeString,

    escapeHTML,

    sanitizeMessage,

    hasMinLength,

    hasMaxLength,

    isAllowedService,

    isTicketFormat,

    normalizePagination,

    createValidationError,

    createErrorBag,

    addError,

    validateService,

    validateMessage,

    validateTicketId,

    validateLogin,

    validateReplyPayload,

    validateSendMessagePayload

};