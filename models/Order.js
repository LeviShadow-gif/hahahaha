/**
 * ============================================================
 * ShadowSMM — Order Model
 * ============================================================
 *
 * Module system : ES Modules
 * Database      : MongoDB Native Driver
 * Collection    : orders
 *
 * Features:
 * - MongoDB orders collection
 * - Database indexes
 * - ObjectId validation
 * - Order normalization
 * - Safe API serialization
 * - Expected Total calculation
 * - Processing / In Progress / Completed / Partial / Cancelled
 * - Cancellation request fields
 * - Permanent order history
 * - Referral discount fields (originalCharge, referralCode,
 *   referralDiscountPercent, referralDiscountAmount)
 *
 * ============================================================
 */

import { ObjectId } from "mongodb";

import {
    connectDB
} from "../config/db.js";

/* ============================================================
   CONSTANTS
============================================================ */

const COLLECTION_NAME = "orders";

const VALID_STATUSES = new Set([
    "processing",
    "in_progress",
    "completed",
    "partial",
    "cancelled"
]);

const MAX_QUANTITY = 100_000_000;
const MAX_COUNT = 1_000_000_000_000;
const MAX_CHARGE = 100_000_000;

/* ============================================================
   BASIC HELPERS
============================================================ */

/**
 * Convert a value into a trimmed, limited string.
 */
function normalizeText(value, maxLength = 200) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .trim()
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .slice(0, maxLength);
}

/**
 * Parse a non-negative whole number.
 *
 * Returns null when the value is invalid.
 */
function parseWholeNumber(
    value,
    min = 0,
    max = MAX_COUNT
) {
    if (
        value === null ||
        value === undefined ||
        (
            typeof value === "string" &&
            value.trim() === ""
        )
    ) {
        return null;
    }

    const number = Number(value);

    if (
        !Number.isSafeInteger(number) ||
        number < min ||
        number > max
    ) {
        return null;
    }

    return number;
}

/**
 * Parse a non-negative monetary amount.
 */
function parseCharge(value) {
    if (
        value === null ||
        value === undefined ||
        (
            typeof value === "string" &&
            value.trim() === ""
        )
    ) {
        return null;
    }

    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        amount > MAX_CHARGE
    ) {
        return null;
    }

    return Math.round(
        (amount + Number.EPSILON) * 100
    ) / 100;
}

/**
 * Validate MongoDB ObjectId.
 *
 * Accepts a valid ObjectId instance or a 24-character
 * hexadecimal string.
 */
export function parseObjectId(value) {
    if (value instanceof ObjectId) {
        return value;
    }

    if (
        typeof value !== "string" ||
        !/^[a-fA-F0-9]{24}$/.test(value)
    ) {
        return null;
    }

    return new ObjectId(value);
}

/**
 * Normalize order status.
 */
function normalizeStatus(value) {
    const status = normalizeText(value, 40)
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

    return VALID_STATUSES.has(status)
        ? status
        : "processing";
}

/**
 * Calculate Expected Total.
 *
 * Expected Total = Start Count + Delivered
 *
 * Both fields must be valid before calculation.
 */
export function calculateExpectedTotal(
    startCount,
    delivered
) {
    const start = parseWholeNumber(
        startCount,
        0,
        MAX_COUNT
    );

    const deliveredCount = parseWholeNumber(
        delivered,
        0,
        MAX_COUNT
    );

    if (
        start === null ||
        deliveredCount === null
    ) {
        return null;
    }

    const total = start + deliveredCount;

    if (!Number.isSafeInteger(total)) {
        return null;
    }

    return total;
}

/* ============================================================
   DATABASE COLLECTION
============================================================ */

/**
 * Get the orders collection from the existing database.
 *
 * Uses config/db.js and the existing "shadowdev" database.
 * Does not create a separate database connection.
 */
export async function getOrdersCollection() {
    const db = await connectDB();

    return db.collection(COLLECTION_NAME);
}

/* ============================================================
   INDEX INITIALIZATION
============================================================ */

/**
 * Create useful indexes for user order history and admin
 * request queries.
 *
 * Call this once during backend startup or initialization.
 */
export async function ensureOrderIndexes() {
    const orders = await getOrdersCollection();

    await Promise.all([
        orders.createIndex(
            {
                orderNumber: 1
            },
            {
                unique: true,
                name: "unique_order_number"
            }
        ),

        orders.createIndex(
            {
                userId: 1,
                createdAt: -1
            },
            {
                name: "user_order_history"
            }
        ),

        orders.createIndex(
            {
                active: 1,
                status: 1,
                createdAt: 1
            },
            {
                name: "active_admin_orders"
            }
        ),

        orders.createIndex(
            {
                active: 1,
                cancellationRequested: 1,
                createdAt: 1
            },
            {
                name: "pending_cancellation_requests"
            }
        )
    ]);

    return true;
}

/* ============================================================
   ORDER NORMALIZATION
============================================================ */

/**
 * Normalize a MongoDB order document.
 *
 * This helper is for consistent data formatting. It must not
 * be used as a substitute for validating client input.
 */
