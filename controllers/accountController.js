import {
    changeEmail,
    changePassword
} from "../services/authService.js";

/**
 * Get the authenticated user's MongoDB ID from the JWT payload.
 */
function getAuthenticatedUserId(req) {
    const userId =
        req.user?.sub ??
        req.user?.userId ??
        req.user?.id;

    if (
        userId === undefined ||
        userId === null ||
        !String(userId).trim()
    ) {
        return null;
    }

    return String(userId).trim();
}

/**
 * Send a consistent error response.
 */
function sendError(res, statusCode, message) {
    return res.status(statusCode).json({
        success: false,
        message
    });
}

/**
 * Handle errors returned by authService.js.
 */
function handleServiceError(res, error, operation) {
    if (error?.code === 11000) {
        return sendError(
            res,
            409,
            "This email address is already registered."
        );
    }

    if (error?.statusCode) {
        return sendError(
            res,
            error.statusCode,
            error.message
        );
    }

    console.error(`${operation} error:`, error);

    const message =
        operation === "Update email"
            ? "Unable to update your email right now. Please try again later."
            : "Unable to update your password right now. Please try again later.";

    return sendError(res, 500, message);
}

/**
 * Update the authenticated user's email.
 *
 * PATCH /api/account/email
 *
 * Required request body:
 * {
 *   "email": "new@example.com",
 *   "currentPassword": "your-current-password"
 * }
 */
export async function updateEmail(req, res) {
    try {
        const userId = getAuthenticatedUserId(req);

        if (!userId) {
            return sendError(
                res,
                401,
                "Invalid authentication. Please log in again."
            );
        }

        const email =
            typeof req.body?.email === "string"
                ? req.body.email
                : "";

        const currentPassword =
            typeof req.body?.currentPassword === "string"
                ? req.body.currentPassword
                : "";

        if (!email.trim() || !currentPassword) {
            return sendError(
                res,
                400,
                "Email and current password are required."
            );
        }

        const updatedUser = await changeEmail(
            userId,
            email,
            currentPassword
        );

        return res.status(200).json({
            success: true,
            message: "Email address updated successfully.",
            user: {
                email: updatedUser.email
            }
        });
    } catch (error) {
        return handleServiceError(
            res,
            error,
            "Update email"
        );
    }
}

/**
 * Update the authenticated user's password.
 *
 * PATCH /api/account/password
 *
 * Required request body:
 * {
 *   "currentPassword": "old-password",
 *   "newPassword": "new-password",
 *   "confirmPassword": "new-password"
 * }
 */
export async function updatePassword(req, res) {
    try {
        const userId = getAuthenticatedUserId(req);

        if (!userId) {
            return sendError(
                res,
                401,
                "Invalid authentication. Please log in again."
            );
        }

        const currentPassword =
            typeof req.body?.currentPassword === "string"
                ? req.body.currentPassword
                : "";

        const newPassword =
            typeof req.body?.newPassword === "string"
                ? req.body.newPassword
                : "";

        const confirmPassword =
            typeof req.body?.confirmPassword === "string"
                ? req.body.confirmPassword
                : "";

        if (
            !currentPassword ||
            !newPassword ||
            !confirmPassword
        ) {
            return sendError(
                res,
                400,
                "Current password, new password and confirmation are required."
            );
        }

        const result = await changePassword(
            userId,
            currentPassword,
            newPassword,
            confirmPassword
        );

        return res.status(200).json({
            success: true,
            message:
                result?.message ||
                "Password updated successfully."
        });
    } catch (error) {
        return handleServiceError(
            res,
            error,
            "Update password"
        );
    }
}