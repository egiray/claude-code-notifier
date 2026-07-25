const DEFAULT_ALLOWED_EVENTS = ['permission_prompt', 'elicitation_dialog'];

function parsePayload(raw) {
    if (typeof raw !== 'string') return { event: 'notification', text: '' };
    const trimmed = raw.trim();
    if (!trimmed) return { event: 'notification', text: '' };
    try {
        const data = JSON.parse(trimmed);
        return {
            event: typeof data.event === 'string' ? data.event : 'notification',
            text: typeof data.text === 'string' ? data.text : trimmed
        };
    } catch (_) {
        return { event: 'notification', text: trimmed };
    }
}

// Notification types arrive as snake_case ("permission_prompt") while hook event
// names arrive as PascalCase ("SubagentStop"). Compare them on equal footing.
function normalizeEvent(event) {
    return String(event || '').toLowerCase().replace(/[_\-\s]/g, '');
}

function isAllowedEvent(event, allowedList) {
    const list = Array.isArray(allowedList) ? allowedList : DEFAULT_ALLOWED_EVENTS;
    const target = normalizeEvent(event);
    return list.some(allowed => normalizeEvent(allowed) === target);
}

module.exports = { parsePayload, isAllowedEvent, normalizeEvent, DEFAULT_ALLOWED_EVENTS };
