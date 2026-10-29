"""Cancelling the job that's running on this thread.

The job panel gives each job a Token; the worker thread sets it as current, and every slow
step checks it: downloads stop between chunks, and commands (package managers, installers)
are terminated. Elevated commands (pkexec, administrator prompts) run as another user and
can't be stopped from here; those finish, then the job stops at the next step.
"""
import threading

_local = threading.local()


class Cancelled(Exception):
    """The user cancelled the job."""


class Token:
    def __init__(self):
        self.cancelled = False
        self._procs = set()
        self._lock = threading.Lock()

    def cancel(self) -> bool:
        """Stop the job. Returns False if something unstoppable is running (it stops after it)."""
        self.cancelled = True
        stoppable = True
        with self._lock:
            for p in list(self._procs):
                try:
                    p.terminate()
                except (PermissionError, ProcessLookupError, OSError):
                    stoppable = False
        return stoppable

    def track(self, proc):
        with self._lock:
            self._procs.add(proc)

    def untrack(self, proc):
        with self._lock:
            self._procs.discard(proc)


def set_current(token: Token | None):
    _local.token = token


def current() -> Token | None:
    return getattr(_local, "token", None)


def check():
    """Raise Cancelled if the current job was cancelled."""
    t = current()
    if t and t.cancelled:
        raise Cancelled()
