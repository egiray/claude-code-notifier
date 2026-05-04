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

function isAllowedEvent(event, allowedList) {
    const list = Array.isArray(allowedList) ? allowedList : DEFAULT_ALLOWED_EVENTS;
    return list.includes(event);
}

module.exports = { parsePayload, isAllowedEvent, DEFAULT_ALLOWED_EVENTS };
