/**
 * VS Code runs an extension where the code lives, not where the person is sitting.
 * When a window is attached to a remote machine — over SSH, in WSL, in a container
 * or in a Codespace — this extension runs over there, so the banner and sound it
 * asks for are produced on that machine. Those machines rarely have a screen or
 * speakers, so nothing reaches the user, and the operating system's own error text
 * ("no notification service", "cannot find audio card") reads like a broken
 * extension rather than a window that is simply pointed somewhere else.
 *
 * This module turns that situation into plain language, so the diagnostics and the
 * one-off warning can say what is really going on.
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

function remoteWarningMessage(remote) {
    if (!remote) return null;
    return `Claude Code Notifier: this window is connected to ${remote.label}, so the banner and sound ` +
        'are produced there rather than on your own computer. The notification inside VS Code still works.';
}

function remoteReportLines(remote) {
    if (!remote) return [];
    return [
        `  • This window is connected to ${remote.label}, so the extension runs there.`,
        '    The banner and sound are asked of that machine, which normally has no screen',
        '    or speakers — that is why they fail, and it is not a fault in your setup.',
        '  • The notification inside VS Code still appears on your own computer, so that is',
        '    your working signal here. Sending banners to your computer from a remote window',
        '    is not something this extension can do yet.',
    ];
}

module.exports = { describeRemoteHost, remoteWarningMessage, remoteReportLines, REMOTE_LABELS };
