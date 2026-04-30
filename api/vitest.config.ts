import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
        environment: "node",
        globalSetup: ["./test/helpers/global-setup.ts"],
        setupFiles: ["./test/helpers/setup-env.ts"],
        // Forks (process isolation) keep the pg Pool from leaking between
        // worker reuses, and singleFork serializes integration tests against
        // the single shared aivibe_test_db. If we ever shard, give each fork
        // its own DB name.
        pool: "forks",
        poolOptions: { forks: { singleFork: true } },
        testTimeout: 15000,
        hookTimeout: 30000,
    },
});
