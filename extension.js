const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const NOTIFY_FILE = path.join(os.tmpdir(), 'claude-notify');

let fileWatcher = null;
let isHandling = false;

function activate(context) {
    console.log('Claude Code Notifier is now active');

    let testCommand = vscode.commands.registerCommand('claude-notifier.notify', function () {
        const payload = JSON.stringify({ event: 'permission_prompt', text: 'Test: Claude needs your permission' });
        try {
            fs.writeFileSync(NOTIFY_FILE, payload, 'utf8');
        } catch (err) {
            vscode.window.showErrorMessage('Could not write test notification: ' + err.message);
        }
    });

    context.subscriptions.push(testCommand);

    startFileWatcher();

    context.subscriptions.push({
        dispose: () => stopFileWatcher()
    });
}

function startFileWatcher() {
    if (!fs.existsSync(NOTIFY_FILE)) {
        try {
            fs.writeFileSync(NOTIFY_FILE, '', 'utf8');
        } catch (err) {
            console.error('Failed to create notification file:', err);
        }
    }

    try {
        fileWatcher = fs.watch(NOTIFY_FILE, (eventType) => {
            if (eventType === 'change') handleNotification();
        });
        console.log(`Watching for notifications at: ${NOTIFY_FILE}`);
    } catch (err) {
        console.error('Failed to watch notification file:', err);
    }

    let lastMtime = 0;
    setInterval(() => {
        try {
            if (fs.existsSync(NOTIFY_FILE)) {
                const stats = fs.statSync(NOTIFY_FILE);
                if (stats.mtimeMs > lastMtime && lastMtime !== 0) handleNotification();
                lastMtime = stats.mtimeMs;
            }
        } catch (_) {}
    }, 1000);
}

function stopFileWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
}

function parsePayload(raw) {
    try {
        const data = JSON.parse(raw);
        return {
            event: typeof data.event === 'string' ? data.event : 'notification',
            text: typeof data.text === 'string' ? data.text : raw
        };
    } catch (_) {
        return { event: 'notification', text: raw };
    }
}

function getAllowedEvents() {
    const cfg = vscode.workspace.getConfiguration('claudeCodeNotifier');
    const list = cfg.get('allowedEvents', ['permission_prompt', 'elicitation_dialog']);
    return new Set(list);
}

function handleNotification() {
    if (isHandling) return;
    isHandling = true;

    try {
        if (!fs.existsSync(NOTIFY_FILE)) { isHandling = false; return; }

        const raw = fs.readFileSync(NOTIFY_FILE, 'utf8').trim();
        if (!raw) { isHandling = false; return; }

        const { event, text } = parsePayload(raw);

        if (!getAllowedEvents().has(event)) {
            console.log(`Skipped notification for event type: ${event}`);
            isHandling = false;
            return;
        }

        vscode.window.showWarningMessage(`🔔 Claude Code: ${text}`, 'OK').then(selection => {
            if (selection === 'OK') {
                try {
                    fs.writeFileSync(NOTIFY_FILE, '', 'utf8');
                } catch (err) {
                    console.error('Failed to clear notification file:', err);
                }
            }
            isHandling = false;
        });

        console.log(`Notification shown [${event}]:`, text);

    } catch (err) {
        console.error('Failed to handle notification:', err);
        isHandling = false;
    }
}

function deactivate() {
    stopFileWatcher();
}

module.exports = { activate, deactivate };
