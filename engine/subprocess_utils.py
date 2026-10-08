"""Cross-platform helpers for decoding captured subprocess output."""
from __future__ import annotations

import locale
import os
import subprocess
from typing import Any, Dict, Optional, Union


_IS_WINDOWS = os.name == "nt"


def hidden_subprocess_kwargs() -> Dict[str, Any]:
    """Return flags that stop console children from flashing on Windows.

    The desktop services run through ``pythonw``.  Without this flag, every
    Node.js quote request creates a visible console; concurrent US screening
    therefore produces a burst of windows.  Non-Windows callers receive no
    additional keyword arguments.
    """

    if not _IS_WINDOWS:
        return {}
    return {
        "creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
    }


def decode_subprocess_output(value: Optional[Union[bytes, str]]) -> str:
    """Decode child-process output without trusting the Windows ANSI code page.

    Node and Python CLIs normally emit UTF-8 even when the parent Python process
    uses a GBK locale. ``subprocess.run(text=True)`` delegates decoding to that
    locale and can therefore crash its background reader thread. Capture bytes
    and try UTF-8, then GB18030, then the active locale.

    GB18030 deliberately comes BEFORE the locale, not after. The first encoding
    that does not raise wins, and on a non-CJK Windows the locale is a
    single-byte codepage such as cp1252, which decodes GB18030 text
    *successfully* into mojibake: none of the bytes in ordinary Chinese output
    fall in cp1252's five undefined positions, so nothing raises and the correct
    decoding is never reached. Measured, ``贵州茅台：测试输出`` encoded as
    GB18030 came back as ``¹óÖÝÃ©Ì¨£º²âÊÔÊä³ö`` under cp1252. GB18030 is a
    superset of GBK, so trying it first covers the documented case on every
    host, and the locale stays as a last resort for genuinely non-CJK output.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value

    encodings = ["utf-8", "gb18030", locale.getpreferredencoding(False)]
    seen = set()
    for encoding in encodings:
        normalized = (encoding or "").lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        try:
            return value.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return value.decode("utf-8", errors="replace")
