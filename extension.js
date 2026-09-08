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
const { describeRemoteHost, companionOfferMessage } = require('./lib/remote-host');
const {
    createCompanionDelivery, companionNotifyAdapter, isCompanionInstalled, COMPANION_ID,
} = require('./lib/companion');

const NOTIFY_FILE = path.join(os.tmpdir(), 'claude-notify');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const NOTIFY_SCRIPT_DEST = path.join(os.homedir(), '.claude', 'notify.js');
const NEVER_OFFER_COMPANION = 'companion.neverOffer';

let watcher = null;
let outputChannel = null;
let warnedAboutOsNotification = false;
let remoteHost = null;
let companionInstalled = false;
let offeredCompanion = false;
let globalState = null;
let active = false;

function log(message) {
    console.log(`[claude-code-notifier] ${message}`);
}

// VS Code routes a command to whichever side registered it, so this is how the
// companion on the user's own machine is reached from here.
function runCommand(command, payload) {
    return Promise.resolve(vscode.commands.executeCommand(command, payload));
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
function warnOnce(message) {
    if (warnedAboutOsNotification) return;
    warnedAboutOsNotification = true;
    vscode.window.showWarningMessage(message, 'Run diagnostics').then(selection => {
        if (selection === 'Run diagnostics') vscode.commands.executeCommand('claude-notifier.diagnose');
    });
}

// Reached when the banner was asked of this machine. In a remote window with no
// companion that was always going to fail, and the offer is the useful thing to say.
function reportOsNotificationFailure(err, info) {
    log(`OS notification failed via ${info.method || 'unknown'}: ${err.message}`);
    if (remoteHost && !companionInstalled) {
        offerCompanion();
        return;
    }
    warnOnce(`Claude Code Notifier: the system notification could not be shown (${info.method || 'unknown'}).`);
}

// The companion reached the user's own computer but its operating system refused the
// banner — an ordinary local problem, so it reads like one.
function reportCompanionFailure(result) {
    log(`companion could not show the banner: ${result.error}`);
    warnOnce(`Claude Code Notifier: the companion could not show the banner on your computer (${result.method}).`);
}

// Offered at most once per session, and never again if the user says so.
async function offerCompanion() {
    if (!remoteHost || companionInstalled || offeredCompanion) return;
    if (globalState && globalState.get(NEVER_OFFER_COMPANION)) return;
    offeredCompanion = true;

    const install = 'Install companion';
    const never = "Don't ask again";
    const choice = await vscode.window.showInformationMessage(
        companionOfferMessage(remoteHost), install, never
    );

    if (choice === install) {
        try {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', COMPANION_ID);
            companionInstalled = true;
            vscode.window.showInformationMessage(
                'Claude Code Notifier: banners and sound will now be delivered to your own computer.'
            );
        } catch (err) {
            vscode.window.showErrorMessage(
                `Claude Code Notifier: the companion could not be installed — ${err.message}`
            );
        }
    } else if (choice === never && globalState) {
        await globalState.update(NEVER_OFFER_COMPANION, true);
    }
}

function activate(context) {
    active = true;
    log('activated');

    globalState = context.globalState || null;

    // VS Code runs this extension where the code lives. On a remote window that is not
    // the machine the user is sitting at, so delivery has to be handed to the companion
    // running over there.
    remoteHost = describeRemoteHost(vscode.env && vscode.env.remoteName);
    if (remoteHost) {
        log(`running on ${remoteHost.label} (${remoteHost.name})`);
        isCompanionInstalled({
            getExtension: (id) => vscode.extensions.getExtension(id),
            executeCommand: runCommand,
        }).then((installed) => {
            if (!active) return;
            companionInstalled = installed;
            log(`companion ${installed ? 'available' : 'not installed'}`);
            if (!installed) offerCompanion();
        });
    }

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

    const delivery = createCompanionDelivery({
        remote: Boolean(remoteHost),
        executeCommand: runCommand,
        deliverHere: (text, options) => sendSystemNotification(text, {
            ...options,
            onError: reportOsNotificationFailure,
        }),
        log,
    });

    const controller = createNotificationController({
        notifyFile: NOTIFY_FILE,
        getSettings,
        ui: {
            showMessage: (text) => vscode.window.showWarningMessage(text, 'OK'),
        },
        notifier: {
            send: (text, options) => {
                delivery.send(text, options).then((result) => {
                    if (result.via === 'companion' && result.error) reportCompanionFailure(result);
                    else if (result.companionMissing) offerCompanion();
                });
            },
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
            // Asked again here rather than trusted from activation: the companion may
            // have been installed since, and the report has to describe the real path.
            if (remoteHost) {
                companionInstalled = await isCompanionInstalled({
                    getExtension: (id) => vscode.extensions.getExtension(id),
                    executeCommand: runCommand,
                });
            }

            if (!outputChannel) outputChannel = vscode.window.createOutputChannel('Claude Code Notifier');
            outputChannel.clear();
            outputChannel.show(true);
            outputChannel.appendLine('Running diagnostics — watch for banners and listen for the sound.');
            outputChannel.appendLine('');

            const { report } = await runDiagnostics({
                settingsPath: SETTINGS_PATH,
                notifyScriptDest: NOTIFY_SCRIPT_DEST,
                notifyFile: NOTIFY_FILE,
                remote: remoteHost,
                companionInstalled,
                // Diagnostics has to exercise the path notifications really take.
                notify: remoteHost && companionInstalled
                    ? companionNotifyAdapter({ executeCommand: runCommand })
                    : undefined,
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
    active = false;
    stopWatcher();
}

module.exports = { activate, deactivate };
