"""Run slow work (network, package managers) off the UI thread."""
import traceback

from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal, Slot

_alive = set()


class _Relay(QObject):
    """Lives in the UI thread, so its slots (and the callbacks) run there."""
    done = Signal(object)
    failed = Signal(str)
    progress = Signal(object, object)
    log = Signal(str)

    def __init__(self, on_done, on_failed, on_progress, on_log):
        super().__init__()
        self.cb = (on_done, on_failed, on_progress, on_log)
        self.done.connect(self._done)
        self.failed.connect(self._failed)
        self.progress.connect(self._progress)
        self.log.connect(self._log)

    @Slot(object)
    def _done(self, v):
        _alive.discard(self)
        if self.cb[0]:
            self.cb[0](v)

    @Slot(str)
    def _failed(self, msg):
        _alive.discard(self)
        if self.cb[1]:
            self.cb[1](msg)

    @Slot(object, object)
    def _progress(self, a, b):
        if self.cb[2]:
            self.cb[2](a, b)

    @Slot(str)
    def _log(self, line):
        if self.cb[3]:
            self.cb[3](line)


class Context:
    """Passed to the work function: report progress / log lines, check for cancel."""

    def __init__(self, relay):
        self._relay = relay
        self.cancelled = False

    def log(self, line: str):
        self._relay.log.emit(str(line))

    def progress(self, done, total):
        self._relay.progress.emit(done, total)


class _Task(QRunnable):
    def __init__(self, fn, relay, ctx):
        super().__init__()
        self.fn, self.relay, self.ctx = fn, relay, ctx

    def run(self):
        try:
            self.relay.done.emit(self.fn(self.ctx))
        except Exception as e:  # noqa: BLE001 - shown to the user
            traceback.print_exc()
            self.relay.failed.emit(str(e) or e.__class__.__name__)


def run_async(fn, done=None, failed=None, progress=None, log=None) -> Context:
    """fn(ctx) runs on a worker thread; the callbacks run on the UI thread."""
    relay = _Relay(done, failed, progress, log)
    _alive.add(relay)
    ctx = Context(relay)
    QThreadPool.globalInstance().start(_Task(fn, relay, ctx))
    return ctx
