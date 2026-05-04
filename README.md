# Claude Code Notifier

Never miss when Claude Code needs your attention! Get instant VS Code notifications — with sound — when Claude asks questions or needs permissions.

## Features

- **VS Code Notifications** — Get notified directly in VS Code when Claude needs you
- **Sound + OS Notifications** — Hear it even when you're focused on another app (macOS, Windows, Linux)
- **Smart Filtering** — Only notifies when Claude is blocked, not during autonomous tool use
- **Zero Configuration** — Hooks install automatically on first activation

## Installation

Install from the VS Code Marketplace — that's it. The extension sets up everything automatically on first launch.

```bash
code --install-extension erdemgiray.claude-code-notifier
```

## Testing

Open the command palette (`Cmd+Shift+P`) and run **Claude Code: Send Test Notification** to verify everything works.

## Settings

Open VS Code Settings and search for **Claude Code Notifier** to configure:

**Notify on Permission Request** — Claude is asking for permission to run a command. On by default.

**Notify on Question** — Claude needs to ask you a question before continuing. On by default.

**Notify on Task Complete** — Claude finished a task and is waiting for your next instruction. Off by default.

**Notify on Subagent Stop** — A Claude subagent finished its task. Off by default.

**System Notification** — Show an OS-level pop-up in addition to the VS Code notification. On by default.

**Sound** — Play a sound when Claude needs your attention. On by default.

**Notification Delay** — Seconds to wait before playing sound and showing the OS notification. If you dismiss the VS Code popup within this time, the sound and OS notification are cancelled. Default: 0 (immediate).

**Suppress When Focused** — When enabled, skips the sound and OS notification if VS Code is already your active window. The VS Code popup still appears. Off by default.

## Troubleshooting

**No notification at all**
- Check that the extension is active: Extensions panel → search `erdemgiray.claude-code-notifier`
- Verify `~/.claude/notify.js` exists and `~/.claude/settings.json` contains the hook

**No OS notification on macOS**
- Install `terminal-notifier` for the best experience: `brew install terminal-notifier`
- Without it, the extension falls back to osascript. Go to System Settings → Notifications → Script Editor to allow those notifications.

**Logs**
- Open `Help → Toggle Developer Tools → Console` to see extension logs

## License

MIT

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture details and development setup. Please open an issue before submitting a pull request.
