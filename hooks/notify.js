#!/usr/bin/env node
const os = require('os');
const path = require('path');
const fs = require('fs');

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
    const text = data.message || event;

    const notifyFile = path.join(os.tmpdir(), 'claude-notify');
    try {
        fs.writeFileSync(notifyFile, JSON.stringify({ event, text }));
    } catch (e) {
        process.stderr.write(`claude-notifier: ${e.message}\n`);
        process.exit(1);
    }
});
