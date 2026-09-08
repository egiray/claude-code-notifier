/**
 * Named sounds, mapped to whatever each operating system already ships.
 *
 * Naming them by character rather than by file means one setting reads sensibly
 * everywhere: a Windows user is never offered "Sosumi", and a Mac user is never
 * offered "chimes". Nothing is bundled — these are the sounds the machine already
 * has, so they sound native and cost nothing to ship.
 */

const DIRECTORIES = {
    darwin: '/System/Library/Sounds',
    win32: 'C:\\Windows\\Media',
    linux: '/usr/share/sounds/freedesktop/stereo',
};

const SOUNDS = {
    Default: { darwin: 'Glass.aiff', win32: 'notify.wav', linux: 'complete.oga' },
    Chime: { darwin: 'Hero.aiff', win32: 'chimes.wav', linux: 'message.oga' },
    Bell: { darwin: 'Ping.aiff', win32: 'ding.wav', linux: 'bell.oga' },
    Knock: { darwin: 'Pop.aiff', win32: 'chord.wav', linux: 'dialog-information.oga' },
    Alert: { darwin: 'Sosumi.aiff', win32: 'ringin.wav', linux: 'dialog-warning.oga' },
};

const SOUND_NAMES = Object.keys(SOUNDS);
const DEFAULT_SOUND = 'Default';

function separatorFor(platform) {
    return platform === 'win32' ? '\\' : '/';
}

/**
 * An unknown name falls back to Default rather than failing: a setting typed by
 * hand, or one written by a newer version, must never leave the user in silence.
 */
function soundFile(name, platform) {
    const directory = DIRECTORIES[platform];
    if (!directory) return null;
    const chosen = SOUNDS[name] || SOUNDS[DEFAULT_SOUND];
    return `${directory}${separatorFor(platform)}${chosen[platform]}`;
}

module.exports = { soundFile, SOUND_NAMES, SOUNDS, DIRECTORIES, DEFAULT_SOUND };
