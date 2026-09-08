const {
    createCompanionDelivery, companionNotifyAdapter, isCompanionInstalled,
    COMPANION_ID, COMMAND_SHOW, COMMAND_READY,
} = require('../lib/companion');

function makeDelivery({ remote = true, executeCommand } = {}) {
    const delivered = [];
    const delivery = createCompanionDelivery({
        remote,
        executeCommand,
        deliverHere: (text, options) => delivered.push({ text, options }),
    });
    return { delivery, delivered };
}

describe('where a notification is delivered', () => {
    test('a local window is served by this machine, as before', async () => {
        const executeCommand = jest.fn();
        const { delivery, delivered } = makeDelivery({ remote: false, executeCommand });

        const result = await delivery.send('Need permission', { sound: true });

        expect(result.via).toBe('here');
        expect(delivered).toEqual([{ text: 'Need permission', options: { sound: true } }]);
        expect(executeCommand).not.toHaveBeenCalled();
    });

    test('a remote window hands the whole payload to the companion', async () => {
        const executeCommand = jest.fn().mockResolvedValue({ method: 'terminal-notifier' });
        const { delivery, delivered } = makeDelivery({ executeCommand });

        const result = await delivery.send('Need permission', { notification: true, sound: false });

        expect(result).toEqual({ via: 'companion', method: 'terminal-notifier', error: null });
        expect(executeCommand).toHaveBeenCalledWith(COMMAND_SHOW, {
            text: 'Need permission', notification: true, sound: false,
        });
        expect(delivered).toEqual([]);
    });

    test('a missing companion falls back to this machine and says so', async () => {
        const executeCommand = jest.fn().mockRejectedValue(new Error("command not found"));
        const { delivery, delivered } = makeDelivery({ executeCommand });

        const result = await delivery.send('Need permission', {});

        expect(result).toEqual({ via: 'here', companionMissing: true });
        expect(delivered).toHaveLength(1);
    });

    test('a companion that could not show the banner reports the reason', async () => {
        const executeCommand = jest.fn().mockResolvedValue({ method: 'osascript', error: 'not allowed' });
        const { delivery, delivered } = makeDelivery({ executeCommand });

        const result = await delivery.send('Need permission', {});

        // Already delivered to the right machine, so there is nothing to retry here.
        expect(result).toEqual({ via: 'companion', method: 'osascript', error: 'not allowed' });
        expect(delivered).toEqual([]);
    });
});

describe('finding out whether the companion is there', () => {
    test('the extension list answers it outright', async () => {
        const executeCommand = jest.fn();
        const found = await isCompanionInstalled({
            getExtension: (id) => (id === COMPANION_ID ? { id } : undefined),
            executeCommand,
        });
        expect(found).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
    });

    test('when the list is empty, answering the ping proves it is awake', async () => {
        const executeCommand = jest.fn().mockResolvedValue(true);
        const found = await isCompanionInstalled({ getExtension: () => undefined, executeCommand });
        expect(found).toBe(true);
        expect(executeCommand).toHaveBeenCalledWith(COMMAND_READY);
    });

    test('an unanswered ping means it is not installed', async () => {
        const executeCommand = jest.fn().mockRejectedValue(new Error('command not found'));
        expect(await isCompanionInstalled({ getExtension: () => undefined, executeCommand })).toBe(false);
    });

    test('an extension list that throws is not fatal', async () => {
        const executeCommand = jest.fn().mockResolvedValue(true);
        const found = await isCompanionInstalled({
            getExtension: () => { throw new Error('not available here'); },
            executeCommand,
        });
        expect(found).toBe(true);
    });
});

describe('diagnostics through the companion', () => {
    test('a delivered banner is reported as the companion delivering it', (done) => {
        const adapter = companionNotifyAdapter({
            executeCommand: () => Promise.resolve({ method: 'terminal-notifier' }),
        });
        adapter.showOsNotification('Diagnostic', (err, info) => {
            expect(err).toBeNull();
            expect(info.method).toBe('companion → terminal-notifier');
            done();
        });
    });

    test("the companion's own failure is reported as a failure", (done) => {
        const adapter = companionNotifyAdapter({
            executeCommand: () => Promise.resolve({ method: 'osascript', error: 'not allowed' }),
        });
        adapter.showOsNotification('Diagnostic', (err) => {
            expect(err.message).toBe('not allowed');
            done();
        });
    });

    test('sound is asked for on its own, with no banner alongside it', (done) => {
        const calls = [];
        const adapter = companionNotifyAdapter({
            executeCommand: (command, payload) => { calls.push(payload); return Promise.resolve({}); },
        });
        adapter.playSound((err) => {
            expect(err).toBeNull();
            expect(calls).toEqual([{ text: '', notification: false, sound: true }]);
            done();
        });
    });
});
