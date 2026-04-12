/**
 * Input sanitisation + output filtering for AI-facing endpoints.
 *
 * Server-side defence-in-depth: the LLM's in-prompt rules are a second layer,
 * but these checks run before any text reaches the model.
 */

/** Maximum user message length sent to the LLM. */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Patterns that strongly indicate a prompt-injection attempt.
 * Case-insensitive, tested against the trimmed message.
 */
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/i,
    /disregard\s+(all\s+)?(previous|prior|above)/i,
    /you\s+are\s+now\s+(a|an|the)\b/i,
    /^system\s*:/im,
    /\bact\s+as\s+(if\s+)?(you\s+)?(are|were|have)\b/i,
    /pretend\s+(you\s+)?(are|were|have)\b/i,
    /reveal\s+(the\s+)?(system\s+)?prompt/i,
    /show\s+(me\s+)?(your|the)\s+(system|initial)\s+(prompt|instructions)/i,
    /what\s+(are|is)\s+(your\s+)?(system|initial)\s+(prompt|instructions)/i,
    /\bDAN\b.*\bjailbreak\b/i,
    /do\s+anything\s+now/i,
];

/**
 * Strip control characters (except newline / tab) from user input.
 * Prevents unicode-based prompt obfuscation.
 */
function stripControlChars(text: string): string {
    // Keep \n (0x0A) and \t (0x09), strip everything else ≤ 0x1F plus DEL (0x7F)
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

export interface SanitizeResult {
    /** Cleaned message (safe to pass to LLM). */
    text: string;
    /** True if a likely injection pattern was detected. */
    blocked: boolean;
    /** Reason text if blocked. */
    reason?: string;
}

/** Sanitise user input before it reaches the LLM. */
export function sanitiseInput(raw: string): SanitizeResult {
    let text = stripControlChars(raw).trim();

    if (text.length > MAX_MESSAGE_LENGTH) {
        text = text.slice(0, MAX_MESSAGE_LENGTH);
    }

    for (const pat of INJECTION_PATTERNS) {
        if (pat.test(text)) {
            return {
                text,
                blocked: true,
                reason: "Your message was flagged by our safety filters. Please rephrase your question.",
            };
        }
    }

    return { text, blocked: false };
}

/**
 * Light output filter — strip any accidental leakage of system prompt
 * markers or known sensitive prefixes from the AI response before
 * sending it to the client.
 */
export function filterOutput(response: string): string {
    return response
        .replace(/\[SECURITY —[^\]]*\]/g, "")
        .replace(/\[SAFETY PROTOCOL[^\]]*\]/g, "")
        .replace(/\[Latest website content\]/g, "")
        .replace(/\[Visitor question\]/g, "")
        .trim();
}
