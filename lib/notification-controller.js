const realFs = require('fs');
const { parsePayload } = require('./payload');
const { settingsForEvent } = require('./settings');

const DEDUP_MS = 2000;

/**
 * Turns a trigger-file change into notifications.
 *
 * The popup is fire-and-forget on purpose. An earlier version kept a "busy" flag
 * until the user clicked the popup, which meant an unacknowledged popup silenced
 * every later notification — exactly the case this extension exists for.
 */
function createNotificationController({
    notifyFile,
    getSettings,
    ui,
    notifier,
    fsImpl = realFs,
    now = Date.now,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    dedupMs = DEDUP_MS,
    log = () => {},
}) {
    let lastKey = '';
    let lastTime = 0;

    function isDuplicate(event, text) {
        const key = `${event}:${text}`;
        const at = now();
        if (key === lastKey && at - lastTime < dedupMs) return true;
        lastKey = key;
        lastTime = at;
        return false;
    }

    function readAndClear() {
        let raw;
        try {
            if (!fsImpl.existsSync(notifyFile)) return '';
            raw = fsImpl.readFileSync(notifyFile, 'utf8').trim();
        } catch (err) {
            log(`Failed to read trigger file: ${err.message}`);
            return '';
        }
        if (!raw) return '';

        // Clear immediately so a dismissed-but-unacknowledged notification can never
        // replay, and so the next write is always seen as a change.
        try {
            fsImpl.writeFileSync(notifyFile, '', 'utf8');
        } catch (err) {
            log(`Failed to clear trigger file: ${err.message}`);
        }
        return raw;
    }

    function handle() {
        const raw = readAndClear();
        if (!raw) return { status: 'empty' };

        const { event, text, project, durationMs } = parsePayload(raw);
        const settings = getSettings();
        const forEvent = settingsForEvent(settings.events, event);

        if (!forEvent || forEvent.level === 'off') {
            log(`Skipped notification for event type: ${event}`);
            return { status: 'filtered', event, text };
        }

        // A task that finished before you could look away is not worth interrupting for.
        const minMs = (settings.minTaskSeconds || 0) * 1000;
        if (minMs > 0 && durationMs !== null && durationMs < minMs) {
            log(`Skipped notification for a ${durationMs}ms task [${event}]`);
            return { status: 'too-short', event, text, durationMs };
        }

        if (isDuplicate(event, text)) {
            log(`Duplicate notification skipped [${event}]`);
            return { status: 'duplicate', event, text };
        }

        const suppress = settings.suppressWhenFocused && settings.windowFocused;
        const banner = forEvent.channels.banner && !suppress;
        const sound = forEvent.channels.sound && !suppress;
        const fireSystemNotification = () => {
            notifier.send(text, {
                notification: banner,
                sound,
                soundName: forEvent.sound,
                // Named after the project that called out, not the window showing this.
                title: project,
            });
        };

        let timer = null;
        if (!banner && !sound) {
            // Nothing to fire, so nothing to delay or cancel either.
        } else if (settings.delayMs > 0) {
            timer = setTimeoutImpl(fireSystemNotification, settings.delayMs);
        } else {
            fireSystemNotification();
        }

        const popup = ui.showMessage(project ? `🔔 Claude Code · ${project}: ${text}` : `🔔 Claude Code: ${text}`);
        if (popup && typeof popup.then === 'function') {
            popup.then((selection) => {
                if (selection && timer) clearTimeoutImpl(timer);
            });
        }

        log(`Notification shown [${event}]: ${text}`);
        return { status: 'shown', event, text, project, delayed: timer !== null };
    }

    return { handle };
}

module.exports = { createNotificationController, DEDUP_MS };
