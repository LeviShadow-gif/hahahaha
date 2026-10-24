/**
 * ============================================================
 * ShadowSMM — Referral Eligibility Service
 * ============================================================
 *
 * Ek hi jagah jahan "referral code ke liye eligible" ka rule
 * likha hai. Admin stats aur (baad mein) auto referral-code
 * generation dono isi ko use kar sakte hain.
 *
 * RULE (neeche ke numbers badal ke apna rule set karo):
 *   - kam se kam MIN_COMPLETED_ORDERS completed orders
 *   - kam se kam MIN_DEPOSITED_USD ka approved deposit (USD)
 *   - (optional) current balance >= MIN_BALANCE_USD  (0 = check off)
 *
 * Data sources:
 *   orders        -> status: "completed", userId
 *   transactions  -> type: "deposit", status: "approved", creditAmount (USD)
 *   users         -> balance (USD)
 * ============================================================
 */

import { connectDB, getUsersCollection } from "../config/db.js";

/* ---------------- EDIT YOUR RULE HERE ---------------- */
export const MIN_COMPLETED_ORDERS = 1;
export const MIN_DEPOSITED_USD = 1;
export const MIN_BALANCE_USD = 0; // 0 = balance check band
/* ----------------------------------------------------- */

/**
 * Eligible users ki userId (string) ka Set return karta hai.
 * Banned / admin users shamil nahi hote.
 */
export async function getReferralEligibleUserIds() {
    const db = await connectDB();
    const users = await getUsersCollection();

    const [orderRows, depositRows] = await Promise.all([
        db
            .collection("orders")
            .aggregate([
                { $match: { status: "completed" } },
                { $group: { _id: "$userId", completed: { $sum: 1 } } },
                { $match: { completed: { $gte: MIN_COMPLETED_ORDERS } } }
            ])
            .toArray(),

        db
            .collection("transactions")
            .aggregate([
                { $match: { type: "deposit", status: "approved" } },
                { $group: { _id: "$userId", deposited: { $sum: "$creditAmount" } } },
                { $match: { deposited: { $gte: MIN_DEPOSITED_USD } } }
            ])
            .toArray()
    ]);

    const depositedIds = new Set(depositRows.map((r) => String(r._id)));
    const candidateIds = orderRows
        .map((r) => r._id)
        .filter((id) => id && depositedIds.has(String(id)));

    if (candidateIds.length === 0) {
        return new Set();
    }

    const filter = {
        _id: { $in: candidateIds },
        role: { $ne: "admin" },
        isAdmin: { $ne: true },
        isActive: { $ne: false } // banned/disabled users (isActive: false) shamil nahi
    };

    if (MIN_BALANCE_USD > 0) {
        filter.balance = { $gte: MIN_BALANCE_USD };
    }

    const eligible = await users
        .find(filter, { projection: { _id: 1 } })
        .toArray();

    return new Set(eligible.map((u) => String(u._id)));
}

export async function countReferralEligibleUsers() {
    return (await getReferralEligibleUserIds()).size;
}

export default {
    getReferralEligibleUserIds,
    countReferralEligibleUsers
};