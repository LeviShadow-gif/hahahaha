/**
 * ============================================================
 * ShadowDev Backend
 * MongoDB Connection
 * ============================================================
 */

import { MongoClient } from "mongodb";
import ENV from "./env.js";

/**
 * ============================================================
 * MongoDB Client
 * ============================================================
 */

const client = new MongoClient(
    ENV.MONGODB_URI,
    {
        maxPoolSize: 10,

        minPoolSize: 0,

        maxIdleTimeMS: 60000,

        waitQueueTimeoutMS: 5000,

        connectTimeoutMS: 10000,

        serverSelectionTimeoutMS: 10000,

        socketTimeoutMS: 30000,

        retryReads: true,

        retryWrites: true
    }
);

/**
 * ============================================================
 * Database State
 * ============================================================
 */

let database = null;

let connectingPromise = null;

/**
 * ============================================================
 * Connect Database
 * ============================================================
 *
 * Important:
 *
 * - Only ONE MongoClient is created.
 * - Only ONE connection attempt can run at a time.
 * - Every route reuses the same MongoClient/pool.
 * - We NEVER call client.close() during normal requests.
 *
 */

export async function connectDB() {

    /**
     * --------------------------------------------------------
     * Already Connected
     * --------------------------------------------------------
     */

    if (database) {

        return database;

    }

    /**
     * --------------------------------------------------------
     * Connection Already In Progress
     * --------------------------------------------------------
     */

    if (connectingPromise) {

        return connectingPromise;

    }

    /**
     * --------------------------------------------------------
     * Start Connection
     * --------------------------------------------------------
     */

    connectingPromise = client
        .connect()
        .then(() => {

            database =
                client.db("shadowdev");

            console.log(
                "✅ MongoDB Connected"
            );

            return database;

        })
        .catch((error) => {

            /**
             * Do not keep a rejected promise
             * stuck forever.
             */

            database = null;

            throw error;

        })
        .finally(() => {

            connectingPromise = null;

        });

    return connectingPromise;
}

/**
 * ============================================================
 * Tickets Collection
 * ============================================================
 */

export async function getTicketsCollection() {

    const db =
        await connectDB();

    return db.collection(
        "tickets"
    );
}

/**
 * ============================================================
 * Admins Collection
 * ============================================================
 */

export async function getAdminsCollection() {

    const db =
        await connectDB();

    return db.collection(
        "admins"
    );
}

/**
 * ============================================================
 * Database Health Check
 * ============================================================
 */

export async function pingDB() {

    const db =
        await connectDB();

    await db.command({
        ping: 1
    });

    return true;
}

/**
 * ============================================================
 * Graceful Shutdown
 * ============================================================
 *
 * This is ONLY called when the Node process itself shuts down.
 * It must NOT be called after every request.
 *
 */

export async function closeDB() {

    try {

        await client.close();

        database = null;

        connectingPromise = null;

        console.log(
            "🛑 MongoDB Connection Closed"
        );

    } catch (error) {

        console.error(
            "❌ MongoDB Close Error:",
            error
        );

    }

}