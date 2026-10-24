/**
 * ============================================================
 * ShadowSMM Backend
 * Funds Routes
 * ============================================================
 *
 * Module System: ES Modules
 * Framework: Express
 *
 * Mounted in server.js:
 * app.use("/api/funds", fundsRoute);
 *
 * User endpoints:
 * POST  /api/funds/upi
 * POST  /api/funds/crypto
 * GET   /api/funds/my-requests
 * GET   /api/funds/my-transactions
 *
 * Admin endpoints:
 * GET   /api/funds/admin
 * PATCH /api/funds/admin/:id/approve
 * PATCH /api/funds/admin/:id/reject
 *
 * Security:
 * - authenticate protects user routes.
 * - requireAdmin protects admin routes.
 * - Multer memoryStorage receives screenshots in memory.
 * - Only image uploads within the configured size limit.
 * ============================================================
 */

import express from "express";
import multer from "multer";

import {
    authenticate,
    requireAdmin
} from "../middleware/auth.js";

import {
    createUpiRequest,
    createCryptoRequest,
    getMyFundRequests,
    getMyTransactions,
    getFundRequests,
    approveFundRequest,
    rejectFundRequest
} from "../controllers/fundsController.js";

const router = express.Router();

/**
 * ============================================================
 * Upload Configuration
 * ============================================================
 */

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence"
]);

const uploadScreenshot = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: MAX_SCREENSHOT_SIZE,
        files: 1,
        fields: 10,
        parts: 12
    },

    fileFilter(req, file, callback) {
        const mimetype = String(file.mimetype || "")
            .toLowerCase()
            .split(";")[0]
            .trim();

        if (!ALLOWED_IMAGE_TYPES.has(mimetype)) {
            const error = new Error(
                "Unsupported screenshot type. Upload JPEG, PNG, WebP, HEIC or HEIF."
            );

            error.statusCode = 400;

            return callback(error);
        }

        return callback(null, true);
    }
});

/**
 * ============================================================
 * Multer Error Handler
 * ============================================================
 */

function handleScreenshotUpload(req, res, next) {
    uploadScreenshot.single("screenshot")(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    success: false,
                    message: "Screenshot must be 5 MB or smaller."
                });
            }

            if (error.code === "LIMIT_FILE_COUNT") {
                return res.status(400).json({
                    success: false,
                    message: "Only one screenshot can be uploaded."
                });
            }

            return res.status(400).json({
                success: false,
                message: "Invalid screenshot upload."
            });
        }

        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message || "Screenshot upload failed."
        });
    });
}

/**
 * ============================================================
 * User Routes
 * ============================================================
 */

/**
 * Submit UPI deposit request.
 *
 * POST /api/funds/upi
 *
 * JSON body:
 * {
 *   "amount": 500,
 *   "utr": "123456789012"
 * }
 */
router.post(
    "/upi",
    authenticate,
    createUpiRequest
);

/**
 * Submit Binance deposit request.
 *
 * POST /api/funds/crypto
 *
 * Content-Type: multipart/form-data
 *
 * Fields:
 * - amount
 * - network
 * - txHash (optional if screenshot is provided)
 * - screenshot (optional if txHash is provided)
 *
 * At least one of txHash or screenshot is required.
 */
router.post(
    "/crypto",
    authenticate,
    handleScreenshotUpload,
    createCryptoRequest
);

/**
 * Get the authenticated user's pending fund requests.
 *
 * GET /api/funds/my-requests
 */
router.get(
    "/my-requests",
    authenticate,
    getMyFundRequests
);

/**
 * Get the authenticated user's reviewed deposits
 * (approved and rejected transactions).
 *
 * GET /api/funds/my-transactions
 */
router.get(
    "/my-transactions",
    authenticate,
    getMyTransactions
);

/**
 * ============================================================
 * Admin Routes
 * ============================================================
 */

/**
 * Get pending fund requests.
 *
 * GET /api/funds/admin
 *
 * Optional query:
 * ?status=pending
 * ?status=all
 */
router.get(
    "/admin",
    authenticate,
    requireAdmin,
    getFundRequests
);

/**
 * Approve a fund request.
 *
 * PATCH /api/funds/admin/:id/approve
 */
router.patch(
    "/admin/:id/approve",
    authenticate,
    requireAdmin,
    approveFundRequest
);

/**
 * Reject a fund request.
 *
 * PATCH /api/funds/admin/:id/reject
 */
router.patch(
    "/admin/:id/reject",
    authenticate,
    requireAdmin,
    rejectFundRequest
);

/**
 * ============================================================
 * Export Router
 * ============================================================
 */

export default router;