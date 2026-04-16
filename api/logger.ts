import pino from "pino";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL ?? (isProd ? "info" : "debug");

export const logger = pino({
    level,
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            'req.body.password',
            'req.body.token',
            'req.body.api_key',
            '*.password',
            '*.token',
            '*.api_key',
            '*.apiKey',
            '*.secret',
        ],
        censor: "[REDACTED]",
    },
    ...(isProd
        ? {}
        : {
              transport: {
                  target: "pino-pretty",
                  options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
              },
          }),
});
