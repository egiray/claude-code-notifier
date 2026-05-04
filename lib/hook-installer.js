const fs = require('fs');
const path = require('path');

const SENTINEL = '# claude-code-notifier';
const MATCHER = 'permission_prompt|elicitation_dialog|idle_prompt|subagent_stop';

function isManaged(hookEntry) {
    return Array.isArray(hookEntry.hooks) &&
        hookEntry.hooks.some(h => typeof h.command === 'string' && h.command.includes(SENTINEL));
}

function buildSettings(settings, notifyScriptPath) {
    const result = JSON.parse(JSON.stringify(settings));
    if (!result.hooks) result.hooks = {};
    if (!result.hooks.Notification) result.hooks.Notification = [];

    const existing = result.hooks.Notification.findIndex(isManaged);
    if (existing !== -1) {
        // Update matcher if outdated, otherwise skip
        if (result.hooks.Notification[existing].matcher === MATCHER) {
            return { settings: result, installed: false };
        }
        result.hooks.Notification[existing].matcher = MATCHER;
        return { settings: result, installed: true };
    }

    result.hooks.Notification.push({
        matcher: MATCHER,
        hooks: [{ type: 'command', command: `node "${notifyScriptPath}" ${SENTINEL}` }]
    });

    return { settings: result, installed: true };
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
    writeSettings(settingsPath, newSettings);

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

module.exports = { install, uninstall, isManaged, buildSettings, removeManaged, SENTINEL, MATCHER };
