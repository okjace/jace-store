"""PyInstaller entry point."""
import os
import sys

if getattr(sys, "frozen", False):
    # PyInstaller points LD_LIBRARY_PATH at the bundle; children (package managers,
    # installed apps) must get the user's own environment
    orig = os.environ.pop("LD_LIBRARY_PATH_ORIG", None)
    if orig is not None:
        os.environ["LD_LIBRARY_PATH"] = orig
    else:
        os.environ.pop("LD_LIBRARY_PATH", None)
else:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jacestore.app import main  # noqa: E402

main()
