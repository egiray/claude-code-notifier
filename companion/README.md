# Claude Code Notifier (Local)

Helper for [Claude Code Notifier](https://marketplace.visualstudio.com/items?itemName=erdemgiray.claude-code-notifier).
Install the main extension — it offers to install this one when you need it.

## What it is for

VS Code runs extensions where your code lives, not where you are sitting. When your
window is connected to a remote machine over SSH, to WSL, to a container or to a
Codespace, Claude Code Notifier runs over there — so the banner and the sound it asks
for are produced on that machine, which usually has no screen and no speakers.

This companion runs on your own computer. The main extension hands the banner and the
sound to it, and you hear and see them where you actually are.

## What it does

Nothing on its own. It has no settings, no hooks and no trigger of its own; it only
answers the main extension. In a purely local window it is not needed at all.

On macOS it also means banners appear as your editor, with its icon and its own
notification settings, instead of being attributed to the delivery tool.
