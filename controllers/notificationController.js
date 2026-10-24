
/**
 * ============================================================
 * ShadowSMM - Notification Controller
 * ============================================================
 *
 * Features:
 * - Get notifications for the authenticated user
 * - Delete one of the authenticated user's notifications
 * - Clear all notifications for the authenticated user
 * - Get notifications for the admin panel
 * - Send a notification to all users
 * - Send a notification to one specific user
 * - Delete a notification from the admin panel
 *
 * Database:
 * - MongoDB native driver
 * - Existing "notifications" collection
 * - Existing "users" collection
 *
 * Important:
 * - Does NOT modify fundsController.js
 * - Does NOT generate duplicate deposit notifications
 * - Does NOT expose other users' notifications
 * - Admin routes must be protected using requireAdmin
 * ============================================================
 */

import { ObjectId } from "mongodb";

import { connectDB } from "../config/db.js";

/**
 * ============================================================
 * Constants
 * ============================================================
 */

const MAX_TITLE_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

/**
 * ============================================================
 * Response Helpers
 * ============================================================
 */

function sendSuccess(res, message, data = {}, status = 200) {
    return res.status(status).json({
        success: true,
        message,
        ...data,
        timestamp: new Date().toISOString()
    });
}

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        message,
        timestamp: new Date().toISOString()
    });
}

/**
 * ============================================================
 * Text Helpers
 * ============================================================
 */

function normalizeText(value, maxLength) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .trim()
        .slice(0, maxLength);
}

function normalizeEmail(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().toLowerCase();
}

/**
 * ============================================================
 * Authenticated User ID
 * ============================================================
 *
 * Existing JWT payloads may identify a user through:
 * - userId
 * - id
 * - sub
 *
 * Funds Controller stores user document IDs as strings.
 * This controller uses the same string representation.
 * ============================================================
 */

function getAuthenticatedUserId(req) {
    const user = req.user;

    if (!user || typeof user !== "object") {
        return null;
    }

    const candidates = [
        user.userId,
        user.id,
        user.sub
    ];

    for (const candidate of candidates) {
        if (
            typeof candidate === "string" &&
            candidate.trim()
        ) {
            return candidate.trim();
        }

        if (
            candidate &&
            typeof candidate === "object" &&
            typeof candidate.toString === "function"
        ) {
            const value = candidate.toString();

            if (value && value !== "[object Object]") {
                return value;
            }
        }
    }

    return null;
}

/**
 * ============================================================
 * MongoDB Helpers
 * ============================================================
 */

async function getNotificationCollections() {
    const db = await connectDB();

    return {
        db,
        notifications: db.collection("notifications"),
        users: db.collection("users")
    };
}

/**
 * ============================================================
 * ObjectId Helpers
 * ============================================================
 */

function parseObjectId(value) {
    if (
        typeof value !== "string" ||
        !ObjectId.isValid(value)
    ) {
        return null;
    }

    try {
        const objectId = new ObjectId(value);

        // Reject malformed ObjectId strings that happen to pass
        // a permissive validation check.
        if (objectId.toHexString() !== value.toLowerCase()) {
            return null;
        }

        return objectId;
    } catch {
        return null;
    }
}

/**
 * ============================================================
 * User ID Matching
 * ============================================================
 *
 * Existing deposit notifications use string userId values.
 * Some older documents may contain an ObjectId instead.
 *
 * Match both representations without changing existing data.
 * ============================================================
 */

function buildUserIdFilter(userId) {
    const alternatives = [
        { userId }
    ];

    const objectId = parseObjectId(userId);

    if (objectId) {
        alternatives.push({
            userId: objectId
        });
    }

    return alternatives.length === 1
        ? alternatives[0]
        : { $or: alternatives };
}

/**
 * ============================================================
 * Notification Serialization
 * ============================================================
 *
 * Frontend-friendly shape:
 * - id
 * - userId
 * - title
 * - message
 * - body
 * - type
 * - metadata
 * - read
 * - createdAt
 * ============================================================
 */

