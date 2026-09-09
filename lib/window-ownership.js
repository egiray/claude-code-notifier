/**
 * Which window should answer a notification.
 *
 * Every window watches the same trigger file, so without this the first one to
 * read it wins and a call from one project surfaces in another project's window.
 * Claude Code reports the directory it was working in, and each window knows the
 * folders it has open, so the window that actually holds that work can take it.
 *
 * The matching rules follow ashmitb95/claude-notifier (MIT), which had already
 * found the two that bite in practice: a session usually runs in a subdirectory
 * rather than at the root of the folder, and Windows paths differ in case.
 */
const path = require('path');

function normalize(value, platform) {
    const text = String(value || '');
    return platform === 'win32' ? text.toLowerCase() : text;
}

function separatorFor(platform) {
    return platform === 'win32' ? '\\' : '/';
}

function cwdInsideFolder(cwd, folder, platform = process.platform) {
    if (!cwd || !folder) return false;
    const target = normalize(cwd, platform);
    const root = normalize(folder, platform);
    if (target === root) return true;
    const sep = separatorFor(platform);
    return target.startsWith(root.endsWith(sep) ? root : root + sep);
}

function ownsCwd(cwd, folders, platform = process.platform) {
    if (!cwd || !Array.isArray(folders)) return false;
    return folders.some((folder) => cwdInsideFolder(cwd, folder, platform));
}

/**
 * Whether some other window that is still running holds the work this
 * notification came from. A window that does not own it uses this to stay out of
 * the way — and, when the answer is no, to take it anyway so that a session run
 * somewhere nobody has open is still announced.
 */
function anotherWindowOwns(cwd, markers, { ownPid, platform = process.platform } = {}) {
    if (!cwd || !Array.isArray(markers)) return false;
    return markers.some((marker) => marker
        && marker.pid !== ownPid
        && ownsCwd(cwd, marker.folders, platform));
}

/**
 * A payload with no directory comes from a hook script older than this routing,
 * and is answered the way it always was: by whoever reads it first.
 */
function shouldAnswer({ cwd, folders, markers, ownPid, platform = process.platform }) {
    if (!cwd) return { answer: true, because: 'unrouted' };
    if (ownsCwd(cwd, folders, platform)) return { answer: true, because: 'owner' };
    if (anotherWindowOwns(cwd, markers, { ownPid, platform })) {
        return { answer: false, because: 'owned-elsewhere' };
    }
    return { answer: true, because: 'nobody-owns-it' };
}

module.exports = { shouldAnswer, ownsCwd, anotherWindowOwns, cwdInsideFolder };
