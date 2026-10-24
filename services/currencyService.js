
/**
 * ============================================================
 * ShadowSMM Backend
 * Currency Conversion Service
 * ============================================================
 *
 * Module System: ES Modules
 *
 * Purpose:
 * - Fetch the latest published USD/INR exchange rate.
 * - Validate the exchange-rate API response.
 * - Convert INR deposits into USD.
 * - Cache the rate briefly to avoid excessive API requests.
 * - Never use a hardcoded fallback rate.
 *
 * Important:
 * Exchange rates from this provider are periodically updated,
 * not guaranteed to be real-time trading prices.
 * ============================================================
 */

const EXCHANGE_RATE_API_URL =
    "https://open.er-api.com/v6/latest/USD";

const REQUEST_TIMEOUT_MS = 8000;

const CACHE_TTL_MS = 5 * 60 * 1000;

const MIN_VALID_RATE = 1;
const MAX_VALID_RATE = 1000;

const MAX_AMOUNT = 1_000_000_000;

let cachedRate = null;
let cacheExpiresAt = 0;
let requestInProgress = null;

/**
 * ============================================================
 * Custom Currency Error
 * ============================================================
 */

export class CurrencyServiceError extends Error {
    constructor(message, statusCode = 503) {
        super(message);

        this.name = "CurrencyServiceError";
        this.statusCode = statusCode;
    }
}

/**
 * ============================================================
 * Validate Monetary Amount
 * ============================================================
 */

function validateAmount(amount) {
    if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > MAX_AMOUNT
    ) {
        throw new CurrencyServiceError(
            "Amount must be a valid positive number.",
            400
        );
    }

    return amount;
}

/**
 * ============================================================
 * Validate Exchange Rate
 * ============================================================
 */

function validateRate(rate) {
    return (
        typeof rate === "number" &&
        Number.isFinite(rate) &&
        rate >= MIN_VALID_RATE &&
        rate <= MAX_VALID_RATE
    );
}

/**
 * ============================================================
 * Fetch Latest Published USD/INR Rate
 * ============================================================
 */

async function fetchLatestUsdInrRate() {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(
            EXCHANGE_RATE_API_URL,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                },
                signal: controller.signal,
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new CurrencyServiceError(
                `Exchange-rate provider returned HTTP ${response.status}.`
            );
        }

        let data;

        try {
            data = await response.json();
        } catch {
            throw new CurrencyServiceError(
                "Exchange-rate provider returned invalid JSON."
            );
        }

        if (
            !data ||
            data.result !== "success" ||
            !data.rates ||
            typeof data.rates !== "object"
        ) {
            throw new CurrencyServiceError(
                "Exchange-rate provider returned an invalid response."
            );
        }

        const rate = Number(data.rates.INR);

        if (!validateRate(rate)) {
            throw new CurrencyServiceError(
                "The USD/INR exchange rate is invalid."
            );
        }

        const providerTimestamp =
            Number(data.time_last_update_unix);

        const fetchedAt = new Date().toISOString();

        return {
            baseCurrency: "USD",
            quoteCurrency: "INR",
            rate,
            source: "open.er-api.com",
            fetchedAt,
            providerUpdatedAt:
                Number.isFinite(providerTimestamp) &&
                providerTimestamp > 0
                    ? new Date(
                        providerTimestamp * 1000
                    ).toISOString()
                    : null
        };
    } catch (error) {
        if (error instanceof CurrencyServiceError) {
            throw error;
        }

        if (error.name === "AbortError") {
            throw new CurrencyServiceError(
                "Exchange-rate request timed out."
            );
        }

        throw new CurrencyServiceError(
            "Unable to fetch the USD/INR exchange rate."
        );
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * ============================================================
 * Get USD/INR Rate
 * ============================================================
 *
 * Returns how many INR equal 1 USD.
 *
 * Example:
 * rate = 90
 * Means:
 * 1 USD = 90 INR
 *
 * A cached rate is reused only while its cache is valid.
 * Failed refreshes do not silently return an expired rate.
 * ============================================================
 */

export async function getUsdInrRate({
    forceRefresh = false
} = {}) {
    if (
        !forceRefresh &&
        cachedRate &&
        Date.now() < cacheExpiresAt
    ) {
        return {
            ...cachedRate,
            cached: true
        };
    }

    // Share a single provider request between concurrent callers.
    if (requestInProgress) {
        const result = await requestInProgress;

        return {
            ...result,
            cached: true
        };
    }

    requestInProgress = fetchLatestUsdInrRate();

    try {
        const result = await requestInProgress;

        cachedRate = result;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;

        return {
            ...result,
            cached: false
        };
    } finally {
        requestInProgress = null;
    }
}

/**
 * ============================================================
 * Convert INR To USD
 * ============================================================
 *
 * Formula:
 *
 * USD = INR / (INR per USD)
 *
 * The returned USD amount is rounded to 2 decimal places.
 * The exchange rate used for the conversion is returned too,
 * so the caller can save it in transaction history.
 * ============================================================
 */

export async function convertInrToUsd(
    inrAmount,
    options = {}
) {
    const amount = validateAmount(inrAmount);

    const exchange = await getUsdInrRate(options);

    const unroundedUsd =
        amount / exchange.rate;

    const usdAmount =
        Math.round(
            (unroundedUsd + Number.EPSILON) * 100
        ) / 100;

    if (
        !Number.isFinite(usdAmount) ||
        usdAmount <= 0
    ) {
        throw new CurrencyServiceError(
            "Unable to calculate the USD amount."
        );
    }

    return {
        originalAmount: amount,
        originalCurrency: "INR",
        convertedAmount: usdAmount,
        convertedCurrency: "USD",
        exchangeRate: exchange.rate,
        rateSource: exchange.source,
        rateFetchedAt: exchange.fetchedAt,
        providerUpdatedAt: exchange.providerUpdatedAt,
        rateWasCached: exchange.cached
    };
}

/**
 * ============================================================
 * Convert USD To INR
 * ============================================================
 *
 * Useful for displaying the approximate INR equivalent.
 * Does not modify any user balance.
 * ============================================================
 */

export async function convertUsdToInr(
    usdAmount,
    options = {}
) {
    const amount = validateAmount(usdAmount);

    const exchange = await getUsdInrRate(options);

    const inrAmount =
        Math.round(
            (amount * exchange.rate + Number.EPSILON) * 100
        ) / 100;

    return {
        originalAmount: amount,
        originalCurrency: "USD",
        convertedAmount: inrAmount,
        convertedCurrency: "INR",
        exchangeRate: exchange.rate,
        rateSource: exchange.source,
        rateFetchedAt: exchange.fetchedAt,
        providerUpdatedAt: exchange.providerUpdatedAt,
        rateWasCached: exchange.cached
    };
}

/**
 * ============================================================
 * Clear Exchange Rate Cache
 * ============================================================
 *
 * Can be used for testing or to request a fresh rate next time.
 * ============================================================
 */

export function clearCurrencyCache() {
    cachedRate = null;
    cacheExpiresAt = 0;
}

/**
 * ============================================================
 * Default Export
 * ============================================================
 */

export default {
    getUsdInrRate,
    convertInrToUsd,
    convertUsdToInr,
    clearCurrencyCache
};