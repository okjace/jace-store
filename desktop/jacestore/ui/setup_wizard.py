"""First run of a downloaded Jace Store: install it properly, then start the installed copy."""
import sys

from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import QCheckBox, QDialog, QHBoxLayout, QLabel, QProgressBar, QPushButton, QVBoxLayout

from jacestore import APP_NAME, APP_VERSION, selfinstall
from jacestore.app_assets import asset
from jacestore.ui.worker import run_async


class SetupWizard(QDialog):
    """Returns Accepted after installing (the installed copy is started), Rejected
    for "Just run it" (keep running this copy without installing)."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"Install {APP_NAME}")
        self.setMinimumWidth(520)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(26, 24, 26, 22)
        lay.setSpacing(12)
        top = QHBoxLayout()
        icon = QLabel()
        icon.setPixmap(QPixmap(str(asset("icon.png"))).scaled(72, 72, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        top.addWidget(icon)
        col = QVBoxLayout()
        t = QLabel(f"Install {APP_NAME} {APP_VERSION}")
        t.setProperty("h1", True)
        col.addWidget(t)
        sub = QLabel("Install apps and games from Jace Store and your computer's own software sources.")
        sub.setWordWrap(True)
        sub.setProperty("muted", True)
        col.addWidget(sub)
        top.addLayout(col, 1)
        lay.addLayout(top)
        where = QLabel(f"Installs to {selfinstall.default_dir()}")
        where.setProperty("muted", True)
        where.setWordWrap(True)
        lay.addWidget(where)
        self.checks = {}
        for key, text, default in selfinstall.options():
            c = QCheckBox(text)
            c.setChecked(default)
            self.checks[key] = c
            lay.addWidget(c)
        self.status = QLabel("")
        self.status.setProperty("muted", True)
        self.bar = QProgressBar()
        self.bar.setTextVisible(False)
        self.bar.hide()
        lay.addWidget(self.status)
        lay.addWidget(self.bar)
        row = QHBoxLayout()
        self.just_run = QPushButton("Just run it")
        self.just_run.clicked.connect(self.reject)
        self.go = QPushButton("Install")
        self.go.setProperty("primary", True)
        self.go.setDefault(True)
        self.go.clicked.connect(self._install)
        row.addWidget(self.just_run)
        row.addStretch()
        row.addWidget(self.go)
        lay.addLayout(row)
        self.installed_to = None

    def _install(self):
        self.go.setEnabled(False)
        self.just_run.setEnabled(False)
        self.bar.show()
        self.bar.setRange(0, 0)
        opts = {k: c.isChecked() for k, c in self.checks.items()}
        run_async(lambda ctx: selfinstall.install(opts, ctx.log), self._done, self._failed, log=self.status.setText)

    def _done(self, target):
        self.installed_to = target
        self.status.setText("Installed. Starting Jace Store…")
        downloaded = selfinstall.running_package()
        selfinstall.relaunch(target, delete_after=downloaded if sys.platform != "linux" else None)
        self.accept()

    def _failed(self, msg):
        self.bar.hide()
        self.status.setText(f"Install failed: {msg}")
        self.go.setEnabled(True)
        self.just_run.setEnabled(True)
