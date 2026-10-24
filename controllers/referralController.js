import {
    getReferralDetails,
    redeemReferralCode,
    getReferralDiscountForUser,
    applyReferralDiscount,
    previewReferralForOrder
} from "../services/referralService.js";

/**
 * ============================================================
 * ShadowSMM Referral Controller
 * Express + MongoDB + JWT
 * ============================================================
 *
 * Endpoints:
 * GET  /api/referral
 * POST /api/referral/redeem
 * GET  /api/referral/discount   (optional: ?amount=100 for a price preview)
 * POST /api/referral/preview    (check a code typed in the order form)
 *
 * Authentication is applied in referralRoutes.js.
 * ============================================================
 */

/**
 * Get the authenticated user's referral dashboard details.
 *
 * Returns:
 * - completedOrders
 * - eligibility
 * - referralCode (only when eligible)
 * - discountPercent
 * - current-tier redemption usage
 * - remaining redemption slots
 */
export async function getReferral(req, res, next) {
    try {
        const userId = req.user?.sub ?? req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const result = await getReferralDetails(userId);

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

/**
 * Redeem another user's referral code.
 *
 * Expected body:
 * {
 *   "referralCode": "SXXXXXXXXM"
 * }
 *
 * The service validates eligibility, self-referrals,
 * duplicate redemptions and tier capacity.
 */
export async function redeemReferral(req, res, next) {
    try {
        const userId = req.user?.sub ?? req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const referralCode =
            typeof req.body?.referralCode === "string"
                ? req.body.referralCode.trim()
                : "";

        if (!referralCode) {
            return res.status(400).json({
                success: false,
                message: "Please provide a referral code."
            });
        }

        if (referralCode.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Referral code is too long."
            });
        }

        const result = await redeemReferralCode(
            userId,
            referralCode
        );

        return res.status(200).json(result);
    } catch (error) {
        return next(error);
    }
}

/**
 * Get the referral discount the authenticated user has earned.
 *
 * Optional query: ?amount=100
 * -> also returns the price after the discount.
 */
export async function getReferralDiscount(req, res, next) {
    try {
        const userId = req.user?.sub ?? req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        if (req.query?.amount !== undefined) {
            const amount = Number(req.query.amount);

            if (!Number.isFinite(amount) || amount < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid amount."
                });
            }

            const price = await applyReferralDiscount(userId, amount);

            return res.status(200).json({
                success: true,
                discount: price
            });
        }

        const discount = await getReferralDiscountForUser(userId);

        return res.status(200).json({
            success: true,
            discount
        });
    } catch (error) {
        return next(error);
    }
}

/**
 * Check a referral code typed in the order form (nothing is saved).
 *
 * Expected body:
 * {
 *   "referralCode": "SXXXXXXXXM",   // optional
 *   "amount": 12.5                  // optional, returns the discounted price
 * }
 */
export async function previewReferral(req, res, next) {
    try {
        const userId = req.user?.sub ?? req.user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const referralCode =
            typeof req.body?.referralCode === "string"
                ? req.body.referralCode.trim()
                : "";

        if (referralCode.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Referral code is too long."
            });
        }

        const preview = await previewReferralForOrder(
            userId,
            referralCode,
            req.body?.amount
        );

        return res.status(200).json({
            success: true,
            preview
        });
    } catch (error) {
        return next(error);
    }
}