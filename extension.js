const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { install: installHooks } = require('./lib/hook-installer');
const { sendSystemNotification, setSenderBundleId } = require('./lib/system-notification');
const { resolveSenderBundleId } = require('./lib/host-app');
const { createNotificationController } = require('./lib/notification-controller');
const { createTriggerWatcher } = require('./lib/trigger-watcher');
const { runDiagnostics } = require('./lib/diagnostics');

const NOTIFY_FILE = path.join(os.tmpdir(), 'claude-notify');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const NOTIFY_SCRIPT_DEST = path.join(os.homedir(), '.claude', 'notify.js');

let watcher = null;
let outputChannel = null;
let warnedAboutOsNotification = false;

function log(message) {
    console.log(`[claude-code-notifier] ${message}`);
}

function getConfig() {
    return vscode.workspace.getConfiguration('claudeCodeNotifier');
}

function getSettings() {
    const cfg = getConfig();
    const allowedEvents = [];
    if (cfg.get('notifyOnPermissionRequest', true)) allowedEvents.push('permission_prompt');
    if (cfg.get('notifyOnQuestion', true)) allowedEvents.push('elicitation_dialog');
    // Stop is what actually fires when Claude hands control back. idle_prompt is kept
    // alongside it so a terminal user who walks away still gets the 60-second nudge.
    if (cfg.get('notifyOnTaskComplete', false)) allowedEvents.push('Stop', 'idle_prompt');
    if (cfg.get('notifyOnSubagentStop', false)) allowedEvents.push('SubagentStop');

    return {
        allowedEvents,
        systemNotification: cfg.get('systemNotification', true),
        sound: cfg.get('sound', true),
        delayMs: (cfg.get('notificationDelay', 0) || 0) * 1000,
        suppressWhenFocused: cfg.get('suppressWhenFocused', false),
        windowFocused: vscode.window.state.focused,
    };
}

// A silent OS-notification failure is the hardest problem to report, so surface it
// once per session and point at the diagnostics.
function reportOsNotificationFailure(err, info) {
    log(`OS notification failed via ${info.method || 'unknown'}: ${err.message}`);
    if (warnedAboutOsNotification) return;
    warnedAboutOsNotification = true;
    vscode.window.showWarningMessage(
        `Claude Code Notifier: the system notification could not be shown (${info.method || 'unknown'}).`,
        'Run diagnostics'
    ).then(selection => {
        if (selection === 'Run diagnostics') vscode.commands.executeCommand('claude-notifier.diagnose');
    });
}

function activate(context) {
    log('activated');

    // Post banners under the editor's own identity so they carry its icon and name.
    const sender = resolveSenderBundleId();
    if (sender) {
        setSenderBundleId(sender);
        log(`posting notifications as ${sender}`);
    }

    try {
        installHooks({
            settingsPath: SETTINGS_PATH,
            notifyScriptSrc: path.join(context.extensionPath, 'hooks', 'notify.js'),
            notifyScriptDest: NOTIFY_SCRIPT_DEST,
        });
    } catch (err) {
        vscode.window.showErrorMessage(
            `Claude Code Notifier: Hook installation failed — ${err.message}. ` +
            'Notifications will not work until notify.js and settings.json are configured manually.'
        );
    }

    const controller = createNotificationController({
        notifyFile: NOTIFY_FILE,
        getSettings,
        ui: {
            showMessage: (text) => vscode.window.showWarningMessage(text, 'OK'),
        },
        notifier: {
            send: (text, options) => sendSystemNotification(text, {
                ...options,
                onError: reportOsNotificationFailure,
            }),
        },
        log,
    });

    watcher = createTriggerWatcher({
        notifyFile: NOTIFY_FILE,
        onChange: () => controller.handle(),
        log,
    });
    watcher.start();
    log(`watching ${NOTIFY_FILE}`);

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-notifier.notify', () => {
            const payload = JSON.stringify({
                event: 'permission_prompt',
                text: 'Test: Claude needs your permission',
            });
            try {
                fs.writeFileSync(NOTIFY_FILE, payload, 'utf8');
            } catch (err) {
                vscode.window.showErrorMessage(`Could not write test notification: ${err.message}`);
            }
        }),

        vscode.commands.registerCommand('claude-notifier.diagnose', async () => {
            if (!outputChannel) outputChannel = vscode.window.createOutputChannel('Claude Code Notifier');
            outputChannel.clear();
            outputChannel.show(true);
            outputChannel.appendLine('Running diagnostics — watch for banners and listen for the sound.');
            outputChannel.appendLine('');

            const { report } = await runDiagnostics({
                settingsPath: SETTINGS_PATH,
                notifyScriptDest: NOTIFY_SCRIPT_DEST,
                notifyFile: NOTIFY_FILE,
                onStep: (label) => outputChannel.appendLine(`  → ${label}`),
            });

            outputChannel.appendLine('');
            outputChannel.appendLine(report);
        }),

        { dispose: () => stopWatcher() }
    );
}

function stopWatcher() {
    if (watcher) {
        watcher.stop();
        watcher = null;
    }
}

function deactivate() {
    stopWatcher();
}

module.exports = { activate, deactivate };
