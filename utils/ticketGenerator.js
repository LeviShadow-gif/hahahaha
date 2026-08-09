/**
 * ============================================================
 * ShadowDev Backend
 * Ticket Generator Utility
 * ============================================================
 *
 * Node.js + MongoDB
 *
 * Responsibilities:
 *
 * - Generate unique Ticket IDs
 * - Generate Message IDs
 * - Validate Ticket IDs
 * - Validate Message IDs
 *
 * ============================================================
 */

import crypto from "node:crypto";

import {
    getTicketsCollection
} from "../config/db.js";

import {
    TICKET
} from "./constants.js";


/**
 * ============================================================
 * Ticket ID Character Set
 * ============================================================
 *
 * Confusing characters are intentionally removed:
 *
 *     O
 *     0
 *     I
 *     1
 *
 * This makes Ticket IDs easier to read and communicate.
 *
 * ============================================================
 */

const CHARSET =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


/**
 * ============================================================
 * Message ID Configuration
 * ============================================================
 */

const MESSAGE_PREFIX =
    "MSG";


const MESSAGE_ID_LENGTH =
    8;


/**
 * ============================================================
 * Ticket Generation Configuration
 * ============================================================
 */

const MAX_TICKET_GENERATION_ATTEMPTS =
    10;


/**
 * ============================================================
 * Generate Cryptographically Random String
 * ============================================================
 */

function generateRandomString(
    length
) {

    if (
        !Number.isInteger(length) ||
        length <= 0
    ) {

        throw new TypeError(
            "Random string length must be a positive integer."
        );

    }


    let result = "";


    /**
     * --------------------------------------------------------
     * Generate enough random bytes.
     * --------------------------------------------------------
     *
     * A little extra entropy is generated because modulo
     * selection can otherwise slightly bias the final
     * character distribution.
     *
     * --------------------------------------------------------
     */

    const bytes =
        crypto.randomBytes(
            length
        );


    for (
        let i = 0;
        i < length;
        i++
    ) {

        result +=
            CHARSET[
                bytes[i] %
                CHARSET.length
            ];

    }


    return result;

}


/**
 * ============================================================
 * Build Ticket ID
 * ============================================================
 *
 * Example:
 *
 *     SD-X7K9QP
 *
 * ============================================================
 */

function buildTicketId() {

    return (

        `${TICKET.PREFIX}-` +

        generateRandomString(
            TICKET.ID_LENGTH
        )

    );

}


/**
 * ============================================================
 * Generate Message ID
 * ============================================================
 *
 * Example:
 *
 *     MSG-X7K9QPA8
 *
 * ============================================================
 */

export function generateMessageId() {

    return (

        `${MESSAGE_PREFIX}-` +

        generateRandomString(
            MESSAGE_ID_LENGTH
        )

    );

}


/**
 * ============================================================
 * Check Whether Ticket Already Exists
 * ============================================================
 */

async function ticketExists(
    tickets,
    ticketId
) {

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

                /**
                 * --------------------------------------------
                 * Keep collision lookup short.
                 * --------------------------------------------
                 */

                maxTimeMS:
                    3000

            }

        );


    return Boolean(
        ticket
    );

}


/**
 * ============================================================
 * Generate Unique Ticket ID
 * ============================================================
 *
 * The caller can provide a collection.
 *
 * If no collection is provided, the function obtains the
 * tickets collection from the database module.
 *
 * ============================================================
 */

export async function generateTicketId(
    tickets = null
) {

    /**
     * --------------------------------------------------------
     * Get Collection
     * --------------------------------------------------------
     */

    const collection =
        tickets ||
        await getTicketsCollection();


    /**
     * --------------------------------------------------------
     * Generate Until Unique
     * --------------------------------------------------------
     */

    for (
        let attempt = 1;
        attempt <=
        MAX_TICKET_GENERATION_ATTEMPTS;
        attempt++
    ) {

        const ticketId =
            buildTicketId();


        const exists =
            await ticketExists(

                collection,

                ticketId

            );


        if (
            !exists
        ) {

            return ticketId;

        }

    }


    /**
     * --------------------------------------------------------
     * Failed
     * --------------------------------------------------------
     */

    throw new Error(
        "Unable to generate unique Ticket ID."
    );

}


/**
 * ============================================================
 * Validate Ticket ID
 * ============================================================
 *
 * Example:
 *
 *     SD-X8K2QP
 *
 * ============================================================
 */

export function isValidTicketId(
    ticketId
) {

    if (
        typeof ticketId !==
        "string"
    ) {

        return false;

    }


    const pattern =
        new RegExp(

            `^${TICKET.PREFIX}-[A-Z2-9]{${TICKET.ID_LENGTH}}$`

        );


    return pattern.test(
        ticketId
    );

}


/**
 * ============================================================
 * Validate Message ID
 * ============================================================
 *
 * Example:
 *
 *     MSG-X7K9QPA8
 *
 * ============================================================
 */

export function isValidMessageId(
    messageId
) {

    if (
        typeof messageId !==
        "string"
    ) {

        return false;

    }


    const pattern =
        new RegExp(

            `^${MESSAGE_PREFIX}-[A-Z2-9]{${MESSAGE_ID_LENGTH}}$`

        );


    return pattern.test(
        messageId
    );

}


/**
 * ============================================================
 * Default Export
 * ============================================================
 */

export default {

    generateTicketId,

    generateMessageId,

    isValidTicketId,

    isValidMessageId

};