const { soundFile, SOUND_NAMES, DEFAULT_SOUND } = require('../lib/sounds');

describe('named sounds', () => {
    test('every name resolves to a real location on every platform', () => {
        for (const name of SOUND_NAMES) {
            expect(soundFile(name, 'darwin')).toMatch(/^\/System\/Library\/Sounds\/.+\.aiff$/);
            expect(soundFile(name, 'win32')).toMatch(/^C:\\Windows\\Media\\.+\.wav$/);
            expect(soundFile(name, 'linux')).toMatch(/^\/usr\/share\/sounds\/freedesktop\/stereo\/.+\.oga$/);
        }
    });

    test('the names map to different sounds, so events can be told apart', () => {
        const files = SOUND_NAMES.map((name) => soundFile(name, 'darwin'));
        expect(new Set(files).size).toBe(files.length);
    });

    test('a name we do not know falls back rather than leaving silence', () => {
        expect(soundFile('Kazoo', 'darwin')).toBe(soundFile(DEFAULT_SOUND, 'darwin'));
        expect(soundFile(undefined, 'darwin')).toBe(soundFile(DEFAULT_SOUND, 'darwin'));
    });

    test('a platform with no sounds of its own reports none', () => {
        expect(soundFile('Default', 'freebsd')).toBeNull();
    });
});
