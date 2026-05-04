const fs = require('fs');
const path = require('path');

const SENTINEL = '# claude-code-notifier';

function isManaged(hookEntry) {
    return Array.isArray(hookEntry.hooks) &&
        hookEntry.hooks.some(h => typeof h.command === 'string' && h.command.includes(SENTINEL));
}

function buildSettings(settings, notifyScriptPath) {
    const result = JSON.parse(JSON.stringify(settings));
    if (!result.hooks) result.hooks = {};
    if (!result.hooks.Notification) result.hooks.Notification = [];

    if (result.hooks.Notification.some(isManaged)) {
        return { settings: result, installed: false };
    }

    result.hooks.Notification.push({
        matcher: 'permission_prompt|elicitation_dialog',
        hooks: [{ type: 'command', command: `python3 "${notifyScriptPath}" ${SENTINEL}` }]
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

    let scriptCopied = false;
    if (!fs.existsSync(notifyScriptDest)) {
        fs.mkdirSync(path.dirname(notifyScriptDest), { recursive: true });
        fs.copyFileSync(notifyScriptSrc, notifyScriptDest);
        scriptCopied = true;
    }

    return { installed, scriptCopied };
}

function uninstall({ settingsPath }) {
    const settings = readSettings(settingsPath);
    const { settings: newSettings, removed } = removeManaged(settings);
    if (removed > 0) writeSettings(settingsPath, newSettings);
    return { removed };
}

module.exports = { install, uninstall, isManaged, buildSettings, removeManaged, SENTINEL };