function toPublicNotification(notification) {
    if (!notification) {
        return null;
    }

    const message =
        typeof notification.message === "string"
            ? notification.message
            : typeof notification.body === "string"
                ? notification.body
                : "";

    return {
        id: notification._id
            ? String(notification._id)
            : "",

        _id: notification._id
            ? String(notification._id)
            : "",

        userId: notification.userId !== undefined &&
                notification.userId !== null
            ? String(notification.userId)
            : null,

        username: notification.username || null,

        title: typeof notification.title === "string"
            ? notification.title
            : "Notification",

        message,

        body: message,

        type: typeof notification.type === "string"
            ? notification.type
            : "admin",

        metadata:
            notification.metadata &&
            typeof notification.metadata === "object"
                ? notification.metadata
                : {},

        read: notification.read === true,

        createdAt: notification.createdAt || null
    };
}

/**
 * ============================================================
 * Pagination Helpers
 * ============================================================
 */

function getPageSize(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_PAGE_SIZE;
    }

    return Math.min(parsed, MAX_PAGE_SIZE);
}

function getSkip(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return Math.min(parsed, 1000000);
}

/**
 * ============================================================
 * GET /api/notification
 * ============================================================
 *
 * Returns notifications belonging only to the authenticated user.
 *
 * Expected authentication:
 * - authenticate middleware
 *
 * Optional query parameters:
 * - limit
 * - skip
 * ============================================================
 */

export async function getUserNotifications(req, res) {
    try {
        const userId = getAuthenticatedUserId(req);

        if (!userId) {
            return sendError(
                res,
                401,
                "A valid user authentication token is required."
            );
        }

        const {
            notifications
        } = await getNotificationCollections();

        const limit = getPageSize(req.query?.limit);
        const skip = getSkip(req.query?.skip);

        const filter = buildUserIdFilter(userId);

        const [items, total] = await Promise.all([
            notifications
                .find(filter)
                .sort({
                    createdAt: -1,
                    _id: -1
                })
                .skip(skip)
                .limit(limit)
                .toArray(),

            notifications.countDocuments(filter)
        ]);

        const unreadCount = await notifications.countDocuments({
            $and: [
                filter,
                {
                    read: {
                        $ne: true
                    }
                }
            ]
        });

        return sendSuccess(
            res,
            "Notifications fetched successfully.",
            {
                notifications: items.map(toPublicNotification),
                items: items.map(toPublicNotification),
                total,
                unreadCount,
                limit,
                skip
            }
        );
    } catch (error) {
        console.error(
            "[NOTIFICATIONS] Get user notifications error:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to fetch notifications."
        );
    }
}

/**
 * ============================================================
 * DELETE /api/notification/:id
 * ============================================================
 *
 * Deletes only a notification owned by the authenticated user.
 * A user cannot delete another user's notification.
 * ============================================================
 */

export async function deleteUserNotification(req, res) {
    try {
        const userId = getAuthenticatedUserId(req);

        if (!userId) {
            return sendError(
                res,
                401,
                "A valid user authentication token is required."
            );
        }

        const notificationId = parseObjectId(
            req.params?.id
        );

        if (!notificationId) {
            return sendError(
                res,
                400,
                "Invalid notification ID."
            );
        }

        const {
            notifications
        } = await getNotificationCollections();

        const ownershipFilter = buildUserIdFilter(userId);

        const result = await notifications.deleteOne({
            _id: notificationId,
            ...ownershipFilter
        });

        if (result.deletedCount !== 1) {
            return sendError(
                res,
                404,
                "Notification not found."
            );
        }

        return sendSuccess(
            res,
            "Notification deleted successfully."
        );
    } catch (error) {
        console.error(
            "[NOTIFICATIONS] Delete user notification error:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to delete notification."
        );
    }
}

