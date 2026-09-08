/**
 * The companion extension is packaged separately, so it cannot reach up into the
 * main extension's folder at install time. It shares the notification code rather
 * than owning a second copy of it, so the shared files are copied in right before
 * the companion is packaged or published (vsce runs vscode:prepublish for us).
 *
 * The copies are not committed — this script is the only thing that writes them.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = [
    ['lib/system-notification.js', 'companion/lib/system-notification.js'],
    ['lib/host-app.js', 'companion/lib/host-app.js'],
    ['lib/sounds.js', 'companion/lib/sounds.js'],
    ['icon.png', 'companion/icon.png'],
    ['LICENSE', 'companion/LICENSE'],
];

function sync() {
    for (const [from, to] of SHARED) {
        const source = path.join(ROOT, from);
        const target = path.join(ROOT, to);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
        console.log(`synced ${from} → ${to}`);
    }
}

if (require.main === module) sync();

module.exports = { sync, SHARED };
