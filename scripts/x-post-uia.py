import argparse
import re
import sys
import time

from pywinauto import Desktop


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout-ms", type=int, default=30000)
    parser.add_argument("--window-title-regex", default="")
    parser.add_argument("--text-snippet", default="")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def choose_window(desktop, title_regex):
    if title_regex:
        windows = desktop.windows(title_re=title_regex)
        if not windows:
            return desktop.window(title_re=title_regex)
        for window in reversed(windows):
            try:
                for ctrl in window.descendants(control_type="Button"):
                    if ctrl.window_text() == "Post":
                        return window
            except Exception:
                continue
        return windows[-1]
    windows = desktop.windows()
    if not windows:
        raise RuntimeError("No desktop windows found")
    return windows[-1]


def has_text(window, snippet):
    if not snippet:
        return True
    needle = snippet.strip()
    if not needle:
        return True
    try:
        for ctrl in window.descendants():
            text = ctrl.window_text()
            if text and needle in text:
                return True
    except Exception:
        return False
    return False


def find_post_button(window):
    labels = ["Post"]
    for label in labels:
        try:
            if hasattr(window, "child_window"):
                button = window.child_window(title=label, control_type="Button")
                wrapper = button.wrapper_object() if hasattr(button, "wrapper_object") else button
                if wrapper.is_visible() and wrapper.is_enabled():
                    return wrapper
        except Exception:
            continue
    try:
        for ctrl in window.descendants(control_type="Button"):
            text = ctrl.window_text()
            if text in labels:
                wrapper = ctrl.wrapper_object() if hasattr(ctrl, "wrapper_object") else ctrl
                if wrapper.is_visible() and wrapper.is_enabled():
                    return wrapper
    except Exception:
        return None
    return None


def main():
    args = parse_args()
    desktop = Desktop(backend="uia")
    deadline = time.time() + (args.timeout_ms / 1000)
    title_regex = args.window_title_regex
    text_snippet = args.text_snippet
    last_error = "Post button not found"

    while time.time() < deadline:
        try:
            window = choose_window(desktop, title_regex)
            if hasattr(window, "exists"):
                if not window.exists(timeout=1):
                    last_error = "Target Chrome window not found"
                    time.sleep(0.5)
                    continue
                wrapper = window.wrapper_object()
            else:
                wrapper = window
            wrapper.set_focus()
            if title_regex:
                title = wrapper.window_text()
                if not re.search(title_regex, title):
                    last_error = f"Window title did not match: {title}"
                    time.sleep(0.5)
                    continue
            if not has_text(wrapper, text_snippet):
                last_error = "Target compose text not found in active window"
                time.sleep(0.5)
                continue
            button = find_post_button(wrapper)
            if button is None:
                last_error = "Post button not available"
                time.sleep(0.5)
                continue
            print(f"Found button: {button.window_text()}")
            if args.dry_run:
                print("Dry run only")
                return
            button.click_input()
            print("Clicked post button")
            return
        except Exception as exc:
            last_error = str(exc)
            time.sleep(0.5)

    print(last_error, file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
