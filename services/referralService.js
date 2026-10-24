import { ObjectId } from "mongodb";
import { randomInt } from "node:crypto";
import {
    connectDB,
    getUsersCollection,
    getReferralRedemptionsCollection
} from "../config/db.js";
import { getOrdersCollection } from "../models/Order.js";

/**
 * ============================================================
 * ShadowSMM Referral Service
 * MongoDB Native Driver + ES Modules
 * ============================================================
 *
 * Rules:
 * - Referral code is permanent.
 * - 0-49 completed orders: not eligible.
 * - 50-99 completed orders: 10% discount.
 * - Every additional 50 completed orders: +5%.
 * - Maximum 50 NEW redeemers per tier per referrer.
 * - The same redeemer cannot redeem the same referrer's code twice.
 * - A referral code can be used on ONE order only per user. Once a user
 *   has placed an order with a referral code, that same code cannot be
 *   used again by that user (no later discount, typed or automatic).
 * - A user may also use their OWN referral code, once (same one-order rule).
 * - Referral reward: when 50 orders placed with a referrer's code in one
 *   discount tier are COMPLETED, the referrer gets a wallet reward:
 *   the first tier pays $0.30 (only once, at the start); every later tier
 *   pays only $0.10 (not added to the $0.30).
 *   It is paid once per tier by recordReferralOrderCompleted().
 * - Completed order counts are read from the database.
 * - Referral code is generated automatically once the user
 *   reaches 50 completed orders (ensureReferralCode).
 * - Redeemer discount is read with getReferralDiscountForUser()
 *   and applied to an order price with applyReferralDiscount().
 * - Completed orders are increased with incrementCompletedOrders().
 * - Order form flow: previewReferralForOrder() checks a typed code
 *   (no changes), applyReferralToOrder() redeems it on the first
 *   order and returns the discounted price.
 *
 * NOTE:
 * Actual completed-order counting and applying the discount to
 * an order's final price must be connected to the order system.
 * This service does not trust client-submitted order counts.
 * ============================================================
 */

const REFERRAL_REQUIRED_ORDERS = 50;
const REFERRAL_INITIAL_DISCOUNT = 10;
const REFERRAL_DISCOUNT_INCREMENT = 5;
const REFERRAL_MAX_REDEEMERS_PER_TIER = 50;

const REDEMPTIONS_COLLECTION = "referralRedemptions";
const TIER_USAGE_COLLECTION = "referralTierUsage";
const REWARD_PROGRESS_COLLECTION = "referralRewardProgress";
const TRANSACTIONS_COLLECTION = "transactions";
const NOTIFICATIONS_COLLECTION = "notifications";

// Referral reward (USD): paid to the referrer when 50 orders of one tier are completed.
// The first tier pays $0.30 (one time only); every later tier pays only $0.10.
const REFERRAL_REWARD_ORDERS_REQUIRED = 50;
const REFERRAL_REWARD_FIRST_USD = 0.3;
const REFERRAL_REWARD_NEXT_USD = 0.1;

// Referral code format: S + 8 characters + M  (example: SK7P2QX9AM)
const REFERRAL_CODE_PREFIX = "S";
const REFERRAL_CODE_SUFFIX = "M";
const REFERRAL_CODE_BODY_LENGTH = 8;
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Convert a user ID into a valid MongoDB ObjectId.
 */
function toObjectId(userId) {
    if (userId instanceof ObjectId) {
        return userId;
    }

    if (
        typeof userId !== "string" ||
        !ObjectId.isValid(userId) ||
        String(new ObjectId(userId)) !== userId.toLowerCase()
    ) {
        const error = new Error("Invalid user ID.");
        error.statusCode = 400;
        throw error;
    }

    return new ObjectId(userId);
}

/**
 * Create a consistent service error.
 */
function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

const REFERRAL_ALREADY_USED_MESSAGE =
    "You have already used this referral code on an order. A referral code can only be used once.";

/**
 * Has this redemption already been used on an order?
 *
 * - New orders mark the redemption with usedAt / usedOrderId.
 * - Older orders (placed before this rule) are found by the
 *   referralCode stored on the order itself.
 */
async function isRedemptionUsed(record, redeemerId) {
    if (record?.usedAt || record?.usedOrderId) {
        return true;
    }

    if (!record?.referralCode) {
        return false;
    }

    const orders = await getOrdersCollection();

    const legacy = await orders.findOne(
        {
            userId: redeemerId,
            referralCode: record.referralCode,
            referralDiscountPercent: { $gt: 0 }
        },
        { projection: { _id: 1 } }
    );

    return Boolean(legacy);
}

