# Claude Code Notifier

Never miss when Claude Code needs your attention! Get instant VS Code notifications when Claude asks questions or needs permissions.

## Features

- **VS Code Notifications**: Get notified directly in VS Code when Claude needs you
- **Smart Filtering**: Only notifies when Claude is blocked — no noise during autonomous tool use
- **Zero Configuration**: Hooks install automatically on first activation

## Installation

Install from the VS Code Marketplace — that's it. The extension sets up everything automatically on first launch.

```bash
code --install-extension erdemgiray.claude-code-notifier
```

## Usage

Once installed, you'll receive a notification whenever Claude needs your input — permission requests, questions, or confirmations.

To test it, open the command palette (`Cmd+Shift+P`) and run:
```
Claude Code: Send Test Notification
```

## Filtering

By default, only `permission_prompt` and `elicitation_dialog` events trigger notifications. Customize this in VS Code settings:

```json
"claudeCodeNotifier.allowedEvents": ["permission_prompt", "elicitation_dialog"]
```

Add `idle_prompt` to also be notified when Claude finishes a task.

## Troubleshooting

- Make sure the extension is active (Extensions panel → `erdemgiray.claude-code-notifier`)
- Check that `~/.claude/notify.js` exists and `~/.claude/settings.json` contains the hook
- Open `Help → Toggle Developer Tools → Console` to see extension logs

## License

MIT

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture details and development setup. Please open an issue before submitting a pull request.

## Support

If you find this extension helpful, please star the repository!
