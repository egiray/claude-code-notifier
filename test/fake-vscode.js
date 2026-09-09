/**
 * A stand-in for the `vscode` module so extension.js can be loaded and driven from
 * plain Node. Jest maps `require('vscode')` here (see jest.moduleNameMapper).
 *
 * Popups are deliberately left unresolved unless a test answers them — that is how
 * we reproduce a user who walks away without touching the notification.
 */
const state = {
    warnings: [],
    errors: [],
    infos: [],
    commands: new Map(),
    outputChannels: [],
    config: {},
    focused: false,
    remoteName: undefined,
    extensions: new Map(),
    globalState: new Map(),
    configListeners: [],
    workspaceFolders: undefined,
};

function reset(config = {}) {
    state.warnings = [];
    state.errors = [];
    state.infos = [];
    state.commands = new Map();
    state.outputChannels = [];
    state.config = { ...config };
    state.focused = false;
    state.remoteName = undefined;
    state.extensions = new Map();
    state.globalState = new Map();
    state.configListeners = [];
    state.workspaceFolders = undefined;
}

function recordMessage(bucket, text, items) {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    bucket.push({ text, items, resolve, promise });
    return promise;
}

const vscode = {
    window: {
        get state() {
            return { focused: state.focused };
        },
        showWarningMessage: (text, ...items) => recordMessage(state.warnings, text, items),
        showErrorMessage: (text, ...items) => recordMessage(state.errors, text, items),
        showInformationMessage: (text, ...items) => recordMessage(state.infos, text, items),
        createOutputChannel: (name) => {
            const channel = {
                name,
                lines: [],
                appendLine: (line) => channel.lines.push(line),
                clear: () => { channel.lines = []; },
                show: () => {},
                dispose: () => {},
            };
            state.outputChannels.push(channel);
            return channel;
        },
    },
    workspace: {
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
        get workspaceFolders() {
            return state.workspaceFolders;
        },
        onDidChangeConfiguration: (handler) => {
            state.configListeners.push(handler);
            return { dispose: () => {} };
        },
        getConfiguration: () => ({
            get: (key, fallback) => (key in state.config ? state.config[key] : fallback),
            // A test config models settings the user actually chose, which is exactly
            // what inspect() reports as explicitly set.
            inspect: (key) => (key in state.config ? { globalValue: state.config[key] } : {}),
        }),
    },
    commands: {
        registerCommand: (id, handler) => {
            state.commands.set(id, handler);
            return { dispose: () => state.commands.delete(id) };
        },
        // Real VS Code rejects an unknown command, which is exactly how the absence of
        // the companion extension is detected — so the stand-in must reject too.
        executeCommand: (id, ...args) => {
            const handler = state.commands.get(id);
            if (!handler) return Promise.reject(new Error(`command '${id}' not found`));
            return Promise.resolve(handler(...args));
        },
    },
    extensions: {
        getExtension: (id) => state.extensions.get(id),
    },
    Uri: { parse: (value) => ({ value }) },
    env: {
        openExternal: () => Promise.resolve(true),
        get remoteName() {
            return state.remoteName;
        },
    },

    // test helpers
    __state: state,
    __reset: reset,
    __lastWarning: () => state.warnings[state.warnings.length - 1],
    __answerLastWarning: (selection) => {
        const last = state.warnings[state.warnings.length - 1];
        if (last) last.resolve(selection);
    },
    __setConfig: (config) => {
        state.config = { ...state.config, ...config };
        const changed = Object.keys(config);
        const event = { affectsConfiguration: (key) => changed.some(k => `claudeCodeNotifier.${k}` === key) };
        state.configListeners.forEach(handler => handler(event));
    },
    __setFocused: (value) => { state.focused = value; },
    __setRemoteName: (value) => { state.remoteName = value; },
    __setWorkspaceFolders: (paths) => {
        state.workspaceFolders = paths && paths.map(p => ({ uri: { fsPath: p } }));
    },
    __installExtension: (id) => { state.extensions.set(id, { id, isActive: true }); },
    __globalState: () => ({
        get: (key, fallback) => (state.globalState.has(key) ? state.globalState.get(key) : fallback),
        update: (key, value) => { state.globalState.set(key, value); return Promise.resolve(); },
    }),
    __lastInfo: () => state.infos[state.infos.length - 1],
    __answerLastInfo: (selection) => {
        const last = state.infos[state.infos.length - 1];
        if (last) last.resolve(selection);
    },
};

module.exports = vscode;
