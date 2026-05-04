# Claude Code Notifier

Never miss when Claude Code needs your attention! Get instant VS Code notifications when Claude asks questions, needs permissions, or waits for your input.

## ✨ Features

- 🔔 **VS Code Notifications**: Get notified directly in VS Code when Claude needs you
- 🎯 **Smart Triggers**: Monitors permission requests and questions
- ⚡ **Zero Configuration**: Hooks install automatically on first activation
- 🔧 **Customizable**: Control which events trigger notifications via VS Code settings

## 📦 Installation

Install from the VS Code Marketplace — that's it. On first activation, the extension automatically:

1. Copies `notify.py` to `~/.claude/notify.py`
2. Adds the required hooks to `~/.claude/settings.json`

No manual configuration needed.

```bash
code --install-extension erdemgiray.claude-code-notifier
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

**Or simulate a hook directly:**
```bash
echo '{"hook_event_name": "Notification", "notification_type": "permission_prompt", "message": "Test: Claude needs your permission"}' | python3 ~/.claude/notify.py
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

To be notified when Claude finishes a task and is waiting for your next prompt, add `idle_prompt` to your VS Code settings:

```json
"claudeCodeNotifier.allowedEvents": ["permission_prompt", "elicitation_dialog", "idle_prompt"]
```

## 🔩 Manual Hook Configuration

If you prefer to configure hooks yourself (e.g. for a specific project), add this to `.claude/settings.local.json`:

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

## 🐛 Troubleshooting

**Notifications not appearing?**
- Verify the extension is active (check Extensions panel — should show `erdemgiray.claude-code-notifier`)
- Check that `~/.claude/notify.py` exists and `~/.claude/settings.json` contains the hook
- Simulate a hook manually: `echo '{"notification_type":"permission_prompt","message":"test"}' | python3 ~/.claude/notify.py`
- Check the VS Code extension host log: `Help → Toggle Developer Tools → Console`

**Wrong or missing message text?**
- Make sure `~/.claude/notify.py` is up to date — reinstall the extension to refresh it

## 🪟 Windows

Replace `python3 ~/.claude/notify.py` with the full path to `notify.py` and use `python` instead of `python3` if needed. The script uses only Python stdlib and works on Windows.

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please open an issue before submitting a pull request.

## ⭐ Support

If you find this extension helpful, please star the repository!
