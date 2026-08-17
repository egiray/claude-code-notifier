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

If something is missing — say the sound plays but no banner appears — run
**Claude Code: Diagnose Notifications**. It sends each kind of notification one at a
time, clearly labelled, then prints a report saying what worked and what to fix.

## Settings

Open VS Code Settings and search for **Claude Code Notifier** to configure:

**Notify on Permission Request** — Claude is asking for permission to run a command. On by default.

**Notify on Question** — Claude needs to ask you a question before continuing. On by default. In practice this covers questions raised by MCP servers; Claude's own multiple-choice questions do not announce themselves, so they cannot be picked up yet.

**Notify on Task Complete** — Claude finished a task and is waiting for your next instruction. Off by default. This fires every time Claude hands control back to you, in the terminal and in the editor panel alike.

**Notify on Subagent Stop** — A Claude subagent finished its task. Off by default.

**System Notification** — Show an OS-level pop-up in addition to the VS Code notification. On by default.

**Sound** — Play a sound when Claude needs your attention. On by default.

**Notification Delay** — Seconds to wait before playing sound and showing the OS notification. If you dismiss the VS Code popup within this time, the sound and OS notification are cancelled. Default: 0 (immediate).

**Suppress When Focused** — When enabled, skips the sound and OS notification if VS Code is already your active window. The VS Code popup still appears. Off by default.

## Troubleshooting

Start with **Claude Code: Diagnose Notifications** from the command palette — it
checks the setup, sends a labelled test of each notification type, and tells you
what to do about anything that failed.

**The VS Code popup appears but no banner shows up on macOS**

This is a macOS permission question, not a setup problem. Without `terminal-notifier`
installed, banners are sent by macOS's built-in scripting tool and are attributed to
**Script Editor** — so if Script Editor is not allowed to send notifications, nothing
appears and nothing reports an error.

- Open System Settings → Notifications → Script Editor and allow notifications
- Check that Focus / Do Not Disturb is off
- Or install `terminal-notifier`, which lets banners appear as VS Code itself, with
  its icon and its notification settings: `brew install terminal-notifier`

**A question from Claude never notifies me**

Claude's own multiple-choice question box does not announce itself to anything outside
Claude Code, so there is nothing for the extension to react to. Turn on **Notify on
Task Complete** instead: you will be told the moment Claude stops and needs you, which
covers the case you actually care about.

**No notification at all**
- Check that the extension is active: Extensions panel → search `erdemgiray.claude-code-notifier`
- Verify `~/.claude/notify.js` exists and `~/.claude/settings.json` contains the hook
- Restart VS Code once after updating the extension. The hooks are re-checked on
  startup, and a release that adds a new one only takes effect after that.

**Logs**
- Open `Help → Toggle Developer Tools → Console` to see extension logs

## License

MIT

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture details and development setup. Please open an issue before submitting a pull request.