/**
 * Mark a redemption as used by an order.
 *
 * Call this INSIDE the order's MongoDB transaction (pass the session).
 * The conditional update lets only one order consume the code, even when
 * two orders are sent at the same moment.
 * Returns true when this call consumed the code.
 */
export async function markReferralRedemptionUsed(
    redemptionId,
    redeemerId,
    order,
    session
) {
    const redemptions = await getReferralRedemptionsCollection();
    const now = new Date();

    const result = await redemptions.updateOne(
        {
            _id: redemptionId,
            redeemerId: toObjectId(redeemerId),
            $or: [
                { usedAt: { $exists: false } },
                { usedAt: null }
            ]
        },
        {
            $set: {
                usedAt: now,
                usedOrderId: order?._id ?? null,
                usedOrderNumber: order?.orderNumber ?? null
            }
        },
        session ? { session } : undefined
    );

    return result.modifiedCount === 1;
}

/**
 * Return a valid completed-order count.
 *
 * This service only reads the database value.
 * It never accepts the count from a frontend request.
 */
function getCompletedOrders(user) {
    const count = Number(user?.completedOrders ?? 0);

    if (!Number.isSafeInteger(count) || count < 0) {
        throw createError(
            "Invalid completed-order count stored for this user.",
            500
        );
    }

    return count;
}

/**
 * Calculate the referral tier and discount.
 *
 * 0-49   => ineligible
 * 50-99  => tier 1, 10%
 * 100-149 => tier 2, 15%
 * 150-199 => tier 3, 20%
 */
export function calculateReferralTier(completedOrders) {
    const count = Number(completedOrders);

    if (!Number.isSafeInteger(count) || count < 0) {
        throw createError("Invalid completed-order count.");
    }

    if (count < REFERRAL_REQUIRED_ORDERS) {
        return {
            eligible: false,
            completedOrders: count,
            requiredOrders: REFERRAL_REQUIRED_ORDERS,
            ordersRemaining: REFERRAL_REQUIRED_ORDERS - count,
            tier: 0,
            discountPercent: 0,
            maxRedeemersPerTier: REFERRAL_MAX_REDEEMERS_PER_TIER
        };
    }

    const tier = Math.floor(
        count / REFERRAL_REQUIRED_ORDERS
    );

    const discountPercent =
        REFERRAL_INITIAL_DISCOUNT +
        (tier - 1) * REFERRAL_DISCOUNT_INCREMENT;

    return {
        eligible: true,
        completedOrders: count,
        requiredOrders: REFERRAL_REQUIRED_ORDERS,
        ordersRemaining: 0,
        tier,
        discountPercent,
        maxRedeemersPerTier: REFERRAL_MAX_REDEEMERS_PER_TIER
    };
}

/**
 * Ensure indexes exist for referral records.
 *
 * The unique redemption index prevents a user from redeeming
 * the same referrer's code more than once.
 *
 * Tier usage is stored separately so that capacity can be
 * reserved atomically with findOneAndUpdate.
 */
let referralIndexesReady = null;

async function getReferralCollections() {
    const db = await connectDB();

    const redemptions =
        await getReferralRedemptionsCollection();

    const tierUsage =
        db.collection(TIER_USAGE_COLLECTION);

    // Create the indexes only once per server start.
    if (!referralIndexesReady) {
        referralIndexesReady = Promise.all([
            redemptions.createIndex(
                {
                    referrerId: 1,
                    redeemerId: 1
                },
                {
                    unique: true,
                    name: "unique_referrer_redeemer"
                }
            ),

            redemptions.createIndex(
                {
                    referrerId: 1,
                    tier: 1
                },
                {
                    name: "referrer_tier_lookup"
                }
            ),

            tierUsage.createIndex(
                {
                    referrerId: 1,
                    tier: 1
                },
                {
                    unique: true,
                    name: "unique_referrer_tier_usage"
                }
            )
        ]).catch((error) => {
            referralIndexesReady = null;
            throw error;
        });
    }

    await referralIndexesReady;

    return {
        db,
        redemptions,
        tierUsage
    };
}

/**
 * Load a user by ID.
 */
