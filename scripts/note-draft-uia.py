import argparse
import ctypes
import sys
import time

from pywinauto import Desktop
from pywinauto.keyboard import send_keys

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


def note_edit_fields(window):
    edits = []
    for ctrl in window.descendants(control_type="Edit"):
        text = ctrl.window_text()
        if text and "editor.note.com/" in text:
            continue
        edits.append(ctrl)
    if not edits:
        raise RuntimeError("note editor field not found")
    if len(edits) == 1:
        return None, edits[0]
    return edits[0], edits[-1]


def set_clipboard_text(text):
    normalized = str(text).replace("\r\n", "\n").replace("\n", "\r\n") + "\0"
    payload = normalized.encode("utf-16-le")

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    GMEM_MOVEABLE = 0x0002
    CF_UNICODETEXT = 13

    kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalUnlock.restype = ctypes.c_int
    kernel32.GlobalFree.argtypes = [ctypes.c_void_p]
    kernel32.GlobalFree.restype = ctypes.c_void_p

    user32.OpenClipboard.argtypes = [ctypes.c_void_p]
    user32.OpenClipboard.restype = ctypes.c_int
    user32.EmptyClipboard.argtypes = []
    user32.EmptyClipboard.restype = ctypes.c_int
    user32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
    user32.SetClipboardData.restype = ctypes.c_void_p
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = ctypes.c_int

    handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(payload))
    if not handle:
        raise RuntimeError("GlobalAlloc failed")

    locked = kernel32.GlobalLock(handle)
    if not locked:
        kernel32.GlobalFree(handle)
        raise RuntimeError("GlobalLock failed")

    try:
        ctypes.memmove(locked, payload, len(payload))
    finally:
        kernel32.GlobalUnlock(handle)

    if not user32.OpenClipboard(None):
        kernel32.GlobalFree(handle)
        raise RuntimeError("OpenClipboard failed")

    try:
        if not user32.EmptyClipboard():
            kernel32.GlobalFree(handle)
            raise RuntimeError("EmptyClipboard failed")
        if not user32.SetClipboardData(CF_UNICODETEXT, handle):
            kernel32.GlobalFree(handle)
            raise RuntimeError("SetClipboardData failed")
        handle = None
    finally:
        user32.CloseClipboard()
        if handle:
            kernel32.GlobalFree(handle)


def paste_text(ctrl, text):
    ctrl.click_input()
    send_keys("^a{BACKSPACE}")
    set_clipboard_text(text)
    send_keys("^v")


def save_button(window):
    for ctrl in window.descendants(control_type="Button"):
        if ctrl.window_text() == SAVE_LABEL:
            return ctrl
    raise RuntimeError("draft save button not found")


def main():
    args = parse_args()
    desktop = Desktop(backend="uia")
    deadline = time.time() + (args.timeout_ms / 1000)
    title = args.title.strip()
    body = args.body.strip()
    if not title and not body:
        raise RuntimeError("title or body is required")

    last_error = "note window not ready"
    while time.time() < deadline:
        try:
            window = choose_note_window(desktop)
            wrapper = window.wrapper_object() if hasattr(window, "wrapper_object") else window
            wrapper.set_focus()
            title_edit, body_edit = note_edit_fields(wrapper)
            if title_edit is not None and title:
                paste_text(title_edit, title)
                time.sleep(0.3)
            if body:
                paste_text(body_edit, body)
                time.sleep(0.3)
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
