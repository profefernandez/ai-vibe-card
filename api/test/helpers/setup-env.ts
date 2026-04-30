/**
 * Vitest setupFiles entry — runs in EVERY worker before any test imports.
 * Pins NODE_ENV=test and supplies fixture secrets so `validateEnv()` in
 * api/index.ts passes without a real .env file. Real values from the
 * shell or .env.test (if loaded) win over these defaults.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-chars-long-for-vitest";
process.env.ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.FEEDBACK_HMAC_SECRET ??= "test-feedback-hmac-secret-at-least-32-chars-vitest";
process.env.CORS_ORIGINS ??= "http://localhost:8080";
process.env.DB_SSL ??= "false";
process.env.DATABASE_URL ??= "postgresql://aivibe_user:password@127.0.0.1:5432/aivibe_test_db";
