
import express from "express";
import rateLimit from "express-rate-limit";

import { authenticate } from "../middleware/auth.js";
import {
    updateEmail,
    updatePassword
} from "../controllers/accountController.js";

const router = express.Router();

const accountUpdateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many account update attempts. Please try again later."
    }
});

// Change email after verifying the current password
router.patch(
    "/email",
    authenticate,
    accountUpdateLimiter,
    updateEmail
);

// Change password after verifying the current password
router.patch(
    "/password",
    authenticate,
    accountUpdateLimiter,
    updatePassword
);

export default router;