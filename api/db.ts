/**
 * PostgreSQL connection pool.
 * Uses DATABASE_URL from environment.
 * Set DB_SSL=true to enable TLS (needed when DB is on a different machine).
 */

import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

const useSSL = process.env.DB_SSL === "true";
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSSL ? { rejectUnauthorized } : false,
    max: 10,
});
