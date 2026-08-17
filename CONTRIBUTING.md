# Developer Notes

## Architecture

```
Claude Code hook fires
       │
       ▼
~/.claude/notify.js reads JSON from stdin
       │  extracts notification_type / hook_event_name + message
       ▼
writes {"event":"...", "text":"..."} to $TMPDIR/claude-notify
       │
       ▼
Extension watches the file (fs.watch + an independent poll)
       │  reads and clears the file immediately
       │  filters by the user's notification settings
       ▼
VS Code popup + system banner + sound
```

**Key files:**

| File | Purpose |
|---|---|
| `extension.js` | Entry point — wires everything to the VS Code API |
| `lib/notification-controller.js` | Decides what the user sees for a given trigger payload |
| `lib/trigger-watcher.js` | Self-healing watcher over the trigger file |
| `lib/system-notification.js` | Sound and OS banners per platform |
| `lib/host-app.js` | Works out which editor the extension host runs inside |
| `lib/hook-installer.js` | Installs and repairs `notify.js` and the hook config |
| `lib/diagnostics.js` | Backs the *Diagnose Notifications* command |
| `lib/payload.js` | Pure functions: parse trigger file, match event names |
| `hooks/notify.js` | Claude Code hook script — reads stdin, writes trigger file |

### Two behaviours worth knowing

**Popups are fire-and-forget.** The extension never waits for the user to click a
popup before handling the next event. An earlier version did, which meant an
unacknowledged popup silenced every later notification until VS Code was restarted.

**The trigger file is cleared as soon as it is read.** With several VS Code windows
open, whichever window reads first wins, so a single event produces one popup rather
than one per window.

**Banners are posted under the editor's own identity.** The bundle identifier is read
from the running application at activation, so VS Code, Insiders, VSCodium and Cursor
each post as themselves rather than as the delivery tool. Only `terminal-notifier`
can honour this; the `osascript` fallback always posts as Script Editor.

## Hook Payload Format

Claude Code sends a JSON object to hook stdin. `notify.js` extracts:

- `notification_type` (or `hook_event_name` for lifecycle events) → event name
- `message` → human-readable text shown in the notification

Output written to `$TMPDIR/claude-notify`:

```json
{"event": "permission_prompt", "text": "Allow Bash command?"}
```

## Hook Configuration

The extension auto-installs this into `~/.claude/settings.json` on activation, and
repairs it whenever the stored command drifts from what the extension ships:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|elicitation_dialog|idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/notify.js\" # claude-code-notifier"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/notify.js\" # claude-code-notifier"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"~/.claude/notify.js\" # claude-code-notifier"
          }
        ]
      }
    ]
  }
}
```

A finished subagent is reported through the top-level `SubagentStop` event, **not**
as a `Notification` matcher value. Putting `subagent_stop` in the matcher string
matches nothing.

### Which event actually means "Claude is done"

`Stop`, and only `Stop`. It is raised by the part of Claude Code that runs the
conversation, so it arrives no matter where Claude Code is running: a terminal, the
editor panel, or the web app. It carries no wording of its own, so `notify.js`
supplies the text.

`idle_prompt` looks like the obvious candidate and is not. It comes from the terminal
interface, so it never arrives at all when Claude Code runs in an editor panel, which
is the whole of issue #14. Even in a terminal it is hard to trigger on purpose: it waits
sixty seconds, and it is cancelled if you touch the keyboard, if a dialog is open, or
if a scheduled wake-up is pending. In a real terminal session, idle for nineteen
minutes, it never fired once. It stays registered as a harmless extra nudge for
someone who walks away, and it is never relied on.

Two more things worth knowing before wiring up a new event:

- Claude's own multiple-choice question box emits nothing. `elicitation_dialog` sounds
  like it covers it but only fires for questions coming from MCP servers.
- Notifications for those MCP questions are held back by Claude Code for six seconds,
  so answering quickly beats the notification. That delay is not ours and cannot be
  shortened from here; the **Notification Delay** setting adds to it.

Verified against Claude Code 2.1.233.

For project-specific hooks, add the same config to `.claude/settings.local.json`.

## Development

**Run tests:**
```bash
npm test
```

**Package locally:**
```bash
vsce package
code --install-extension claude-code-notifier-*.vsix
```

**Simulate a hook:**
```bash
echo '{"notification_type":"permission_prompt","message":"Test"}' | node ~/.claude/notify.js
echo '{"hook_event_name":"Stop","last_assistant_message":"All done."}' | node ~/.claude/notify.js
echo '{"hook_event_name":"SubagentStop","last_assistant_message":"Subagent done"}' | node ~/.claude/notify.js
```

**Publish:**
```bash
vsce login erdemgiray
vsce publish        # uses current version in package.json
vsce publish minor  # bumps minor version and publishes
```

## Test Coverage

Everything except "did a banner physically appear on screen" is covered by
`npm test` — no VS Code instance needed. `test/fake-vscode.js` stands in for the
`vscode` module (wired up through `jest.moduleNameMapper`).

| Suite | Covers |
|---|---|
| `test/extension.integration.test.js` | The real hook script driving the real extension end to end |
| `test/notification-controller.test.js` | Filtering, dedup, delays, and unacknowledged popups |
| `test/trigger-watcher.test.js` | Watcher recovery after deletion, replacement, and errors |
| `test/system-notification.test.js` | Banner and sound commands per platform, banner identity |
| `test/host-app.test.js` | Resolving the host editor's bundle identifier |
| `test/hook-installer.test.js` | Settings write, idempotency, repair of legacy installs |
| `test/diagnostics.test.js` | Setup checks, live checks, and report wording |
| `test/payload.test.js` | Trigger file parsing and event-name matching |
| `test/notify.test.js` | `hooks/notify.js` stdin parsing and file write |

The integration suite redirects `os.homedir()` and `os.tmpdir()` at the module level
and asserts the redirect took effect before activating, so a test run can never write
to a real `~/.claude`.

The one thing tests cannot judge is whether macOS actually drew a banner — that is a
notification-permission question. Run **Claude Code: Diagnose Notifications** from the
command palette for that; it fires labelled banners one at a time and prints a report.