async function findUserById(userId) {
    const users = await getUsersCollection();
    const _id = toObjectId(userId);

    const user = await users.findOne(
        { _id },
        {
            projection: {
                username: 1,
                email: 1,
                role: 1,
                completedOrders: 1,
                referralCode: 1,
                referredBy: 1
            }
        }
    );

    if (!user) {
        throw createError("User not found.", 404);
    }

    return user;
}

/**
 * Load a referrer by their permanent referral code.
 */
async function findReferrerByCode(code) {
    if (typeof code !== "string" || !code.trim()) {
        throw createError("Referral code is required.");
    }

    const normalizedCode = code.trim().toUpperCase();

    const users = await getUsersCollection();

    const user = await users.findOne(
        {
            referralCode: normalizedCode
        },
        {
            projection: {
                username: 1,
                role: 1,
                completedOrders: 1,
                referralCode: 1
            }
        }
    );

    if (!user) {
        throw createError("Invalid referral code.", 404);
    }

    return user;
}

/**
 * Generate a random referral code like "SK7P2QX9AM".
 */
function generateReferralCode() {
    let body = "";

    for (let i = 0; i < REFERRAL_CODE_BODY_LENGTH; i += 1) {
        body += REFERRAL_CODE_ALPHABET[
            randomInt(REFERRAL_CODE_ALPHABET.length)
        ];
    }

    return `${REFERRAL_CODE_PREFIX}${body}${REFERRAL_CODE_SUFFIX}`;
}

/**
 * Make sure a user has a permanent referral code.
 *
 * - If the user already has a code, it is returned unchanged.
 * - Otherwise a unique code is generated and saved once.
 */
export async function ensureReferralCode(userId) {
    const users = await getUsersCollection();
    const _id = toObjectId(userId);

    const existing = await users.findOne(
        { _id },
        { projection: { referralCode: 1 } }
    );

    if (!existing) {
        throw createError("User not found.", 404);
    }

    if (existing.referralCode) {
        return existing.referralCode;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = generateReferralCode();

        const taken = await users.findOne(
            { referralCode: candidate },
            { projection: { _id: 1 } }
        );

        if (taken) {
            continue;
        }

        // Save only if the user still has no code (another request may have set it).
        const result = await users.updateOne(
            {
                _id,
                $or: [
                    { referralCode: { $exists: false } },
                    { referralCode: null },
                    { referralCode: "" }
                ]
            },
            {
                $set: { referralCode: candidate }
            }
        );

        if (result.modifiedCount === 1) {
            return candidate;
        }

        const latest = await users.findOne(
            { _id },
            { projection: { referralCode: 1 } }
        );

        if (latest?.referralCode) {
            return latest.referralCode;
        }
    }

    throw createError(
        "Could not generate a referral code. Please try again.",
        500
    );
}

/**
 * Reserve one redemption slot for the referrer's current tier.
 *
 * Throws a clear 409 error when the tier is already full.
 */
async function reserveTierSlot(tierUsage, referrerId, tier, now) {
    const filter = {
        referrerId,
        tier,
        count: {
            $lt: REFERRAL_MAX_REDEEMERS_PER_TIER
        }
    };

    const update = {
        $inc: {
            count: 1
        },
        $set: {
            updatedAt: now
        },
        $setOnInsert: {
            createdAt: now
        }
    };

    const options = {
        upsert: false,
        returnDocument: "after"
    };

    // MongoDB driver versions differ in return shape.
    const extract = (result) =>
        result && result.value !== undefined ? result.value : result;

    let usageRecord = extract(
        await tierUsage.findOneAndUpdate(filter, update, options)
    );

    if (usageRecord) {
        return;
    }

    /*
     * No record updated: either the usage record does not exist yet,
     * or the tier is full. Try to create it at count 1.
     */
    try {
        await tierUsage.insertOne({
            referrerId,
            tier,
            count: 1,
            createdAt: now,
            updatedAt: now
        });

        return;
    } catch (insertError) {
        if (insertError?.code !== 11000) {
            throw insertError;
        }
    }

    /*
     * The record already exists. It was either created by a parallel
     * request a moment ago, or this tier is really full. Try once more.
     */
    usageRecord = extract(
        await tierUsage.findOneAndUpdate(filter, update, options)
    );

    if (usageRecord) {
        return;
    }

    throw createError(
        "This referral code has reached its redemption limit for the current tier.",
        409
    );
}

/**
 * Get a user's referral dashboard information.
 *
 * The referral code is returned only after eligibility is reached.
 */
