# Developer Notes

## Architecture

```
Claude Code hook fires
       │
       ▼
~/.claude/notify.js reads JSON from stdin
       │  extracts notification_type + message
       ▼
writes {"event":"...", "text":"..."} to $TMPDIR/claude-notify
       │
       ▼
Extension watches the file (fs.watch + polling fallback)
       │  filters by claudeCodeNotifier.allowedEvents
       ▼
VS Code notification shown
```

**Key files:**

| File | Purpose |
|---|---|
| `extension.js` | Entry point — file watcher, notification display |
| `lib/payload.js` | Pure functions: parse trigger file, filter by event type |
| `lib/hook-installer.js` | Auto-installs `notify.js` and hook config on activate |
| `hooks/notify.js` | Claude Code hook script — reads stdin, writes trigger file |

## Hook Payload Format

Claude Code sends a JSON object to hook stdin. `notify.js` extracts:

- `notification_type` → event name (e.g. `permission_prompt`, `elicitation_dialog`)
- `message` → human-readable text shown in the notification

Output written to `$TMPDIR/claude-notify`:

```json
{"event": "permission_prompt", "text": "Allow Bash command?"}
```

## Hook Configuration

The extension auto-installs this into `~/.claude/settings.json` on first activation:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|elicitation_dialog",
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
```

**Publish:**
```bash
vsce login erdemgiray
vsce publish        # uses current version in package.json
vsce publish minor  # bumps minor version and publishes
```

## Test Coverage

- `test/payload.test.js` — Jest tests for `lib/payload.js` (parsing, filtering)
- `test/hook-installer.test.js` — Jest tests for `lib/hook-installer.js` (settings write, idempotency)
- `test/notify.test.js` — Jest tests for `hooks/notify.js` (stdin parsing, file write)
