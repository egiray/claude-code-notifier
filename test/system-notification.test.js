const { sendSystemNotification, playSound, showOsNotification } = require('../lib/system-notification');

jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('os', () => ({ platform: jest.fn() }));

const { execFile } = require('child_process');
const os = require('os');

beforeEach(() => {
    jest.clearAllMocks();
});

// ── sendSystemNotification ───────────────────────────────────────────────────

describe('sendSystemNotification', () => {
    test('does nothing when both disabled', () => {
        os.platform.mockReturnValue('darwin');
        sendSystemNotification('hello', { notification: false, sound: false });
        expect(execFile).not.toHaveBeenCalled();
    });

    test('calls both sound and notification by default', () => {
        os.platform.mockReturnValue('darwin');
        sendSystemNotification('Need permission');
        expect(execFile).toHaveBeenCalledTimes(2);
    });

    test('calls only sound when notification disabled', () => {
        os.platform.mockReturnValue('darwin');
        sendSystemNotification('test', { notification: false, sound: true });
        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][0]).toBe('afplay');
    });

    test('calls only notification when sound disabled', () => {
        os.platform.mockReturnValue('darwin');
        sendSystemNotification('test', { notification: true, sound: false });
        expect(execFile).toHaveBeenCalledTimes(1);
        expect(execFile.mock.calls[0][0]).toBe('terminal-notifier');
    });
});

// ── playSound ────────────────────────────────────────────────────────────────

describe('playSound — macOS', () => {
    beforeEach(() => os.platform.mockReturnValue('darwin'));

    test('calls afplay with Glass sound file', () => {
        playSound();
        expect(execFile).toHaveBeenCalledWith('afplay', ['/System/Library/Sounds/Glass.aiff'], expect.any(Function));
    });
});

describe('playSound — Windows', () => {
    beforeEach(() => os.platform.mockReturnValue('win32'));

    test('calls powershell with SoundPlayer', () => {
        playSound();
        expect(execFile.mock.calls[0][0]).toBe('powershell');
        expect(execFile.mock.calls[0][1].join(' ')).toContain('SoundPlayer');
    });
});

describe('playSound — Linux', () => {
    beforeEach(() => os.platform.mockReturnValue('linux'));

    test('calls paplay as primary', () => {
        playSound();
        expect(execFile.mock.calls[0][0]).toBe('paplay');
    });

    test('falls back to aplay when paplay fails', () => {
        execFile.mockImplementationOnce((cmd, args, cb) => cb(new Error('not found')));
        playSound();
        expect(execFile.mock.calls[1][0]).toBe('aplay');
    });
});

// ── showOsNotification ───────────────────────────────────────────────────────

describe('showOsNotification — macOS', () => {
    beforeEach(() => os.platform.mockReturnValue('darwin'));

    test('tries terminal-notifier first', () => {
        showOsNotification('Need permission');
        expect(execFile.mock.calls[0][0]).toBe('terminal-notifier');
        expect(execFile.mock.calls[0][1]).toContain('Need permission');
        expect(execFile.mock.calls[0][1]).toContain('Claude Code');
    });

    test('falls back to osascript when terminal-notifier is missing', () => {
        execFile.mockImplementationOnce((cmd, args, cb) => cb(new Error('not found')));
        showOsNotification('Need permission');
        expect(execFile.mock.calls[1][0]).toBe('osascript');
        expect(execFile.mock.calls[1][1][1]).toContain('Need permission');
    });

    test('strips dangerous characters', () => {
        showOsNotification(`say 'hello' & rm -rf`);
        const args = execFile.mock.calls[0][1];
        const msgIndex = args.indexOf('-message') + 1;
        const userText = args[msgIndex];
        expect(userText).not.toContain("'");
        expect(userText).not.toContain('&');
    });
});

describe('showOsNotification — Windows', () => {
    beforeEach(() => os.platform.mockReturnValue('win32'));

    test('calls powershell with toast XML', () => {
        showOsNotification('Need permission');
        expect(execFile.mock.calls[0][0]).toBe('powershell');
        expect(execFile.mock.calls[0][1][2]).toContain('Need permission');
    });
});

describe('showOsNotification — Linux', () => {
    beforeEach(() => os.platform.mockReturnValue('linux'));

    test('calls notify-send with title and message as separate args', () => {
        showOsNotification('Need permission');
        expect(execFile.mock.calls[0][0]).toBe('notify-send');
        expect(execFile.mock.calls[0][1]).toEqual(['Claude Code', 'Need permission']);
    });
});

describe('showOsNotification — unknown platform', () => {
    test('does nothing on unsupported platform', () => {
        os.platform.mockReturnValue('freebsd');
        showOsNotification('test');
        expect(execFile).not.toHaveBeenCalled();
    });
});
