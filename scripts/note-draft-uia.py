import argparse
import sys
import time

from pywinauto import Desktop

SAVE_LABEL = "\u4e0b\u66f8\u304d\u4fdd\u5b58"
PUBLISH_LABEL = "\u516c\u958b\u306b\u9032\u3080"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout-ms", type=int, default=45000)
    parser.add_argument("--title", default="")
    parser.add_argument("--body", default="")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def choose_note_window(desktop):
    windows = desktop.windows(title_re=".*note.*Google Chrome")
    if not windows:
        raise RuntimeError("note window not found")
    for window in reversed(windows):
        try:
            titles = [ctrl.window_text() for ctrl in window.descendants(control_type="Button")]
            if SAVE_LABEL in titles and PUBLISH_LABEL in titles:
                return window
        except Exception:
            continue
    return windows[-1]


def note_body_edit(window):
    edits = []
    for ctrl in window.descendants(control_type="Edit"):
        text = ctrl.window_text()
        if text and "editor.note.com/" in text:
            continue
        edits.append(ctrl)
    if not edits:
        raise RuntimeError("note editor field not found")
    return edits[-1]


def save_button(window):
    for ctrl in window.descendants(control_type="Button"):
        if ctrl.window_text() == SAVE_LABEL:
            return ctrl
    raise RuntimeError("draft save button not found")


def main():
    args = parse_args()
    desktop = Desktop(backend="uia")
    deadline = time.time() + (args.timeout_ms / 1000)
    content = args.body.strip()
    if args.title.strip():
        content = f"{args.title.strip()}\n\n{content}" if content else args.title.strip()
    if not content:
        raise RuntimeError("title or body is required")

    last_error = "note window not ready"
    while time.time() < deadline:
        try:
            window = choose_note_window(desktop)
            wrapper = window.wrapper_object() if hasattr(window, "wrapper_object") else window
            wrapper.set_focus()
            editor = note_body_edit(wrapper)
            editor.click_input()
            editor.type_keys("^a{BACKSPACE}", set_foreground=True)
            editor.type_keys(content, with_spaces=True, with_newlines=True, pause=0.01, set_foreground=True)
            button = save_button(wrapper)
            print(f"Found save button: {button.window_text()} enabled={button.is_enabled()}")
            if args.dry_run:
                print("Dry run only")
                return
            if not button.is_enabled():
                time.sleep(1.5)
            button.click_input()
            print("Clicked draft save button")
            return
        except Exception as exc:
            last_error = str(exc)
            time.sleep(0.6)

    print(last_error, file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
