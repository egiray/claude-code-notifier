const { parsePayload, isAllowedEvent, DEFAULT_ALLOWED_EVENTS } = require('../lib/payload');

describe('parsePayload', () => {
    describe('valid JSON payloads', () => {
        test('parses event and text fields', () => {
            const result = parsePayload('{"event":"permission_prompt","text":"Claude needs permission"}');
            expect(result).toEqual({ event: 'permission_prompt', text: 'Claude needs permission' });
        });

        test('defaults event to notification when field is missing', () => {
            const result = parsePayload('{"text":"hello"}');
            expect(result).toEqual({ event: 'notification', text: 'hello' });
        });

        test('defaults event to notification when field is not a string', () => {
            const result = parsePayload('{"event":42,"text":"hello"}');
            expect(result).toEqual({ event: 'notification', text: 'hello' });
        });

        test('falls back to raw string as text when text field is missing', () => {
            const input = '{"event":"permission_prompt"}';
            const result = parsePayload(input);
            expect(result).toEqual({ event: 'permission_prompt', text: input });
        });

        test('falls back to raw string as text when text field is not a string', () => {
            const input = '{"event":"permission_prompt","text":true}';
            const result = parsePayload(input);
            expect(result).toEqual({ event: 'permission_prompt', text: input });
        });

        test('handles extra unknown fields gracefully', () => {
            const result = parsePayload('{"event":"elicitation_dialog","text":"A question","pid":1234}');
            expect(result).toEqual({ event: 'elicitation_dialog', text: 'A question' });
        });
    });

    describe('plain-text fallback (backward compatibility)', () => {
        test('treats plain text as notification event', () => {
            const result = parsePayload('Claude needs your permission');
            expect(result).toEqual({ event: 'notification', text: 'Claude needs your permission' });
        });

        test('trims surrounding whitespace', () => {
            const result = parsePayload('  some message  ');
            expect(result).toEqual({ event: 'notification', text: 'some message' });
        });
    });

    describe('edge cases', () => {
        test('returns empty text for empty string', () => {
            const result = parsePayload('');
            expect(result).toEqual({ event: 'notification', text: '' });
        });

        test('returns empty text for whitespace-only string', () => {
            const result = parsePayload('   ');
            expect(result).toEqual({ event: 'notification', text: '' });
        });

        test('handles malformed JSON', () => {
            const result = parsePayload('{bad json}');
            expect(result).toEqual({ event: 'notification', text: '{bad json}' });
        });

        test('handles non-string input gracefully', () => {
            const result = parsePayload(null);
            expect(result).toEqual({ event: 'notification', text: '' });
        });
    });
});

describe('isAllowedEvent', () => {
    test('allows events in the list', () => {
        expect(isAllowedEvent('permission_prompt', ['permission_prompt', 'elicitation_dialog'])).toBe(true);
        expect(isAllowedEvent('elicitation_dialog', ['permission_prompt', 'elicitation_dialog'])).toBe(true);
    });

    test('blocks events not in the list', () => {
        expect(isAllowedEvent('pre_tool_use', ['permission_prompt', 'elicitation_dialog'])).toBe(false);
        expect(isAllowedEvent('idle_prompt', ['permission_prompt', 'elicitation_dialog'])).toBe(false);
    });

    test('uses DEFAULT_ALLOWED_EVENTS when list is null', () => {
        expect(isAllowedEvent('permission_prompt', null)).toBe(true);
        expect(isAllowedEvent('pre_tool_use', null)).toBe(false);
    });

    test('uses DEFAULT_ALLOWED_EVENTS when list is not an array', () => {
        expect(isAllowedEvent('permission_prompt', 'invalid')).toBe(true);
    });

    test('notification type is blocked by default', () => {
        expect(isAllowedEvent('notification', DEFAULT_ALLOWED_EVENTS)).toBe(false);
    });

    test('custom allow list works', () => {
        expect(isAllowedEvent('idle_prompt', ['idle_prompt'])).toBe(true);
        expect(isAllowedEvent('permission_prompt', ['idle_prompt'])).toBe(false);
    });

    test('empty allow list blocks everything', () => {
        expect(isAllowedEvent('permission_prompt', [])).toBe(false);
    });
});
