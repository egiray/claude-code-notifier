const realOs = require('os');
const realFs = require('fs');
const systemNotification = require('./system-notification');
const { isManaged, SENTINEL } = require('./hook-installer');

const STEP_GAP_MS = 1500;

function promisify(fn) {
    return (...args) => new Promise((resolve) => {
        fn(...args, (err, info) => resolve({ err: err || null, info: info || {} }));
    });
}

function readJson(fsImpl, filePath) {
    try {
        return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function managedCommands(settings) {
    const hooks = (settings && settings.hooks) || {};
    const found = {};
    for (const [section, entries] of Object.entries(hooks)) {
        if (!Array.isArray(entries)) continue;
        const ours = entries.filter(isManaged);
        if (ours.length) {
            found[section] = ours.flatMap(e => e.hooks
                .filter(h => typeof h.command === 'string' && h.command.includes(SENTINEL))
                .map(h => h.command));
        }
    }
    return found;
}

// Pulls the script path back out of `node "<path>" # claude-code-notifier`.
function scriptPathFromCommand(command) {
    const quoted = command.match(/"([^"]+)"/);
    if (quoted) return quoted[1];
    const bare = command.replace(SENTINEL, '').trim().split(/\s+/);
    return bare[bare.length - 1] || '';
}

function checkSetup({
    settingsPath, notifyScriptDest, notifyFile,
    fsImpl = realFs, platform = realOs.platform(), notify = systemNotification,
}) {
    const checks = [];

    const settings = readJson(fsImpl, settingsPath);
    if (!settings) {
        checks.push({ name: 'Hook configuration', ok: false, detail: `Could not read ${settingsPath}` });
    } else {
        const found = managedCommands(settings);
        const sections = Object.keys(found);
        checks.push({
            name: 'Hook configuration',
            ok: sections.includes('Notification'),
            detail: sections.length ? `Registered for: ${sections.join(', ')}` : 'No hooks registered by this extension',
        });

        const stale = Object.values(found).flat()
            .map(scriptPathFromCommand)
            .filter(p => p && !fsImpl.existsSync(p));
        if (stale.length) {
            checks.push({
                name: 'Hook script path',
                ok: false,
                detail: `Configured hook points at a missing file: ${[...new Set(stale)].join(', ')}`,
            });
        }
    }

    checks.push({
        name: 'Notify script',
        ok: fsImpl.existsSync(notifyScriptDest),
        detail: notifyScriptDest,
    });

    let triggerOk = false;
    let triggerDetail = notifyFile;
    try {
        fsImpl.writeFileSync(notifyFile, '', 'utf8');
        triggerOk = true;
    } catch (err) {
        triggerDetail = `${notifyFile} — ${err.message}`;
    }
    checks.push({ name: 'Trigger file', ok: triggerOk, detail: triggerDetail });

    if (platform === 'darwin') {
        const binary = notify.findTerminalNotifier();
        checks.push({
            name: 'terminal-notifier',
            ok: Boolean(binary),
            detail: binary || 'Not installed — falling back to osascript (notifications appear as "Script Editor")',
        });
    }

    return checks;
}

async function runLiveChecks({
    platform = realOs.platform(),
    notify = systemNotification,
    onStep = () => {},
    sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    gapMs = STEP_GAP_MS,
} = {}) {
    const results = [];
    const steps = [];

    if (platform === 'darwin') {
        if (notify.findTerminalNotifier()) {
            steps.push({
                name: 'Banner via terminal-notifier',
                run: () => promisify(notify.notifyViaTerminalNotifier)('Diagnostic 1: banner via terminal-notifier'),
            });
        }
        steps.push({
            name: 'Banner via osascript',
            run: () => promisify(notify.notifyViaOsascript)('Diagnostic 2: banner via osascript'),
        });
    } else {
        steps.push({
            name: 'System banner',
            run: () => promisify(notify.showOsNotification)('Diagnostic 1: system banner'),
        });
    }

    steps.push({ name: 'Sound', run: () => promisify(notify.playSound)() });

    for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        const label = `${i + 1}/${steps.length} ${step.name}`;
        onStep(label);
        const { err } = await step.run();
        results.push({ name: step.name, ok: !err, detail: err ? err.message : 'Command ran without error' });
        if (i < steps.length - 1) await sleep(gapMs);
    }

    return results;
}

function buildReport({ setupChecks, liveChecks, platform = realOs.platform(), notify = systemNotification }) {
    const lines = ['Claude Code Notifier — diagnostics', ''];

    lines.push('Setup');
    for (const check of setupChecks) lines.push(`  ${check.ok ? 'OK  ' : 'FAIL'}  ${check.name}: ${check.detail}`);

    lines.push('', 'Delivery (each of these should have appeared or played just now)');
    liveChecks.forEach((check, i) => {
        lines.push(`  ${check.ok ? 'OK  ' : 'FAIL'}  ${i + 1}/${liveChecks.length} ${check.name}: ${check.detail}`);
    });

    const failed = [...setupChecks, ...liveChecks].filter(c => !c.ok);
    lines.push('', 'What to do next');

    if (platform === 'darwin') {
        const usedOsascript = liveChecks.some(c => c.name.includes('osascript') && c.ok);
        if (usedOsascript) {
            lines.push('  • If a banner did NOT appear even though the command reported OK, macOS is');
            lines.push('    suppressing it. Open System Settings → Notifications → Script Editor and');
            lines.push('    allow notifications, then check that Focus / Do Not Disturb is off.');
        }
        if (!notify.findTerminalNotifier()) {
            lines.push('  • For banners that are not attributed to Script Editor, install terminal-notifier:');
            lines.push('    brew install terminal-notifier');
        }
    }

    if (failed.length) {
        lines.push(`  • ${failed.length} check(s) failed above — the detail line says why.`);
    } else {
        lines.push('  • Everything the extension can verify from here is working.');
    }

    return lines.join('\n');
}

async function runDiagnostics(options) {
    const platform = options.platform || realOs.platform();
    const notify = options.notify || systemNotification;
    const setupChecks = checkSetup({ ...options, platform, notify });
    const liveChecks = await runLiveChecks({ ...options, platform, notify });
    return {
        setupChecks,
        liveChecks,
        report: buildReport({ setupChecks, liveChecks, platform, notify }),
    };
}

module.exports = {
    runDiagnostics, checkSetup, runLiveChecks, buildReport,
    managedCommands, scriptPathFromCommand, STEP_GAP_MS,
};
