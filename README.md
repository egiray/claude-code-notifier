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
code --install-extension YOUR_PUBLISHER_NAME.claude-code-notifier
```

### Step 2: Configure Claude Code Hooks

Add the following hooks configuration to your Claude Code settings:

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
            "command": "echo 'Claude needs your permission' > /tmp/claude-notify && terminal-notifier -title \"Claude Code\" -message \"Claude needs your permission\" -sound Glass"
          }
        ]
      },
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Claude is waiting for your input' > /tmp/claude-notify && terminal-notifier -title \"Claude Code\" -message \"Claude is waiting for your input\" -sound Glass"
          }
        ]
      },
      {
        "matcher": "elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Claude has a question for you' > /tmp/claude-notify && terminal-notifier -title \"Claude Code\" -message \"Claude has a question for you\" -sound Glass"
          }
        ]
      }
    ]
  }
}
```

### Step 3: Install terminal-notifier (macOS only - optional)

The hooks configuration above includes `terminal-notifier` for system-level notifications. Install it with:

```bash
brew install terminal-notifier
```

**Note:** If you don't want system notifications, simply remove the `&& terminal-notifier...` part from each command.

## 🚀 Usage

Once installed and configured, the extension works automatically:

1. **Permission Requests**: Get notified when Claude needs permission to run commands
2. **Questions**: Get notified when Claude asks you questions via `AskUserQuestion`
3. **Waiting for Input**: Get notified when Claude is idle and waiting for your input

## 🧪 Testing

Test the extension by running the command palette (`Cmd+Shift+P`) and searching for:

```
Claude Code: Send Test Notification
```

You should see a notification appear in VS Code.

## 🛠️ How It Works

The extension watches a trigger file at `/tmp/claude-notify` for changes. When Claude Code hooks write to this file, the extension reads the message and displays it as a VS Code notification.

## 📝 Customization

You can customize the notification messages by editing the hooks configuration. Change the text after `echo` to customize what appears in the notification.

Example:
```json
"command": "echo 'Hey! Claude needs you!' > /tmp/claude-notify"
```

## 🐛 Troubleshooting

**Notifications not appearing?**
- Ensure the extension is installed and activated (check Extensions panel)
- Verify hooks are configured in `.claude/settings.local.json`
- Check that `/tmp/claude-notify` file exists
- Run the test command to verify the extension is working

**System notifications not working?**
- Install `terminal-notifier` via Homebrew
- Or remove the terminal-notifier part from the hooks

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## ⭐ Support

If you find this extension helpful, please star the repository and share it with others!
# claude-code-notifier
