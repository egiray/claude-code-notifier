const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    isManaged, buildSettings, removeManaged, install, uninstall, SENTINEL, MATCHER
} = require('../lib/hook-installer');

// ── pure function tests (no file I/O) ───────────────────────────────────────

describe('isManaged', () => {
    test('returns true for entries with our sentinel', () => {
        const entry = { hooks: [{ type: 'command', command: `node /some/path ${SENTINEL}` }] };
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
    const scriptPath = '/home/user/.claude/notify.js';

    test('adds a Notification hook to empty settings', () => {
        const { settings, installed } = buildSettings({}, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.Notification[0].matcher).toBe(MATCHER);
        expect(settings.hooks.Notification[0].hooks[0].command).toContain(scriptPath);
        expect(settings.hooks.Notification[0].hooks[0].command).toContain(SENTINEL);
    });

    test('registers a SubagentStop hook, which is a separate event from Notification', () => {
        const { settings } = buildSettings({}, scriptPath);
        expect(settings.hooks.SubagentStop).toHaveLength(1);
        expect(settings.hooks.SubagentStop[0].matcher).toBeUndefined();
        expect(settings.hooks.SubagentStop[0].hooks[0].command).toContain(scriptPath);
    });

    test('never puts subagent_stop in the Notification matcher', () => {
        const { settings } = buildSettings({}, scriptPath);
        expect(settings.hooks.Notification[0].matcher).not.toContain('subagent');
    });

    // Task-complete notifications used to rely on the idle_prompt notification, which
    // the terminal REPL is the only thing that emits, so it never arrived for anyone
    // running Claude Code in an editor panel. See issue #14.
    test('registers a Stop hook so task completion is reported in every host', () => {
        const { settings } = buildSettings({}, scriptPath);
        expect(settings.hooks.Stop).toHaveLength(1);
        expect(settings.hooks.Stop[0].matcher).toBeUndefined();
        expect(settings.hooks.Stop[0].hooks[0].command).toContain(scriptPath);
        expect(settings.hooks.Stop[0].hooks[0].command).toContain(SENTINEL);
    });

    // An install from before the Stop hook existed has our Notification and
    // SubagentStop entries already in place, so nothing would look out of date
    // unless reconciliation checks each section on its own.
    test('adds the Stop hook to an install that predates it', () => {
        const stale = {
            hooks: {
                Notification: [{ matcher: MATCHER, hooks: [{ type: 'command', command: `node "${scriptPath}" ${SENTINEL}` }] }],
                SubagentStop: [{ hooks: [{ type: 'command', command: `node "${scriptPath}" ${SENTINEL}` }] }],
            },
        };
        const { settings, installed } = buildSettings(stale, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.Stop).toHaveLength(1);
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.SubagentStop).toHaveLength(1);
    });

    test('adds hooks alongside existing unrelated hooks', () => {
        const existing = {
            hooks: {
                PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }]
            }
        };
        const { settings, installed } = buildSettings(existing, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.PreToolUse).toHaveLength(1);
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.SubagentStop).toHaveLength(1);
    });

    test('adds hooks alongside existing unrelated Notification entries', () => {
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

    test('is idempotent — skips when our hooks are already in their current shape', () => {
        const { settings: first } = buildSettings({}, scriptPath);
        const { settings: second, installed } = buildSettings(first, scriptPath);
        expect(installed).toBe(false);
        expect(second.hooks.Notification).toHaveLength(1);
        expect(second.hooks.SubagentStop).toHaveLength(1);
    });

    test('updates an outdated matcher', () => {
        const outdated = {
            hooks: {
                Notification: [{
                    matcher: 'permission_prompt|elicitation_dialog',
                    hooks: [{ type: 'command', command: `node "${scriptPath}" ${SENTINEL}` }]
                }]
            }
        };
        const { settings, installed } = buildSettings(outdated, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.Notification[0].matcher).toBe(MATCHER);
    });

    // Upgrades used to leave the old command in place forever, so anyone who
    // installed the Python-era version kept calling a script we no longer ship.
    test('repairs an install still pointing at the retired Python hook', () => {
        const legacy = {
            hooks: {
                Notification: [{
                    matcher: 'permission_prompt|elicitation_dialog|idle_prompt|subagent_stop',
                    hooks: [{ type: 'command', command: `python3 "/home/user/.claude/notify.py" ${SENTINEL}` }]
                }]
            }
        };
        const { settings, installed } = buildSettings(legacy, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.Notification).toHaveLength(1);
        const command = settings.hooks.Notification[0].hooks[0].command;
        expect(command).toContain(scriptPath);
        expect(command).not.toContain('notify.py');
        expect(settings.hooks.SubagentStop).toHaveLength(1);
    });

    test('repairs a command pointing at a stale script location', () => {
        const stale = {
            hooks: {
                Notification: [{
                    matcher: MATCHER,
                    hooks: [{ type: 'command', command: `node "/old/location/notify.js" ${SENTINEL}` }]
                }]
            }
        };
        const { settings, installed } = buildSettings(stale, scriptPath);
        expect(installed).toBe(true);
        expect(settings.hooks.Notification[0].hooks[0].command).toContain(scriptPath);
    });

    test('does not mutate the original settings object', () => {
        const original = {};
        buildSettings(original, scriptPath);
        expect(original.hooks).toBeUndefined();
    });
});

