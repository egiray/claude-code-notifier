jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('os', () => ({ platform: jest.fn() }));
jest.mock('fs', () => ({ existsSync: jest.fn() }));

const {
    sendSystemNotification, playSound, showOsNotification,
    escapeForAppleScript, findTerminalNotifier, TERMINAL_NOTIFIER_PATHS,
    setSenderBundleId, getSenderBundleId,
} = require('../lib/system-notification');
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');

beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    execFile.mockImplementation((cmd, args, cb) => cb && cb(null));
    setSenderBundleId(null);
});

function argsOf(callIndex) {
    return execFile.mock.calls[callIndex][1];
}

// ── locating terminal-notifier ───────────────────────────────────────────────

describe('findTerminalNotifier', () => {
    // GUI-launched VS Code does not inherit a shell PATH, so a Homebrew install is
    // invisible unless we look for it by absolute path.
    test('finds the Apple Silicon Homebrew install', () => {
        fs.existsSync.mockImplementation(p => p === '/opt/homebrew/bin/terminal-notifier');
        expect(findTerminalNotifier()).toBe('/opt/homebrew/bin/terminal-notifier');
    });

    test('finds the Intel Homebrew install', () => {
        fs.existsSync.mockImplementation(p => p === '/usr/local/bin/terminal-notifier');
        expect(findTerminalNotifier()).toBe('/usr/local/bin/terminal-notifier');
    });

    test('returns null when it is not installed', () => {
        expect(findTerminalNotifier()).toBeNull();
    });

    test('checks both Homebrew prefixes', () => {
        findTerminalNotifier();
        expect(fs.existsSync.mock.calls.map(c => c[0])).toEqual(TERMINAL_NOTIFIER_PATHS);
    });
});

// ── sendSystemNotification ───────────────────────────────────────────────────

describe('sendSystemNotification', () => {
    beforeEach(() => os.platform.mockReturnValue('darwin'));

    test('does nothing when both are disabled', () => {
        sendSystemNotification('hello', { notification: false, sound: false });
        expect(execFile).not.toHaveBeenCalled();
    });

    test('plays a sound and shows a banner by default', () => {
        sendSystemNotification('Need permission');
        expect(execFile).toHaveBeenCalledTimes(2);
    });

    test('plays only a sound when the banner is disabled', () => {
        sendSystemNotification('test', { notification: false, sound: true });
        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][0]).toBe('afplay');
    });

    test('shows only a banner when sound is disabled', () => {
        sendSystemNotification('test', { notification: true, sound: false });
        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][0]).toBe('osascript');
    });

    // Silent failure here is what made this impossible to support remotely.
    test('reports a failure instead of swallowing it', () => {
        execFile.mockImplementation((cmd, args, cb) => cb(new Error('not permitted')));
        const onError = jest.fn();
        sendSystemNotification('test', { sound: false, onError });
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].message).toBe('not permitted');
        expect(onError.mock.calls[0][1].method).toBe('osascript');
    });

    test('does not report anything when delivery succeeds', () => {
        const onError = jest.fn();
        sendSystemNotification('test', { sound: false, onError });
        expect(onError).not.toHaveBeenCalled();
    });
});

// ── playSound ────────────────────────────────────────────────────────────────

describe('playSound', () => {
    test('macOS uses afplay', () => {
        os.platform.mockReturnValue('darwin');
        playSound();
        expect(execFile.mock.calls[0][0]).toBe('afplay');
        expect(argsOf(0)).toEqual(['/System/Library/Sounds/Glass.aiff']);
    });

    test('Windows uses SoundPlayer', () => {
        os.platform.mockReturnValue('win32');
        playSound();
        expect(execFile.mock.calls[0][0]).toBe('powershell');
        expect(argsOf(0).join(' ')).toContain('SoundPlayer');
    });

    test('Linux uses paplay first', () => {
        os.platform.mockReturnValue('linux');
        playSound();
        expect(execFile.mock.calls[0][0]).toBe('paplay');
    });

    test('Linux falls back to aplay', () => {
        os.platform.mockReturnValue('linux');
        execFile.mockImplementationOnce((cmd, args, cb) => cb(new Error('not found')));
        playSound();
        expect(execFile.mock.calls[1][0]).toBe('aplay');
    });

    test('reports unsupported platforms', () => {
        os.platform.mockReturnValue('freebsd');
        const done = jest.fn();
        playSound(done);
        expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
    });
});

// ── showOsNotification ───────────────────────────────────────────────────────

