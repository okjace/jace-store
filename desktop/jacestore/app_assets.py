"""Find bundled files (icons) both from source and in PyInstaller builds."""
import sys
from pathlib import Path


def asset(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base / "jacestore" / "assets" / name
