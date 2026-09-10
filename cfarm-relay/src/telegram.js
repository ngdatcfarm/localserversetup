/**
 * Telegram Bot API wrapper.
 * Uses Cloudflare's global `fetch` (no SDK needed).
 *
 * sendMessage: https://core.telegram.org/bots/api#sendmessage
 * sendPhoto:   https://core.telegram.org/bots/api#sendphoto
 */

const API_BASE = "https://api.telegram.org";

function apiUrl(token, method) {
    return `${API_BASE}/bot${token}/${method}`;
}

export async function sendMessage(token, chatId, text, opts = {}) {
    const body = {
        chat_id: String(chatId),
        text,
        parse_mode: opts.parse_mode || "MarkdownV2",
        disable_web_page_preview: opts.disable_web_page_preview ?? false,
    };
    if (opts.silent) body.disable_notification = true;
    const res = await fetch(apiUrl(token, "sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok === true, status: res.status, data };
}

export async function sendPhoto(token, chatId, photoUrl, caption, opts = {}) {
    const body = {
        chat_id: String(chatId),
        photo: photoUrl,
        parse_mode: opts.parse_mode || "MarkdownV2",
    };
    if (caption) body.caption = caption;
    if (opts.silent) body.disable_notification = true;
    const res = await fetch(apiUrl(token, "sendPhoto"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok === true, status: res.status, data };
}

/**
 * Escape user text for MarkdownV2 — chars that MUST be escaped per Telegram spec.
 * https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMd(text) {
    if (!text) return "";
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/**
 * Convert plain text into a MarkdownV2-safe body. Use ONLY for fields we author
 * ourselves (titles, captions). For user-supplied bodies, escape() first.
 */
export function buildMessage(title, body, snapshotUrl, severity) {
    const icon = { danger: "🔴", warning: "🟡", info: "🔵" }[severity] || "⚪";
    const safeTitle = escapeMd(title || "CFarm");
    const safeBody = escapeMd((body || "").slice(0, 1500));
    let out = `${icon} *${safeTitle}*\n\n${safeBody}`;
    if (snapshotUrl) {
        out += `\n\n📷 [Snapshot](${snapshotUrl})`;
    }
    return out;
}