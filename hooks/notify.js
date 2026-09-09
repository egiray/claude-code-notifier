#!/usr/bin/env node
const os = require('os');
const path = require('path');
const fs = require('fs');

// Notification events carry their own wording in "message". Hook events like Stop
// do not, so without these the banner would read "Stop" at the user.
const LABELS = {
    Stop: 'Claude finished and is waiting for you',
    SubagentStop: 'A Claude subagent finished its task',
};

// A turn starting is not worth a notification, but it is the only place the clock
// can be started — so that a finished task can say how long it took, and short ones
// can be left alone.
const START_EVENT = 'UserPromptSubmit';

function taskFile(sessionId) {
    const safe = String(sessionId || 'default').replace(/[^A-Za-z0-9_-]/g, '');
    return path.join(os.tmpdir(), `claude-notifier-task-${safe || 'default'}`);
}

function recordStart(sessionId) {
    try {
        fs.writeFileSync(taskFile(sessionId), String(Date.now()));
    } catch (_) {
        // Losing the clock only costs the duration, never the notification.
    }
}

function takeDuration(sessionId) {
    const file = taskFile(sessionId);
    try {
        const startedAt = Number(fs.readFileSync(file, 'utf8').trim());
        fs.unlinkSync(file);
        if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
        return Math.max(0, Date.now() - startedAt);
    } catch (_) {
        return null;
    }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
    let data;
    try {
        data = JSON.parse(raw);
    } catch (_) {
        process.exit(0);
    }

    const event = data.notification_type || data.hook_event_name || 'notification';

    if (event === START_EVENT) {
        recordStart(data.session_id);
        process.exit(0);
    }

    const text = data.message || LABELS[event] || event;
    // Which project called out, decided where the work happens rather than in the
    // window that happens to show the notification.
    const cwd = data.cwd || process.cwd() || '';
    const project = path.basename(cwd) || null;
    const durationMs = event === 'Stop' ? takeDuration(data.session_id) : null;

    const payload = { event, text };
    if (project) payload.project = project;
    if (cwd) payload.cwd = cwd;
    if (durationMs !== null) payload.durationMs = durationMs;

    const notifyFile = path.join(os.tmpdir(), 'claude-notify');
    try {
        fs.writeFileSync(notifyFile, JSON.stringify(payload));
    } catch (e) {
        process.stderr.write(`claude-notifier: ${e.message}\n`);
        process.exit(1);
    }
});
