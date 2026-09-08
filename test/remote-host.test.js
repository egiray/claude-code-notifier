const { describeRemoteHost, companionOfferMessage, remoteReportLines } = require('../lib/remote-host');

describe('describeRemoteHost', () => {
    test('a local window is not remote', () => {
        expect(describeRemoteHost(undefined)).toBeNull();
        expect(describeRemoteHost('')).toBeNull();
    });

    test('known remote kinds get plain-language labels', () => {
        expect(describeRemoteHost('ssh-remote').label).toBe('a remote machine over SSH');
        expect(describeRemoteHost('wsl').label).toBe('WSL');
        expect(describeRemoteHost('codespaces').label).toBe('a GitHub Codespace');
    });

    test('an authority with a host name is still recognised', () => {
        const remote = describeRemoteHost('ssh-remote+build-box');
        expect(remote.label).toBe('a remote machine over SSH');
        expect(remote.name).toBe('ssh-remote+build-box');
    });

    test('an unknown kind still reads as a sentence', () => {
        expect(describeRemoteHost('something-new').label).toBe('a remote environment (something-new)');
    });
});

describe('what the user is told', () => {
    test('nothing is said when the window is local', () => {
        expect(companionOfferMessage(null)).toBeNull();
        expect(remoteReportLines(null)).toEqual([]);
    });

    test('the offer names the remote, the fix, and the signal that already works', () => {
        const message = companionOfferMessage(describeRemoteHost('ssh-remote'));
        expect(message).toContain('a remote machine over SSH');
        expect(message).toContain('Install the companion extension');
        expect(message).toContain('notification inside VS Code works either way');
    });

    test('with no companion the report explains the failure and names the fix', () => {
        const text = remoteReportLines(describeRemoteHost('wsl')).join('\n');
        expect(text).toContain('WSL');
        expect(text).toContain('not a fault in your setup');
        expect(text).toContain('Claude Code Notifier (Local)');
    });

    test('with the companion the report says delivery reached the user instead', () => {
        const text = remoteReportLines(describeRemoteHost('wsl'), { companionInstalled: true }).join('\n');
        expect(text).toContain('companion extension on your own computer delivered');
        expect(text).not.toContain('not a fault in your setup');
    });
});
