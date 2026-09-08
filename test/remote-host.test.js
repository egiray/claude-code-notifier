const { describeRemoteHost, remoteWarningMessage, remoteReportLines } = require('../lib/remote-host');

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
        expect(remoteWarningMessage(null)).toBeNull();
        expect(remoteReportLines(null)).toEqual([]);
    });

    test('the warning names the remote and points at the working signal', () => {
        const message = remoteWarningMessage(describeRemoteHost('ssh-remote'));
        expect(message).toContain('a remote machine over SSH');
        expect(message).toContain('notification inside VS Code still works');
    });

    test('the report explains the failure instead of blaming the setup', () => {
        const text = remoteReportLines(describeRemoteHost('wsl')).join('\n');
        expect(text).toContain('WSL');
        expect(text).toContain('not a fault in your setup');
    });
});
