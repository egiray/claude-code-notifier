/**
 * VS Code runs an extension where the code lives, not where the person is sitting.
 * When a window is attached to a remote machine — over SSH, in WSL, in a container
 * or in a Codespace — this extension runs over there, so a banner it asks for is
 * produced on that machine. Those machines rarely have a screen or speakers, so
 * nothing reaches the user.
 *
 * The companion extension is the way out: it runs on the user's own computer and
 * delivers the banner and sound there. So everything the user is told depends on
 * whether the companion is installed — either delivery works and we say where it
 * happens, or it does not and we say what to install.
 */

const REMOTE_LABELS = {
    'ssh-remote': 'a remote machine over SSH',
    'wsl': 'WSL',
    'dev-container': 'a dev container',
    'attached-container': 'a container',
    'codespaces': 'a GitHub Codespace',
    'tunnel': 'a remote machine over a tunnel',
};

function describeRemoteHost(remoteName) {
    if (typeof remoteName !== 'string' || !remoteName) return null;
    // Authorities arrive as "ssh-remote+myhost"; only the kind is interesting here.
    const kind = remoteName.split('+')[0];
    return { name: remoteName, label: REMOTE_LABELS[kind] || `a remote environment (${kind})` };
}

// The one thing to say in a remote window with no companion. It replaces the generic
// "could not be shown" warning there, because the cause is known and so is the fix.
function companionOfferMessage(remote) {
    if (!remote) return null;
    return `Claude Code Notifier is running on ${remote.label}, so banners and sound appear there ` +
        'instead of on your computer. Install the companion extension to receive them where you are. ' +
        'The notification inside VS Code works either way.';
}

function remoteReportLines(remote, { companionInstalled = false } = {}) {
    if (!remote) return [];
    if (companionInstalled) {
        return [
            `  • This window is connected to ${remote.label}, so the extension itself runs there.`,
            '    The companion extension on your own computer delivered the banner and sound above,',
            '    which is why they were tested there rather than on the remote machine.',
        ];
    }
    return [
        `  • This window is connected to ${remote.label}, so the extension runs there. The banner`,
        '    and sound were asked of that machine, which normally has no screen or speakers — that',
        '    is why they failed, and it is not a fault in your setup.',
        '  • Install the companion extension "Claude Code Notifier (Local)" to have them delivered',
        '    to your own computer instead. The notification inside VS Code works either way.',
    ];
}

module.exports = {
    describeRemoteHost,
    companionOfferMessage,
    remoteReportLines,
    REMOTE_LABELS,
};
