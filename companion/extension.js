/**
 * Claude Code Notifier (Local)
 *
 * VS Code runs an extension where the code lives. When a window is attached to a
 * remote machine — SSH, WSL, a container, a Codespace — the main extension runs over
 * there, and a banner it asks for is produced on a machine with no screen and no
 * speakers. This companion runs on the user's own computer instead, and the main
 * extension hands the banner to it; VS Code routes the request across the boundary.
 *
 * It has no trigger file, no hooks and no settings of its own. It exists purely to
 * be the pair of hands on the machine the user is actually sitting at.
 */
const vscode = require('vscode');
const { showOsNotification, playSound, setSenderBundleId } = require('./lib/system-notification');
const { resolveSenderBundleId } = require('./lib/host-app');

// Kept in step with lib/companion.js in the main extension.
const COMMAND_SHOW = 'claudeCodeNotifier.showOnLocalMachine';
const COMMAND_READY = 'claudeCodeNotifier.companionReady';

function log(message) {
    console.log(`[claude-code-notifier-companion] ${message}`);
}

function deliver({ text, notification = true, sound = true, soundName, title } = {}) {
    if (sound) playSound(soundName, () => {});
    if (!notification) return Promise.resolve({ method: 'sound-only' });

    return new Promise((resolve) => {
        showOsNotification(String(text || ''), { title }, (err, info) => {
            const method = (info && info.method) || 'unknown';
            if (err) log(`banner failed via ${method}: ${err.message}`);
            resolve({ method, error: err ? err.message : null });
        });
    });
}

function activate(context) {
    log('activated');

    // On this side the running application really is the user's editor, so banners
    // can carry its own icon and name.
    const sender = resolveSenderBundleId();
    if (sender) {
        setSenderBundleId(sender);
        log(`posting notifications as ${sender}`);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_SHOW, (payload) => deliver(payload)),
        // Answering at all is the answer: it proves this side is installed and awake.
        vscode.commands.registerCommand(COMMAND_READY, () => true),
    );
}

function deactivate() {}

module.exports = { activate, deactivate, deliver, COMMAND_SHOW, COMMAND_READY };
