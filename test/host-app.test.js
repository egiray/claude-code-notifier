const { resolveSenderBundleId, findAppBundle, readBundleId } = require('../lib/host-app');

const VSCODE_HELPER = '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)';

describe('findAppBundle', () => {
    // The helper binary lives inside a nested .app; we want the outer one.
    test('returns the outer application bundle, not the helper bundle', () => {
        expect(findAppBundle(VSCODE_HELPER)).toBe('/Applications/Visual Studio Code.app');
    });

    test('handles a path with no nesting', () => {
        expect(findAppBundle('/Applications/Cursor.app/Contents/MacOS/Cursor')).toBe('/Applications/Cursor.app');
    });

    test('handles an app installed outside /Applications', () => {
        expect(findAppBundle('/Users/me/Apps/VSCodium.app/Contents/MacOS/Electron'))
            .toBe('/Users/me/Apps/VSCodium.app');
    });

    test('returns null when there is no app bundle in the path', () => {
        expect(findAppBundle('/usr/local/bin/node')).toBeNull();
    });

    test('returns null for missing input', () => {
        expect(findAppBundle(undefined)).toBeNull();
        expect(findAppBundle('')).toBeNull();
    });
});

describe('readBundleId', () => {
    test('reads the identifier from the app Info.plist', () => {
        const execFileSync = jest.fn(() => 'com.microsoft.VSCode\n');
        expect(readBundleId('/Applications/Visual Studio Code.app', execFileSync)).toBe('com.microsoft.VSCode');
        expect(execFileSync.mock.calls[0][1]).toEqual([
            'read', '/Applications/Visual Studio Code.app/Contents/Info', 'CFBundleIdentifier',
        ]);
    });

    test('returns null when the identifier cannot be read', () => {
        const execFileSync = jest.fn(() => { throw new Error('does not exist'); });
        expect(readBundleId('/Applications/Nope.app', execFileSync)).toBeNull();
    });

    test('returns null for an empty identifier', () => {
        expect(readBundleId('/Applications/Empty.app', () => '  \n')).toBeNull();
    });
});

describe('resolveSenderBundleId', () => {
    test('resolves the identity of the editor it is running inside', () => {
        const id = resolveSenderBundleId({
            platform: 'darwin',
            execPath: VSCODE_HELPER,
            execFileSync: () => 'com.microsoft.VSCode',
        });
        expect(id).toBe('com.microsoft.VSCode');
    });

    test('resolves a VS Code fork to its own identity, not a hardcoded one', () => {
        const id = resolveSenderBundleId({
            platform: 'darwin',
            execPath: '/Applications/Cursor.app/Contents/MacOS/Cursor',
            execFileSync: () => 'com.todesktop.230313mzl4w4u92',
        });
        expect(id).toBe('com.todesktop.230313mzl4w4u92');
    });

    test('does nothing off macOS', () => {
        const execFileSync = jest.fn();
        expect(resolveSenderBundleId({ platform: 'win32', execPath: 'C:\\Code.exe', execFileSync })).toBeNull();
        expect(execFileSync).not.toHaveBeenCalled();
    });

    test('gives up quietly when the identity cannot be worked out', () => {
        expect(resolveSenderBundleId({
            platform: 'darwin',
            execPath: '/usr/local/bin/node',
            execFileSync: () => 'irrelevant',
        })).toBeNull();
    });
});