export async function getReferralDetails(userId) {
    const user = await findUserById(userId);

    const completedOrders = getCompletedOrders(user);
    const tierInfo = calculateReferralTier(completedOrders);

    const {
        redemptions,
        tierUsage
    } = await getReferralCollections();

    let currentTierRedemptions = 0;
    let totalRedemptions = 0;

    if (tierInfo.eligible) {
        const currentTierUsage = await tierUsage.findOne({
            referrerId: user._id,
            tier: tierInfo.tier
        });

        currentTierRedemptions = Number(
            currentTierUsage?.count ?? 0
        );

        if (
            !Number.isSafeInteger(currentTierRedemptions) ||
            currentTierRedemptions < 0
        ) {
            throw createError(
                "Invalid referral tier usage record.",
                500
            );
        }
    }

    totalRedemptions = await redemptions.countDocuments({
        referrerId: user._id
    });

    let referralCode = null;

    if (tierInfo.eligible) {
        referralCode =
            user.referralCode ||
            (await ensureReferralCode(user._id));
    }

    return {
        success: true,
        referral: {
            completedOrders,
            requiredOrders: REFERRAL_REQUIRED_ORDERS,
            ordersRemaining: tierInfo.ordersRemaining,
            eligible: tierInfo.eligible,

            // Hidden until the user is eligible.
            referralCode,

            tier: tierInfo.tier,
            discountPercent: tierInfo.discountPercent,

            maxRedeemersPerTier:
                REFERRAL_MAX_REDEEMERS_PER_TIER,

            currentTierRedemptions,
            currentTierRemaining:
                tierInfo.eligible
                    ? Math.max(
                        0,
                        REFERRAL_MAX_REDEEMERS_PER_TIER -
                        currentTierRedemptions
                    )
                    : 0,

            totalRedemptions
        }
    };
}

/**
 * Redeem another user's referral code.
 *
 * This reserves one slot for the referrer's CURRENT tier.
 * A unique redemption record prevents the same redeemer from
 * using that referrer's code again in any future tier.
 *
 * NOTE:
 * This records the referral redemption and discount snapshot.
 * Applying the discount to an actual order requires integration
 * with the order-pricing service.
 */
export async function redeemReferralCode(redeemerId, code) {
    const redeemerObjectId = toObjectId(redeemerId);
    const redeemer = await findUserById(redeemerObjectId);

    const referrer = await findReferrerByCode(code);

    // A user may use their own referral code once (the unique redemption
    // record below keeps it to one use, like any other code).
    const isSelfUse = redeemer._id.equals(referrer._id);

    const referrerOrders = getCompletedOrders(referrer);
    const tierInfo = calculateReferralTier(referrerOrders);

    if (!tierInfo.eligible) {
        throw createError(
            "This referral code is not eligible yet."
        );
    }

    const {
        redemptions,
        tierUsage
    } = await getReferralCollections();

    const now = new Date();

    /*
     * Reserve a slot only if this tier has fewer than 50 uses.
     *
     * The conditional atomic update prevents concurrent requests
     * from reserving more than 50 slots.
     */
    await reserveTierSlot(
        tierUsage,
        referrer._id,
        tierInfo.tier,
        now
    );

    /*
     * Save the redemption after reserving capacity.
     * If the redeemer already used this referrer's code, release
     * the reserved slot so it is not permanently consumed.
     */
    try {
        await redemptions.insertOne({
            referrerId: referrer._id,
            redeemerId: redeemer._id,
            referralCode: referrer.referralCode,
            tier: tierInfo.tier,
            discountPercent: tierInfo.discountPercent,
            createdAt: now
        });
    } catch (error) {
        if (error?.code === 11000) {
            await tierUsage.updateOne(
                {
                    referrerId: referrer._id,
                    tier: tierInfo.tier,
                    count: { $gt: 0 }
                },
                {
                    $inc: { count: -1 },
                    $set: { updatedAt: new Date() }
                }
            );

            const alreadyError = createError(
                "You have already used this user's referral code.",
                409
            );
            alreadyError.reason = "already_redeemed";

            throw alreadyError;
        }

        /*
         * For unexpected database errors, attempt to release
         * the reserved slot before propagating the failure.
         */
        await tierUsage.updateOne(
            {
                referrerId: referrer._id,
                tier: tierInfo.tier,
                count: { $gt: 0 }
            },
            {
                $inc: { count: -1 },
                $set: { updatedAt: new Date() }
            }
        );

        throw error;
    }

    /*
     * Remember who referred this user (first referrer only).
     * The redemption is already saved, so a failure here is not fatal.
     */
    try {
        // Nobody is "referred by" themselves, so skip it for own-code use.
        if (!isSelfUse) {
            const users = await getUsersCollection();

            await users.updateOne(
                {
                    _id: redeemer._id,
                    $or: [
                        { referredBy: { $exists: false } },
                        { referredBy: null }
                    ]
                },
                {
                    $set: { referredBy: referrer._id }
                }
            );
        }
    } catch {
        /* ignore */
    }

    return {
        success: true,
        message: "Referral code redeemed successfully.",
        redemption: {
            referralCode: referrer.referralCode,
            discountPercent: tierInfo.discountPercent,
            tier: tierInfo.tier,
            redeemedAt: now
        }
    };
}

