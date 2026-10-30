"""Entry point: command-line flags, single instance, then the window.

  JaceStore                       open the app (setup wizard first if not installed)
  JaceStore jacestore://project/x open a project page (from the website)
  --install --yes                 install without the wizard (tests, scripts)
  --uninstall / --uninstall-gui   remove Jace Store itself
  --apply-update DIR [--wait-pid N] [--no-relaunch]   Windows updater step
  --update --yes [--no-relaunch]  update without the window
  --self-test                     start headless, check everything loads, write SELF-TEST OK
  --version
"""
import os
import sys
import traceback

from jacestore import APP_NAME, APP_VERSION, URL_SCHEME


def _arg(argv, name):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return None


def _say(text: str):
    out = os.environ.get("JACE_SELF_TEST_OUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    try:
        print(text, flush=True)
    except (OSError, ValueError, AttributeError):
        pass   # windowed builds on Windows have no console


def self_test() -> int:
    """Everything a release must survive: imports, system detection, the window, the store API."""
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    from PySide6.QtWidgets import QApplication
    from jacestore import installer, selfinstall, sources, store, system  # noqa: F401 - must import in the build
    from jacestore.ui.main_window import MainWindow
    from jacestore.ui.style import QSS
    app = QApplication.instance() or QApplication(sys.argv)
    app.setStyleSheet(QSS)
    s = system.detect()
    _say(f"{APP_NAME} {APP_VERSION} on {s.describe()} | frozen={selfinstall.frozen()} | sources="
         + ",".join(f"{x.id}{'' if x.available() else '(off)'}" for x in sources.for_this_computer()))
    w = MainWindow()
    w.show()
    app.processEvents()
    for name in MainWindow.NAV:
        w.show_page(name)
        app.processEvents()
    try:
        _say(f"store api ok: {len(store.search('', limit=5).get('hits', []))} hits")
    except Exception as e:  # noqa: BLE001 - the network isn't part of the release check
        _say(f"store api unreachable (not fatal): {e}")
    w.close()
    from PySide6.QtCore import QThreadPool
    QThreadPool.globalInstance().waitForDone(20000)   # let background requests finish before Qt shuts down
    app.processEvents()
    _say("SELF-TEST OK")
    return 0


def _cli(argv) -> int | None:
    """Handle flags that don't need the window. Returns an exit code, or None to start the GUI."""
    from jacestore import selfinstall, updater
    if "--version" in argv:
        _say(APP_VERSION)
        return 0
    if "--self-test" in argv:
        return self_test()
    if "--install" in argv and "--yes" in argv:
        opts = {k: d for k, _, d in selfinstall.options()}
        target = selfinstall.install(opts, _say, _arg(argv, "--dir"))
        _say(f"Installed to {target}")
        return 0
    if "--uninstall" in argv:
        selfinstall.uninstall(_say)
        return 0
    if "--apply-update" in argv:
        pid = _arg(argv, "--wait-pid")
        if pid:
            selfinstall.wait_for_pid(int(pid))
        from pathlib import Path
        target = selfinstall.install({"apps": True}, _say, Path(_arg(argv, "--apply-update")))
        if "--no-relaunch" not in argv:
            selfinstall.relaunch(target)
        return 0
    if "--update" in argv and "--yes" in argv:
        reason = updater.unsupported_reason()
        if reason:
            _say(reason)
            return 1
        info = updater.check()
        if not info:
            _say(f"Up to date ({updater.current_version()})")
            return 0
        _say(f"Updating {updater.current_version()} -> {info['version']}")
        updater.apply(info, _say, relaunch="--no-relaunch" not in argv, extra_args=[a for a in ("--no-gui",) if a in argv])
        return 0
    return None


def _close_splash():
    """The Windows setup .exe shows a splash while it unpacks; hide it once we're running."""
    if sys.platform != "win32":
        return
    try:
        import pyi_splash  # only exists in the onefile Windows build
        pyi_splash.close()
    except Exception:  # noqa: BLE001
        pass


def main():
    _close_splash()
    argv = sys.argv[1:]
    try:
        code = _cli(argv)
    except Exception as e:  # noqa: BLE001
        _say(f"error: {e}")
        traceback.print_exc()
        sys.exit(1)
    if code is not None:
        sys.exit(code)

    from PySide6.QtCore import QTimer
    from PySide6.QtGui import QIcon
    from PySide6.QtNetwork import QLocalServer, QLocalSocket
    from PySide6.QtWidgets import QApplication, QMessageBox
    from jacestore import selfinstall
    from jacestore.app_assets import asset
    from jacestore.ui.style import QSS

    from jacestore.flatpak_links import is_flatpak_arg
    url = next((a for a in argv if a.startswith(f"{URL_SCHEME}:") or is_flatpak_arg(a)), None)
    if url and not url.startswith(f"{URL_SCHEME}:") and "://" not in url:
        url = os.path.abspath(url)            # a downloaded .flatpakref: the running copy has another working folder
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationVersion(APP_VERSION)
    app.setDesktopFileName("io.github.okjace.JaceStore")
    app.setWindowIcon(QIcon(str(asset("icon.png"))))
    app.setStyleSheet(QSS)

    if "--uninstall-gui" in argv:
        if QMessageBox.question(None, APP_NAME, "Remove Jace Store from this computer?\n\nApps you installed with it stay installed.") == QMessageBox.Yes:
            selfinstall.uninstall()
        sys.exit(0)

    # one window: a second launch (e.g. a jacestore:// link) hands its link to the running copy
    name = f"JaceStore-{os.environ.get('USER') or os.environ.get('USERNAME') or 'user'}"
    sock = QLocalSocket()
    sock.connectToServer(name)
    if sock.waitForConnected(300):
        sock.write((url or "show").encode())
        sock.waitForBytesWritten(1000)
        sock.disconnectFromServer()
        sys.exit(0)

    if selfinstall.needs_setup():
        from jacestore.ui.setup_wizard import SetupWizard
        wiz = SetupWizard()
        if wiz.exec():
            sys.exit(0)        # the installed copy has been started

    try:
        selfinstall.refresh_integration()      # newer versions register for more links (e.g. Flathub's)
    except Exception:  # noqa: BLE001 - never stop the app from starting
        traceback.print_exc()
    from jacestore.ui.main_window import MainWindow
    win = MainWindow()
    server = QLocalServer()
    QLocalServer.removeServer(name)
    server.listen(name)

    def incoming():
        c = server.nextPendingConnection()
        if c.waitForReadyRead(1000):
            msg = bytes(c.readAll()).decode(errors="replace")
            win.handle_url(msg) if msg != "show" else (win.showNormal(), win.raise_(), win.activateWindow())
        c.disconnectFromServer()
    server.newConnection.connect(incoming)

    # macOS delivers jacestore:// links as an event, not an argument
    from PySide6.QtCore import QEvent, QObject

    class UrlFilter(QObject):
        def eventFilter(self, obj, ev):
            if ev.type() == QEvent.FileOpen:
                u = ev.url()
                if u.scheme() == URL_SCHEME:
                    win.handle_url(u.toString())
                    return True
                if ev.file() and is_flatpak_arg(ev.file()):
                    win.handle_url(ev.file())
                    return True
            return False
    f = UrlFilter()
    app.installEventFilter(f)

    win.show()
    if url:
        QTimer.singleShot(200, lambda: win.handle_url(url))
    sys.exit(app.exec())