describe('showOsNotification — macOS', () => {
    beforeEach(() => os.platform.mockReturnValue('darwin'));

    test('uses terminal-notifier by absolute path when installed', () => {
        fs.existsSync.mockImplementation(p => p === '/opt/homebrew/bin/terminal-notifier');
        showOsNotification('Need permission');
        expect(execFile.mock.calls[0][0]).toBe('/opt/homebrew/bin/terminal-notifier');
        expect(argsOf(0)).toContain('Need permission');
        expect(argsOf(0)).toContain('Claude Code');
    });

    test('goes straight to osascript when terminal-notifier is missing', () => {
        showOsNotification('Need permission');
        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][0]).toBe('osascript');
    });

    test('falls back to osascript when terminal-notifier fails', () => {
        fs.existsSync.mockReturnValue(true);
        execFile.mockImplementationOnce((cmd, args, cb) => cb(new Error('crashed')));
        showOsNotification('Need permission');
        expect(execFile.mock.calls[1][0]).toBe('osascript');
        expect(argsOf(1)[1]).toContain('Need permission');
    });

    test('reports which delivery method was used', () => {
        const done = jest.fn();
        showOsNotification('Need permission', done);
        expect(done.mock.calls[0][1]).toEqual({ method: 'osascript' });
    });

    // The old sanitizer deleted quotes and ampersands outright, mangling messages.
    test('keeps apostrophes and ampersands in the message', () => {
        showOsNotification(`Claude's tool & the file`);
        const script = argsOf(0)[1];
        expect(script).toContain("Claude's tool & the file");
    });

    test('escapes quotes so the AppleScript string stays intact', () => {
        showOsNotification('run "npm test" now');
        const script = argsOf(0)[1];
        expect(script).toBe('display notification "run \\"npm test\\" now" with title "Claude Code"');
    });

    test('flattens multi-line messages to a single line', () => {
        showOsNotification('line one\nline two');
        expect(argsOf(0)[1]).toContain('line one line two');
    });
});

describe('showOsNotification — other platforms', () => {
    test('Windows sends a toast', () => {
        os.platform.mockReturnValue('win32');
        showOsNotification('Need permission');
        expect(execFile.mock.calls[0][0]).toBe('powershell');
        expect(argsOf(0)[2]).toContain('Need permission');
    });

    test('Linux uses notify-send with separate arguments', () => {
        os.platform.mockReturnValue('linux');
        showOsNotification('Need permission');
        expect(execFile.mock.calls[0][0]).toBe('notify-send');
        expect(argsOf(0)).toEqual(['Claude Code', 'Need permission']);
    });

    test('an unsupported platform reports an error and runs nothing', () => {
        os.platform.mockReturnValue('freebsd');
        const done = jest.fn();
        showOsNotification('test', done);
        expect(execFile).not.toHaveBeenCalled();
        expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
    });
});

// Without this the banner carries the delivering tool's icon and name, which users
// do not recognise as coming from their editor.
describe('banner identity', () => {
    beforeEach(() => {
        os.platform.mockReturnValue('darwin');
        fs.existsSync.mockImplementation(p => p === '/opt/homebrew/bin/terminal-notifier');
    });

    test('posts under the editor identity when one is known', () => {
        setSenderBundleId('com.microsoft.VSCode');
        showOsNotification('Need permission');
        expect(argsOf(0)).toEqual([
            '-title', 'Claude Code', '-message', 'Need permission', '-sender', 'com.microsoft.VSCode',
        ]);
    });

    test('reports the identity it posted under', () => {
        setSenderBundleId('com.microsoft.VSCode');
        const done = jest.fn();
        showOsNotification('Need permission', done);
        expect(done.mock.calls[0][1].method).toBe('terminal-notifier');
    });

    test('omits the identity when none was resolved', () => {
        showOsNotification('Need permission');
        expect(argsOf(0)).not.toContain('-sender');
    });

    test('clearing the identity goes back to the default', () => {
        setSenderBundleId('com.microsoft.VSCode');
        setSenderBundleId(null);
        expect(getSenderBundleId()).toBeNull();
        showOsNotification('Need permission');
        expect(argsOf(0)).not.toContain('-sender');
    });

    // osascript has no equivalent switch — it always posts as Script Editor.
    test('the osascript fallback is unaffected', () => {
        fs.existsSync.mockReturnValue(false);
        setSenderBundleId('com.microsoft.VSCode');
        showOsNotification('Need permission');
        expect(execFile.mock.calls[0][0]).toBe('osascript');
        expect(argsOf(0)).not.toContain('-sender');
    });
});

describe('escapeForAppleScript', () => {
    test('escapes backslashes and quotes', () => {
        expect(escapeForAppleScript('a\\b"c')).toBe('a\\\\b\\"c');
    });

    test('collapses newlines', () => {
        expect(escapeForAppleScript('a\r\nb')).toBe('a b');
    });

    test('handles non-string input', () => {
        expect(escapeForAppleScript(undefined)).toBe('undefined');
    });
});