/**
 * Increase a user's completed-order count by 1.
 *
 * Call this ONCE when an order moves to "Completed" in the order system.
 * When the user reaches 50 completed orders, their referral code is
 * created automatically.
 */
export async function incrementCompletedOrders(userId, by = 1) {
    if (!Number.isSafeInteger(by) || by < 1) {
        throw createError("Invalid completed-order increment.");
    }

    const users = await getUsersCollection();
    const _id = toObjectId(userId);

    const result = await users.findOneAndUpdate(
        { _id },
        { $inc: { completedOrders: by } },
        {
            returnDocument: "after",
            projection: { completedOrders: 1 }
        }
    );

    // MongoDB driver versions differ in return shape.
    const updated =
        result && result.value !== undefined ? result.value : result;

    if (!updated) {
        throw createError("User not found.", 404);
    }

    const completedOrders = getCompletedOrders(updated);

    if (completedOrders >= REFERRAL_REQUIRED_ORDERS) {
        await ensureReferralCode(_id);
    }

    return calculateReferralTier(completedOrders);
}

/**
 * Get the referral discount a user (the redeemer) can still use.
 *
 * Only codes that were saved on the account but NOT yet used on an order
 * count. A code that was already used on an order gives no more discount.
 * If more than one unused code is saved, the highest discount is used.
 */
export async function getReferralDiscountForUser(userId) {
    const redemptions = await getReferralRedemptionsCollection();
    const redeemerId = toObjectId(userId);

    const records = await redemptions
        .find(
            { redeemerId },
            {
                projection: {
                    discountPercent: 1,
                    referralCode: 1,
                    referrerId: 1,
                    tier: 1,
                    usedAt: 1,
                    usedOrderId: 1
                }
            }
        )
        .sort({ discountPercent: -1 })
        .toArray();

    for (const record of records) {
        const discountPercent = Number(record?.discountPercent ?? 0);

        if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
            continue;
        }

        if (await isRedemptionUsed(record, redeemerId)) {
            continue;
        }

        return {
            hasDiscount: true,
            discountPercent,
            referralCode: record.referralCode ?? null,
            redemptionId: record._id,
            referrerId: record.referrerId ?? null,
            tier: record.tier ?? null
        };
    }

    return {
        hasDiscount: false,
        discountPercent: 0,
        referralCode: null,
        redemptionId: null,
        referrerId: null,
        tier: null
    };
}

/**
 * Price maths shared by every discount function.
 * Discount is rounded to cents; the final price never goes below 0.
 */
function priceWithPercent(original, discountPercent) {
    if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
        return {
            originalAmount: original,
            discountPercent: 0,
            discountAmount: 0,
            finalAmount: original
        };
    }

    const discountAmount =
        Math.round(original * discountPercent) / 100;

    const finalAmount =
        Math.max(0, Math.round((original - discountAmount) * 100) / 100);

    return {
        originalAmount: original,
        discountPercent,
        discountAmount: Math.round(discountAmount * 100) / 100,
        finalAmount
    };
}

function parseAmount(amount) {
    const original = Number(amount);

    if (!Number.isFinite(original) || original < 0) {
        throw createError("Invalid order amount.");
    }

    return original;
}

/**
 * Apply the user's referral discount to an order amount.
 *
 * Call this from the order system when the final price is calculated:
 *   const price = await applyReferralDiscount(userId, orderAmount);
 *   // charge price.finalAmount
 */
