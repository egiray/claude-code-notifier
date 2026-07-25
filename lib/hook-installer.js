const fs = require('fs');
const path = require('path');

const SENTINEL = '# claude-code-notifier';

// Valid Notification types only. "subagent_stop" used to be listed here, but a
// finished subagent is reported through the separate SubagentStop hook event —
// it never matched anything as a Notification matcher.
const MATCHER = 'permission_prompt|elicitation_dialog|idle_prompt';

function isManaged(hookEntry) {
    return Array.isArray(hookEntry.hooks) &&
        hookEntry.hooks.some(h => typeof h.command === 'string' && h.command.includes(SENTINEL));
}

function commandFor(notifyScriptPath) {
    return `node "${notifyScriptPath}" ${SENTINEL}`;
}

function desiredSections(notifyScriptPath) {
    const hook = { type: 'command', command: commandFor(notifyScriptPath) };
    return {
        Notification: [{ matcher: MATCHER, hooks: [hook] }],
        SubagentStop: [{ hooks: [hook] }],
    };
}

// Replaces every entry we own with the current desired shape. This repairs installs
// whose stored command still points at a script we no longer ship.
function reconcileSection(entries, desired) {
    const ours = entries.filter(isManaged);
    if (JSON.stringify(ours) === JSON.stringify(desired)) return { entries, changed: false };
    return { entries: entries.filter(e => !isManaged(e)).concat(desired), changed: true };
}

function buildSettings(settings, notifyScriptPath) {
    const result = JSON.parse(JSON.stringify(settings));
    if (!result.hooks) result.hooks = {};

    let installed = false;
    for (const [section, desired] of Object.entries(desiredSections(notifyScriptPath))) {
        const reconciled = reconcileSection(result.hooks[section] || [], desired);
        result.hooks[section] = reconciled.entries;
        if (reconciled.changed) installed = true;
    }

    return { settings: result, installed };
}

function removeManaged(settings) {
    const result = JSON.parse(JSON.stringify(settings));
    if (!result.hooks) return { settings: result, removed: 0 };

    let removed = 0;
    for (const section of Object.keys(result.hooks)) {
        const before = result.hooks[section].length;
        result.hooks[section] = result.hooks[section].filter(e => !isManaged(e));
        removed += before - result.hooks[section].length;
        if (result.hooks[section].length === 0) delete result.hooks[section];
    }
    if (Object.keys(result.hooks).length === 0) delete result.hooks;

    return { settings: result, removed };
}

function readSettings(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (_) {
        return {};
    }
}

function writeSettings(filePath, settings) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
}

function install({ settingsPath, notifyScriptSrc, notifyScriptDest }) {
    const settings = readSettings(settingsPath);
    const { settings: newSettings, installed } = buildSettings(settings, notifyScriptDest);
    if (installed) writeSettings(settingsPath, newSettings);

    fs.mkdirSync(path.dirname(notifyScriptDest), { recursive: true });
    fs.copyFileSync(notifyScriptSrc, notifyScriptDest);

    return { installed, scriptCopied: true };
}

function uninstall({ settingsPath }) {
    const settings = readSettings(settingsPath);
    const { settings: newSettings, removed } = removeManaged(settings);
    if (removed > 0) writeSettings(settingsPath, newSettings);
    return { removed };
}

module.exports = {
    install, uninstall, isManaged, buildSettings, removeManaged,
    readSettings, writeSettings, commandFor, SENTINEL, MATCHER,
};
