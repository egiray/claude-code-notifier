const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const TITLE = 'Claude Code';

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

function playSound(done = () => {}) {
    const platform = os.platform();
    if (platform === 'darwin') {
        execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], done);
    } else if (platform === 'win32') {
        execFile('powershell', ['-NoProfile', '-c',
            '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\notify.wav").PlaySync()'
        ], done);
    } else if (platform === 'linux') {
        execFile('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'], (err) => {
            if (err) execFile('aplay', ['/usr/share/sounds/alsa/Front_Center.wav'], done);
            else done(null);
        });
    } else {
        done(new Error(`Unsupported platform: ${platform}`));
    }
}

function notifyViaTerminalNotifier(text, done = () => {}) {
    const binary = findTerminalNotifier() || 'terminal-notifier';
    const args = ['-title', TITLE, '-message', String(text)];
    if (senderBundleId) args.push('-sender', senderBundleId);
    execFile(binary, args, (err) => done(err, { binary, sender: senderBundleId }));
}

function notifyViaOsascript(text, done = () => {}) {
    const script = `display notification "${escapeForAppleScript(text)}" with title "${TITLE}"`;
    execFile('osascript', ['-e', script], (err) => done(err));
}

function showOsNotification(text, done = () => {}) {
    const platform = os.platform();

    if (platform === 'darwin') {
        if (findTerminalNotifier()) {
            notifyViaTerminalNotifier(text, (err) => {
                if (!err) return done(null, { method: 'terminal-notifier' });
                notifyViaOsascript(text, (fallbackErr) => done(fallbackErr, { method: 'osascript' }));
            });
        } else {
            notifyViaOsascript(text, (err) => done(err, { method: 'osascript' }));
        }
        return;
    }

    if (platform === 'win32') {
        const safe = escapeForAppleScript(text).replace(/[<>&]/g, '');
        const xml = `<toast><visual><binding template="ToastText02"><text id="1">${TITLE}</text><text id="2">${safe}</text></binding></visual></toast>`;
        const ps = `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;` +
            `$xml=New-Object Windows.Data.Xml.Dom.XmlDocument;$xml.LoadXml('${xml}');` +
            `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${TITLE}').Show((New-Object Windows.UI.Notifications.ToastNotification $xml))`;
        execFile('powershell', ['-NoProfile', '-Command', ps], (err) => done(err, { method: 'powershell' }));
        return;
    }

    if (platform === 'linux') {
        execFile('notify-send', [TITLE, String(text)], (err) => done(err, { method: 'notify-send' }));
        return;
    }

    done(new Error(`Unsupported platform: ${platform}`), { method: 'none' });
}

function sendSystemNotification(text, { notification = true, sound = true, onError = () => {} } = {}) {
    if (sound) playSound(() => {});
    if (notification) {
        showOsNotification(text, (err, info) => {
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
