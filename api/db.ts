/**
 * PostgreSQL connection pool.
 * Uses DATABASE_URL from environment.
 */

import { Pool } from "pg";

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false, // internal VPS connection — no SSL needed
    max: 10,
});
