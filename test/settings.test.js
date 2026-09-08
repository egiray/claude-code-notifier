const { buildEventSettings, settingsForEvent, channelsFor, migrateLevel, LEVELS } = require('../lib/settings');

// Models a VS Code configuration: `chosen` is what the user actually set, anything
// else falls back to the default the caller asks for.
function config(chosen = {}) {
    return {
        explicit: (key) => chosen[key],
        value: (key, fallback) => (key in chosen ? chosen[key] : fallback),
    };
}

function levelOf(chosen, event) {
    return settingsForEvent(buildEventSettings(config(chosen)), event).level;
}

describe('a fresh install', () => {
    test('announces permission requests and questions, and stays quiet otherwise', () => {
        expect(levelOf({}, 'permission_prompt')).toBe('sound+banner');
        expect(levelOf({}, 'elicitation_dialog')).toBe('sound+banner');
        expect(levelOf({}, 'Stop')).toBe('off');
        expect(levelOf({}, 'SubagentStop')).toBe('off');
    });

    test('gives each event a sound of its own', () => {
        const events = buildEventSettings(config());
        const sounds = ['permission_prompt', 'elicitation_dialog', 'Stop', 'SubagentStop']
            .map((event) => settingsForEvent(events, event).sound);
        expect(new Set(sounds).size).toBe(sounds.length);
    });
});

// The promise to people who already had this installed: nothing changes for them.
describe('an existing install is translated, not reset', () => {
    test('an event they turned off stays off', () => {
        expect(levelOf({ notifyOnQuestion: false }, 'elicitation_dialog')).toBe('off');
    });

    test('an event they turned on starts announcing itself', () => {
        expect(levelOf({ notifyOnTaskComplete: true }, 'Stop')).toBe('sound+banner');
    });

    test('sound turned off leaves the banner', () => {
        expect(levelOf({ sound: false }, 'permission_prompt')).toBe('banner');
    });

    test('the banner turned off leaves the sound', () => {
        expect(levelOf({ systemNotification: false }, 'permission_prompt')).toBe('sound');
    });

    test('both turned off leaves the VS Code notification on its own', () => {
        // This is why "editor-only" exists — it is the one combination the four
        // levels borrowed from elsewhere cannot express.
        expect(levelOf({ sound: false, systemNotification: false }, 'permission_prompt'))
            .toBe('editor-only');
    });

    test('the old switches reach every event, not just the one they set', () => {
        const chosen = { notifyOnSubagentStop: true, sound: false };
        expect(levelOf(chosen, 'SubagentStop')).toBe('banner');
        expect(levelOf(chosen, 'permission_prompt')).toBe('banner');
    });

    test('idle_prompt is answered by the task-complete choice', () => {
        expect(levelOf({ notifyOnTaskComplete: true }, 'idle_prompt')).toBe('sound+banner');
    });
});

describe('once a new choice is made', () => {
    test('it wins over anything left behind by the old settings', () => {
        expect(levelOf({
            'taskComplete.level': 'sound',
            notifyOnTaskComplete: false,
            sound: false,
        }, 'Stop')).toBe('sound');
    });

    test('a value we do not recognise is ignored rather than obeyed', () => {
        expect(levelOf({ 'permissionRequest.level': 'shout' }, 'permission_prompt'))
            .toBe('sound+banner');
    });
});

describe('what a level means', () => {
    test('each level delivers the channels it names', () => {
        expect(channelsFor('sound+banner')).toEqual({ popup: true, banner: true, sound: true });
        expect(channelsFor('banner')).toEqual({ popup: true, banner: true, sound: false });
        expect(channelsFor('sound')).toEqual({ popup: true, banner: false, sound: true });
        expect(channelsFor('editor-only')).toEqual({ popup: true, banner: false, sound: false });
        expect(channelsFor('off')).toEqual({ popup: false, banner: false, sound: false });
    });

    test('every level the settings offer is one the translation can produce', () => {
        const reachable = new Set([
            migrateLevel({ enabled: false }),
            migrateLevel({ enabled: true, banner: true, sound: true }),
            migrateLevel({ enabled: true, banner: true, sound: false }),
            migrateLevel({ enabled: true, banner: false, sound: true }),
            migrateLevel({ enabled: true, banner: false, sound: false }),
        ]);
        expect([...reachable].sort()).toEqual([...LEVELS].sort());
    });
});

describe('an event nobody configured', () => {
    test('is simply not answered', () => {
        expect(settingsForEvent(buildEventSettings(config()), 'pre_tool_use')).toBeNull();
    });
});
