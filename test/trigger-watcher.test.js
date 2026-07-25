const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { createTriggerWatcher } = require('../lib/trigger-watcher');

// Generous by design: these tests wait on the real filesystem, and the whole suite
// runs in parallel workers, so "eventually" can genuinely take a few seconds.
function waitFor(predicate, { timeout = 12000, step = 25 } = {}) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
            if (predicate()) return resolve();
            if (Date.now() - started > timeout) return reject(new Error('timed out waiting for condition'));
            setTimeout(tick, step);
        };
        tick();
    });
}

// ── real filesystem behaviour ────────────────────────────────────────────────

describe('watching a real file', () => {
    jest.setTimeout(20000);

    let dir;
    let notifyFile;
    let watcher;
    let changes;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccn-watch-'));
        notifyFile = path.join(dir, 'claude-notify');
        changes = 0;
        watcher = createTriggerWatcher({
            notifyFile,
            onChange: () => { changes += 1; },
            pollIntervalMs: 100,
            rearmDelayMs: 50,
        });
    });

    afterEach(() => {
        watcher.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('creates the trigger file if it does not exist', () => {
        watcher.start();
        expect(fs.existsSync(notifyFile)).toBe(true);
    });

    test('reports a write', async () => {
        watcher.start();
        await waitFor(() => watcher.isArmed());

        const before = changes;
        fs.writeFileSync(notifyFile, 'hello');
        await waitFor(() => changes > before);
    });

    test('sweeps once on start so events during VS Code startup are not lost', () => {
        fs.writeFileSync(notifyFile, 'arrived before we were watching');
        watcher.start();
        expect(changes).toBe(1);
    });

    // fs.watch can take a moment to go live on macOS. Anything written in that
    // window is invisible to it, so the poll has to catch it on its own.
    test('the poll catches a write the watch handle missed', () => {
        watcher.start();
        const before = changes;

        fs.writeFileSync(notifyFile, 'written while the watch was still coming up');
        watcher.poll();

        expect(changes).toBe(before + 1);
    });

    test('the poll stays quiet when nothing changed', () => {
        watcher.start();
        const before = changes;
        watcher.poll();
        watcher.poll();
        expect(changes).toBe(before);
    });

    test('recovers after the file is deleted out from under it', async () => {
        watcher.start();
        await waitFor(() => watcher.isArmed());

        fs.rmSync(notifyFile);
        await waitFor(() => watcher.rearmCount() > 0);
        await waitFor(() => fs.existsSync(notifyFile));

        const before = changes;
        fs.writeFileSync(notifyFile, 'after deletion');
        await waitFor(() => changes > before);
    });

    test('recovers after the file is replaced by a new inode', async () => {
        watcher.start();
        await waitFor(() => watcher.isArmed());

        const replacement = path.join(dir, 'replacement');
        fs.writeFileSync(replacement, 'fresh');
        fs.renameSync(replacement, notifyFile);

        await waitFor(() => watcher.rearmCount() > 0);

        const before = changes;
        fs.writeFileSync(notifyFile, 'after replacement');
        await waitFor(() => changes > before);
    });

    test('stops cleanly and reports no further changes', async () => {
        watcher.start();
        await waitFor(() => watcher.isArmed());
        watcher.stop();

        const before = changes;
        fs.writeFileSync(notifyFile, 'ignored');
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(changes).toBe(before);
    });
});

// ── failure paths that are hard to provoke for real ──────────────────────────

describe('watch handle failures', () => {
    function makeFakeFs({ watchThrows = false } = {}) {
        const emitters = [];
        return {
            emitters,
            existsSync: () => true,
            writeFileSync: () => {},
            statSync: () => ({ ino: 1, mtimeMs: 1, size: 0 }),
            watch: () => {
                if (watchThrows) throw new Error('fs.watch unavailable');
                const emitter = new EventEmitter();
                emitter.close = () => { emitter.closed = true; };
                emitters.push(emitter);
                return emitter;
            },
        };
    }

    test('re-arms after fs.watch throws', async () => {
        const fsImpl = makeFakeFs({ watchThrows: true });
        const watcher = createTriggerWatcher({
            notifyFile: '/tmp/claude-notify',
            onChange: () => {},
            fsImpl,
            rearmDelayMs: 10,
        });
        watcher.start();
        await waitFor(() => watcher.rearmCount() > 0);
        watcher.stop();
    });

    test('re-arms after the watch handle emits an error', async () => {
        const fsImpl = makeFakeFs();
        const watcher = createTriggerWatcher({
            notifyFile: '/tmp/claude-notify',
            onChange: () => {},
            fsImpl,
            rearmDelayMs: 10,
        });
        watcher.start();
        expect(fsImpl.emitters).toHaveLength(1);

        fsImpl.emitters[0].emit('error', new Error('handle died'));

        await waitFor(() => fsImpl.emitters.length > 1);
        expect(fsImpl.emitters[0].closed).toBe(true);
        watcher.stop();
    });

    test('an error on the handle does not crash the process', () => {
        const fsImpl = makeFakeFs();
        const watcher = createTriggerWatcher({
            notifyFile: '/tmp/claude-notify',
            onChange: () => {},
            fsImpl,
            rearmDelayMs: 10,
        });
        watcher.start();
        expect(() => fsImpl.emitters[0].emit('error', new Error('boom'))).not.toThrow();
        watcher.stop();
    });
});