export async function applyReferralDiscount(userId, amount) {
    const original = parseAmount(amount);

    const { discountPercent } =
        await getReferralDiscountForUser(userId);

    return priceWithPercent(original, discountPercent);
}

/**
 * Check a referral code typed in the order form.
 * READ-ONLY: nothing is saved and no slot is used.
 *
 * Returns the discount the user will get on this order.
 * Throws a clear error when the code cannot be used
 * (including when the user already used this code on an order).
 */
export async function previewReferralForOrder(userId, code, amount) {
    const redeemerId = toObjectId(userId);
    const earned = await getReferralDiscountForUser(redeemerId);

    const trimmed = typeof code === "string" ? code.trim() : "";

    let codeDiscount = 0;
    let alreadyRedeemed = false;
    let referralCode = null;

    if (trimmed) {
        // Own referral code is allowed once (checked by the used-code rule below).
        const referrer = await findReferrerByCode(trimmed);

        const tierInfo = calculateReferralTier(
            getCompletedOrders(referrer)
        );

        if (!tierInfo.eligible) {
            throw createError(
                "This referral code is not eligible yet."
            );
        }

        const { redemptions, tierUsage } =
            await getReferralCollections();

        const existing = await redemptions.findOne({
            referrerId: referrer._id,
            redeemerId
        });

        if (existing) {
            // One order per code: a used code cannot be used again.
            if (await isRedemptionUsed(existing, redeemerId)) {
                const usedError = createError(
                    REFERRAL_ALREADY_USED_MESSAGE,
                    409
                );
                usedError.reason = "already_used";
                throw usedError;
            }

            // Saved earlier but not used on an order yet.
            alreadyRedeemed = true;

            const saved = Number(existing.discountPercent ?? 0);
            codeDiscount =
                Number.isFinite(saved) && saved > 0 ? saved : 0;
        } else {
            const usage = await tierUsage.findOne({
                referrerId: referrer._id,
                tier: tierInfo.tier
            });

            if (
                Number(usage?.count ?? 0) >=
                REFERRAL_MAX_REDEEMERS_PER_TIER
            ) {
                throw createError(
                    "This referral code has reached its redemption limit for the current tier.",
                    409
                );
            }

            codeDiscount = tierInfo.discountPercent;
        }

        referralCode = referrer.referralCode;
    }

    // A typed code gives its own discount; otherwise the unused saved one.
    const discountPercent = trimmed
        ? codeDiscount
        : earned.discountPercent;

    const preview = {
        valid: true,
        referralCode,
        alreadyRedeemed,
        earnedDiscountPercent: earned.discountPercent,
        discountPercent
    };

    if (amount !== undefined && amount !== null && amount !== "") {
        Object.assign(
            preview,
            priceWithPercent(parseAmount(amount), discountPercent)
        );
    }

    return preview;
}

/**
 * Use a referral code on an order and return the final price.
 *
 * - A typed code is redeemed now if this user has not saved it yet
 *   (one referrer slot is used).
 * - A code can be used on ONE order only. If the user already placed an
 *   order with this code, a 409 error is thrown.
 * - With no code typed, a saved-but-unused code (for example one saved
 *   by an order that failed) is applied automatically.
 *
 * The returned `redemptionId` must be passed to
 * markReferralRedemptionUsed() inside the order transaction, so the code
 * is consumed together with the order.
 *
 * Call from the order-create controller:
 *   const pricing = await applyReferralToOrder(userId, req.body.referralCode, amount);
 *   // charge pricing.finalAmount
 *
 * `amount` must be calculated by the backend from the service rate and
 * quantity, never taken from the browser.
 */