describe('removeManaged', () => {
    const scriptPath = '/home/user/.claude/notify.js';

    test('removes every one of our hook entries', () => {
        const { settings: withHooks } = buildSettings({}, scriptPath);
        const { settings, removed } = removeManaged(withHooks);
        expect(removed).toBe(3);
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

    test('removes only our entries when mixed with unrelated ones', () => {
        const existing = {
            hooks: {
                Notification: [{ matcher: 'idle_prompt', hooks: [{ type: 'command', command: 'other.sh' }] }]
            }
        };
        const { settings: withBoth } = buildSettings(existing, scriptPath);
        const { settings, removed } = removeManaged(withBoth);
        expect(removed).toBe(3);
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.Notification[0].hooks[0].command).toBe('other.sh');
        expect(settings.hooks.Stop).toBeUndefined();
        expect(settings.hooks.SubagentStop).toBeUndefined();
    });

    test('handles settings with no hooks key', () => {
        const { settings, removed } = removeManaged({});
        expect(removed).toBe(0);
        expect(settings.hooks).toBeUndefined();
    });

    test('does not mutate the original settings object', () => {
        const { settings: withHooks } = buildSettings({}, scriptPath);
        const original = JSON.parse(JSON.stringify(withHooks));
        removeManaged(withHooks);
        expect(withHooks).toEqual(original);
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
        scriptSrc = path.join(tmpDir, 'notify.js');
        scriptDest = path.join(tmpDir, 'dest', 'notify.js');
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
        expect(written.hooks.SubagentStop).toHaveLength(1);
    });

    test('copies notify.js to destination', () => {
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

    test('overwrites existing notify.js to keep it up to date', () => {
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
        expect(written.hooks.SubagentStop).toHaveLength(1);
    });

    test('leaves settings.json untouched when nothing needs changing', () => {
        install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });
        const before = fs.readFileSync(settingsPath, 'utf8');
        install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });
        expect(fs.readFileSync(settingsPath, 'utf8')).toBe(before);
    });

    test('preserves unrelated settings while repairing a legacy install', () => {
        fs.writeFileSync(settingsPath, JSON.stringify({
            model: 'opus',
            hooks: {
                Notification: [{
                    matcher: 'permission_prompt|elicitation_dialog|idle_prompt|subagent_stop',
                    hooks: [{ type: 'command', command: `python3 "/gone/notify.py" ${SENTINEL}` }]
                }],
                PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }]
            }
        }, null, 2));

        install({ settingsPath, notifyScriptSrc: scriptSrc, notifyScriptDest: scriptDest });

        const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(written.model).toBe('opus');
        expect(written.hooks.PreToolUse).toHaveLength(1);
        expect(written.hooks.Notification[0].hooks[0].command).toContain(scriptDest);
        expect(written.hooks.SubagentStop).toHaveLength(1);
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

    test('removes our hooks and cleans up empty sections', () => {
        const { settings } = buildSettings({}, '/some/notify.js');
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        const { removed } = uninstall({ settingsPath });
        expect(removed).toBe(3);
        const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        expect(written.hooks).toBeUndefined();
    });

    test('handles missing settings.json gracefully', () => {
        expect(() => uninstall({ settingsPath })).not.toThrow();
    });
});
