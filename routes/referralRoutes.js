/**
 * ============================================================
 * ShadowSMM Referral Routes
 * Express + JWT Authentication
 * ============================================================
 *
 * Mounted in server.js at:
 * app.use("/api/referral", referralRoutes);
 *
 * Endpoints:
 * GET  /api/referral
 * POST /api/referral/redeem
 * GET  /api/referral/discount
 * POST /api/referral/preview
 * ============================================================
 */

import { Router } from "express";

import { authenticate } from "../middleware/auth.js";

import {
    getReferral,
    redeemReferral,
    getReferralDiscount,
    previewReferral
} from "../controllers/referralController.js";

const router = Router();

/**
 * GET /api/referral
 *
 * Returns the authenticated user's referral information:
 * - Completed orders
 * - Eligibility
 * - Referral code (when eligible)
 * - Discount percentage
 * - Tier redemption usage
 */
router.get(
    "/",
    authenticate,
    getReferral
);

/**
 * POST /api/referral/redeem
 *
 * Request body:
 * {
 *   "referralCode": "SXXXXXXXXM"
 * }
 *
 * Requires authentication.
 */
router.post(
    "/redeem",
    authenticate,
    redeemReferral
);

/**
 * GET /api/referral/discount
 *
 * Returns the referral discount the authenticated user has earned
 * by redeeming someone's code.
 *
 * Optional query: ?amount=100
 * -> also returns the price after the discount.
 *
 * Requires authentication.
 */
router.get(
    "/discount",
    authenticate,
    getReferralDiscount
);

/**
 * POST /api/referral/preview
 *
 * Request body:
 * {
 *   "referralCode": "SXXXXXXXXM",   // optional
 *   "amount": 12.5                  // optional
 * }
 *
 * Checks a code typed in the order form and returns the discount it
 * gives. Nothing is saved. Requires authentication.
 */
router.post(
    "/preview",
    authenticate,
    previewReferral
);

export default router;