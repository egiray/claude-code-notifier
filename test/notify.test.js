const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'hooks', 'notify.js');

function run(stdinText) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-test-'));
    try {
        const env = { ...process.env, TMPDIR: tmpDir, TEMP: tmpDir, TMP: tmpDir };
        const result = spawnSync(process.execPath, [SCRIPT], {
            input: stdinText,
            encoding: 'utf8',
            env,
        });
        const triggerPath = path.join(tmpDir, 'claude-notify');
        const content = fs.existsSync(triggerPath) ? fs.readFileSync(triggerPath, 'utf8') : null;
        return { code: result.status, content };
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

test('permission_prompt writes correct event and text', () => {
    const payload = JSON.stringify({
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'Claude needs permission to run: rm -rf node_modules',
    });
    const { code, content } = run(payload);
    expect(code).toBe(0);
    const data = JSON.parse(content);
    expect(data.event).toBe('permission_prompt');
    expect(data.text).toBe('Claude needs permission to run: rm -rf node_modules');
});

test('elicitation_dialog writes correct event and text', () => {
    const payload = JSON.stringify({
        hook_event_name: 'Notification',
        notification_type: 'elicitation_dialog',
        message: 'Which database should I use?',
    });
    const { code, content } = run(payload);
    expect(code).toBe(0);
    const data = JSON.parse(content);
    expect(data.event).toBe('elicitation_dialog');
    expect(data.text).toBe('Which database should I use?');
});

test('stop event uses hook_event_name as fallback when no notification_type', () => {
    const payload = JSON.stringify({ hook_event_name: 'Stop', cwd: '/some/path' });
    const { code, content } = run(payload);
    expect(code).toBe(0);
    const data = JSON.parse(content);
    expect(data.event).toBe('Stop');
});

test('missing message falls back to event name', () => {
    const payload = JSON.stringify({
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
    });
    const { code, content } = run(payload);
    expect(code).toBe(0);
    const data = JSON.parse(content);
    expect(data.text).toBe('permission_prompt');
});

test('message takes priority over event name', () => {
    const payload = JSON.stringify({
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'Real message from Claude',
    });
    const { code, content } = run(payload);
    const data = JSON.parse(content);
    expect(data.text).toBe('Real message from Claude');
});

test('malformed JSON exits cleanly without writing', () => {
    const { code, content } = run('this is not json {{{');
    expect(code).toBe(0);
    expect(content).toBeNull();
});

test('empty stdin exits cleanly without writing', () => {
    const { code, content } = run('');
    expect(code).toBe(0);
    expect(content).toBeNull();
});

test('output is valid JSON', () => {
    const payload = JSON.stringify({
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'test',
    });
    const { content } = run(payload);
    expect(() => JSON.parse(content)).not.toThrow();
});

test('unknown event type is passed through', () => {
    const payload = JSON.stringify({
        hook_event_name: 'SomeFutureEvent',
        message: 'future message',
    });
    const { code, content } = run(payload);
    expect(code).toBe(0);
    const data = JSON.parse(content);
    expect(data.event).toBe('SomeFutureEvent');
});
