const { createNotificationController } = require('../lib/notification-controller');
const { buildEventSettings } = require('../lib/settings');

// The settings the extension would hand over for a default install: permission and
// question announce themselves fully, task completion stays quiet.
function defaultEvents(overrides = {}) {
    return buildEventSettings({
        explicit: (key) => overrides[key],
        value: (key, fallback) => (key in overrides ? overrides[key] : fallback),
    });
}

function makeFs(initial = '') {
    let content = initial;
    let readable = true;
    return {
        existsSync: () => true,
        readFileSync: () => {
            if (!readable) throw new Error('EACCES');
            return content;
        },
        writeFileSync: (_file, value) => { content = value; },
        __write: (value) => { content = value; },
        __read: () => content,
        __breakReads: () => { readable = false; },
    };
}

function makeHarness({ settings = {}, initialContent = '' } = {}) {
    const fsImpl = makeFs(initialContent);
    const popups = [];
    const sent = [];
    const timers = [];
    let clock = 1000;

    const controller = createNotificationController({
        notifyFile: '/tmp/claude-notify',
        fsImpl,
        getSettings: () => ({
            events: defaultEvents(),
            minTaskSeconds: 0,
            delayMs: 0,
            suppressWhenFocused: false,
            windowFocused: false,
            ...settings,
        }),
        ui: {
            showMessage: (text) => {
                let resolve;
                const promise = new Promise((r) => { resolve = r; });
                popups.push({ text, resolve });
                return promise;
            },
        },
        notifier: { send: (text, options) => sent.push({ text, options }) },
        now: () => clock,
        setTimeoutImpl: (fn, ms) => {
            const timer = { fn, ms, cancelled: false };
            timers.push(timer);
            return timer;
        },
        clearTimeoutImpl: (timer) => { if (timer) timer.cancelled = true; },
    });

    return {
        controller,
        fsImpl,
        popups,
        sent,
        timers,
        advance: (ms) => { clock += ms; },
        fire: (payload) => {
            fsImpl.__write(typeof payload === 'string' ? payload : JSON.stringify(payload));
            return controller.handle();
        },
    };
}

describe('delivery', () => {
    test('shows a popup and a system notification for an allowed event', () => {
        const h = makeHarness();
        const result = h.fire({ event: 'permission_prompt', text: 'Need permission' });

        expect(result.status).toBe('shown');
        expect(h.popups).toHaveLength(1);
        expect(h.popups[0].text).toContain('Need permission');
        expect(h.sent).toEqual([{
            text: 'Need permission',
            options: { notification: true, sound: true, soundName: 'Alert', title: null },
        }]);
    });

    test('clears the trigger file as soon as it is read', () => {
        const h = makeHarness();
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(h.fsImpl.__read()).toBe('');
    });

    test('a second change with an empty file is a no-op', () => {
        const h = makeHarness();
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(h.controller.handle().status).toBe('empty');
        expect(h.popups).toHaveLength(1);
    });

    test('survives an unreadable trigger file', () => {
        const h = makeHarness();
        h.fsImpl.__breakReads();
        expect(h.controller.handle().status).toBe('empty');
        expect(h.popups).toHaveLength(0);
    });
});

// The bug this suite exists for: an unacknowledged popup used to silence the
// extension until VS Code was fully restarted.
describe('unacknowledged popups', () => {
    test('keeps notifying when the user never touches the first popup', () => {
        const h = makeHarness();

        h.fire({ event: 'permission_prompt', text: 'First' });
        h.advance(5000);
        const second = h.fire({ event: 'permission_prompt', text: 'Second' });
        h.advance(5000);
        const third = h.fire({ event: 'elicitation_dialog', text: 'Third' });

        expect(second.status).toBe('shown');
        expect(third.status).toBe('shown');
        expect(h.popups.map(p => p.text)).toEqual([
            '🔔 Claude Code: First',
            '🔔 Claude Code: Second',
            '🔔 Claude Code: Third',
        ]);
        expect(h.sent).toHaveLength(3);
    });

    test('ten ignored popups still produce ten system notifications', () => {
        const h = makeHarness();
        for (let i = 0; i < 10; i += 1) {
            h.advance(5000);
            h.fire({ event: 'permission_prompt', text: `Message ${i}` });
        }
        expect(h.sent).toHaveLength(10);
    });
});

describe('filtering', () => {
    test('skips events the user turned off', () => {
        const h = makeHarness();
        const result = h.fire({ event: 'idle_prompt', text: 'Done' });
        expect(result.status).toBe('filtered');
        expect(h.popups).toHaveLength(0);
        expect(h.sent).toHaveLength(0);
    });

    test('matches SubagentStop against the snake_case setting name', () => {
        const h = makeHarness({ settings: { events: defaultEvents({ 'subagentStop.level': 'sound+banner' }) } });
        expect(h.fire({ event: 'SubagentStop', text: 'Subagent done' }).status).toBe('shown');
    });
});

