const { announce, forget, readMarkers, cleanStale } = require('../lib/window-markers');

// An in-memory stand-in for the marker directory.
function makeFs(files = {}) {
    const store = new Map(Object.entries(files));
    return {
        store,
        mkdirSync: () => {},
        writeFileSync: (file, value) => { store.set(file, value); },
        readFileSync: (file) => {
            if (!store.has(file)) throw new Error('ENOENT');
            return store.get(file);
        },
        readdirSync: (dir) => [...store.keys()]
            .filter(f => f.startsWith(`${dir}/`))
            .map(f => f.slice(dir.length + 1)),
        unlinkSync: (file) => {
            if (!store.has(file)) throw new Error('ENOENT');
            store.delete(file);
        },
    };
}

const DIR = '/tmp/windows';
const alive = (pids) => (pid) => pids.includes(pid);

describe('leaving a note', () => {
    test('a window records the folders it has open', () => {
        const fsImpl = makeFs();
        announce({ dir: DIR, pid: 42, folders: ['/work/api', '/work/web'], fsImpl });
        expect(fsImpl.store.get('/tmp/windows/42')).toBe('/work/api\n/work/web');
    });

    test('a window with nothing open still says so', () => {
        const fsImpl = makeFs();
        announce({ dir: DIR, pid: 42, folders: [], fsImpl });
        expect(readMarkers({ dir: DIR, fsImpl, isAlive: alive([42]) })).toEqual([{ pid: 42, folders: [] }]);
    });

    test('a directory that cannot be written is survivable', () => {
        const fsImpl = makeFs();
        fsImpl.writeFileSync = () => { throw new Error('EACCES'); };
        expect(announce({ dir: DIR, pid: 42, folders: [], fsImpl })).toBe(false);
    });

    test('closing a window takes its note away', () => {
        const fsImpl = makeFs();
        announce({ dir: DIR, pid: 42, folders: ['/work/api'], fsImpl });
        forget({ dir: DIR, pid: 42, fsImpl });
        expect(readMarkers({ dir: DIR, fsImpl, isAlive: alive([42]) })).toEqual([]);
    });

    test('forgetting a note that is already gone is fine', () => {
        expect(() => forget({ dir: DIR, pid: 7, fsImpl: makeFs() })).not.toThrow();
    });
});

describe('reading the notes', () => {
    test('a note from a window that is no longer running is ignored', () => {
        const fsImpl = makeFs({ '/tmp/windows/1': '/work/api', '/tmp/windows/2': '/work/web' });
        expect(readMarkers({ dir: DIR, fsImpl, isAlive: alive([2]) }))
            .toEqual([{ pid: 2, folders: ['/work/web'] }]);
    });

    test('a file that is not a process id is not a note', () => {
        const fsImpl = makeFs({ '/tmp/windows/notes.txt': '/work/api' });
        expect(readMarkers({ dir: DIR, fsImpl, isAlive: () => true })).toEqual([]);
    });

    test('no directory at all simply means no other windows', () => {
        const fsImpl = makeFs();
        fsImpl.readdirSync = () => { throw new Error('ENOENT'); };
        expect(readMarkers({ dir: DIR, fsImpl })).toEqual([]);
    });
});

describe('tidying up', () => {
    test('notes from windows that crashed are removed, live ones left alone', () => {
        const fsImpl = makeFs({
            '/tmp/windows/1': '/work/api',
            '/tmp/windows/2': '/work/web',
            '/tmp/windows/rubbish': '',
        });
        expect(cleanStale({ dir: DIR, fsImpl, isAlive: alive([2]) })).toBe(2);
        expect([...fsImpl.store.keys()]).toEqual(['/tmp/windows/2']);
    });
});
