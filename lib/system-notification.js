const os = require('os');
const { execFile } = require('child_process');

function playSound() {
    const platform = os.platform();
    if (platform === 'darwin') {
        execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
    } else if (platform === 'win32') {
        execFile('powershell', ['-NoProfile', '-c',
            '(New-Object Media.SoundPlayer "C:\\Windows\\Media\\notify.wav").PlaySync()'
        ], () => {});
    } else if (platform === 'linux') {
        execFile('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'], (err) => {
            if (err) execFile('aplay', ['/usr/share/sounds/alsa/Front_Center.wav'], () => {});
        });
    }
}

function showOsNotification(text) {
    const safe = text.replace(/['"\\<>&]/g, '');
    const platform = os.platform();
    if (platform === 'darwin') {
        execFile('terminal-notifier', [
            '-title', 'Claude Code',
            '-message', safe,
            '-activate', 'com.microsoft.VSCode',
        ], (err) => {
            if (err) execFile('osascript', ['-e', `display notification "${safe}" with title "Claude Code"`], () => {});
        });
    } else if (platform === 'win32') {
        const xml = `<toast><visual><binding template="ToastText02"><text id="1">Claude Code</text><text id="2">${safe}</text></binding></visual></toast>`;
        const ps = `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null;` +
            `$xml=New-Object Windows.Data.Xml.Dom.XmlDocument;$xml.LoadXml('${xml}');` +
            `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show((New-Object Windows.UI.Notifications.ToastNotification $xml))`;
        execFile('powershell', ['-NoProfile', '-Command', ps], () => {});
    } else if (platform === 'linux') {
        execFile('notify-send', ['Claude Code', safe], () => {});
    }
}

function sendSystemNotification(text, { notification = true, sound = true } = {}) {
    if (sound) playSound();
    if (notification) showOsNotification(text);
}

module.exports = { sendSystemNotification, playSound, showOsNotification };
