/**
 * ============================================================
 * ShadowSMM — Order Routes
 * ============================================================
 *
 * Stack:
 * - Node.js ES Modules
 * - Express 5
 * - MongoDB Native Driver
 * - Existing JWT authentication middleware
 *
 * Base URL:
 * /api/orders
 *
 * USER ROUTES:
 * POST  /api/orders
 * GET   /api/orders
 * POST  /api/orders/:id/cancel-request
 *
 * ADMIN ROUTES:
 * GET   /api/orders/admin
 * PATCH /api/orders/admin/:id/approve
 * PATCH /api/orders/admin/:id/cancel
 * PATCH /api/orders/admin/:id/tracking
 * PATCH /api/orders/admin/:id/complete
 *
 * IMPORTANT:
 * This file defines routes and access control.
 * Business logic lives in orderController.js.
 *
 * Referral system:
 * No extra routes are needed here. The referral discount is applied
 * inside createOrder (POST /api/orders) and completed orders are
 * counted inside completeOrder (PATCH /api/orders/admin/:id/complete).
 * Referral endpoints live in referralRoutes.js (/api/referral).
 * ============================================================
 */

import express from "express";

import {
    authenticate,
    requireAdmin
} from "../middleware/auth.js";

import {
    createOrder,
    getUserOrders,
    getAdminOrders,
    approveOrder,
    requestCancellation,
    cancelOrderByAdmin,
    updateOrderTracking,
    completeOrder
} from "../controllers/orderController.js";

/* ============================================================
   ROUTER
============================================================ */

const router = express.Router();

/* ============================================================
   USER ROUTES
============================================================ */

/**
 * ------------------------------------------------------------
 * Place a new order
 *
 * POST /api/orders
 *
 * Authentication required.
 * Order owner is determined from the verified JWT.
 *
 * Optional body field: "referralCode". The price is always
 * calculated on the server; any referral discount is applied there.
 * ------------------------------------------------------------
 */

router.post(
    "/",
    authenticate,
    createOrder
);

/**
 * ------------------------------------------------------------
 * Get the authenticated user's order history
 *
 * GET /api/orders
 *
 * Users must only receive their own orders.
 * ------------------------------------------------------------
 */

router.get(
    "/",
    authenticate,
    getUserOrders
);

/**
 * ------------------------------------------------------------
 * Request order cancellation
 *
 * POST /api/orders/:id/cancel-request
 *
 * Only the owner can request cancellation.
 * The order remains Processing until the admin acts.
 * ------------------------------------------------------------
 */

router.post(
    "/:id/cancel-request",
    authenticate,
    requestCancellation
);

/* ============================================================
   ADMIN ROUTES
============================================================ */

/**
 * ------------------------------------------------------------
 * Get active order requests
 *
 * GET /api/orders/admin
 *
 * Admin authentication and role required.
 * ------------------------------------------------------------
 */

router.get(
    "/admin",
    requireAdmin,
    getAdminOrders
);

/**
 * ------------------------------------------------------------
 * Approve a Processing order
 *
 * PATCH /api/orders/admin/:id/approve
 *
 * Processing -> In Progress
 * ------------------------------------------------------------
 */

router.patch(
    "/admin/:id/approve",
    requireAdmin,
    approveOrder
);

/**
 * ------------------------------------------------------------
 * Cancel a Processing order
 *
 * PATCH /api/orders/admin/:id/cancel
 *
 * Processing -> Cancelled
 * The order remains in database history.
 * ------------------------------------------------------------
 */

router.patch(
    "/admin/:id/cancel",
    requireAdmin,
    cancelOrderByAdmin
);

/**
 * ------------------------------------------------------------
 * Update tracking values
 *
 * PATCH /api/orders/admin/:id/tracking
 *
 * Body example:
 * {
 *   "startCount": 12500
 * }
 *
 * Or:
 * {
 *   "delivered": 700
 * }
 *
 * Or update both values in one request.
 * ------------------------------------------------------------
 */

router.patch(
    "/admin/:id/tracking",
    requireAdmin,
    updateOrderTracking
);

/**
 * ------------------------------------------------------------
 * Complete an In Progress order
 *
 * PATCH /api/orders/admin/:id/complete
 *
 * Delivered >= quantity -> Completed
 * Delivered < quantity  -> Partial
 *
 * Both Start Count and Delivered must be set first.
 *
 * A "Completed" order is added to the user's completed-order
 * count for the referral system ("Partial" is not counted).
 * ------------------------------------------------------------
 */

router.patch(
    "/admin/:id/complete",
    requireAdmin,
    completeOrder
);

/* ============================================================
   EXPORT ROUTER
============================================================ */

export default router;