/**
 * ============================================================
 * DELETE /api/notification
 * ============================================================
 *
 * Clears notifications belonging only to the authenticated user.
 * ============================================================
 */

export async function clearUserNotifications(req, res) {
    try {
        const userId = getAuthenticatedUserId(req);

        if (!userId) {
            return sendError(
                res,
                401,
                "A valid user authentication token is required."
            );
        }

        const {
            notifications
        } = await getNotificationCollections();

        const result = await notifications.deleteMany(
            buildUserIdFilter(userId)
        );

        return sendSuccess(
            res,
            "Notifications cleared successfully.",
            {
                deletedCount: result.deletedCount || 0
            }
        );
    } catch (error) {
        console.error(
            "[NOTIFICATIONS] Clear user notifications error:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to clear notifications."
        );
    }
}

/**
 * ============================================================
 * GET /api/admin/notifications
 * ============================================================
 *
 * Admin-only endpoint.
 *
 * Returns notifications from the shared collection.
 * Optional query parameters:
 * - limit
 * - skip
 * - userId
 * ============================================================
 */

export async function getAdminNotifications(req, res) {
    try {
        const {
            notifications
        } = await getNotificationCollections();

        const limit = getPageSize(req.query?.limit);
        const skip = getSkip(req.query?.skip);

        const filter = {};

        if (
            typeof req.query?.userId === "string" &&
            req.query.userId.trim()
        ) {
            Object.assign(
                filter,
                buildUserIdFilter(req.query.userId.trim())
            );
        }

        const [items, total] = await Promise.all([
            notifications
                .find(filter)
                .sort({
                    createdAt: -1,
                    _id: -1
                })
                .skip(skip)
                .limit(limit)
                .toArray(),

            notifications.countDocuments(filter)
        ]);

        return sendSuccess(
            res,
            "Admin notifications fetched successfully.",
            {
                notifications: items.map(toPublicNotification),
                items: items.map(toPublicNotification),
                total,
                limit,
                skip
            }
        );
    } catch (error) {
        console.error(
            "[NOTIFICATIONS] Get admin notifications error:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to fetch admin notifications."
        );
    }
}

/**
 * ============================================================
 * POST /api/admin/notifications
 * ============================================================
 *
 * Admin-only endpoint.
 *
 * Send to everyone:
 * {
 *   "title": "Maintenance Notice",
 *   "body": "The website will be under maintenance.",
 *   "audience": "all"
 * }
 *
 * Send to one user:
 * {
 *   "title": "Account Notice",
 *   "body": "Please check your account.",
 *   "audience": "user",
 *   "user": "username, email, or user ID"
 * }
 *
 * One notification is inserted per recipient.
 * ============================================================
 */

