const { runDiagnostics, checkSetup, runLiveChecks, buildReport, scriptPathFromCommand } = require('../lib/diagnostics');
const { SENTINEL, buildSettings } = require('../lib/hook-installer');

const SCRIPT = '/home/user/.claude/notify.js';

function makeFs({ files = {}, existing = [], writable = true } = {}) {
    return {
        readFileSync: (p) => {
            if (!(p in files)) throw new Error(`ENOENT: ${p}`);
            return files[p];
        },
        existsSync: (p) => existing.includes(p),
        writeFileSync: () => {
            if (!writable) throw new Error('EROFS: read-only file system');
        },
    };
}

function makeNotify({ terminalNotifier = null, failures = [] } = {}) {
    const calls = [];
    const respond = (name) => (text, cb) => {
        calls.push({ name, text });
        cb(failures.includes(name) ? new Error(`${name} failed`) : null, {});
    };
    return {
        calls,
        findTerminalNotifier: () => terminalNotifier,
        notifyViaTerminalNotifier: respond('terminal-notifier'),
        notifyViaOsascript: respond('osascript'),
        showOsNotification: respond('os-notification'),
        playSound: (cb) => {
            calls.push({ name: 'sound' });
            cb(failures.includes('sound') ? new Error('sound failed') : null, {});
        },
    };
}

function settingsWithHooks(scriptPath = SCRIPT) {
    return JSON.stringify(buildSettings({}, scriptPath).settings);
}

const noSleep = () => Promise.resolve();

// ── setup checks ─────────────────────────────────────────────────────────────

describe('checkSetup', () => {
    const base = {
        settingsPath: '/home/user/.claude/settings.json',
        notifyScriptDest: SCRIPT,
        notifyFile: '/tmp/claude-notify',
        platform: 'darwin',
        notify: makeNotify(),
    };

    function run(overrides) {
        return checkSetup({ ...base, ...overrides });
    }

    function find(checks, name) {
        return checks.find(c => c.name === name);
    }

    test('passes when everything is in place', () => {
        const checks = run({
            fsImpl: makeFs({
                files: { '/home/user/.claude/settings.json': settingsWithHooks() },
                existing: [SCRIPT],
            }),
            notify: makeNotify({ terminalNotifier: '/opt/homebrew/bin/terminal-notifier' }),
        });
        expect(find(checks, 'Hook configuration').ok).toBe(true);
        expect(find(checks, 'Hook configuration').detail).toContain('SubagentStop');
        expect(find(checks, 'Notify script').ok).toBe(true);
        expect(find(checks, 'Trigger file').ok).toBe(true);
        expect(find(checks, 'terminal-notifier').ok).toBe(true);
    });

    test('flags an unreadable settings file', () => {
        const checks = run({ fsImpl: makeFs({}) });
        expect(find(checks, 'Hook configuration').ok).toBe(false);
    });

    test('flags settings with no hooks of ours', () => {
        const checks = run({
            fsImpl: makeFs({ files: { '/home/user/.claude/settings.json': '{"hooks":{}}' } }),
        });
        expect(find(checks, 'Hook configuration').ok).toBe(false);
        expect(find(checks, 'Hook configuration').detail).toContain('No hooks registered');
    });

    // The exact state a machine upgraded from the Python-era release ends up in.
    test('flags a hook pointing at a script that no longer exists', () => {
        const legacy = JSON.stringify({
            hooks: {
                Notification: [{
                    matcher: 'permission_prompt',
                    hooks: [{ type: 'command', command: `python3 "/home/user/.claude/notify.py" ${SENTINEL}` }]
                }]
            }
        });
        const checks = run({
            fsImpl: makeFs({ files: { '/home/user/.claude/settings.json': legacy }, existing: [] }),
        });
        const stale = find(checks, 'Hook script path');
        expect(stale.ok).toBe(false);
        expect(stale.detail).toContain('notify.py');
    });

    test('flags a missing notify script', () => {
        const checks = run({
            fsImpl: makeFs({ files: { '/home/user/.claude/settings.json': settingsWithHooks() }, existing: [] }),
        });
        expect(find(checks, 'Notify script').ok).toBe(false);
    });

    test('flags a trigger file it cannot write', () => {
        const checks = run({
            fsImpl: makeFs({ files: { '/home/user/.claude/settings.json': settingsWithHooks() }, writable: false }),
        });
        expect(find(checks, 'Trigger file').ok).toBe(false);
        expect(find(checks, 'Trigger file').detail).toContain('read-only');
    });

    test('reports the osascript fallback when terminal-notifier is missing', () => {
        const checks = run({
            fsImpl: makeFs({ files: { '/home/user/.claude/settings.json': settingsWithHooks() } }),
        });
        expect(find(checks, 'terminal-notifier').ok).toBe(false);
        expect(find(checks, 'terminal-notifier').detail).toContain('Script Editor');
    });

    test('skips the terminal-notifier check off macOS', () => {
        const checks = run({
            platform: 'linux',
            fsImpl: makeFs({ files: { '/home/user/.claude/settings.json': settingsWithHooks() } }),
        });
        expect(find(checks, 'terminal-notifier')).toBeUndefined();
    });
});

