
/**
 * ============================================================
 * ShadowSMM - Notification Routes
 * ============================================================
 *
 * User routes:
 * GET    /api/notification
 * DELETE /api/notification/:id
 * DELETE /api/notification
 *
 * Admin routes:
 * GET    /api/admin/notifications
 * POST   /api/admin/notifications
 * DELETE /api/admin/notifications/:id
 *
 * Security:
 * - User routes require authenticate middleware.
 * - Admin routes require requireAdmin middleware.
 * - Admin routes never rely on frontend-only authorization.
 *
 * Controller:
 * ../controllers/notificationController.js
 * ============================================================
 */

import { Router } from "express";

import {
    authenticate,
    requireAdmin
} from "../middleware/auth.js";

import {
    getUserNotifications,
    deleteUserNotification,
    clearUserNotifications,
    getAdminNotifications,
    createAdminNotification,
    deleteAdminNotification
} from "../controllers/notificationController.js";

/**
 * ============================================================
 * Router
 * ============================================================
 */

const router = Router();

/**
 * ============================================================
 * User Notification Routes
 * ============================================================
 *
 * These routes are for logged-in users only.
 * Every controller checks ownership using the authenticated
 * user's ID.
 * ============================================================
 */

/**
 * GET /api/notification
 *
 * Fetch notifications belonging to the logged-in user.
 */
router.get(
    "/notification",
    authenticate,
    getUserNotifications
);

/**
 * DELETE /api/notification/:id
 *
 * Delete one notification belonging to the logged-in user.
 */
router.delete(
    "/notification/:id",
    authenticate,
    deleteUserNotification
);

/**
 * DELETE /api/notification
 *
 * Clear all notifications belonging to the logged-in user.
 */
router.delete(
    "/notification",
    authenticate,
    clearUserNotifications
);

/**
 * ============================================================
 * Admin Notification Routes
 * ============================================================
 *
 * These routes are for administrators only.
 * requireAdmin verifies the user's token and admin role.
 * ============================================================
 */

/**
 * GET /api/admin/notifications
 *
 * Fetch notifications for the admin panel.
 */
router.get(
    "/admin/notifications",
    requireAdmin,
    getAdminNotifications
);

/**
 * POST /api/admin/notifications
 *
 * Send a notification to:
 * - All users
 * - One selected user
 */
router.post(
    "/admin/notifications",
    requireAdmin,
    createAdminNotification
);

/**
 * DELETE /api/admin/notifications/:id
 *
 * Delete one notification from the admin panel.
 */
router.delete(
    "/admin/notifications/:id",
    requireAdmin,
    deleteAdminNotification
);

/**
 * ============================================================
 * Export
 * ============================================================
 */

export default router;