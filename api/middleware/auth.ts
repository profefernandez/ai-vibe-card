/**
 * JWT authentication middleware.
 * Verifies the Bearer token from the Authorization header.
 * Attaches the decoded user payload to req.user.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
    user?: { id: string; email: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
            sub: string;
            email: string;
        };
        req.user = { id: payload.sub, email: payload.email };
        next();
    } catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}