export async function applyReferralToOrder(userId, code, amount) {
    const redeemerId = toObjectId(userId);
    const original = parseAmount(amount);

    const trimmed = typeof code === "string" ? code.trim() : "";

    let redeemedNow = false;
    let referralCode = null;
    let redemptionId = null;
    let referrerId = null;
    let tier = null;
    let discountPercent = 0;

    if (trimmed) {
        const referrer = await findReferrerByCode(trimmed);
        referralCode = referrer.referralCode;

        const redemptions = await getReferralRedemptionsCollection();

        let record = await redemptions.findOne({
            referrerId: referrer._id,
            redeemerId
        });

        if (!record) {
            try {
                await redeemReferralCode(redeemerId, trimmed);
                redeemedNow = true;
            } catch (error) {
                // Two orders sent at the same moment: the code is already saved.
                if (error?.reason !== "already_redeemed") {
                    throw error;
                }
            }

            record = await redemptions.findOne({
                referrerId: referrer._id,
                redeemerId
            });
        }

        if (!record) {
            throw createError(
                "Could not apply this referral code. Please try again.",
                500
            );
        }

        // One order per code.
        if (await isRedemptionUsed(record, redeemerId)) {
            const usedError = createError(
                REFERRAL_ALREADY_USED_MESSAGE,
                409
            );
            usedError.reason = "already_used";
            throw usedError;
        }

        redemptionId = record._id;
        referrerId = record.referrerId ?? referrer._id;
        tier = record.tier ?? null;
        discountPercent = Number(record.discountPercent ?? 0);
    } else {
        const earned = await getReferralDiscountForUser(redeemerId);

        if (earned.hasDiscount) {
            redemptionId = earned.redemptionId;
            referrerId = earned.referrerId;
            tier = earned.tier;
            referralCode = earned.referralCode;
            discountPercent = earned.discountPercent;
        }
    }

    if (!Number.isFinite(discountPercent) || discountPercent <= 0) {
        discountPercent = 0;
        redemptionId = null;
        referrerId = null;
        tier = null;
    }

    const pricing = priceWithPercent(original, discountPercent);

    return {
        ...pricing,
        referralCode,
        redeemedNow,
        redemptionId,

        // Saved on the order so the referrer's reward can be counted when it completes.
        referrerId,
        tier
    };
}

/* ============================================================
   REFERRAL REWARD
   When 50 orders placed with a referrer's code (in one discount
   tier) are completed, the referrer earns a wallet reward:
   tier 1 = $0.30 (one time, at the start), every later tier = $0.10 only.
============================================================ */

/**
 * Reward in USD for a discount tier.
 * Tier 1 pays $0.30 once; every later tier (2, 3, 4, ...) pays only $0.10.
 */
export function calculateReferralReward(tier) {
    const t = Number(tier);

    if (!Number.isSafeInteger(t) || t < 1) {
        return 0;
    }

    return t === 1
        ? REFERRAL_REWARD_FIRST_USD
        : REFERRAL_REWARD_NEXT_USD;
}

let rewardIndexesReady = null;

async function getRewardProgressCollection(db) {
    const progress = db.collection(REWARD_PROGRESS_COLLECTION);

    // Indexes cannot be created inside a transaction, so do it first.
    if (!rewardIndexesReady) {
        rewardIndexesReady = progress
            .createIndex(
                { referrerId: 1, tier: 1 },
                {
                    unique: true,
                    name: "unique_referrer_tier_reward"
                }
            )
            .catch((error) => {
                rewardIndexesReady = null;
                throw error;
            });
    }

    await rewardIndexesReady;

    return progress;
}

/**
 * Count one COMPLETED order that used a referral code, and pay the
 * referrer's reward when the tier reaches 50 completed orders.
 *
 * Call this ONCE when an order becomes "completed" (not partial/cancelled).
 * Everything (count, wallet credit, transaction entry, notification) is
 * one MongoDB transaction, and each order is counted only once.
 *
 * Returns { counted, rewarded, amount?, tier?, transactionId? }.
 */
