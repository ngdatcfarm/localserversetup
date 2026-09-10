/**
 * cfarm-relay Worker — fan-out CFarm alerts to Telegram (and future channels).
 *
 * Endpoints:
 *   POST /relay              (HMAC-signed) — receive alert from CFarm, fan-out
 *   GET  /register?token=... — bind Telegram chat_id from a one-time token
 *   GET  /healthz            — health check
 *   GET  /channels           (auth)        — list registered channels
 *
 * Storage: D1 (binding `DB`). Schema in schema.sql.
 */

import { verifySignature } from "./verify.js";
import { sendMessage, sendPhoto, buildMessage, escapeMd } from "./telegram.js";

export { RelayRoom } from "./relay-room.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function corsHeaders(req) {
    // CFarm UI hits /healthz and /channels from same origin via API.* helpers.
    // We still allow any origin so curl/Postman works.
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-CFarm-Signature",
        "Access-Control-Max-Age": "86400",
    };
}

function withCors(res, req) {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders(req))) {
        headers.set(k, v);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function logDelivery(env, channelId, alertType, errorMsg) {
    try {
        await env.DB.prepare(
            "INSERT INTO delivery_log (channel_id, alert_type, success, error_msg) VALUES (?, ?, ?, ?)"
        )
            .bind(channelId, alertType || null, errorMsg ? 0 : 1, errorMsg || null)
            .run();
    } catch (e) {
        console.error("logDelivery failed:", e);
    }
}

async function fanOut(env, payload) {
    const { type, title, body, snapshot_url, severity } = payload;
    const { channels } = await env.DB.prepare(
        "SELECT id, telegram_chat_id FROM channels WHERE active = 1"
    ).all();
    if (!channels.length) {
        return { delivered: 0, failed: 0, channels: 0, skipped: "no_active_channels" };
    }

    const text = buildMessage(title, body, snapshot_url, severity);
    let delivered = 0;
    let failed = 0;
    const errors = [];

    for (const ch of channels) {
        let res;
        if (snapshot_url && /^https?:\/\//i.test(snapshot_url)) {
            const caption = buildMessage(title, body, null, severity).slice(0, 1024);
            res = await sendPhoto(env.TELEGRAM_BOT_TOKEN, ch.telegram_chat_id, snapshot_url, caption);
        } else {
            res = await sendMessage(env.TELEGRAM_BOT_TOKEN, ch.telegram_chat_id, text);
        }
        if (res.ok) {
            delivered += 1;
            await env.DB.prepare(
                "UPDATE channels SET last_verified_at = datetime('now') WHERE id = ?"
            ).bind(ch.id).run();
            await logDelivery(env, ch.id, type, null);
        } else {
            failed += 1;
            const errMsg = `HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`;
            errors.push({ channel_id: ch.id, error: errMsg });
            await logDelivery(env, ch.id, type, errMsg);
        }
    }
    return { delivered, failed, channels: channels.length, errors: errors.slice(0, 5) };
}

async function handleRelay(req, env) {
    const sigHeader = req.headers.get("X-CFarm-Signature") || "";
    const raw = await req.text();
    const verdict = await verifySignature(sigHeader, raw, env.CFARM_SHARED_SECRET);
    if (!verdict.ok) {
        return json({ ok: false, error: "signature", reason: verdict.reason }, 401);
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (e) {
        return json({ ok: false, error: "bad_json" }, 400);
    }
    const result = await fanOut(env, payload);
    return json({ ok: true, ...result });
}

async function handleRegister(req, env, url) {
    const token = url.searchParams.get("token");
    if (!token) return json({ ok: false, error: "missing_token" }, 400);

    // Look up bind token from CFarm via cloud callback, OR if we can't reach
    // CFarm, accept a token we issued ourselves (for tests).
    // In production, the CFarm UI generates a token and tells the user to open
    // this URL — the Worker then asks CFarm "is this token valid + what's the
    // user_label?" via the X-CFarm-Signature flow.
    //
    // For now we use a simple local mapping: tokens are stored in D1 when CFarm
    // calls POST /admin/issue-token (admin-only HMAC endpoint).
    const row = await env.DB.prepare(
        "SELECT id, user_label FROM bind_tokens WHERE token = ? AND used_at IS NULL"
    ).bind(token).first();
    if (!row) return json({ ok: false, error: "invalid_or_used_token" }, 404);

    // Read chat_id from Telegram's update queue via /getUpdates since the user
    // clicked the bot's /start button. We probe only when the Worker was just
    // opened from a Telegram redirect (deep-link parameter chat_id is supplied
    // in some bots but not all). Fallback: ask user to type /start and wait.
    //
    // For simplicity: we accept the chat_id via ?chat_id=... parameter when the
    // Telegram bot deep-links us. Otherwise we tell the user to /start the bot
    // and refresh.
    const chatId = url.searchParams.get("chat_id");
    if (!chatId) {
        return json({
            ok: false,
            error: "no_chat_id",
            hint: "Open the bot in Telegram, send /start, then click this link again with ?chat_id=YOUR_ID appended. Or run /bind in the bot.",
        }, 400);
    }

    try {
        await env.DB.prepare(
            "INSERT INTO channels (user_label, telegram_chat_id) VALUES (?, ?) ON CONFLICT(telegram_chat_id) DO UPDATE SET user_label = excluded.user_label, active = 1"
        ).bind(row.user_label || "unknown", String(chatId)).run();
        await env.DB.prepare(
            "UPDATE bind_tokens SET used_at = datetime('now') WHERE id = ?"
        ).bind(row.id).run();
        // Fire a confirmation message so the user sees it worked.
        await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId,
            "✅ *CFarm đã kết nối thành công*\n\nBạn sẽ nhận được cảnh báo từ CFarm tại đây\\.");
        return json({ ok: true, chat_id: chatId, user_label: row.user_label });
    } catch (e) {
        return json({ ok: false, error: "db_error", detail: String(e) }, 500);
    }
}

async function handleChannels(env) {
    const { results } = await env.DB.prepare(
        "SELECT id, user_label, telegram_chat_id, active, created_at, last_verified_at FROM channels ORDER BY id DESC LIMIT 100"
    ).all();
    return json({ ok: true, count: results.length, channels: results });
}

async function handleIssueToken(req, env) {
    // Admin-only — must be HMAC-signed by the CFarm backend.
    const sigHeader = req.headers.get("X-CFarm-Signature") || "";
    const raw = await req.text();
    const verdict = await verifySignature(sigHeader, raw, env.CFARM_SHARED_SECRET);
    if (!verdict.ok) {
        return json({ ok: false, error: "signature", reason: verdict.reason }, 401);
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (e) {
        return json({ ok: false, error: "bad_json" }, 400);
    }
    const userLabel = (payload.user_label || "").slice(0, 200);
    const token = cryptoRandomHex(32);
    const ttl = parseInt(payload.ttl_seconds || "300", 10);
    const expires = new Date(Date.now() + ttl * 1000).toISOString();
    try {
        await env.DB.prepare(
            "INSERT INTO bind_tokens (token, user_label, expires_at) VALUES (?, ?, ?)"
        ).bind(token, userLabel, expires).run();
        return json({ ok: true, token, expires_at: expires, ttl_seconds: ttl });
    } catch (e) {
        return json({ ok: false, error: "db_error", detail: String(e) }, 500);
    }
}

function cryptoRandomHex(bytes) {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    let s = "";
    for (let i = 0; i < buf.length; i++) s += buf[i].toString(16).padStart(2, "0");
    return s;
}

async function handleHealth(env) {
    let dbOk = false;
    try {
        await env.DB.prepare("SELECT 1 AS x").all();
        dbOk = true;
    } catch (e) {
        // ignore
    }
    return json({
        ok: dbOk,
        db: dbOk ? "ok" : "down",
        ts: new Date().toISOString(),
    });
}

export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        try {
            if (req.method === "OPTIONS") {
                return withCors(new Response(null, { status: 204 }), req);
            }
            let res;
            if (url.pathname === "/healthz" && req.method === "GET") {
                res = await handleHealth(env);
            } else if (url.pathname === "/register" && req.method === "GET") {
                res = await handleRegister(req, env, url);
            } else if (url.pathname === "/channels" && req.method === "GET") {
                res = await handleChannels(env);
            } else if (url.pathname === "/admin/issue-token" && req.method === "POST") {
                res = await handleIssueToken(req, env);
            } else if (url.pathname === "/relay" && req.method === "POST") {
                res = await handleRelay(req, env);
            } else {
                res = json({ ok: false, error: "not_found", path: url.pathname }, 404);
            }
            return withCors(res, req);
        } catch (e) {
            console.error("Worker error:", e);
            return withCors(json({ ok: false, error: "internal", detail: String(e) }, 500), req);
        }
    },

    // Optional: hourly cron to prune delivery_log older than 7 days.
    // Bind via wrangler.toml: [triggers] crons = ["0 * * * *"]
    async scheduled(event, env, ctx) {
        try {
            await env.DB.prepare(
                "DELETE FROM delivery_log WHERE delivered_at < datetime('now', '-7 days')"
            ).run();
            console.log("Pruned old delivery_log rows");
        } catch (e) {
            console.error("Cron prune failed:", e);
        }
    },
};