# Claude Code Notifier

Never miss when Claude Code needs your attention! Get instant VS Code notifications when Claude asks questions, needs permissions, or waits for your input.

## ✨ Features

- 🔔 **VS Code Notifications**: Get notified directly in VS Code when Claude needs you
- 🎯 **Smart Triggers**: Monitors permission requests, questions, and idle states
- ⚡ **Zero Configuration**: Works automatically once installed
- 🔧 **Customizable**: Easy to configure with Claude Code hooks

## 📦 Installation

### Step 1: Install the Extension

Install from the VS Code marketplace or:

```bash
code --install-extension erdemgiray.claude-code-notifier
```

### Step 2: Configure Claude Code Hooks

Add the following hooks configuration to your Claude Code settings.

**For global notifications (all projects):**
Add to `~/.claude/settings.local.json`:

**For project-specific notifications:**
Add to `.claude/settings.local.json` in your project directory:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "printf '{\"event\":\"permission_prompt\",\"text\":\"Claude needs your permission\"}' > \"${TMPDIR:-/tmp}/claude-notify\""
          }
        ]
      },
      {
        "matcher": "elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "printf '{\"event\":\"elicitation_dialog\",\"text\":\"Claude has a question for you\"}' > \"${TMPDIR:-/tmp}/claude-notify\""
          }
        ]
      }
    ]
  }
}
```

**Windows users:** Replace `${TMPDIR:-/tmp}` with `%TEMP%` in the hook commands, or run `node -e "console.log(require('os').tmpdir())"` to find your temp directory path.

### Step 3: Install terminal-notifier (macOS only - optional)

For system-level notifications in addition to VS Code popups:

```bash
brew install terminal-notifier
```

Append `&& terminal-notifier -title "Claude Code" -message "Claude needs your permission" -sound Glass` to each hook command if you want both.

## 🚀 Usage

Once installed and configured, the extension works automatically:

1. **Permission Requests**: Get notified when Claude needs permission to run commands
2. **Questions**: Get notified when Claude asks you questions via `AskUserQuestion`

**Note:** The configuration excludes `idle_prompt` (task completion notifications) to reduce notification noise. You'll only be notified when Claude is blocked and needs your input.

## 🔧 Filtering Notifications

You can control which event types show notifications via VS Code settings:

```json
"claudeCodeNotifier.allowedEvents": ["permission_prompt", "elicitation_dialog"]
```

Any hook that writes an event type not in this list will be silently ignored. This is useful for preventing false positives when Claude runs tools autonomously.

## 🧪 Testing

Test the extension by running the command palette (`Cmd+Shift+P`) and searching for:

```
Claude Code: Send Test Notification
```

Or manually write to the trigger file:

```bash
printf '{"event":"permission_prompt","text":"Test message"}' > "${TMPDIR:-/tmp}/claude-notify"
```

## 🛠️ How It Works

The extension watches a trigger file (`claude-notify` in your system's temp directory) for changes. When Claude Code hooks write a JSON payload to this file, the extension reads the event type and message, filters based on your `allowedEvents` setting, and displays a VS Code notification.

## 📝 Customization

### Custom Messages

Edit the `text` field in the hook command:

```bash
printf '{"event":"permission_prompt","text":"Hey! Claude needs you!"}' > "${TMPDIR:-/tmp}/claude-notify"
```

### Optional: Task Completion Notifications

If you want to be notified when Claude finishes tasks:

```json
{
  "matcher": "idle_prompt",
  "hooks": [
    {
      "type": "command",
      "command": "printf '{\"event\":\"idle_prompt\",\"text\":\"Claude is waiting for your input\"}' > \"${TMPDIR:-/tmp}/claude-notify\""
    }
  ]
}
```

Add `idle_prompt` to your `claudeCodeNotifier.allowedEvents` setting to enable this.

## 🐛 Troubleshooting

**Notifications not appearing?**
- Ensure the extension is installed and activated (check Extensions panel)
- Verify hooks are configured in `.claude/settings.local.json`
- Run the test command to verify the extension is working
- Check the VS Code Output panel for "Claude Code Notifier" logs

**False positive notifications?**
- Check `claudeCodeNotifier.allowedEvents` in your VS Code settings
- Remove event types that fire too frequently

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## ⭐ Support

If you find this extension helpful, please star the repository and share it with others!
