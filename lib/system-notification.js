const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { soundFile, DEFAULT_SOUND } = require('./sounds');

const TITLE = 'Claude Code';

// Callers that predate per-event sounds and per-project titles pass the callback
// where the options now go, so both shapes are accepted.
function optionsAndDone(options, done) {
    if (typeof options === 'function') return [{}, options];
    return [options || {}, done || (() => {})];
}

function titleFor(options) {
    return options.title ? `${TITLE} — ${options.title}` : TITLE;
}

// GUI-launched apps inherit launchd's PATH (/usr/bin:/bin:/usr/sbin:/sbin), which
// never contains Homebrew. Probing absolute paths is the only reliable way to find
// terminal-notifier from the extension host.
const TERMINAL_NOTIFIER_PATHS = [
    '/opt/homebrew/bin/terminal-notifier',
    '/usr/local/bin/terminal-notifier',
];

// Bundle identity to post banners under, so they carry the editor's icon and name.
// Only terminal-notifier can honour this; osascript always posts as Script Editor.
let senderBundleId = null;

function setSenderBundleId(bundleId) {
    senderBundleId = bundleId || null;
}

function getSenderBundleId() {
    return senderBundleId;
}

function findTerminalNotifier() {
    for (const candidate of TERMINAL_NOTIFIER_PATHS) {
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch (_) {
            // unreadable path — keep looking
        }
    }
    return null;
}

// execFile does not go through a shell, so the only characters that need care are
// the ones that would break out of the AppleScript string literal.
function escapeForAppleScript(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n]+/g, ' ');
}

function playSound(soundName, done) {
    if (typeof soundName === 'function') {
        done = soundName;
        soundName = DEFAULT_SOUND;
    }
    if (!done) done = () => {};

    const platform = os.platform();
    const file = soundFile(soundName, platform);

    if (platform === 'darwin') {
        execFile('afplay', [file], done);
    } else if (platform === 'win32') {
        execFile('powershell', ['-NoProfile', '-c',
            `(New-Object Media.SoundPlayer "${file}").PlaySync()`
        ], done);
    } else if (platform === 'linux') {
        execFile('paplay', [file], (err) => {
            if (err) execFile('aplay', ['/usr/share/sounds/alsa/Front_Center.wav'], done);
            else done(null);
        });
    } else {
        done(new Error(`Unsupported platform: ${platform}`));
    }
}

function notifyViaTerminalNotifier(text, options, done) {
    const [opts, finish] = optionsAndDone(options, done);
    const binary = findTerminalNotifier() || 'terminal-notifier';
    const args = ['-title', titleFor(opts), '-message', String(text)];
    if (senderBundleId) args.push('-sender', senderBundleId);
    execFile(binary, args, (err) => finish(err, { binary, sender: senderBundleId }));
}

function notifyViaOsascript(text, options, done) {
    const [opts, finish] = optionsAndDone(options, done);
    const script = `display notification "${escapeForAppleScript(text)}" ` +
        `with title "${escapeForAppleScript(titleFor(opts))}"`;
    execFile('osascript', ['-e', script], (err) => finish(err));
}

function showOsNotification(text, options, done) {
    const [opts, finish] = optionsAndDone(options, done);
    const done_ = finish;
    const platform = os.platform();

    if (platform === 'darwin') {
        if (findTerminalNotifier()) {
            notifyViaTerminalNotifier(text, opts, (err) => {
                if (!err) return done_(null, { method: 'terminal-notifier' });
                notifyViaOsascript(text, opts, (fallbackErr) => done_(fallbackErr, { method: 'osascript' }));
            });
        } else {
            notifyViaOsascript(text, opts, (err) => done_(err, { method: 'osascript' }));
        }
        return;
    }

    if (platform === 'win32') {
        const safe = escapeForAppleScript(text).replace(/[<>&]/g, '');
        const heading = escapeForAppleScript(titleFor(opts)).replace(/[<>&]/g, '');
        const xml = `<toast><visual><binding template="ToastText02"><text id="1">${heading}</text><text id="2">${safe}</text></binding></visual></toast>`;
        // Windows PowerShell 5.1 resolves WinRT types one at a time: every type the
        // command touches needs its own declaration, in its own namespace. Declaring
        // only ToastNotificationManager leaves XmlDocument unresolvable and the whole
        // toast fails on the first line.
        const ps = `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;` +
            `[Windows.UI.Notifications.ToastNotification,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;` +
            `[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom,ContentType=WindowsRuntime]|Out-Null;` +
            `$xml=New-Object Windows.Data.Xml.Dom.XmlDocument;$xml.LoadXml('${xml}');` +
            `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${TITLE}').Show((New-Object Windows.UI.Notifications.ToastNotification $xml))`;
        execFile('powershell', ['-NoProfile', '-Command', ps], (err) => done_(err, { method: 'powershell' }));
        return;
    }

    if (platform === 'linux') {
        execFile('notify-send', [titleFor(opts), String(text)], (err) => done_(err, { method: 'notify-send' }));
        return;
    }

    done_(new Error(`Unsupported platform: ${platform}`), { method: 'none' });
}

function sendSystemNotification(text, {
    notification = true, sound = true, soundName = DEFAULT_SOUND, title = null, onError = () => {},
} = {}) {
    if (sound) playSound(soundName, () => {});
    if (notification) {
        showOsNotification(text, { title }, (err, info) => {
            if (err) onError(err, info || {});
        });
    }
}

module.exports = {
    sendSystemNotification,
    playSound,
    showOsNotification,
    setSenderBundleId,
    getSenderBundleId,
    notifyViaTerminalNotifier,
    notifyViaOsascript,
    findTerminalNotifier,
    escapeForAppleScript,
    TERMINAL_NOTIFIER_PATHS,
    TITLE,
};
