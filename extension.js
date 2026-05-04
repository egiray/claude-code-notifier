const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parsePayload, isAllowedEvent } = require('./lib/payload');
const { install: installHooks } = require('./lib/hook-installer');
const { sendSystemNotification } = require('./lib/system-notification');

const NOTIFY_FILE = path.join(os.tmpdir(), 'claude-notify');
const NOTIFY_SCRIPT_DEST = path.join(os.homedir(), '.claude', 'notify.js');

let fileWatcher = null;
let isHandling = false;
let lastNotifKey = '';
let lastNotifTime = 0;
const DEDUP_MS = 2000;

function activate(context) {
    console.log('Claude Code Notifier is now active');

    try {
        installHooks({
            settingsPath: path.join(os.homedir(), '.claude', 'settings.json'),
            notifyScriptSrc: path.join(context.extensionPath, 'hooks', 'notify.js'),
            notifyScriptDest: NOTIFY_SCRIPT_DEST,
        });
    } catch (err) {
        vscode.window.showErrorMessage(
            `Claude Code Notifier: Hook installation failed — ${err.message}. ` +
            'Notifications will not work until notify.js and settings.json are configured manually.'
        );
    }

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
        // fs.watch unavailable (e.g. network drives) — fall back to polling
        console.error('fs.watch failed, falling back to fs.watchFile:', err);
        fs.watchFile(NOTIFY_FILE, { interval: 500 }, (curr, prev) => {
            if (curr.mtimeMs > prev.mtimeMs) handleNotification();
        });
    }
}

function stopFileWatcher() {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
    fs.unwatchFile(NOTIFY_FILE);
}

function getConfig() {
    return vscode.workspace.getConfiguration('claudeCodeNotifier');
}

function getAllowedList() {
    const cfg = getConfig();
    const events = [];
    if (cfg.get('notifyOnPermissionRequest', true)) events.push('permission_prompt');
    if (cfg.get('notifyOnQuestion', true)) events.push('elicitation_dialog');
    if (cfg.get('notifyOnTaskComplete', false)) events.push('idle_prompt');
    if (cfg.get('notifyOnSubagentStop', false)) events.push('subagent_stop');
    return events;
}

function isDuplicate(event, text) {
    const key = `${event}:${text}`;
    const now = Date.now();
    if (key === lastNotifKey && now - lastNotifTime < DEDUP_MS) return true;
    lastNotifKey = key;
    lastNotifTime = now;
    return false;
}


function handleNotification() {
    if (isHandling) return;
    isHandling = true;

    try {
        if (!fs.existsSync(NOTIFY_FILE)) { isHandling = false; return; }

        const raw = fs.readFileSync(NOTIFY_FILE, 'utf8').trim();
        if (!raw) { isHandling = false; return; }

        const { event, text } = parsePayload(raw);

        if (!isAllowedEvent(event, getAllowedList())) {
            console.log(`Skipped notification for event type: ${event}`);
            isHandling = false;
            return;
        }

        if (isDuplicate(event, text)) {
            console.log(`Duplicate notification skipped [${event}]`);
            isHandling = false;
            return;
        }

        const cfg = getConfig();
        const delayMs = (cfg.get('notificationDelay', 0) || 0) * 1000;

        function fireSysNotif() {
            const suppress = cfg.get('suppressWhenFocused', false) && vscode.window.state.focused;
            sendSystemNotification(text, {
                notification: cfg.get('systemNotification', true) && !suppress,
                sound: cfg.get('sound', true) && !suppress,
            });
        }

        let sysNotifTimer = null;
        if (delayMs > 0) {
            sysNotifTimer = setTimeout(fireSysNotif, delayMs);
        } else {
            fireSysNotif();
        }

        vscode.window.showWarningMessage(`🔔 Claude Code: ${text}`, 'OK').then(selection => {
            if (selection === 'OK') {
                if (sysNotifTimer) clearTimeout(sysNotifTimer);
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