export async function createAdminNotification(req, res) {
    try {
        const title = normalizeText(
            req.body?.title,
            MAX_TITLE_LENGTH
        );

        const body = normalizeText(
            req.body?.body ?? req.body?.message,
            MAX_MESSAGE_LENGTH
        );

        const audience = normalizeText(
            req.body?.audience,
            20
        ).toLowerCase();

        if (!title) {
            return sendError(
                res,
                400,
                "Notification title is required."
            );
        }

        if (!body) {
            return sendError(
                res,
                400,
                "Notification message is required."
            );
        }

        if (!["all", "user"].includes(audience)) {
            return sendError(
                res,
                400,
                "Audience must be either 'all' or 'user'."
            );
        }

        const {
            notifications,
            users
        } = await getNotificationCollections();

        const now = new Date();

        /**
         * ----------------------------------------------------
         * Send to all users
         * ----------------------------------------------------
         */

        if (audience === "all") {
            const cursor = users.find(
                {},
                {
                    projection: {
                        _id: 1,
                        username: 1
                    }
                }
            );

            const operations = [];

            for await (const user of cursor) {
                if (
                    user._id === undefined ||
                    user._id === null
                ) {
                    continue;
                }

                operations.push({
                    insertOne: {
                        document: {
                            userId: String(user._id),
                            username: user.username || "",
                            title,
                            message: body,
                            type: "admin",
                            metadata: {
                                audience: "all"
                            },
                            read: false,
                            createdAt: now
                        }
                    }
                });
            }

            if (operations.length === 0) {
                return sendSuccess(
                    res,
                    "No users were found to receive this notification.",
                    {
                        audience: "all",
                        recipientCount: 0
                    }
                );
            }

            let recipientCount = 0;

            // Use batches to avoid oversized MongoDB bulk requests.
            const BATCH_SIZE = 500;

            for (
                let index = 0;
                index < operations.length;
                index += BATCH_SIZE
            ) {
                const batch = operations.slice(
                    index,
                    index + BATCH_SIZE
                );

                const result = await notifications.bulkWrite(
                    batch,
                    {
                        ordered: false
                    }
                );

                recipientCount += result.insertedCount || 0;
            }

            return sendSuccess(
                res,
                "Notification sent to all users successfully.",
                {
                    audience: "all",
                    recipientCount
                },
                201
            );
        }

        /**
         * ----------------------------------------------------
         * Send to one specific user
         * ----------------------------------------------------
         *
         * Accepts username, email, or user ID.
         * ----------------------------------------------------
         */

        const target = normalizeText(
            req.body?.user ?? req.body?.userId,
            320
        );

        if (!target) {
            return sendError(
                res,
                400,
                "Enter the username, email, or ID of the recipient."
            );
        }

        let user = null;

        // First try an exact string ID match.
        user = await users.findOne({
            _id: target
        });

        // Also support MongoDB ObjectId user IDs.
        if (!user) {
            const objectId = parseObjectId(target);

            if (objectId) {
                user = await users.findOne({
                    _id: objectId
                });
            }
        }

        // Then try an exact username match.
        if (!user) {
            user = await users.findOne({
                username: target
            });
        }

        // Then try case-insensitive username lookup using the
        // normalized username field when available.
        if (!user) {
            user = await users.findOne({
                usernameLower: target.toLowerCase()
            });
        }

        // Finally, try email lookup.
        if (!user && target.includes("@")) {
            user = await users.findOne({
                email: normalizeEmail(target)
            });
        }

        if (!user) {
            return sendError(
                res,
                404,
                "Recipient user was not found."
            );
        }

        const result = await notifications.insertOne({
            userId: String(user._id),
            username: user.username || "",
            title,
            message: body,
            type: "admin",
            metadata: {
                audience: "user"
            },
            read: false,
            createdAt: now
        });

        return sendSuccess(
            res,
            "Notification sent to the selected user successfully.",
            {
                audience: "user",
                recipientCount: 1,
                notificationId: String(result.insertedId),
                recipient: {
                    id: String(user._id),
                    username: user.username || "",
                    email: user.email || ""
                }
            },
            201
        );
    } catch (error) {
        console.error(
            "[NOTIFICATIONS] Create admin notification error:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to send notification."
        );
    }
}

/**
 * ============================================================
 * DELETE /api/admin/notifications/:id
 * ============================================================
 *
 * Admin-only endpoint.
 * Deletes a single notification from the shared collection.
 * ============================================================
 */

export async function deleteAdminNotification(req, res) {
    try {
        const notificationId = parseObjectId(
            req.params?.id
        );

        if (!notificationId) {
            return sendError(
                res,
                400,
                "Invalid notification ID."
            );
        }

        const {
            notifications
        } = await getNotificationCollections();

        const result = await notifications.deleteOne({
            _id: notificationId
        });

        if (result.deletedCount !== 1) {
            return sendError(
                res,
                404,
                "Notification not found."
            );
        }

        return sendSuccess(
            res,
            "Notification deleted successfully."
        );
    } catch (error) {
        console.error(
            "[NOTIFICATIONS] Delete admin notification error:",
            error
        );

        return sendError(
            res,
            500,
            "Unable to delete notification."
        );
    }
}