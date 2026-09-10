# CFarm Remote Terminal

A browser-accessible shell for CFarm — opens a `cmd.exe` session on the
server through any HTTPS connection (Cloudflare tunnel included). Designed
for **remote work**: admin can debug, check logs, and even chat with
Claude Code from a phone or outside-network laptop.

> Public URL: `https://quanly.doihong.io.vn/terminal`
> Local URL:  `http://localhost:8002/terminal`

---

## What's running here

```
Browser (xterm.js)                                 Windows server (CFarm)
───────────────────                                ──────────────────────
 HTTPS / WSS  ────►  Cloudflare tunnel  ────►  FastAPI :8002  ────►  pywinpty ConPTY
                                                       │
                                                  cmd.exe (per tab)
                                                  Process tree killed
                                                  on disconnect.
```

- **Per-tab session** — closing the tab kills the process tree.
- **Default shell** — `cmd.exe` (Windows full shell). Override with
  `?shell=powershell` or any executable name.
- **No state survives reconnect** — kill-and-respawn by design.

---

## Security

`/terminal` is admin-debug tooling — anyone who can reach it has a full
shell on the server. Three independent gates are applied on every
request:

| Gate | Check | Failure response |
|---|---|---|
| **Session cookie** | `cfarm_session` must be valid (signed, not expired). | HTTP 401 / WS close 4401 |
| **Admin role** | Token payload must include `role: "admin"`. Regular users are rejected. | HTTP 403 / WS close 4403 |
| **Origin header** | WS upgrade must come from `localhost`, `quanly.doihong.io.vn`, or `www.quanly.doihong.io.vn`. Custom hosts via `TERMINAL_ALLOWED_ORIGINS` env var (comma-separated). | HTTP 403 / WS close 4403 |
| **Shell whitelist** | Only `cmd.exe` accepted via `?shell=`. `powershell.exe`, `calc.exe`, full path to any other binary are all rejected. Users wanting PowerShell type `powershell` once inside the shell. | HTTP 403 / WS close 4403 |

### Why each gate matters

- **Cookie alone** is not enough — a stolen session cookie from a
  regular user could be used to open a shell if we didn't check role.
- **Role alone** is not enough — a logged-in admin browsing a malicious
  page that fires an XHR to `/terminal/ws` would have the cookie
  auto-attached. The Origin check stops that.
- **Shell whitelist** stops URL injection like
  `?shell=C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe;-enc BASE64`.
  Even with admin + right origin, only `cmd.exe` will spawn.

### Other mitigation

| Concern | Mitigation |
|---|---|
| Cookie theft over network | `Secure` flag off by default; set `CFARM_COOKIE_SECURE=1` in `.env` when behind HTTPS. |
| Resource exhaustion | Each tab spawns exactly one `cmd.exe`. Killed on disconnect (`taskkill /F /T /PID`). No idle session retention. |
| Process escape | Sessions run under the same user the CFarm server runs as. Limited by Windows ACLs. |
| Error message leakage | Spawn failures return a generic Vietnamese message; the full exception goes to the server log only. |

---

## Running Claude Code from the browser terminal

Once `/terminal` is open, type:

```
claude
```

Claude Code is interactive and uses TUI-style full-screen rendering.
xterm.js renders this correctly. Things to expect:

- **Prompt rendering** — Claude Code clears the screen, draws the
  prompt header, and uses alt-buffer mode. xterm.js handles this.
- **Copy/paste** — `Ctrl+Shift+C` / `Ctrl+Shift+V` (browser default),
  or right-click → copy/paste.
- **Mobile** — works with on-screen keyboards. Pinch-zoom is enabled
  by the viewport meta tag, but expect to scroll rather than type tiny
  commands.
- **Long output** — scrollback is 5000 lines; older output auto-trims
  but stays accessible via the scrollback buffer (`Shift+PageUp`).

---

## API

### `GET /terminal`

Renders the xterm.js HTML page.

- **Auth**: required (`cfarm_session` cookie). Returns `401` without.
- **Response**: `200 text/html`. Loads:
  - `/static/vendor/xterm/xterm.js`
  - `/static/vendor/xterm/xterm.css`
  - `/static/vendor/xterm/xterm-addon-fit.js`
  - `/static/vendor/xterm/xterm-addon-web-links.js`

### `WS /terminal/ws`

PTY bridge.

- **Auth**: required. WS handshake without a valid `cfarm_session`
  cookie returns HTTP `403` from the upgrade request (no socket upgrade).