describe('deduplication', () => {
    test('drops an identical repeat inside the dedup window', () => {
        const h = makeHarness();
        h.fire({ event: 'permission_prompt', text: 'Same' });
        h.advance(500);
        expect(h.fire({ event: 'permission_prompt', text: 'Same' }).status).toBe('duplicate');
        expect(h.sent).toHaveLength(1);
    });

    test('allows the same message again after the window passes', () => {
        const h = makeHarness();
        h.fire({ event: 'permission_prompt', text: 'Same' });
        h.advance(3000);
        expect(h.fire({ event: 'permission_prompt', text: 'Same' }).status).toBe('shown');
        expect(h.sent).toHaveLength(2);
    });
});

describe('delayed notifications', () => {
    test('holds the system notification until the delay elapses', () => {
        const h = makeHarness({ settings: { delayMs: 5000 } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });

        expect(h.sent).toHaveLength(0);
        expect(h.timers).toHaveLength(1);
        h.timers[0].fn();
        expect(h.sent).toHaveLength(1);
    });

    test('cancels the pending system notification when the popup is answered', async () => {
        const h = makeHarness({ settings: { delayMs: 5000 } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });

        h.popups[0].resolve('OK');
        await Promise.resolve();

        expect(h.timers[0].cancelled).toBe(true);
        expect(h.sent).toHaveLength(0);
    });

    test('leaves the pending notification alone when the popup is dismissed', async () => {
        const h = makeHarness({ settings: { delayMs: 5000 } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });

        h.popups[0].resolve(undefined);
        await Promise.resolve();

        expect(h.timers[0].cancelled).toBe(false);
    });
});

describe('what each level delivers', () => {
    test('"sound" plays but does not put a banner on screen', () => {
        const h = makeHarness({ settings: { events: defaultEvents({ 'permissionRequest.level': 'sound' }) } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(h.sent[0].options).toMatchObject({ notification: false, sound: true });
        expect(h.popups).toHaveLength(1);
    });

    test('"banner" shows but stays quiet', () => {
        const h = makeHarness({ settings: { events: defaultEvents({ 'permissionRequest.level': 'banner' }) } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(h.sent[0].options).toMatchObject({ notification: true, sound: false });
    });

    test('"editor-only" leaves the machine alone and only shows the VS Code notification', () => {
        const h = makeHarness({ settings: { events: defaultEvents({ 'permissionRequest.level': 'editor-only' }) } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(h.sent).toHaveLength(0);
        expect(h.popups).toHaveLength(1);
    });

    test('"off" says nothing at all', () => {
        const h = makeHarness({ settings: { events: defaultEvents({ 'permissionRequest.level': 'off' }) } });
        const result = h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(result.status).toBe('filtered');
        expect(h.popups).toHaveLength(0);
    });

    test('each event carries its own sound', () => {
        const h = makeHarness({ settings: { events: defaultEvents({ 'taskComplete.level': 'sound+banner' }) } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        h.fire({ event: 'Stop', text: 'All done' });
        expect(h.sent.map(s => s.options.soundName)).toEqual(['Alert', 'Default']);
    });
});

describe('short tasks', () => {
    const events = { events: defaultEvents({ 'taskComplete.level': 'sound+banner' }) };

    test('a task that finished quicker than the threshold is left alone', () => {
        const h = makeHarness({ settings: { ...events, minTaskSeconds: 10 } });
        const result = h.fire({ event: 'Stop', text: 'All done', durationMs: 3000 });
        expect(result.status).toBe('too-short');
        expect(h.popups).toHaveLength(0);
        expect(h.sent).toHaveLength(0);
    });

    test('a longer task still announces itself', () => {
        const h = makeHarness({ settings: { ...events, minTaskSeconds: 10 } });
        expect(h.fire({ event: 'Stop', text: 'All done', durationMs: 30000 }).status).toBe('shown');
    });

    test('with no threshold set, every task announces itself', () => {
        const h = makeHarness({ settings: events });
        expect(h.fire({ event: 'Stop', text: 'All done', durationMs: 5 }).status).toBe('shown');
    });

    test('an unmeasured task is never suppressed', () => {
        const h = makeHarness({ settings: { ...events, minTaskSeconds: 10 } });
        expect(h.fire({ event: 'Stop', text: 'All done' }).status).toBe('shown');
    });
});

describe('which project called out', () => {
    test('the project is named in both the popup and the banner', () => {
        const h = makeHarness();
        h.fire({ event: 'permission_prompt', text: 'Need permission', project: 'billing-api' });
        expect(h.popups[0].text).toContain('billing-api');
        expect(h.sent[0].options.title).toBe('billing-api');
    });

    test('without a project it reads as it always did', () => {
        const h = makeHarness();
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(h.popups[0].text).toBe('🔔 Claude Code: Need permission');
    });
});

describe('suppressWhenFocused', () => {
    test('still shows the popup but silences sound and banner', () => {
        const h = makeHarness({ settings: { suppressWhenFocused: true, windowFocused: true } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });

        expect(h.popups).toHaveLength(1);
        // With both channels silenced there is nothing to deliver, so the notifier is
        // not troubled at all — which in a remote window saves a pointless round trip.
        expect(h.sent).toHaveLength(0);
    });

    test('does not silence anything when the window is in the background', () => {
        const h = makeHarness({ settings: { suppressWhenFocused: true, windowFocused: false } });
        h.fire({ event: 'permission_prompt', text: 'Need permission' });
        expect(h.sent[0].options).toMatchObject({ notification: true, sound: true });
    });
});