describe('scriptPathFromCommand', () => {
    test('reads a quoted path', () => {
        expect(scriptPathFromCommand(`node "/a b/notify.js" ${SENTINEL}`)).toBe('/a b/notify.js');
    });

    test('reads an unquoted path', () => {
        expect(scriptPathFromCommand(`node /a/notify.js ${SENTINEL}`)).toBe('/a/notify.js');
    });
});

// ── live checks ──────────────────────────────────────────────────────────────

describe('runLiveChecks', () => {
    test('exercises terminal-notifier, osascript and sound on macOS', async () => {
        const notify = makeNotify({ terminalNotifier: '/usr/local/bin/terminal-notifier' });
        const results = await runLiveChecks({ platform: 'darwin', notify, sleep: noSleep });
        expect(notify.calls.map(c => c.name)).toEqual(['terminal-notifier', 'osascript', 'sound']);
        expect(results.every(r => r.ok)).toBe(true);
    });

    test('skips terminal-notifier when it is not installed', async () => {
        const notify = makeNotify();
        await runLiveChecks({ platform: 'darwin', notify, sleep: noSleep });
        expect(notify.calls.map(c => c.name)).toEqual(['osascript', 'sound']);
    });

    test('labels each step with its position so banners can be told apart', async () => {
        const labels = [];
        await runLiveChecks({ platform: 'darwin', notify: makeNotify(), sleep: noSleep, onStep: l => labels.push(l) });
        expect(labels).toEqual(['1/2 Banner via osascript', '2/2 Sound']);
    });

    test('records which step failed', async () => {
        const notify = makeNotify({ failures: ['osascript'] });
        const results = await runLiveChecks({ platform: 'darwin', notify, sleep: noSleep });
        expect(results[0].ok).toBe(false);
        expect(results[0].detail).toContain('osascript failed');
        expect(results[1].ok).toBe(true);
    });

    test('uses a single generic banner check off macOS', async () => {
        const notify = makeNotify();
        await runLiveChecks({ platform: 'linux', notify, sleep: noSleep });
        expect(notify.calls.map(c => c.name)).toEqual(['os-notification', 'sound']);
    });
});

// ── report ───────────────────────────────────────────────────────────────────

describe('buildReport', () => {
    test('tells macOS users where to allow Script Editor notifications', () => {
        const report = buildReport({
            platform: 'darwin',
            notify: makeNotify(),
            setupChecks: [{ name: 'Notify script', ok: true, detail: SCRIPT }],
            liveChecks: [{ name: 'Banner via osascript', ok: true, detail: 'ran' }],
        });
        expect(report).toContain('System Settings');
        expect(report).toContain('Script Editor');
        expect(report).toContain('brew install terminal-notifier');
    });

    test('marks failures clearly', () => {
        const report = buildReport({
            platform: 'darwin',
            notify: makeNotify({ terminalNotifier: '/usr/local/bin/terminal-notifier' }),
            setupChecks: [{ name: 'Notify script', ok: false, detail: 'missing' }],
            liveChecks: [{ name: 'Sound', ok: true, detail: 'ran' }],
        });
        expect(report).toContain('FAIL');
        expect(report).toContain('1 check(s) failed');
    });

    test('says so when nothing is wrong', () => {
        const report = buildReport({
            platform: 'darwin',
            notify: makeNotify({ terminalNotifier: '/usr/local/bin/terminal-notifier' }),
            setupChecks: [{ name: 'Notify script', ok: true, detail: SCRIPT }],
            liveChecks: [{ name: 'Sound', ok: true, detail: 'ran' }],
        });
        expect(report).toContain('Everything the extension can verify');
    });
});

describe('runDiagnostics', () => {
    test('returns setup checks, live checks and a rendered report', async () => {
        const result = await runDiagnostics({
            settingsPath: '/home/user/.claude/settings.json',
            notifyScriptDest: SCRIPT,
            notifyFile: '/tmp/claude-notify',
            platform: 'darwin',
            notify: makeNotify(),
            fsImpl: makeFs({ files: { '/home/user/.claude/settings.json': settingsWithHooks() }, existing: [SCRIPT] }),
            sleep: noSleep,
        });

        expect(result.setupChecks.length).toBeGreaterThan(0);
        expect(result.liveChecks.length).toBeGreaterThan(0);
        expect(result.report).toContain('Claude Code Notifier — diagnostics');
    });
});
