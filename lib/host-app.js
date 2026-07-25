const path = require('path');
const { execFileSync: realExecFileSync } = require('child_process');

/**
 * Works out which macOS app the extension host is running inside, so notifications
 * can be posted under that app's identity — the banner then carries the editor's own
 * icon and name instead of whichever helper tool delivered it.
 *
 * Derived from the running binary rather than hardcoded, so VS Code Insiders,
 * VSCodium, Cursor and friends each get their own identity.
 */
function findAppBundle(execPath) {
    if (typeof execPath !== 'string' || !execPath) return null;
    const parts = execPath.split(path.sep);
    // The first .app walking down from the root is the outer application bundle;
    // anything deeper is a helper bundle nested inside it.
    for (let i = 0; i < parts.length; i += 1) {
        if (parts[i].endsWith('.app')) return parts.slice(0, i + 1).join(path.sep);
    }
    return null;
}

function readBundleId(appBundlePath, execFileSync = realExecFileSync) {
    try {
        const output = execFileSync(
            'defaults',
            ['read', path.join(appBundlePath, 'Contents', 'Info'), 'CFBundleIdentifier'],
            { encoding: 'utf8' }
        );
        const id = String(output).trim();
        return id || null;
    } catch (_) {
        return null;
    }
}

function resolveSenderBundleId({
    platform = process.platform,
    execPath = process.execPath,
    execFileSync = realExecFileSync,
} = {}) {
    if (platform !== 'darwin') return null;
    const appBundlePath = findAppBundle(execPath);
    if (!appBundlePath) return null;
    return readBundleId(appBundlePath, execFileSync);
}

module.exports = { resolveSenderBundleId, findAppBundle, readBundleId };
