# Claude Code Notifier

Never miss when Claude Code needs your attention! Get instant VS Code notifications when Claude asks questions, needs permissions, or waits for your input.

## ✨ Features

- 🔔 **VS Code Notifications**: Get notified directly in VS Code when Claude needs you
- 🎯 **Smart Triggers**: Monitors permission requests and questions
- ⚡ **Zero Configuration**: Works automatically once installed
- 🔧 **Customizable**: Control which events trigger notifications via VS Code settings

## 📦 Installation

### Step 1: Install the Extension

Install from the VS Code marketplace or:

```bash
code --install-extension erdemgiray.claude-code-notifier
```

### Step 2: Save the Hook Script

Copy [`hooks/notify.py`](hooks/notify.py) from this repository to `~/.claude/notify.py`:

```bash
curl -o ~/.claude/notify.py https://raw.githubusercontent.com/egiray/claude-code-notifier/main/hooks/notify.py
```

This script reads the JSON payload Claude Code sends to hooks and passes the real message to the extension.

### Step 3: Configure Claude Code Hooks

Add to `~/.claude/settings.local.json` for all projects, or `.claude/settings.local.json` for a specific project:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/notify.py"
          }
        ]
      }
    ]
  }
}
```

## 🚀 Usage

Once installed, the extension works automatically:

1. **Permission Requests**: Get notified when Claude needs permission to run a command
2. **Questions**: Get notified when Claude asks you something via `AskUserQuestion`

**Note:** `idle_prompt` (task completion) is excluded by default to reduce noise. You'll only be notified when Claude is actually blocked and needs your input.

## 🔧 Filtering Notifications

Control which event types show notifications via VS Code settings:

```json
"claudeCodeNotifier.allowedEvents": ["permission_prompt", "elicitation_dialog"]
```

Any event type not in this list is silently ignored. Add `idle_prompt` if you want to know when Claude finishes a task.

## 🧪 Testing

**Run the test command** — open the command palette (`Cmd+Shift+P`) and search for:
```
Claude Code: Send Test Notification
```

**Or write to the trigger file directly:**
```bash
python3 ~/.claude/notify.py <<'EOF'
{"hook_event_name": "Notification", "notification_type": "permission_prompt", "message": "Test: Claude needs your permission"}
EOF
```

## 🛠️ How It Works

```
Claude Code hook fires
       │
       ▼
~/.claude/notify.py reads JSON from stdin
       │  extracts notification_type + message
       ▼
writes {"event":"permission_prompt","text":"..."} to $TMPDIR/claude-notify
       │
       ▼
Extension watches the file, filters by allowedEvents, shows VS Code notification
```

The trigger file path is resolved via `os.tmpdir()` in the extension and `$TMPDIR` in the hook script — both resolve to the same location on macOS and Linux.

## 📝 Optional: Task Completion Notifications

To be notified when Claude finishes a task and is waiting for your next prompt:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|elicitation_dialog|idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/notify.py"
          }
        ]
      }
    ]
  }
}
```

Then add `idle_prompt` to `claudeCodeNotifier.allowedEvents` in your VS Code settings.

## 🐛 Troubleshooting

**Notifications not appearing?**
- Verify the extension is active (check Extensions panel)
- Check hooks are configured in `.claude/settings.local.json`
- Test the script directly: `echo '{"hook_event_name":"Notification","notification_type":"permission_prompt","message":"test"}' | python3 ~/.claude/notify.py`
- Check the VS Code Output panel → "Claude Code Notifier" for logs

**Wrong or missing message text?**
- Make sure `~/.claude/notify.py` is the latest version from this repo
- Old plain-text hook configs still work but show hardcoded messages — migrate to the script

## 🪟 Windows

Replace `python3 ~/.claude/notify.py` with the full path to `notify.py` and use `python` instead of `python3` if needed. The script uses only Python stdlib and works on Windows.

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please open an issue before submitting a pull request.

## ⭐ Support

If you find this extension helpful, please star the repository!
