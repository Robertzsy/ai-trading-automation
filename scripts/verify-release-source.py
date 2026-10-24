"""Validate archived source before either Windows package copies broad trees."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
receipt_path = root / "release-source.json"
if not receipt_path.is_file():
    raise SystemExit("Use prepare-release-source.ps1 to build from an exact committed archive")
receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
for relative, expected in receipt["files"].items():
    path = root / relative
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f"Release source differs from {receipt['commit']}: {relative}")
for directory in ("app", "engine", "scripts", "config"):
    for path in (root / directory).rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        parts = path.relative_to(root).parts
        if "node_modules" in parts or "__pycache__" in parts or path.suffix in {".pyc", ".pyo"}:
            continue
        if relative not in receipt["files"]:
            raise SystemExit(f"Unexpected release input: {relative}")
manifest = json.loads((root / "app/product-manifest.json").read_text(encoding="utf-8"))
for category in ("plugins", "skills"):
    actual = {path.name for path in (root / "app" / category).iterdir() if path.is_dir()}
    if actual != set(manifest[category]):
        raise SystemExit(f"Product {category} differ from the release allowlist")
dsh = json.loads((root / "app/node_modules/@deepseek-ai/dsh/package.json").read_text(encoding="utf-8"))["version"]
expected_dsh = json.loads((root / "app/package.json").read_text(encoding="utf-8"))["dependencies"]["@deepseek-ai/dsh"]
if dsh != expected_dsh:
    raise SystemExit("Installed DSH differs from the exact dependency pin")
print(f"Verified source {receipt['commit']}: {len(receipt['files'])} files, DSH {dsh}")
