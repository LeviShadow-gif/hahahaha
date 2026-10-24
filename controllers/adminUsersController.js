/**
 * ============================================================
 * ShadowSMM — Admin Users Controller
 * ============================================================
 * GET   /api/admin/users?limit=1000
 *   -> { success, users: [{ id, username, email, whatsapp, balance,
 *        spent, orders, completedOrders, referralCode, referredBy,
 *        referralEligible, role, isActive, status, createdAt }] }
 *
 * PATCH /api/admin/users/:id   { status: "active" | "banned" }
 *   -> { success, user }
 *
 * passwordHash kabhi bahar nahi bheja jata (projection se hata diya).
 * ============================================================
 */

import { ObjectId } from "mongodb";

import { connectDB, getUsersCollection } from "../config/db.js";
import { getReferralEligibleUserIds } from "../services/referralEligibilityService.js";

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;

function sendError(res, status, message) {
    return res.status(status).json({ success: false, message });
}

function isAdminRequest(req) {
    return req.user?.role === "admin";
}

function requesterId(req) {
    return String(req.user?.sub ?? req.user?.userId ?? req.user?.id ?? "");
}

function serializeAdminUser(user, extra = {}) {
    const isActive = user.isActive !== false;

    return {
        id: String(user._id),
        username: user.username ?? "",
        email: user.email ?? "",
        whatsapp: user.whatsapp ?? "",
        role: user.role ?? "user",
        balance: Number(user.balance ?? 0),
        spent: Number(user.spent ?? 0),
        completedOrders: Number(user.completedOrders ?? 0),
        referralCode: user.referralCode ?? "",
        referredBy: user.referredBy ?? null,
        isActive,
        status: isActive ? "active" : "banned",
        createdAt: user.createdAt ?? null,
        ...extra
    };
}

/* ------------------------------------------------------------ */
/* GET /api/admin/users                                          */
/* ------------------------------------------------------------ */

export async function getAdminUsers(req, res) {
    try {
        if (!isAdminRequest(req)) {
            return sendError(res, 403, "Administrator access required.");
        }

        const requested = Number.parseInt(req.query?.limit, 10);
        const limit = Number.isFinite(requested)
            ? Math.min(Math.max(requested, 1), MAX_LIMIT)
            : DEFAULT_LIMIT;

        const db = await connectDB();
        const users = await getUsersCollection();

        const [rows, orderCounts, eligibleIds] = await Promise.all([
            users
                .find(
                    {},
                    {
                        projection: {
                            passwordHash: 0
                        }
                    }
                )
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray(),

            db
                .collection("orders")
                .aggregate([{ $group: { _id: "$userId", total: { $sum: 1 } } }])
                .toArray(),

            getReferralEligibleUserIds()
        ]);

        const ordersByUser = new Map(
            orderCounts.map((r) => [String(r._id), r.total])
        );

        return res.status(200).json({
            success: true,
            users: rows.map((u) =>
                serializeAdminUser(u, {
                    orders: ordersByUser.get(String(u._id)) ?? 0,
                    referralEligible: eligibleIds.has(String(u._id))
                })
            )
        });
    } catch (error) {
        console.error("[ADMIN USERS] list error:", error);
        return sendError(res, 500, "Could not load users.");
    }
}

/* ------------------------------------------------------------ */
/* PATCH /api/admin/users/:id                                    */
/* ------------------------------------------------------------ */

export async function updateAdminUser(req, res) {
    try {
        if (!isAdminRequest(req)) {
            return sendError(res, 403, "Administrator access required.");
        }

        const id = String(req.params?.id ?? "");

        if (!ObjectId.isValid(id)) {
            return sendError(res, 400, "Invalid user ID.");
        }

        const status = String(req.body?.status ?? "").toLowerCase();

        if (status !== "active" && status !== "banned") {
            return sendError(res, 400, 'Status must be "active" or "banned".');
        }

        if (status === "banned" && id === requesterId(req)) {
            return sendError(res, 400, "You cannot ban your own account.");
        }

        const users = await getUsersCollection();
        const target = await users.findOne({ _id: new ObjectId(id) });

        if (!target) {
            return sendError(res, 404, "User not found.");
        }

        if (status === "banned" && target.role === "admin") {
            return sendError(res, 400, "Admin accounts cannot be banned.");
        }

        await users.updateOne(
            { _id: target._id },
            {
                $set: {
                    isActive: status === "active",
                    updatedAt: new Date()
                }
            }
        );

        return res.status(200).json({
            success: true,
            message: status === "banned" ? "User banned." : "User unbanned.",
            user: serializeAdminUser({
                ...target,
                passwordHash: undefined,
                isActive: status === "active"
            })
        });
    } catch (error) {
        console.error("[ADMIN USERS] update error:", error);
        return sendError(res, 500, "Could not update the user.");
    }
}

export default { getAdminUsers, updateAdminUser };