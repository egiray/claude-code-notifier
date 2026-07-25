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
};

function reset(config = {}) {
    state.warnings = [];
    state.errors = [];
    state.infos = [];
    state.commands = new Map();
    state.outputChannels = [];
    state.config = { ...config };
    state.focused = false;
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
        getConfiguration: () => ({
            get: (key, fallback) => (key in state.config ? state.config[key] : fallback),
        }),
    },
    commands: {
        registerCommand: (id, handler) => {
            state.commands.set(id, handler);
            return { dispose: () => state.commands.delete(id) };
        },
        executeCommand: (id, ...args) => {
            const handler = state.commands.get(id);
            return handler ? handler(...args) : undefined;
        },
    },
    Uri: { parse: (value) => ({ value }) },
    env: { openExternal: () => Promise.resolve(true) },

    // test helpers
    __state: state,
    __reset: reset,
    __lastWarning: () => state.warnings[state.warnings.length - 1],
    __answerLastWarning: (selection) => {
        const last = state.warnings[state.warnings.length - 1];
        if (last) last.resolve(selection);
    },
    __setConfig: (config) => { state.config = { ...state.config, ...config }; },
    __setFocused: (value) => { state.focused = value; },
};

module.exports = vscode;
