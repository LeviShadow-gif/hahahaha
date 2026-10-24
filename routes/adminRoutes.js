/**
 * ============================================================
 * ShadowSMM — Admin Routes (stats + users)
 * ============================================================
 * GET   /api/admin/stats
 * GET   /api/admin/users
 * PATCH /api/admin/users/:id
 *
 * Mounted in server.js as:  app.use("/api/admin", adminRoutes);
 *
 * Auth middleware har route par alag lagaya hai (router.use nahi),
 * taaki /api/admin/notifications jaise baaki routes par asar na pade.
 * ============================================================
 */

import express from "express";

import { getAdminStats } from "../controllers/adminStatsController.js";
import {
    getAdminUsers,
    updateAdminUser
} from "../controllers/adminUsersController.js";

// !! IMPORTANT: yahan wahi auth middleware import karo jo
// routes/funds.js ke /admin routes par use hota hai (jo req.user set kare).
// Naam/path apne project ke hisaab se badlo.
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/stats", authenticate, getAdminStats);
router.get("/users", authenticate, getAdminUsers);
router.patch("/users/:id", authenticate, updateAdminUser);

export default router;