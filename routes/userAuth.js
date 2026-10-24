import express from "express";
import rateLimit from "express-rate-limit";
import {
    register,
    login,
    me,
    logout
} from "../controllers/userAuthController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/*  Rate limiting                                                             */
/* -------------------------------------------------------------------------- */

const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_RATE_LIMIT_MAX_REQUESTS = 30; // per IP, per window

/**
 * Protects public auth endpoints (register/login) against brute-force
 * and credential-stuffing attempts.
 */
const authLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    limit: AUTH_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication attempts. Please try again later."
    }
});

/* -------------------------------------------------------------------------- */
/*  Public routes                                                             */
/* -------------------------------------------------------------------------- */

// POST /register - create a new account
router.post("/register", authLimiter, register);

// POST /login - authenticate with username or email
router.post("/login", authLimiter, login);

/* -------------------------------------------------------------------------- */
/*  Protected routes (valid JWT required)                                     */
/* -------------------------------------------------------------------------- */

// GET /me - fetch the currently authenticated user
router.get("/me", authenticate, me);

// POST /logout - stateless logout (client clears its token)
router.post("/logout", authenticate, logout);

export default router;