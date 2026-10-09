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
    // Whether a banner asked for here reaches the user. It does not in a remote window
    // without the companion, so the VS Code notification stands in for it there.
    bannerReachesUser = () => true,
    // Answers whether this window should take a notification from a given
    // directory. Left open by default, which is how a single window behaves.
    decideOwnership = () => ({ answer: true, because: 'unrouted' }),
    ownId = process.pid,
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

    // Looks without taking, so a window can decide whether the notification is its
    // to answer before removing it from under the window it actually belongs to.
    function peek() {
        try {
            if (!fsImpl.existsSync(notifyFile)) return '';
            return fsImpl.readFileSync(notifyFile, 'utf8').trim();
        } catch (err) {
            log(`Failed to read trigger file: ${err.message}`);
            return '';
        }
    }

    /**
     * Takes the notification for this window. Renaming is atomic, so when several
     * windows reach for the same one exactly one succeeds and the rest are told
     * nothing is there — which is the answer they need.
     *
     * Taking it also clears it, so a dismissed-but-unacknowledged notification can
     * never replay and the next write always reads as a change.
     */
    function claim() {
        const claimed = `${notifyFile}.claimed-${ownId}`;
        try {
            fsImpl.renameSync(notifyFile, claimed);
        } catch (_) {
            return '';
        }

        let raw = '';
        try {
            raw = fsImpl.readFileSync(claimed, 'utf8').trim();
        } catch (err) {
            log(`Failed to read claimed notification: ${err.message}`);
        }
        try {
            fsImpl.unlinkSync(claimed);
        } catch (err) {
            log(`Failed to clean up claimed notification: ${err.message}`);
        }
        return raw;
    }

    function handle() {
        const waiting = peek();
        if (!waiting) return { status: 'empty' };

        const decision = decideOwnership(parsePayload(waiting).cwd);
        if (!decision.answer) {
            // Left in place on purpose: the window that owns this work will take it.
            return { status: 'not-ours', because: decision.because };
        }

        const raw = claim();
        if (!raw) return { status: 'taken' };

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
        // A choice that drops the VS Code notification still gets one when its banner
        // cannot reach the user, so the event is never lost.
        const showPopup = forEvent.channels.popup || (forEvent.channels.banner && !bannerReachesUser());

        if (!showPopup && !banner && !sound) {
            log(`Suppressed notification while VS Code is focused [${event}]`);
            return { status: 'suppressed', event, text };
        }

        const fireSystemNotification = () => {
            notifier.send(text, {
                notification: banner,
                sound,
                soundName: forEvent.sound,
                // Named after the project that called out, not the window showing this.
                title: project,
            });
        };

        // The delay is cancelled by answering the VS Code notification, so it only
        // applies when there is one to answer.
        let timer = null;
        if (!banner && !sound) {
            // Nothing to fire, so nothing to delay or cancel either.
        } else if (showPopup && settings.delayMs > 0) {
            timer = setTimeoutImpl(fireSystemNotification, settings.delayMs);
        } else {
            fireSystemNotification();
        }

        if (showPopup) {
            const popup = ui.showMessage(project ? `🔔 Claude Code · ${project}: ${text}` : `🔔 Claude Code: ${text}`);
            if (popup && typeof popup.then === 'function') {
                popup.then((selection) => {
                    if (selection && timer) clearTimeoutImpl(timer);
                });
            }
        }

        log(`Notification shown [${event}]: ${text}`);
        return { status: 'shown', event, text, project, delayed: timer !== null };
    }

    return { handle };
}

module.exports = { createNotificationController, DEDUP_MS };
