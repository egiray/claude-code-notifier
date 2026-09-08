/**
 * End-to-end check with no VS Code involved: the real hook script writes a real
 * trigger file, the real extension picks it up, and we assert on what the user
 * would have seen. `vscode` is mapped to test/fake-vscode.js by jest config.
 */
const fs = require('fs');
const path = require('path');
const realOs = jest.requireActual('os');
const { spawnSync } = jest.requireActual('child_process');

// Redirect the extension's idea of home and temp so a test run can never touch the
// developer's real ~/.claude or trigger file. Jest's sandboxed process.env is not
// enough — os.homedir()/os.tmpdir() read the real environment underneath it.
let mockHome = null;
let mockTmp = null;

jest.mock('os', () => {
    const actual = jest.requireActual('os');
    return {
        ...actual,
        homedir: () => mockHome || actual.homedir(),
        tmpdir: () => mockTmp || actual.tmpdir(),
    };
});

jest.mock('child_process', () => ({ execFile: jest.fn((cmd, args, cb) => cb && cb(null)) }));

let { execFile } = require('child_process');
const REPO_ROOT = path.join(__dirname, '..');

function waitFor(predicate, { timeout = 5000, step = 25 } = {}) {
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

describe('extension end to end', () => {
    let home, tmp, vscode, extension;

    function notifyFile() {
        return path.join(tmp, 'claude-notify');
    }

    function settingsPath() {
        return path.join(home, '.claude', 'settings.json');
    }

    // Runs the installed hook exactly the way Claude Code does: JSON on stdin.
    function fireHook(payload) {
        return spawnSync(process.execPath, [path.join(home, '.claude', 'notify.js')], {
            input: JSON.stringify(payload),
            env: { ...process.env, TMPDIR: tmp, HOME: home },
            encoding: 'utf8',
        });
    }

    function activate({ config = {}, remoteName } = {}) {
        // Guard against a redirect that silently failed and would write to real paths.
        expect(require('os').homedir()).toBe(home);
        expect(require('os').tmpdir()).toBe(tmp);

        jest.resetModules();
        vscode = require('vscode');
        vscode.__reset(config);
        if (remoteName) vscode.__setRemoteName(remoteName);
        // resetModules hands the extension a fresh mock, so re-capture it here.
        execFile = require('child_process').execFile;
        extension = require('../extension.js');
        extension.activate({ extensionPath: REPO_ROOT, subscriptions: [] });
    }

    beforeEach(() => {
        home = fs.mkdtempSync(path.join(realOs.tmpdir(), 'ccn-home-'));
        tmp = fs.mkdtempSync(path.join(realOs.tmpdir(), 'ccn-tmp-'));
        mockHome = home;
        mockTmp = tmp;
    });

    afterEach(() => {
        if (extension) extension.deactivate();
        extension = null;
        mockHome = null;
        mockTmp = null;
        fs.rmSync(home, { recursive: true, force: true });
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    // ── installation ────────────────────────────────────────────────────────

    test('installs the hook script and both hook events on activation', () => {
        activate();
        expect(fs.existsSync(path.join(home, '.claude', 'notify.js'))).toBe(true);
        const settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
        expect(settings.hooks.Notification).toHaveLength(1);
        expect(settings.hooks.SubagentStop).toHaveLength(1);
    });

    test('repairs an install left pointing at the retired Python hook', () => {
        fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
        fs.writeFileSync(settingsPath(), JSON.stringify({
            hooks: {
                Notification: [{
                    matcher: 'permission_prompt|elicitation_dialog|idle_prompt|subagent_stop',
                    hooks: [{ type: 'command', command: 'python3 "/gone/notify.py" # claude-code-notifier' }]
                }]
            }
        }));

        activate();

        const settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
        const command = settings.hooks.Notification[0].hooks[0].command;
        expect(command).toContain(path.join(home, '.claude', 'notify.js'));
        expect(command).not.toContain('notify.py');
    });

    // ── delivery ────────────────────────────────────────────────────────────

    test('a real permission_prompt hook reaches the user', async () => {
        activate();
        const result = fireHook({
            hook_event_name: 'Notification',
            notification_type: 'permission_prompt',
            message: 'Claude needs permission to run git push',
        });
        expect(result.status).toBe(0);

        await waitFor(() => vscode.__state.warnings.length > 0);
        expect(vscode.__lastWarning().text).toContain('Claude needs permission to run git push');
        expect(execFile).toHaveBeenCalled();
    });

    test('events the user turned off are not shown', async () => {
        activate({ config: { notifyOnTaskComplete: false } });
        fireHook({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'All done' });

        await new Promise(resolve => setTimeout(resolve, 600));
        expect(vscode.__state.warnings).toHaveLength(0);
    });

    test('task-complete events are shown once the user turns them on', async () => {
        activate({ config: { notifyOnTaskComplete: true } });
        fireHook({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'All done' });

        await waitFor(() => vscode.__state.warnings.length > 0);
        expect(vscode.__lastWarning().text).toContain('All done');
    });

    // The end-to-end version of issue #14: a real Stop payload, straight through the
    // hook script and the watcher, has to reach the user with readable wording.
    test('the end of a turn reaches the user once task-complete is on', async () => {
        activate({ config: { notifyOnTaskComplete: true } });
        const result = fireHook({
            hook_event_name: 'Stop',
            stop_hook_active: false,
            last_assistant_message: 'Done, the tests pass.',
        });
        expect(result.status).toBe(0);

        await waitFor(() => vscode.__state.warnings.length > 0);
        expect(vscode.__lastWarning().text).toContain('Claude finished and is waiting for you');
    });

    test('the end of a turn stays quiet while task-complete is off', async () => {
        activate({ config: { notifyOnTaskComplete: false } });
        fireHook({ hook_event_name: 'Stop', last_assistant_message: 'Done.' });

        await new Promise(resolve => setTimeout(resolve, 600));
        expect(vscode.__state.warnings).toHaveLength(0);
    });

    test('a finished subagent reaches the user once the setting is on', async () => {
        activate({ config: { notifyOnSubagentStop: true } });
        fireHook({ hook_event_name: 'SubagentStop', message: 'Subagent finished' });

        await waitFor(() => vscode.__state.warnings.length > 0);
        expect(vscode.__lastWarning().text).toContain('Subagent finished');
    });

    test('a finished subagent stays quiet while the setting is off', async () => {
        activate({ config: { notifyOnSubagentStop: false } });
        fireHook({ hook_event_name: 'SubagentStop', message: 'Subagent finished' });

        await new Promise(resolve => setTimeout(resolve, 600));
        expect(vscode.__state.warnings).toHaveLength(0);
    });

    // ── the regression this release is about ────────────────────────────────

    test('keeps notifying while earlier popups sit unanswered', async () => {
        activate();

        fireHook({ notification_type: 'permission_prompt', message: 'First request' });
        await waitFor(() => vscode.__state.warnings.length === 1);

        // The user is away from the machine: nobody clicks the first popup.
        fireHook({ notification_type: 'permission_prompt', message: 'Second request' });
        await waitFor(() => vscode.__state.warnings.length === 2);

        fireHook({ notification_type: 'elicitation_dialog', message: 'Third request' });
        await waitFor(() => vscode.__state.warnings.length === 3);

        expect(vscode.__state.warnings.map(w => w.text)).toEqual([
            '🔔 Claude Code: First request',
            '🔔 Claude Code: Second request',
            '🔔 Claude Code: Third request',
        ]);
    });

    test('recovers when the trigger file is deleted mid-session', async () => {
        activate();

        fireHook({ notification_type: 'permission_prompt', message: 'Before deletion' });
        await waitFor(() => vscode.__state.warnings.length === 1);

        // macOS prunes the temp directory; the old watcher died silently here.
        fs.rmSync(notifyFile());
        await waitFor(() => fs.existsSync(notifyFile()), { timeout: 4000 });

        fireHook({ notification_type: 'permission_prompt', message: 'After deletion' });
        await waitFor(() => vscode.__state.warnings.length === 2, { timeout: 4000 });
        expect(vscode.__lastWarning().text).toContain('After deletion');
    });

    // ── commands ────────────────────────────────────────────────────────────

    test('the test command produces a notification', async () => {
        activate();
        await vscode.commands.executeCommand('claude-notifier.notify');
        await waitFor(() => vscode.__state.warnings.length > 0);
        expect(vscode.__lastWarning().text).toContain('Test: Claude needs your permission');
    });

    // ── remote windows ──────────────────────────────────────────────────────

    test('a failed banner on a remote window is explained, not reported as a fault', async () => {
        activate({ remoteName: 'ssh-remote+build-box' });
        execFile.mockImplementation((cmd, args, cb) => cb && cb(new Error('no notification service')));

        await vscode.commands.executeCommand('claude-notifier.notify');
        await waitFor(() => vscode.__state.warnings.some(w => w.text.includes('remote machine over SSH')));

        const texts = vscode.__state.warnings.map(w => w.text).join('\n');
        expect(texts).toContain('notification inside VS Code still works');
        expect(texts).not.toContain('could not be shown');
    });

    test('a local window keeps the plain failure message', async () => {
        activate();
        execFile.mockImplementation((cmd, args, cb) => cb && cb(new Error('boom')));

        await vscode.commands.executeCommand('claude-notifier.notify');
        await waitFor(() => vscode.__state.warnings.some(w => w.text.includes('could not be shown')));

        expect(vscode.__state.warnings.map(w => w.text).join('\n')).not.toContain('remote machine');
    });

    test('the diagnose command writes a report to an output channel', async () => {
        activate();
        await vscode.commands.executeCommand('claude-notifier.diagnose');

        const channel = vscode.__state.outputChannels[0];
        expect(channel.name).toBe('Claude Code Notifier');
        const text = channel.lines.join('\n');
        expect(text).toContain('Claude Code Notifier — diagnostics');
        expect(text).toContain('Hook configuration');
        expect(text).toContain('Trigger file');
    }, 15000);

    test('the report on a remote window says where the banner is going', async () => {
        activate({ remoteName: 'ssh-remote+build-box' });
        await vscode.commands.executeCommand('claude-notifier.diagnose');

        const text = vscode.__state.outputChannels[0].lines.join('\n');
        expect(text).toContain('INFO  Where this runs');
        expect(text).toContain('a remote machine over SSH');
        expect(text).toContain('not on your computer');
    }, 15000);
});
