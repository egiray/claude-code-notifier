import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).parent.parent / "hooks" / "notify.py"


def run(stdin_text):
    """Run notify.py with the given stdin, return (returncode, trigger_file_content)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        env = {**os.environ, "TMPDIR": tmpdir}
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=stdin_text,
            capture_output=True,
            text=True,
            env=env,
        )
        trigger = pathlib.Path(tmpdir) / "claude-notify"
        content = trigger.read_text() if trigger.exists() else None
        return result.returncode, content


class TestNotifyScript(unittest.TestCase):

    def test_permission_prompt_writes_correct_event_and_text(self):
        payload = json.dumps({
            "hook_event_name": "Notification",
            "notification_type": "permission_prompt",
            "message": "Claude needs permission to run: rm -rf node_modules",
        })
        code, content = run(payload)
        self.assertEqual(code, 0)
        data = json.loads(content)
        self.assertEqual(data["event"], "permission_prompt")
        self.assertEqual(data["text"], "Claude needs permission to run: rm -rf node_modules")

    def test_elicitation_dialog_writes_correct_event_and_text(self):
        payload = json.dumps({
            "hook_event_name": "Notification",
            "notification_type": "elicitation_dialog",
            "message": "Which database should I use?",
        })
        code, content = run(payload)
        self.assertEqual(code, 0)
        data = json.loads(content)
        self.assertEqual(data["event"], "elicitation_dialog")
        self.assertEqual(data["text"], "Which database should I use?")

    def test_stop_event_uses_hook_event_name_as_fallback(self):
        payload = json.dumps({"hook_event_name": "Stop", "cwd": "/some/path"})
        code, content = run(payload)
        self.assertEqual(code, 0)
        data = json.loads(content)
        self.assertEqual(data["event"], "Stop")

    def test_missing_message_falls_back_to_event_name(self):
        payload = json.dumps({
            "hook_event_name": "Notification",
            "notification_type": "permission_prompt",
        })
        code, content = run(payload)
        self.assertEqual(code, 0)
        data = json.loads(content)
        self.assertEqual(data["text"], "permission_prompt")

    def test_real_message_takes_priority_over_event_name(self):
        payload = json.dumps({
            "hook_event_name": "Notification",
            "notification_type": "permission_prompt",
            "message": "Real message from Claude",
        })
        code, content = run(payload)
        data = json.loads(content)
        self.assertEqual(data["text"], "Real message from Claude")

    def test_malformed_json_exits_cleanly_without_writing(self):
        code, content = run("this is not json {{{")
        self.assertEqual(code, 0)
        self.assertIsNone(content)

    def test_empty_stdin_exits_cleanly_without_writing(self):
        code, content = run("")
        self.assertEqual(code, 0)
        self.assertIsNone(content)

    def test_output_is_valid_json(self):
        payload = json.dumps({
            "hook_event_name": "Notification",
            "notification_type": "permission_prompt",
            "message": "test",
        })
        _, content = run(payload)
        try:
            json.loads(content)
        except (json.JSONDecodeError, TypeError):
            self.fail("trigger file does not contain valid JSON")

    def test_unknown_event_type_is_passed_through(self):
        payload = json.dumps({
            "hook_event_name": "SomeFutureEvent",
            "message": "future message",
        })
        code, content = run(payload)
        self.assertEqual(code, 0)
        data = json.loads(content)
        self.assertEqual(data["event"], "SomeFutureEvent")

    def test_tmpdir_trailing_slash_handled_correctly(self):
        """TMPDIR with a trailing slash should not produce a double-slash path."""
        payload = json.dumps({
            "hook_event_name": "Notification",
            "notification_type": "permission_prompt",
            "message": "test",
        })
        with tempfile.TemporaryDirectory() as tmpdir:
            env = {**os.environ, "TMPDIR": tmpdir + "/"}
            result = subprocess.run(
                [sys.executable, str(SCRIPT)],
                input=payload,
                capture_output=True,
                text=True,
                env=env,
            )
            trigger = pathlib.Path(tmpdir) / "claude-notify"
            self.assertTrue(trigger.exists(), "trigger file was not created")
            self.assertEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
