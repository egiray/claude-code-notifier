/**
 * What should happen for each kind of event.
 *
 * Every event now carries a single choice instead of being spread across an
 * on/off switch plus two global ones. The old settings still decide the answer for
 * anyone who set them, so an existing install behaves exactly as it did before the
 * update and nobody has to touch anything.
 */
const { normalizeEvent } = require('./payload');

const LEVELS = ['sound+banner', 'banner', 'sound', 'editor-only', 'off'];

// Each configurable event, the Claude Code events it covers, and the old setting
// that used to turn it on or off.
const EVENTS = [
    {
        key: 'permissionRequest',
        covers: ['permission_prompt'],
        legacyKey: 'notifyOnPermissionRequest',
        legacyDefault: true,
        defaultSound: 'Alert',
    },
    {
        key: 'question',
        covers: ['elicitation_dialog'],
        legacyKey: 'notifyOnQuestion',
        legacyDefault: true,
        defaultSound: 'Chime',
    },
    {
        // idle_prompt rides along with Stop; see CONTRIBUTING for why it is not alone.
        key: 'taskComplete',
        covers: ['Stop', 'idle_prompt'],
        legacyKey: 'notifyOnTaskComplete',
        legacyDefault: false,
        defaultSound: 'Default',
    },
    {
        key: 'subagentStop',
        covers: ['SubagentStop'],
        legacyKey: 'notifyOnSubagentStop',
        legacyDefault: false,
        defaultSound: 'Knock',
    },
];

function channelsFor(level) {
    return {
        popup: level !== 'off',
        banner: level === 'sound+banner' || level === 'banner',
        sound: level === 'sound+banner' || level === 'sound',
    };
}

/**
 * A level the user chose in the new model always wins. Otherwise, if they had
 * tuned any of the old settings, those are translated — losslessly, which is why
 * "editor-only" exists: turning both global switches off used to leave the VS Code
 * notification on its own, and that has to keep working.
 */
function migrateLevel({ enabled, banner, sound }) {
    if (enabled === false) return 'off';
    if (sound && banner) return 'sound+banner';
    if (sound) return 'sound';
    if (banner) return 'banner';
    return 'editor-only';
}

function levelFor(event, inspector) {
    const fallback = event.legacyDefault ? 'sound+banner' : 'off';
    // A level we do not recognise — typed by hand, or written by a newer version —
    // must not silence anything, so it is ignored rather than obeyed.
    const known = (value) => (typeof value === 'string' && LEVELS.includes(value) ? value : null);

    const explicit = known(inspector.explicit(`${event.key}.level`));
    if (explicit) return explicit;

    const legacyTouched = [event.legacyKey, 'systemNotification', 'sound']
        .some((key) => inspector.explicit(key) !== undefined);
    if (!legacyTouched) return known(inspector.value(`${event.key}.level`, fallback)) || fallback;

    return migrateLevel({
        enabled: inspector.value(event.legacyKey, event.legacyDefault),
        banner: inspector.value('systemNotification', true),
        sound: inspector.value('sound', true),
    });
}

/**
 * Returns the settings keyed by the event names Claude Code actually sends, so a
 * trigger can be answered with one lookup.
 */
function buildEventSettings(inspector) {
    const byEvent = {};
    for (const event of EVENTS) {
        const level = levelFor(event, inspector);
        const settings = {
            key: event.key,
            level,
            channels: channelsFor(level),
            sound: inspector.value(`${event.key}.sound`, event.defaultSound),
        };
        for (const name of event.covers) byEvent[normalizeEvent(name)] = settings;
    }
    return byEvent;
}

function settingsForEvent(byEvent, event) {
    return byEvent[normalizeEvent(event)] || null;
}

module.exports = { buildEventSettings, settingsForEvent, channelsFor, migrateLevel, EVENTS, LEVELS };
