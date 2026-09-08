/**
 * Hands notification delivery to the companion extension when this window is
 * attached to a remote machine.
 *
 * VS Code routes a command to whichever side registered it, so the request crosses
 * the boundary on its own — there is no server, port or file in between. If the
 * companion is not installed the command simply has no home, which is how its
 * absence is detected: delivery falls back to trying it here, exactly as before.
 */

const COMPANION_ID = 'erdemgiray.claude-code-notifier-companion';
const COMMAND_SHOW = 'claudeCodeNotifier.showOnLocalMachine';
const COMMAND_READY = 'claudeCodeNotifier.companionReady';

// Two ways of asking, because the extension list is not always populated for the
// other side, while answering a command proves the companion is there and awake.
async function isCompanionInstalled({ getExtension, executeCommand }) {
    try {
        if (getExtension && getExtension(COMPANION_ID)) return true;
    } catch (_) {
        // fall through to asking it directly
    }
    try {
        await executeCommand(COMMAND_READY);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * `deliverHere` is the original behaviour: ask this machine's own operating system.
 * It stays the fallback for local windows and for a remote window with no companion.
 */
function createCompanionDelivery({ remote, executeCommand, deliverHere, log = () => {} }) {
    async function send(text, options = {}) {
        if (!remote) {
            deliverHere(text, options);
            return { via: 'here' };
        }

        try {
            const result = await executeCommand(COMMAND_SHOW, { text, ...options });
            const method = (result && result.method) || 'unknown';
            const error = (result && result.error) || null;
            if (error) log(`companion could not show the banner via ${method}: ${error}`);
            return { via: 'companion', method, error };
        } catch (err) {
            log(`companion not available (${err.message}) — trying this machine instead`);
            deliverHere(text, options);
            return { via: 'here', companionMissing: true };
        }
    }

    return { send };
}

/**
 * Diagnostics has to test the path notifications really take, so on a remote window
 * with a companion it must ask the companion — testing this machine's own banner
 * would report a failure for something that works.
 */
function companionNotifyAdapter({ executeCommand }) {
    const ask = (payload) => Promise.resolve(executeCommand(COMMAND_SHOW, payload));

    return {
        showOsNotification(text, done = () => {}) {
            ask({ text, notification: true, sound: false }).then(
                (result) => {
                    const method = `companion → ${(result && result.method) || 'unknown'}`;
                    const error = result && result.error;
                    done(error ? new Error(error) : null, { method });
                },
                (err) => done(err, { method: 'companion' }),
            );
        },
        playSound(done = () => {}) {
            ask({ text: '', notification: false, sound: true }).then(
                () => done(null),
                (err) => done(err),
            );
        },
        findTerminalNotifier: () => null,
    };
}

module.exports = {
    createCompanionDelivery,
    companionNotifyAdapter,
    isCompanionInstalled,
    COMPANION_ID,
    COMMAND_SHOW,
    COMMAND_READY,
};
