const { shouldAnswer, ownsCwd, anotherWindowOwns, cwdInsideFolder } = require('../lib/window-ownership');

describe('does this window hold the work', () => {
    test('a session at the root of an open folder belongs to it', () => {
        expect(cwdInsideFolder('/work/api', '/work/api', 'darwin')).toBe(true);
    });

    test('a session in a subdirectory belongs to it too — the usual case', () => {
        expect(cwdInsideFolder('/work/api/src/routes', '/work/api', 'darwin')).toBe(true);
    });

    test('a folder that merely starts with the same letters does not count', () => {
        expect(cwdInsideFolder('/work/api-docs', '/work/api', 'darwin')).toBe(false);
    });

    test('a trailing separator on the folder changes nothing', () => {
        expect(cwdInsideFolder('/work/api/src', '/work/api/', 'darwin')).toBe(true);
    });

    test('Windows paths match regardless of case', () => {
        expect(cwdInsideFolder('C:\\Work\\Api\\src', 'c:\\work\\api', 'win32')).toBe(true);
        expect(cwdInsideFolder('C:\\Work\\Api\\src', 'c:\\work\\api', 'darwin')).toBe(false);
    });

    test('missing values never match', () => {
        expect(cwdInsideFolder('', '/work/api', 'darwin')).toBe(false);
        expect(cwdInsideFolder('/work/api', '', 'darwin')).toBe(false);
        expect(ownsCwd('/work/api', null, 'darwin')).toBe(false);
    });

    test('any one of several open folders is enough', () => {
        expect(ownsCwd('/work/web/app', ['/work/api', '/work/web'], 'darwin')).toBe(true);
    });
});

describe('does another window hold it', () => {
    const markers = [
        { pid: 2, folders: ['/work/api'] },
        { pid: 3, folders: [] },
    ];

    test('yes, when a different window has that folder open', () => {
        expect(anotherWindowOwns('/work/api/src', markers, { ownPid: 1, platform: 'darwin' })).toBe(true);
    });

    test('this window does not count as another window', () => {
        expect(anotherWindowOwns('/work/api/src', markers, { ownPid: 2, platform: 'darwin' })).toBe(false);
    });

    test('a window with nothing open holds nothing', () => {
        expect(anotherWindowOwns('/elsewhere', markers, { ownPid: 1, platform: 'darwin' })).toBe(false);
    });
});

describe('who answers', () => {
    const markers = [{ pid: 2, folders: ['/work/api'] }];
    const decide = (cwd, folders) => shouldAnswer({ cwd, folders, markers, ownPid: 1, platform: 'darwin' });

    test('the window holding the work answers', () => {
        expect(decide('/work/api/src', ['/work/api'])).toEqual({ answer: true, because: 'owner' });
    });

    test('a window holding something else stands aside', () => {
        expect(decide('/work/api/src', ['/work/web'])).toEqual({ answer: false, because: 'owned-elsewhere' });
    });

    test('work nobody has open is still answered, or it would be lost', () => {
        expect(decide('/tmp/scratch', ['/work/web'])).toEqual({ answer: true, because: 'nobody-owns-it' });
    });

    test('a window with nothing open answers what nobody else holds', () => {
        expect(decide('/tmp/scratch', [])).toEqual({ answer: true, because: 'nobody-owns-it' });
        expect(decide('/work/api/src', [])).toEqual({ answer: false, because: 'owned-elsewhere' });
    });

    test('a notification with no directory is answered by whoever sees it first', () => {
        expect(decide(null, ['/work/web'])).toEqual({ answer: true, because: 'unrouted' });
    });
});
