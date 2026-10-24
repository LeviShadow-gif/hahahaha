/**
 * ============================================================
 * ShadowSMM — Admin Stats Controller
 * ============================================================
 * GET /api/admin/stats  (admin only)
 *
 * -> {
 *      success, totalUsers, newUsersToday, totalOrders,
 *      completedOrders, pendingOrders, pendingDeposits,
 *      totalDeposited, todayDeposited, totalBalance,
 *      referralEligible
 *    }
 *
 * Agar tumhare paas pehle se stats controller hai to poora
 * replace mat karo: bas `countReferralEligibleUsers()` import
 * karke apne response mein `referralEligible` add kar do.
 * ============================================================
 */

import { connectDB, getUsersCollection } from "../config/db.js";
import { countReferralEligibleUsers } from "../services/referralEligibilityService.js";

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

const sumOf = (rows, key) => Number(rows?.[0]?.[key] ?? 0);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function getAdminStats(req, res) {
    try {
        if (req.user?.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Administrator access required."
            });
        }

        const db = await connectDB();
        const users = await getUsersCollection();
        const orders = db.collection("orders");
        const transactions = db.collection("transactions");
        const fundRequests = db.collection("fund_requests");
        const today = startOfToday();

        const [
            totalUsers,
            newUsersToday,
            totalOrders,
            completedOrders,
            pendingOrders,
            pendingDeposits,
            depositedAll,
            depositedToday,
            balanceAll,
            referralEligible
        ] = await Promise.all([
            users.countDocuments({}),
            users.countDocuments({ createdAt: { $gte: today } }),
            orders.countDocuments({}),
            orders.countDocuments({ status: "completed" }),
            orders.countDocuments({ status: "processing", active: { $ne: false } }),
            fundRequests.countDocuments({ status: "pending" }),
            transactions
                .aggregate([
                    { $match: { type: "deposit", status: "approved" } },
                    { $group: { _id: null, total: { $sum: "$creditAmount" } } }
                ])
                .toArray(),
            transactions
                .aggregate([
                    {
                        $match: {
                            type: "deposit",
                            status: "approved",
                            createdAt: { $gte: today }
                        }
                    },
                    { $group: { _id: null, total: { $sum: "$creditAmount" } } }
                ])
                .toArray(),
            users
                .aggregate([
                    { $group: { _id: null, total: { $sum: "$balance" } } }
                ])
                .toArray(),
            countReferralEligibleUsers()
        ]);

        return res.status(200).json({
            success: true,
            totalUsers,
            newUsersToday,
            totalOrders,
            completedOrders,
            pendingOrders,
            pendingDeposits,
            totalDeposited: round2(sumOf(depositedAll, "total")),
            todayDeposited: round2(sumOf(depositedToday, "total")),
            totalBalance: round2(sumOf(balanceAll, "total")),
            referralEligible
        });
    } catch (error) {
        console.error("getAdminStats error:", error);
        return res.status(500).json({
            success: false,
            message: "Could not load admin stats."
        });
    }
}

export default { getAdminStats };