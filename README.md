# Claude Code Notifier

Never miss when Claude Code needs your attention! Get instant VS Code notifications — with sound — when Claude asks questions or needs permissions.

## Features

- **VS Code Notifications** — Get notified directly in VS Code when Claude needs you
- **Sound + OS Notifications** — Hear it even when you're focused on another app (macOS, Windows, Linux)
- **Smart Filtering** — Only notifies when Claude is blocked, not during autonomous tool use
- **Zero Configuration** — Hooks install automatically on first activation
- **Tells You Which Project** — with several windows open, you see which one is calling
- **Works over SSH, WSL and containers** — a one-click companion delivers banners and sound to your own computer

## Installation

Install from the VS Code Marketplace — that's it. The extension sets up everything automatically on first launch.

```bash
code --install-extension erdemgiray.claude-code-notifier
```

## Connected to a remote machine?

If your window is attached to a remote machine over SSH, to WSL, to a container or to a
Codespace, VS Code runs this extension over there — so a banner would appear on that
machine instead of on yours.

The extension notices and offers to install **Claude Code Notifier (Local)**, a small
companion that runs on your own computer and receives the banner and sound for you. One
click, nothing to configure. Say "Don't ask again" and it never comes back; the
notification inside VS Code keeps working either way.

Banners cannot be delivered when a Codespace is opened in a **browser** rather than in
desktop VS Code, because the browser side cannot reach your operating system.

## Testing

Open the command palette (`Cmd+Shift+P`) and run **Claude Code: Send Test Notification** to verify everything works.

If something is missing — say the sound plays but no banner appears — run
**Claude Code: Diagnose Notifications**. It sends each kind of notification one at a
time, clearly labelled, then prints a report saying what worked and what to fix.

## Settings

Open VS Code Settings and search for **Claude Code Notifier**.

Each event gets one choice — what should happen when it fires:

| Choice | What you get |
|---|---|
| **sound+banner** | A sound and a system banner, plus the VS Code notification |
| **banner** | A system banner, plus the VS Code notification |
| **sound** | A sound, plus the VS Code notification |
| **editor-only** | Only the VS Code notification |
| **off** | Nothing at all for this event |

And the four events, with what they are set to out of the box:

| Event | Default | Sound |
|---|---|---|
| **Permission Request** — Claude wants to run a command | sound+banner | Alert |
| **Question** — Claude needs an answer before continuing | sound+banner | Chime |
| **Task Complete** — Claude finished and is waiting for you | off | Default |
| **Subagent Stop** — a subagent finished its task | off | Knock |

Question notifications in practice cover questions raised by MCP servers; Claude's own
multiple-choice questions do not announce themselves, so they cannot be picked up yet.

### Sounds

Each event can have its own sound, so you learn what happened without looking:
**Default**, **Chime**, **Bell**, **Knock**, **Alert**. Nothing is downloaded — these
are the sounds your machine already ships, so each one is the native equivalent on
macOS, Windows and Linux.

### The rest

**Min Task Seconds** — do not announce a finished task that took less than this many
seconds. Useful when you are watching anyway. Default: 0, which announces everything.
Switching this on adds one extra Claude Code hook so the extension can time a task;
setting it back to 0 removes it again.

**Notification Delay** — seconds to wait before the sound and banner. If you dismiss the
VS Code notification within this time, both are cancelled. Default: 0.

**Suppress When Focused** — skip the sound and banner when VS Code is already your
active window. The VS Code notification still appears. Off by default.

### Upgrading from an earlier version

Nothing to do. The older settings — the four on/off switches plus the global sound and
system-notification toggles — still decide what happens if you had set them, so your
setup behaves exactly as it did. They are marked as replaced in the settings list; the
moment you pick a level for an event, that choice takes over for it.

## Troubleshooting## Troubleshooting

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

**I am connected to a remote machine (SSH, WSL, a container, a Codespace) and only
the VS Code popup appears**

The companion extension is missing. VS Code runs extensions where your code lives, so
in a remote window this extension runs on the remote machine — and a banner asked of
that machine reaches nobody, because it has no screen and no speakers.

Install **Claude Code Notifier (Local)** and the banner and sound arrive on your own
computer instead. The extension offers it to you in a remote window; if you dismissed
that, run **Claude Code: Diagnose Notifications** — the report says whether the
companion is installed.

Once it is installed, the diagnostics test the real path: the banner and sound it fires
are delivered to your computer, so what you see in the report is what you will get.

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
