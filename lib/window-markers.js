/**
 * Each window leaves a note saying which projects it has open, so the others can
 * tell whether anyone is holding the work a notification came from.
 *
 * One file per window, named by process id: a directory rather than a single
 * shared file means windows never overwrite each other, and a window that crashed
 * leaves a note that is recognisably dead rather than a lie everyone believes.
 */
const realFs = require('fs');
const os = require('os');
const path = require('path');

const MARKER_DIR = path.join(os.tmpdir(), 'claude-notifier-windows');

function defaultIsAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        // Someone else's process is still a running process.
        return err.code === 'EPERM';
    }
}

function markerPath(dir, pid) {
    return path.join(dir, String(pid));
}

function announce({ dir = MARKER_DIR, pid = process.pid, folders = [], fsImpl = realFs } = {}) {
    try {
        fsImpl.mkdirSync(dir, { recursive: true });
        fsImpl.writeFileSync(markerPath(dir, pid), folders.join('\n'), 'utf8');
        return true;
    } catch (_) {
        // Without a note this window simply cannot be deferred to, which costs
        // routing accuracy but never a notification.
        return false;
    }
}

function forget({ dir = MARKER_DIR, pid = process.pid, fsImpl = realFs } = {}) {
    try {
        fsImpl.unlinkSync(markerPath(dir, pid));
    } catch (_) {
        // Already gone, which is the state we wanted.
    }
}

function readMarkers({ dir = MARKER_DIR, fsImpl = realFs, isAlive = defaultIsAlive } = {}) {
    let names;
    try {
        names = fsImpl.readdirSync(dir);
    } catch (_) {
        return [];
    }

    const markers = [];
    for (const name of names) {
        const pid = Number.parseInt(name, 10);
        if (!Number.isFinite(pid) || !isAlive(pid)) continue;
        let contents = '';
        try {
            contents = fsImpl.readFileSync(markerPath(dir, name), 'utf8');
        } catch (_) {
            continue;
        }
        markers.push({
            pid,
            folders: contents.split('\n').map(line => line.trim()).filter(Boolean),
        });
    }
    return markers;
}

function cleanStale({ dir = MARKER_DIR, fsImpl = realFs, isAlive = defaultIsAlive } = {}) {
    let names;
    try {
        names = fsImpl.readdirSync(dir);
    } catch (_) {
        return 0;
    }

    let removed = 0;
    for (const name of names) {
        const pid = Number.parseInt(name, 10);
        if (Number.isFinite(pid) && isAlive(pid)) continue;
        try {
            fsImpl.unlinkSync(markerPath(dir, name));
            removed += 1;
        } catch (_) {
            // Another window is tidying the same corpse; either way it goes.
        }
    }
    return removed;
}

module.exports = { announce, forget, readMarkers, cleanStale, MARKER_DIR, defaultIsAlive };