export function normalizeOrder(order) {
    if (!order || typeof order !== "object") {
        return null;
    }

    const userId = parseObjectId(order.userId);

    const quantity = parseWholeNumber(
        order.quantity,
        1,
        MAX_QUANTITY
    );

    const charge = parseCharge(order.charge);

    // Referral discount info (older orders do not have these fields).
    const originalCharge = parseCharge(order.originalCharge);

    const referralDiscountAmount = parseCharge(
        order.referralDiscountAmount
    );

    const referralDiscountPercentRaw = Number(
        order.referralDiscountPercent
    );

    const referralDiscountPercent =
        Number.isFinite(referralDiscountPercentRaw) &&
            referralDiscountPercentRaw > 0 &&
            referralDiscountPercentRaw <= 100
            ? referralDiscountPercentRaw
            : 0;

    const startCount = parseWholeNumber(
        order.startCount,
        0,
        MAX_COUNT
    );

    const delivered = parseWholeNumber(
        order.delivered,
        0,
        MAX_COUNT
    );

    const expectedTotal = calculateExpectedTotal(
        startCount,
        delivered
    );

    const status = normalizeStatus(order.status);

    return {
        ...order,

        userId,

        username: normalizeText(
            order.username,
            120
        ),

        orderNumber: normalizeText(
            order.orderNumber,
            100
        ),

        category: normalizeText(
            order.category,
            120
        ),

        serviceName: normalizeText(
            order.serviceName ?? order.service,
            240
        ),

        serviceId: normalizeText(
            order.serviceId,
            120
        ) || null,

        provider: normalizeText(
            order.provider,
            120
        ),

        link: normalizeText(
            order.link,
            2000
        ),

        quantity,

        charge,

        originalCharge,

        referralCode: normalizeText(
            order.referralCode,
            100
        ) || null,

        referralDiscountPercent,

        referralDiscountAmount,

        currency: normalizeText(
            order.currency || "INR",
            10
        ),

        startCount,

        delivered,

        expectedTotal,

        status,

        cancellationRequested:
            order.cancellationRequested === true,

        cancellationRequestedAt:
            order.cancellationRequestedAt instanceof Date
                ? order.cancellationRequestedAt
                : null,

        cancellationHandledAt:
            order.cancellationHandledAt instanceof Date
                ? order.cancellationHandledAt
                : null,

        active: order.active !== false,

        createdAt:
            order.createdAt instanceof Date
                ? order.createdAt
                : null,

        updatedAt:
            order.updatedAt instanceof Date
                ? order.updatedAt
                : null,

        approvedAt:
            order.approvedAt instanceof Date
                ? order.approvedAt
                : null,

        completedAt:
            order.completedAt instanceof Date
                ? order.completedAt
                : null,

        cancelledAt:
            order.cancelledAt instanceof Date
                ? order.cancelledAt
                : null,

        history: Array.isArray(order.history)
            ? order.history
            : []
    };
}

/* ============================================================
   SAFE API SERIALIZATION
============================================================ */

/**
 * Convert an order into a JSON-safe API response.
 *
 * MongoDB internal data and unexpected fields are not returned.
 */
export function serializeOrder(order) {
    if (!order || typeof order !== "object") {
        return null;
    }

    const normalized = normalizeOrder(order);

    if (!normalized) {
        return null;
    }

    return {
        id: normalized._id
            ? String(normalized._id)
            : null,

        _id: normalized._id
            ? String(normalized._id)
            : null,

        orderNumber: normalized.orderNumber,

        userId: normalized.userId
            ? String(normalized.userId)
            : null,

        username: normalized.username,

        category: normalized.category,

        serviceName: normalized.serviceName,

        service: normalized.serviceName,

        serviceId: normalized.serviceId,

        provider: normalized.provider,

        link: normalized.link,

        quantity: normalized.quantity,

        charge: normalized.charge,

        // Price before the referral discount (same as charge when no discount).
        originalCharge:
            normalized.originalCharge ?? normalized.charge,

        referralCode: normalized.referralCode,

        referralDiscountPercent:
            normalized.referralDiscountPercent,

        referralDiscountAmount:
            normalized.referralDiscountAmount ?? 0,

        currency: normalized.currency,

        startCount: normalized.startCount,

        delivered: normalized.delivered,

        deliveredQuantity: normalized.delivered,

        expectedTotal: normalized.expectedTotal,

        status: normalized.status,

        cancellationRequested:
            normalized.cancellationRequested,

        cancellationRequestedAt:
            normalized.cancellationRequestedAt,

        cancellationHandledAt:
            normalized.cancellationHandledAt,

        active: normalized.active,

        createdAt: normalized.createdAt,

        updatedAt: normalized.updatedAt,

        approvedAt: normalized.approvedAt,

        completedAt: normalized.completedAt,

        cancelledAt: normalized.cancelledAt,

        history: normalized.history.map((entry) => ({
            action: normalizeText(
                entry?.action,
                100
            ),

            by: normalizeText(
                entry?.by,
                120
            ),

            at: entry?.at instanceof Date
                ? entry.at
                : null
        }))
    };
}

/* ============================================================
   EXPORTS
============================================================ */

export {
    VALID_STATUSES,
    MAX_QUANTITY,
    MAX_COUNT,
    MAX_CHARGE,
    parseWholeNumber,
    parseCharge,
    normalizeStatus
};

export default {
    getOrdersCollection,
    ensureOrderIndexes,
    parseObjectId,
    calculateExpectedTotal,
    normalizeOrder,
    serializeOrder
};