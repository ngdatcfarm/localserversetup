/**
 * HMAC signature verification — shared with CFarm backend.
 *
 * Format: X-CFarm-Signature: t=<unix_ts>,v1=<hex_hmac_sha256>
 * Signed payload: `${ts}.${raw_body}` using HMAC-SHA256 with shared secret.
 * Window: 5 minutes (configurable via HMAC_WINDOW_SECONDS env var).
 */

const enc = new TextEncoder();

function timingSafeEqualHex(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

function hex(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).padStart(2, "0");
    }
    return s;
}

export async function verifySignature(headerValue, rawBody, secret, nowSeconds) {
    if (!headerValue || !secret) return { ok: false, reason: "missing" };
    const parts = Object.fromEntries(
        headerValue.split(",").map(p => p.split("=", 2)).map(([k, v]) => [k.trim(), v.trim()])
    );
    const ts = parts["t"];
    const sig = parts["v1"];
    if (!ts || !sig) return { ok: false, reason: "format" };

    const tsNum = parseInt(ts, 10);
    if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_ts" };

    const window = parseInt(global.env?.HMAC_WINDOW_SECONDS || "300", 10);
    const drift = Math.abs((nowSeconds ?? Math.floor(Date.now() / 1000)) - tsNum);
    if (drift > window) return { ok: false, reason: "expired" };

    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${rawBody}`));
    const expected = hex(sigBuf);
    if (!timingSafeEqualHex(expected, sig)) return { ok: false, reason: "bad_sig" };

    return { ok: true };
}

export async function signPayload(rawBody, secret, ts) {
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${rawBody}`));
    return hex(sigBuf);
}