export async function recordReferralOrderCompleted(order) {
    if (
        !order?._id ||
        !order.referralReferrerId ||
        !Number.isSafeInteger(Number(order.referralTier)) ||
        Number(order.referralTier) < 1
    ) {
        return { counted: false, rewarded: false };
    }

    const referrerId = toObjectId(order.referralReferrerId);
    const tier = Number(order.referralTier);

    const db = await connectDB();
    const progress = await getRewardProgressCollection(db);
    const users = await getUsersCollection();
    const orders = await getOrdersCollection();
    const transactions = db.collection(TRANSACTIONS_COLLECTION);
    const notifications = db.collection(NOTIFICATIONS_COLLECTION);

    const session = db.client?.startSession?.();

    if (!session) {
        throw createError(
            "Wallet transactions are unavailable on this database connection.",
            500
        );
    }

    // MongoDB driver versions differ in return shape.
    const extract = (result) =>
        result && result.value !== undefined ? result.value : result;

    let outcome = { counted: false, rewarded: false };

    try {
        await session.withTransaction(async () => {
            // withTransaction may run this function again after a transient error.
            outcome = { counted: false, rewarded: false };

            const now = new Date();

            // Count each order only once.
            const marked = await orders.updateOne(
                {
                    _id: order._id,
                    referralCounted: { $ne: true }
                },
                {
                    $set: { referralCounted: true }
                },
                { session }
            );

            if (marked.modifiedCount !== 1) {
                return;
            }

            outcome.counted = true;

            const tierProgress = extract(
                await progress.findOneAndUpdate(
                    { referrerId, tier },
                    {
                        $inc: { completedOrders: 1 },
                        $set: { updatedAt: now },
                        $setOnInsert: {
                            createdAt: now,
                            rewardPaid: false
                        }
                    },
                    {
                        upsert: true,
                        returnDocument: "after",
                        session
                    }
                )
            );

            if (
                !tierProgress ||
                Number(tierProgress.completedOrders) <
                REFERRAL_REWARD_ORDERS_REQUIRED ||
                tierProgress.rewardPaid === true
            ) {
                return;
            }

            const amount = calculateReferralReward(tier);

            if (amount <= 0) {
                return;
            }

            // Only one request can flip this flag, so the reward is paid once per tier.
            const flagged = await progress.updateOne(
                {
                    _id: tierProgress._id,
                    rewardPaid: { $ne: true }
                },
                {
                    $set: {
                        rewardPaid: true,
                        rewardAmount: amount,
                        paidAt: now
                    }
                },
                { session }
            );

            if (flagged.modifiedCount !== 1) {
                return;
            }

            const before = extract(
                await users.findOneAndUpdate(
                    { _id: referrerId },
                    {
                        $inc: { balance: amount },
                        $set: { updatedAt: now }
                    },
                    {
                        returnDocument: "before",
                        projection: { balance: 1, username: 1 },
                        session
                    }
                )
            );

            if (!before) {
                throw createError("Referrer account not found.", 404);
            }

            const balanceBefore = Number(before.balance ?? 0);

            if (!Number.isFinite(balanceBefore)) {
                throw createError("Invalid referrer balance.", 500);
            }

            const balanceAfter = Math.round(
                (balanceBefore + amount + Number.EPSILON) * 100
            ) / 100;

            const transactionId =
                `RWD-${referrerId.toHexString()}-T${tier}`;

            // Wallet ledger entry (shown in Funds History as Referral Reward).
            await transactions.insertOne(
                {
                    transactionId,

                    // Unique per referrer + tier (unique index on requestId).
                    requestId: transactionId,

                    userId: referrerId,
                    username: before.username ?? null,

                    type: "referral_reward",
                    method: "wallet",

                    amount,
                    currency: "USD",

                    balanceBefore,
                    balanceAfter,

                    status: "completed",

                    referralTier: tier,
                    ordersCompleted: Number(tierProgress.completedOrders),

                    description:
                        `Referral reward: ${REFERRAL_REWARD_ORDERS_REQUIRED} completed orders (tier ${tier})`,

                    createdAt: now
                },
                { session }
            );

            // User notification (same format as the deposit notifications).
            await notifications.insertOne(
                {
                    userId: referrerId,
                    title: "Referral reward earned",
                    message:
                        `${REFERRAL_REWARD_ORDERS_REQUIRED} orders placed with your referral code are complete. $${amount.toFixed(2)} has been added to your balance.`,
                    type: "referral_reward",
                    metadata: {
                        transactionId,
                        tier,
                        amount,
                        currency: "USD"
                    },
                    read: false,
                    createdAt: now
                },
                { session }
            );

            outcome = {
                counted: true,
                rewarded: true,
                amount,
                tier,
                transactionId,
                balanceBefore,
                balanceAfter
            };
        });
    } finally {
        await session.endSession();
    }

    return outcome;
}

/**
 * Export constants for controllers/tests if needed.
 */
export const REFERRAL_RULES = Object.freeze({
    requiredOrders: REFERRAL_REQUIRED_ORDERS,
    initialDiscountPercent: REFERRAL_INITIAL_DISCOUNT,
    discountIncrementPercent: REFERRAL_DISCOUNT_INCREMENT,
    maxRedeemersPerTier: REFERRAL_MAX_REDEEMERS_PER_TIER,
    rewardOrdersRequired: REFERRAL_REWARD_ORDERS_REQUIRED,
    rewardFirstUsd: REFERRAL_REWARD_FIRST_USD,
    rewardNextUsd: REFERRAL_REWARD_NEXT_USD
});