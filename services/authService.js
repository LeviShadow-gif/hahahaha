import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

import { getUsersCollection } from "../config/db.js";

/**
 * Create a consistent service error.
 */
function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

/**
 * Validate and convert the authenticated user's ID.
 */
function getValidUserId(userId) {
    if (
        typeof userId !== "string" ||
        !ObjectId.isValid(userId) ||
        !new ObjectId(userId).equals(userId)
    ) {
        throw createError(
            "Invalid authentication. Please log in again.",
            401
        );
    }

    return new ObjectId(userId);
}

/**
 * Find an existing user by MongoDB ID.
 */
async function getUserById(userId) {
    // IMPORTANT: getUsersCollection() is async.
    // Await it before calling MongoDB collection methods.
    const users = await getUsersCollection();

    const user = await users.findOne({
        _id: userId
    });

    if (!user) {
        throw createError("User account not found.", 404);
    }

    if (typeof user.passwordHash !== "string") {
        throw createError(
            "Password verification is unavailable for this account.",
            400
        );
    }

    return { users, user };
}

/**
 * Verify the user's current password.
 */
async function verifyCurrentPassword(user, currentPassword) {
    if (
        typeof currentPassword !== "string" ||
        currentPassword.length === 0
    ) {
        throw createError("Current password is required.");
    }

    const matches = await bcrypt.compare(
        currentPassword,
        user.passwordHash
    );

    if (!matches) {
        throw createError(
            "Your current password is incorrect."
        );
    }
}

/**
 * Change the authenticated user's email address.
 *
 * @param {string} userId
 * @param {string} email
 * @param {string} currentPassword
 */
export async function changeEmail(
    userId,
    email,
    currentPassword
) {
    const mongoUserId = getValidUserId(userId);

    if (typeof email !== "string") {
        throw createError(
            "Please enter a valid email address."
        );
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (
        !normalizedEmail ||
        normalizedEmail.length > 254
    ) {
        throw createError(
            "Please enter a valid email address."
        );
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
        throw createError(
            "Please enter a valid email address."
        );
    }

    const { users, user } = await getUserById(
        mongoUserId
    );

    await verifyCurrentPassword(
        user,
        currentPassword
    );

    const existingEmail = String(user.email ?? "")
        .trim()
        .toLowerCase();

    if (existingEmail === normalizedEmail) {
        throw createError(
            "This is already your current email address."
        );
    }

    const emailAlreadyUsed = await users.findOne({
        email: normalizedEmail,
        _id: { $ne: mongoUserId }
    });

    if (emailAlreadyUsed) {
        throw createError(
            "This email address is already registered.",
            409
        );
    }

    try {
        const result = await users.updateOne(
            { _id: mongoUserId },
            {
                $set: {
                    email: normalizedEmail,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            throw createError(
                "User account not found.",
                404
            );
        }
    } catch (error) {
        if (error?.code === 11000) {
            throw createError(
                "This email address is already registered.",
                409
            );
        }

        throw error;
    }

    return {
        email: normalizedEmail
    };
}

/**
 * Change the authenticated user's password.
 *
 * @param {string} userId
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} confirmPassword
 */
export async function changePassword(
    userId,
    currentPassword,
    newPassword,
    confirmPassword
) {
    const mongoUserId = getValidUserId(userId);

    if (
        typeof newPassword !== "string" ||
        typeof confirmPassword !== "string"
    ) {
        throw createError(
            "New password and confirmation are required."
        );
    }

    if (newPassword.length < 8) {
        throw createError(
            "Your new password must contain at least 8 characters."
        );
    }

    if (
        Buffer.byteLength(newPassword, "utf8") > 72
    ) {
        throw createError(
            "Your new password exceeds the maximum supported length."
        );
    }

    if (newPassword !== confirmPassword) {
        throw createError(
            "New password and confirmation do not match."
        );
    }

    const { users, user } = await getUserById(
        mongoUserId
    );

    await verifyCurrentPassword(
        user,
        currentPassword
    );

    const sameAsCurrent = await bcrypt.compare(
        newPassword,
        user.passwordHash
    );

    if (sameAsCurrent) {
        throw createError(
            "Your new password must be different from your current password."
        );
    }

    const passwordHash = await bcrypt.hash(
        newPassword,
        12
    );

    const result = await users.updateOne(
        { _id: mongoUserId },
        {
            $set: {
                passwordHash,
                updatedAt: new Date()
            }
        }
    );

    if (result.matchedCount === 0) {
        throw createError(
            "User account not found.",
            404
        );
    }

    return {
        message: "Password updated successfully."
    };
}