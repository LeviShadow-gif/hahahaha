
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import ENV from "../config/env.js";

const {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET
} = ENV;

const configured = Boolean(
    CLOUDINARY_CLOUD_NAME &&
    CLOUDINARY_API_KEY &&
    CLOUDINARY_API_SECRET
);

if (configured) {
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true
    });
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence"
]);

export function isCloudinaryConfigured() {
    return configured;
}

async function normalizeImage(buffer) {
    // Decode supported formats, including HEIC/HEIF when
    // the installed Sharp/libvips build supports them.
    // Re-encode to JPEG for broad browser compatibility.
    return sharp(buffer, {
        limitInputPixels: 25_000_000,
        failOn: "error"
    })
        .rotate()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
}

export async function uploadPaymentScreenshot(
    buffer,
    mimetype
) {
    if (!configured) {
        throw new Error(
            "Cloudinary credentials are not configured."
        );
    }

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error("A valid image buffer is required.");
    }

    if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(
            "Screenshot must be 5 MB or smaller."
        );
    }

    const type = String(mimetype || "")
        .toLowerCase()
        .split(";")[0]
        .trim();

    if (!ALLOWED_TYPES.has(type)) {
        throw new Error(
            "Unsupported image type. Upload a JPEG, PNG, WebP, HEIC or HEIF image."
        );
    }

    let normalizedBuffer;

    try {
        normalizedBuffer = await normalizeImage(buffer);
    } catch (error) {
        throw new Error(
            "Could not process this image. Please upload a JPEG or PNG screenshot."
        );
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "shadowsmm/payment-screenshots",
                resource_type: "image",
                format: "jpg"
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }

                if (!result?.secure_url || !result?.public_id) {
                    return reject(
                        new Error(
                            "Cloudinary upload returned no image URL."
                        )
                    );
                }

                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    format: result.format,
                    bytes: result.bytes,
                    originalFormat: type,
                    normalizedFormat: "jpg"
                });
            }
        );

        stream.end(normalizedBuffer);
    });
}

export default cloudinary;