- **Query params**:
  - `shell` (optional) — shell executable. Defaults to `cmd.exe`.
    Override via `CFARM_TERMINAL_SHELL` env var on the server.

**Client → server messages** (text frames):

- Raw text — forwarded to the shell as if typed at the keyboard.
  Send `\r\n` (or `\r`) for "Enter".
- `{"type":"resize","cols":120,"rows":30}` — resize the PTY.
  Sent automatically by xterm.js's `FitAddon` whenever the layout
  changes.
- `{"type":"signal","name":"ctrl_c"}` — send Ctrl+C (ETX, `\x03`).
- `{"type":"signal","name":"ctrl_d"}` — send Ctrl+D (EOT, `\x04`).
- `{"type":"ping"}` — receive `{"type":"pong"}`.

**Server → client messages** (text frames):

- Raw bytes — whatever the shell wrote to the terminal, including
  ANSI escape codes. xterm.js renders these.
- `{"type":"error","message":"..."}` — startup or runtime error.

**Lifecycle**: server closes the socket when the shell process exits
(normal close) or with custom close codes:

- `4401` — auth failed / expired session
- `4400` — couldn't spawn the shell (e.g. pywinpty missing)

---

## Architecture notes

### Process model

The PTY is a synchronous API (pywinpty). We bridge it to asyncio via:

1. A **reader thread** per session calls `proc.read(1024)` in a loop
   and pushes strings onto a `queue.Queue` (sync).
2. After every put, the reader thread calls
   `loop.call_soon_threadsafe(drain_cb)`. The drain callback is a
   closure scheduled on the asyncio loop that copies the sync queue
   onto an `asyncio.Queue`.
3. A `writer_task` reads from the asyncio queue and pushes each chunk
   to the WS as a text frame.

This gives us zero-latency I/O passthrough (the WS isn't gated on the
read loop), no missed bytes, and a single asyncio task per session
that we can cancel cleanly on disconnect.

### Resize semantics

xterm.js's `FitAddon` recomputes cols/rows whenever the container
sizes change (window resize, mobile rotation, on-screen keyboard
show/hide) and sends `{"type":"resize",...}`. We pass these to
`proc.setwinsize(rows, cols)`. ConPTY then reflows its output buffer
accordingly.

### Cleanup on disconnect

When the WS closes (client side or server side), we:

1. Cancel `writer_task`.
2. Call `proc.terminate(force=True)` — ConPTY exit.
3. Run `taskkill /F /T /PID <pid>` as a belt-and-braces step in case
   ConPTY didn't tear down its child `cmd.exe`.
4. Join the reader thread (2-second cap).
5. Close the WS from our side.

Because we kill by PID and walk the process tree, even runaway child
processes spawned by the user's shell get cleaned up.

---

## Files added/modified

| File | Purpose |
|---|---|
| `src/server/terminal_manager.py` | PTY session spawner (pywinpty). Stateless. |
| `src/server/routes/terminal.py` | `/terminal` (HTML) + `/terminal/ws` (PTY bridge). |
| `src/server/templates/terminal.html` | xterm.js frontend. Mobile-friendly. |
| `src/server/main.py` | Mounts `terminal_router`. |
| `static/vendor/xterm/` | Vendored xterm.js v5.5.0 + addons (fit, web-links). |
| `requirements.txt` | `pywinpty==3.0.5` (Windows-only marker). |

## Operational checklist

- [x] `pip install pywinpty` (Windows-only env marker in `requirements.txt`).
- [x] Vendor xterm.js — done in this commit, no CDN at runtime.
- [x] Cloudflare routes `quanly.doihong.io.vn` to `localhost:8002`
      already (token-based tunnel). No Cloudflare config changes
      needed.
- [x] Open-route list in `CLAUDE.md` is **not** updated — `/terminal`
      is intentionally auth-gated.

## Known limitations

- **Single user at a time per tab is fine, but multiple users at once
  share the same server-side rights** — anyone authenticated can spawn
  cmd.exe. That's expected: this is admin-debug tooling.
- **PowerShell won't render Unicode box characters well** by default
  in xterm.js unless we set `unicode: true`. Cmd.exe is fine for
  Latin-1.
- **No scrollback persistence** — by design, but disconnects wipe
  history. Long log dumps require piping to a file.
- **No paste-mode escape** — pasting large blocks into a TUI app that
  doesn't expect it (vim in normal mode, top, etc.) can break the TUI.
  Either run in a shell that supports bracketed paste (Windows
  Terminal-style) or use `--enable-bracketed-paste` equivalent where
  supported.
