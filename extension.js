const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Path to the notification trigger file
const NOTIFY_FILE = '/tmp/claude-notify';

let fileWatcher = null;

/**
 * Activates the extension
 */
function activate(context) {
    console.log('Claude Code Notifier is now active');

    // Register test command
    let testCommand = vscode.commands.registerCommand('claude-notifier.notify', function () {
        vscode.window.showInformationMessage('Claude Code Notifier is working! 🎉');
    });

    context.subscriptions.push(testCommand);

    // Start watching for the notification file
    startFileWatcher();

    // Clean up on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (fileWatcher) {
                fileWatcher.close();
            }
        }
    });
}

/**
 * Starts watching for the notification trigger file
 */
function startFileWatcher() {
    // Ensure the file exists (create empty file)
    if (!fs.existsSync(NOTIFY_FILE)) {
        try {
            fs.writeFileSync(NOTIFY_FILE, '', 'utf8');
        } catch (err) {
            console.error('Failed to create notification file:', err);
        }
    }

    // Watch the file for changes
    try {
        fileWatcher = fs.watch(NOTIFY_FILE, (eventType, filename) => {
            if (eventType === 'change') {
                handleNotification();
            }
        });
        console.log(`Watching for notifications at: ${NOTIFY_FILE}`);
    } catch (err) {
        console.error('Failed to watch notification file:', err);
    }

    // Also check periodically (fallback in case fs.watch misses changes)
    let lastMtime = 0;
    setInterval(() => {
        try {
            if (fs.existsSync(NOTIFY_FILE)) {
                const stats = fs.statSync(NOTIFY_FILE);
                if (stats.mtimeMs > lastMtime && lastMtime !== 0) {
                    handleNotification();
                }
                lastMtime = stats.mtimeMs;
            }
        } catch (err) {
            // Ignore errors
        }
    }, 1000);
}

/**
 * Reads the notification file and shows the message
 */
function handleNotification() {
    try {
        if (!fs.existsSync(NOTIFY_FILE)) {
            return;
        }

        // Read the notification message
        const message = fs.readFileSync(NOTIFY_FILE, 'utf8').trim();

        if (!message) {
            return;
        }

        // Show the notification in VS Code
        vscode.window.showWarningMessage(`🔔 Claude Code: ${message}`, 'OK').then(() => {
            // Clear the file after notification is acknowledged
            try {
                fs.writeFileSync(NOTIFY_FILE, '', 'utf8');
            } catch (err) {
                console.error('Failed to clear notification file:', err);
            }
        });

        console.log('Notification shown:', message);

    } catch (err) {
        console.error('Failed to handle notification:', err);
    }
}

/**
 * Deactivates the extension
 */
function deactivate() {
    if (fileWatcher) {
        fileWatcher.close();
    }
}

module.exports = {
    activate,
    deactivate
};
