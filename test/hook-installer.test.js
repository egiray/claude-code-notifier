const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    isManaged, buildSettings, removeManaged, install, uninstall, SENTINEL
} = require('../lib/hook-installer');

// ── pure function tests (no file I/O) ───────────────────────────────────────

describe('isManaged', () => {
    test('returns true for entries with our sentinel', () => {
        const entry = { hooks: [{ type: 'command', command: `python3 /some/path ${SENTINEL}` }] };
        expect(isManaged(entry)).toBe(true);
    });

    test('returns false for entries without our sentinel', () => {
        const entry = { hooks: [{ type: 'command', command: 'echo hello' }] };
        expect(isManaged(entry)).toBe(false);
    });

    test('returns false for entries with no hooks array', () => {
        expect(isManaged({})).toBe(false);
        expect(isManaged({ hooks: [] })).toBe(false);
    });
});

describe('buildSettings', () => {
    const scriptPath = '/home/user/.claude/notify.py';

    test('adds Notification hook to empty settings', () => {
        const { settings, installed } = buildSettings({}, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.Notification[0].matcher).toBe('permission_prompt|elicitation_dialog');
        expect(settings.hooks.Notification[0].hooks[0].command).toContain(scriptPath);
        expect(settings.hooks.Notification[0].hooks[0].command).toContain(SENTINEL);
    });

    test('adds hook alongside existing unrelated hooks', () => {
        const existing = {
            hooks: {
                PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }]
            }
        };
        const { settings, installed } = buildSettings(existing, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.PreToolUse).toHaveLength(1);
        expect(settings.hooks.Notification).toHaveLength(1);
    });

    test('adds hook alongside existing unrelated Notification entries', () => {
        const existing = {
            hooks: {
                Notification: [{ matcher: 'idle_prompt', hooks: [{ type: 'command', command: 'other.sh' }] }]
            }
        };
        const { settings, installed } = buildSettings(existing, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.Notification).toHaveLength(2);
        expect(settings.hooks.Notification[0].hooks[0].command).toBe('other.sh');
    });

    test('is idempotent — skips if our hook is already present', () => {
        const { settings: first } = buildSettings({}, scriptPath);
        const { settings: second, installed } = buildSettings(first, scriptPath);
        expect(installed).toBe(false);
        expect(second.hooks.Notification).toHaveLength(1);
    });

    test('does not mutate the original settings object', () => {
        const original = {};
        buildSettings(original, scriptPath);
        expect(original.hooks).toBeUndefined();
    });
});

describe('removeManaged', () => {
    const scriptPath = '/home/user/.claude/notify.py';

    test('removes our hook entry', () => {
        const { settings: withHook } = buildSettings({}, scriptPath);
        const { settings, removed } = removeManaged(withHook);
        expect(removed).toBe(1);
        expect(settings.hooks).toBeUndefined();
    });

    test('leaves unrelated hooks untouched', () => {
        const input = {
            hooks: {
                PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }]
            }
        };
        const { settings, removed } = removeManaged(input);
        expect(removed).toBe(0);
        expect(settings.hooks.PreToolUse).toHaveLength(1);
    });

    test('removes only our entry when mixed with unrelated ones', () => {
        const existing = {
            hooks: {
                Notification: [{ matcher: 'idle_prompt', hooks: [{ type: 'command', command: 'other.sh' }] }]
            }
        };
        const { settings: withBoth } = buildSettings(existing, scriptPath);
        const { settings, removed } = removeManaged(withBoth);
        expect(removed).toBe(1);
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.Notification[0].hooks[0].command).toBe('other.sh');
    });

    test('handles settings with no hooks key', () => {
        const { settings, removed } = removeManaged({});
        expect(removed).toBe(0);
        expect(settings.hooks).toBeUndefined();
    });

    test('does not mutate the original settings object', () => {
        const { settings: withHook } = buildSettings({}, scriptPath);
        const original = JSON.parse(JSON.stringify(withHook));
        removeManaged(withHook);
        expect(withHook).toEqual(original);
    });
});

// ── file I/O tests (use temp directories) ───────────────────────────────────

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'hook-installer-test-'));
}

describe('install', () => {
    let tmpDir, settingsPath, scriptSrc, scriptDest;

    beforeEach(() => {
        tmpDir = makeTempDir();
        settingsPath = path.join(tmpDir, 'settings.json');
        scriptSrc = path.join(tmpDir, 'notify.py');
        scriptDest = path.join(tmpDir, 'dest', 'notify.py');
        fs.writeFileSync(scriptSrc, '# notify script');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('creates settings.json when it does not exist', () => {
        install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });
        expect(fs.existsSync(settingsPath)).toBe(true);
        const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(written.hooks.Notification).toHaveLength(1);
    });

    test('copies notify.py to destination', () => {
        install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });
        expect(fs.existsSync(scriptDest)).toBe(true);
        expect(fs.readFileSync(scriptDest, 'utf8')).toBe('# notify script');
    });

    test('handles malformed settings.json gracefully', () => {
        fs.writeFileSync(settingsPath, 'this is not json }{');
        expect(() => install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest })).not.toThrow();
        const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(written.hooks.Notification).toHaveLength(1);
    });

    test('handles empty settings.json gracefully', () => {
        fs.writeFileSync(settingsPath, '');
        expect(() => install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest })).not.toThrow();
    });

    test('overwrites existing notify.py to keep it up to date', () => {
        fs.mkdirSync(path.dirname(scriptDest), { recursive: true });
        fs.writeFileSync(scriptDest, '# old script');
        const { scriptCopied } = install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });
        expect(scriptCopied).toBe(true);
        expect(fs.readFileSync(scriptDest, 'utf8')).not.toBe('# old script');
    });

    test('is idempotent — running twice does not duplicate hooks', () => {
        install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });
        install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });
        const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(written.hooks.Notification).toHaveLength(1);
    });
});

describe('uninstall', () => {
    let tmpDir, settingsPath;

    beforeEach(() => {
        tmpDir = makeTempDir();
        settingsPath = path.join(tmpDir, 'settings.json');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('removes our hook and cleans up empty sections', () => {
        const { settings } = buildSettings({}, '/some/notify.py');
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        const { removed } = uninstall({ settingsPath });
        expect(removed).toBe(1);
        const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(written.hooks).toBeUndefined();
    });

    test('handles missing settings.json gracefully', () => {
        expect(() => uninstall({ settingsPath })).not.toThrow();
    });
});
