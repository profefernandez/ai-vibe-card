/**
 * PostgreSQL connection pool.
 * Uses DATABASE_URL from environment.
 * Set DB_SSL=true to enable TLS (needed when DB is on a different machine).
 */

import { Pool } from "pg";

const useSSL = process.env.DB_SSL === "true";

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    max: 10,
});
