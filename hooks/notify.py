#!/usr/bin/env python3
"""
Claude Code hook script for claude-code-notifier.

Save this file to ~/.claude/notify.py and configure your hooks to run it.
Claude Code pipes a JSON payload to stdin on every hook event.
This script reads that payload and writes it to the VS Code extension's trigger file.
"""
import sys
import json
import os
import pathlib


def main():
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    event = data.get('notification_type') or data.get('hook_event_name', 'notification')
    text = data.get('message') or event

    tmpdir = os.environ.get('TMPDIR', '/tmp').rstrip('/')
    notify_file = pathlib.Path(tmpdir) / 'claude-notify'

    try:
        notify_file.write_text(json.dumps({'event': event, 'text': text}))
    except OSError as e:
        sys.stderr.write(f'claude-notifier: {e}\n')
        sys.exit(1)


if __name__ == '__main__':
    main()
