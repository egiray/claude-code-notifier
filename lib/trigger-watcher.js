const realFs = require('fs');

/**
 * Watches the trigger file and calls onChange whenever it may have new content.
 *
 * fs.watch is fast but fragile: the handle dies silently when the file is deleted
 * (macOS prunes the temp directory) or replaced, and it can emit an error long after
 * it was armed. So the handle is treated as disposable — re-armed whenever it
 * misbehaves — and a poll of our own always runs alongside it.
 *
 * The poll compares against a baseline we capture ourselves rather than using
 * fs.watchFile, which only calls back when it detects a change relative to its own
 * first stat — anything written before that first stat is lost for good.
 */
function createTriggerWatcher({
    notifyFile,
    onChange,
    fsImpl = realFs,
    pollIntervalMs = 1000,
    rearmDelayMs = 500,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
    log = () => {},
}) {
    let watcher = null;
    let rearmTimer = null;
    let pollTimer = null;
    let stopped = false;
    let rearmCount = 0;
    let armedIno = null;
    let lastSeen = null;

    function statOrNull() {
        try {
            return fsImpl.statSync ? fsImpl.statSync(notifyFile) : null;
        } catch (_) {
            return null;
        }
    }

    function ensureFileExists() {
        try {
            if (!fsImpl.existsSync(notifyFile)) fsImpl.writeFileSync(notifyFile, '', 'utf8');
            return true;
        } catch (err) {
            log(`Failed to create trigger file: ${err.message}`);
            return false;
        }
    }

    function closeWatcher() {
        if (!watcher) return;
        try { watcher.close(); } catch (_) { /* already closed */ }
        watcher = null;
    }

    function scheduleRearm(reason) {
        if (stopped || rearmTimer) return;
        log(`Re-arming trigger watcher (${reason})`);
        rearmTimer = setTimeoutImpl(() => {
            rearmTimer = null;
            if (stopped) return;
            rearmCount += 1;
            arm();
        }, rearmDelayMs);
    }

    function arm() {
        if (stopped) return;
        closeWatcher();
        if (!ensureFileExists()) {
            scheduleRearm('trigger file missing');
            return;
        }

        const stat = statOrNull();
        armedIno = stat ? stat.ino : null;

        try {
            watcher = fsImpl.watch(notifyFile, (eventType) => {
                if (stopped) return;
                // 'rename' means the inode we hold is gone — this handle is now dead.
                if (eventType === 'rename') {
                    closeWatcher();
                    scheduleRearm('trigger file replaced');
                }
                onChange();
            });
            if (watcher && typeof watcher.on === 'function') {
                watcher.on('error', (err) => {
                    closeWatcher();
                    scheduleRearm(`watch error: ${err.message}`);
                });
            }
        } catch (err) {
            log(`fs.watch failed: ${err.message}`);
            scheduleRearm('fs.watch threw');
        }
    }

    function poll() {
        if (stopped) return;

        const stat = statOrNull();
        if (!stat) {
            scheduleRearm('trigger file is gone');
            return;
        }
        if (!watcher || (armedIno !== null && stat.ino !== armedIno)) {
            scheduleRearm('watch handle is stale');
        }

        if (lastSeen && stat.mtimeMs === lastSeen.mtimeMs && stat.size === lastSeen.size) return;
        lastSeen = { mtimeMs: stat.mtimeMs, size: stat.size };
        onChange();
    }

    function start() {
        stopped = false;
        arm();

        const baseline = statOrNull();
        lastSeen = baseline ? { mtimeMs: baseline.mtimeMs, size: baseline.size } : null;
        pollTimer = setIntervalImpl(poll, pollIntervalMs);

        // Deliver anything that arrived while VS Code was still starting up.
        onChange();
    }

    function stop() {
        stopped = true;
        if (rearmTimer) {
            clearTimeoutImpl(rearmTimer);
            rearmTimer = null;
        }
        if (pollTimer) {
            clearIntervalImpl(pollTimer);
            pollTimer = null;
        }
        closeWatcher();
    }

    return {
        start,
        stop,
        poll,
        isArmed: () => watcher !== null,
        rearmCount: () => rearmCount,
    };
}

module.exports = { createTriggerWatcher };
