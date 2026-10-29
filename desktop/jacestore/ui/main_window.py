"""The Jace Store window: Discover, Search, project pages, Installed, Updates, Settings."""
import webbrowser

from PySide6.QtCore import Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QIcon
from PySide6.QtWidgets import (QButtonGroup, QComboBox, QFrame, QGridLayout, QHBoxLayout, QLabel, QLineEdit,
                               QListWidget, QListWidgetItem, QMainWindow, QMessageBox, QPlainTextEdit, QProgressBar,
                               QPushButton, QScrollArea, QStackedWidget, QTextBrowser, QVBoxLayout, QWidget)

from jacestore import APP_NAME, APP_VERSION, STORE_URL, actions, installed, installer, selfinstall, settings, sources, store, updater
from jacestore.app_assets import asset
from jacestore.system import detect
from jacestore.ui import images
from jacestore.ui.worker import run_async


def label(text="", muted=False, h1=False, h2=False, wrap=False, sel=False) -> QLabel:
    lab = QLabel(text)
    if muted:
        lab.setProperty("muted", True)
    if h1:
        lab.setProperty("h1", True)
    if h2:
        lab.setProperty("h2", True)
    lab.setWordWrap(wrap)
    if sel:
        lab.setTextInteractionFlags(Qt.TextSelectableByMouse)
    return lab


def button(text, primary=False, danger=False, chip=False) -> QPushButton:
    b = QPushButton(text)
    b.setCursor(Qt.PointingHandCursor)
    for k, v in (("primary", primary), ("danger", danger), ("chip", chip)):
        if v:
            b.setProperty(k, True)
    if chip:
        b.setCheckable(True)
    return b


def fmt_bytes(n) -> str:
    if not n:
        return ""
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return ""


def fmt_num(n) -> str:
    n = n or 0
    return f"{n / 1_000_000:.1f}M" if n >= 1_000_000 else f"{n / 1000:.1f}k" if n >= 1000 else str(n)


def clear(layout):
    while layout.count():
        item = layout.takeAt(0)
        w = item.widget()
        if w:
            w.hide()          # deleteLater only happens later; don't leave it on screen until then
            w.deleteLater()
        elif item.layout():
            clear(item.layout())


def scroller(inner: QWidget) -> QScrollArea:
    s = QScrollArea()
    s.setWidgetResizable(True)
    s.setWidget(inner)
    s.setFrameShape(QFrame.NoFrame)
    return s


# --- jobs (installs run one at a time) -------------------------------------------------------

class JobPanel(QFrame):
    """Bottom bar: the running install with progress, and its log."""
    finished = Signal()

    def __init__(self):
        super().__init__()
        self.setObjectName("panel")
        self.queue = []
        self.current = None
        lay = QVBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10)
        row = QHBoxLayout()
        self.title = label("")
        self.title.setStyleSheet("font-weight:600")
        self.bar = QProgressBar()
        self.bar.setMaximumWidth(260)
        self.bar.setTextVisible(False)
        self.more = label("", muted=True)
        self.toggle = button("Show details")
        self.toggle.clicked.connect(self._toggle_log)
        row.addWidget(self.title, 1)
        row.addWidget(self.more)
        row.addWidget(self.bar)
        row.addWidget(self.toggle)
        lay.addLayout(row)
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumHeight(170)
        self.log.hide()
        lay.addWidget(self.log)
        self.hide()

    def _toggle_log(self):
        self.log.setVisible(not self.log.isVisible())
        self.toggle.setText("Hide details" if self.log.isVisible() else "Show details")

    def busy(self, key) -> bool:
        return (self.current and self.current[0] == key) or any(j[0] == key for j in self.queue)

    def add(self, key, title, fn, on_done=None):
        """fn(log, progress) runs on a worker thread. key stops the same thing being queued twice."""
        if self.busy(key):
            return
        self.queue.append((key, title, fn, on_done))
        self._update_more()
        if not self.current:
            self._next()

    def _update_more(self):
        self.more.setText(f"{len(self.queue)} waiting" if self.queue else "")

    def _next(self):
        if not self.queue:
            self.current = None
            QTimer.singleShot(4000, lambda: self.hide() if not self.current else None)
            self.finished.emit()
            return
        self.current = self.queue.pop(0)
        key, title, fn, on_done = self.current
        self._update_more()
        self.show()
        self.title.setText(title)
        self.bar.setRange(0, 0)
        self.log.appendPlainText(f"\n== {title}")

        def progress(done, total):
            if total:
                self.bar.setRange(0, 1000)
                self.bar.setValue(int(done * 1000 / total))

        def done(result):
            self.bar.setRange(0, 1)
            self.bar.setValue(1)
            self.title.setText(f"✓ {title.replace('Installing', 'Installed').replace('Updating', 'Updated').replace('Removing', 'Removed')}")
            if on_done:
                on_done(result, None)
            self._next()

        def failed(msg):
            self.bar.setRange(0, 1)
            self.bar.setValue(0)
            self.title.setText(f"✗ {title}: failed")
            self.log.appendPlainText(f"Error: {msg}")
            if on_done:
                on_done(None, msg)
            QMessageBox.warning(self.window(), APP_NAME, f"{title} failed.\n\n{msg}")
            self._next()

        run_async(lambda ctx: fn(ctx.log, ctx.progress), done, failed, progress, self.log.appendPlainText)


# --- cards & rows --------------------------------------------------------------------------------

class Card(QFrame):
    clicked = Signal(str)

    def __init__(self, hit: dict):
        super().__init__()
        self.setObjectName("card")
        self.slug = hit["slug"]
        self.setCursor(Qt.PointingHandCursor)
        self.setMinimumHeight(104)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 14, 14, 14)
        lay.setSpacing(12)
        icon = QLabel()
        icon.setFixedSize(56, 56)
        images.load_into(icon, hit.get("icon_url"), hit["title"], 56)
        lay.addWidget(icon, 0, Qt.AlignTop)
        col = QVBoxLayout()
        col.setSpacing(3)
        t = label(hit["title"])
        t.setStyleSheet("font-weight:700; font-size:11pt")
        col.addWidget(t)
        s = label(hit.get("summary", ""), muted=True, wrap=True)
        s.setAlignment(Qt.AlignLeft | Qt.AlignTop)
        s.setFixedHeight(s.fontMetrics().lineSpacing() * 2 - 2)   # two lines, cut cleanly below
        col.addWidget(s)
        meta = " · ".join(x for x in (hit.get("type_label"), hit.get("author") and f"by {hit['author']}",
                                      f"{fmt_num(hit.get('downloads'))} downloads") if x)
        col.addWidget(label(meta, muted=True))
        col.addStretch()
        lay.addLayout(col, 1)

    def mouseReleaseEvent(self, e):
        if e.button() == Qt.LeftButton:
            self.clicked.emit(self.slug)


class CardGrid(QWidget):
    """Cards in as many columns as fit."""
    open_project = Signal(str)

    def __init__(self, min_width=320):
        super().__init__()
        self.min_width = min_width
        self.grid = QGridLayout(self)
        self.grid.setContentsMargins(0, 0, 0, 0)
        self.grid.setSpacing(12)
        self.cards = []
        self.cols = 0

    def set_hits(self, hits: list, empty_text="Nothing here yet."):
        for c in self.cards:
            c.hide()
            c.deleteLater()
        self.cards = []
        clear(self.grid)
        self.setVisible(bool(hits) or bool(empty_text))
        if not hits:
            self.grid.addWidget(label(empty_text, muted=True), 0, 0)
            return
        for h in hits:
            c = Card(h)
            c.clicked.connect(self.open_project.emit)
            self.cards.append(c)
        self.cols = 0
        self._layout()

    def _layout(self):
        cols = max(1, self.width() // self.min_width)
        if cols == self.cols or not self.cards:
            return
        self.cols = cols
        for c in self.cards:
            self.grid.removeWidget(c)
        for i, c in enumerate(self.cards):
            self.grid.addWidget(c, i // cols, i % cols)
        for i in range(4):
            self.grid.setColumnStretch(i, 1 if i < cols else 0)

    def resizeEvent(self, e):
        super().resizeEvent(e)
        self._layout()


class PackageRow(QFrame):
    """A search result from another source (Flathub, winget, apt...)."""

    def __init__(self, pkg: sources.Package, win: "MainWindow"):
        super().__init__()
        self.setObjectName("card")
        self.pkg, self.win = pkg, win
        lay = QHBoxLayout(self)
        lay.setContentsMargins(12, 10, 12, 10)
        icon = QLabel()
        icon.setFixedSize(40, 40)
        images.load_into(icon, pkg.icon_url, pkg.name, 40)
        lay.addWidget(icon)
        col = QVBoxLayout()
        col.setSpacing(2)
        top = pkg.name + (f"   {pkg.version}" if pkg.version else "")
        t = label(top)
        t.setStyleSheet("font-weight:700")
        col.addWidget(t)
        sub = pkg.summary
        if pkg.id != pkg.name:
            sub = f"{pkg.id} · {sub}" if sub else pkg.id
        if pkg.extra.get("verified"):
            sub = "✓ verified · " + sub
        if pkg.extra.get("out_of_date"):
            sub = "⚠ flagged out of date · " + sub
        col.addWidget(label(sub, muted=True, wrap=True))
        lay.addLayout(col, 1)
        if pkg.homepage:
            web = button("Website")
            web.clicked.connect(lambda: webbrowser.open(pkg.homepage))
            lay.addWidget(web)
        self.btn = button("", primary=True)
        self.btn.clicked.connect(self._click)
        lay.addWidget(self.btn)
        self.refresh()

    def refresh(self):
        rec = installed.get(self.pkg.source, self.pkg.id)
        key = f"{self.pkg.source}:{self.pkg.id}"
        if self.win.jobs.busy(key):
            self.btn.setText("Working…")
            self.btn.setEnabled(False)
        elif rec:
            self.btn.setText("Remove")
            self.btn.setProperty("primary", False)
            self.btn.setProperty("danger", True)
            self.btn.setEnabled(True)
        else:
            self.btn.setText("Install")
            self.btn.setEnabled(True)
        self.btn.style().unpolish(self.btn)
        self.btn.style().polish(self.btn)

    def _click(self):
        rec = installed.get(self.pkg.source, self.pkg.id)
        if rec:
            self.win.uninstall(rec, after=self.refresh)
        else:
            self.win.install_package(self.pkg, after=self.refresh)
        self.refresh()


# --- pages -----------------------------------------------------------------------------------------

class Page(QWidget):
    def __init__(self, win):
        super().__init__()
        self.win = win
        self.inner = QWidget()
        self.body = QVBoxLayout(self.inner)
        self.body.setContentsMargins(28, 24, 28, 24)
        self.body.setSpacing(14)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(scroller(self.inner))

    def shown(self):
        pass


class DiscoverPage(Page):
    def __init__(self, win):
        super().__init__(win)
        hero = QFrame()
        hero.setObjectName("panel")
        h = QVBoxLayout(hero)
        h.setContentsMargins(22, 20, 22, 20)
        h.addWidget(label("Every app, one store.", h1=True))
        h.addWidget(label(f"Apps and games from Jace Store, made to work on your {detect().describe()}.", muted=True, wrap=True))
        row = QHBoxLayout()
        self.q = QLineEdit()
        self.q.setPlaceholderText("Search Jace Store and " + ", ".join(s.name for s in sources.for_this_computer()) + "…")
        self.q.returnPressed.connect(lambda: win.search(self.q.text()))
        go = button("Search", primary=True)
        go.clicked.connect(lambda: win.search(self.q.text()))
        row.addWidget(self.q, 1)
        row.addWidget(go)
        h.addLayout(row)
        self.body.addWidget(hero)
        self.sections = {}
        for key, title in (("popular", "Popular"), ("recently_updated", "Recently updated"), ("newest", "New on Jace Store")):
            self.body.addWidget(label(title, h2=True))
            grid = CardGrid()
            grid.open_project.connect(win.open_project)
            self.body.addWidget(grid)
            self.sections[key] = grid
        self.body.addStretch()
        self.loaded = False

    def shown(self):
        if self.loaded:
            return
        self.loaded = True
        for g in self.sections.values():
            g.set_hits([], "Loading…")
        run_async(lambda ctx: store.featured(9), self._show, self._fail)

    def _show(self, data):
        for k, g in self.sections.items():
            g.set_hits(data.get(k, []), "Nothing for your computer yet.")

    def _fail(self, msg):
        self.loaded = False
        for g in self.sections.values():
            g.set_hits([], f"Couldn't reach Jace Store: {msg}")


class SearchPage(Page):
    def __init__(self, win):
        super().__init__(win)
        row = QHBoxLayout()
        self.q = QLineEdit()
        self.q.setPlaceholderText("Search for apps and games…")
        self.q.returnPressed.connect(self.run)
        go = button("Search", primary=True)
        go.clicked.connect(self.run)
        row.addWidget(self.q, 1)
        row.addWidget(go)
        self.body.addLayout(row)
        chips = QHBoxLayout()
        self.group = QButtonGroup(self)
        self.srcs = [None, *sources.for_this_computer()]   # None = Jace Store
        for i, s in enumerate(self.srcs):
            b = button("Jace Store" if s is None else s.name, chip=True)
            b.setChecked(i == 0)
            self.group.addButton(b, i)
            chips.addWidget(b)
        chips.addStretch()
        self.group.idClicked.connect(lambda _: self.run())
        self.body.addLayout(chips)
        self.status = label("", muted=True, wrap=True)
        self.body.addWidget(self.status)
        self.grid = CardGrid()
        self.grid.open_project.connect(win.open_project)
        self.body.addWidget(self.grid)
        self.rows = QVBoxLayout()
        self.rows.setSpacing(8)
        self.body.addLayout(self.rows)
        self.body.addStretch()
        self.gen = 0

    def run(self, q: str | None = None):
        if q is not None:
            self.q.setText(q)
        q = self.q.text().strip()
        src = self.srcs[self.group.checkedId()]
        self.gen += 1
        gen = self.gen
        clear(self.rows)
        self.grid.set_hits([], "")
        if src is None:
            self.status.setText("Searching Jace Store…")
            all_p = settings.load().get("all_platforms")
            run_async(lambda ctx: store.search(q, all_platforms=all_p, limit=48),
                      lambda d: gen == self.gen and self._store(d, q), lambda e: gen == self.gen and self.status.setText(f"Search failed: {e}"))
            return
        if not src.available():
            self.status.setText(src.notice() or f"{src.name} isn't available on this computer.")
            return
        if not q:
            self.status.setText(f"Type what you're looking for to search {src.name}.")
            return
        self.status.setText(f"Searching {src.name}…")
        run_async(lambda ctx: src.search(q), lambda pk: gen == self.gen and self._pkgs(src, pk),
                  lambda e: gen == self.gen and self.status.setText(f"{src.name} search failed: {e}"))

    def _store(self, data, q):
        hits = data.get("hits", [])
        self.status.setText(f"{data.get('total', len(hits))} results on Jace Store" + (f" for “{q}”" if q else "")
                            + ("" if hits else ". Try the other sources above."))
        self.grid.set_hits(hits, "")

    def _pkgs(self, src, pkgs):
        hint = f"  {src.notice()}" if src.notice() else ""
        self.status.setText(f"{len(pkgs)} results from {src.name}.{hint}")
        for p in pkgs:
            self.rows.addWidget(PackageRow(p, self.win))


class ProjectPage(Page):
    def __init__(self, win):
        super().__init__(win)
        self.slug = None
        self.res = None
        self.data = None

    def load(self, slug: str):
        self.slug = slug
        self.res = self.data = None
        clear(self.body)
        back = button("← Back")
        back.setMaximumWidth(100)
        back.clicked.connect(self.win.back)
        self.body.addWidget(back)
        self.body.addWidget(label("Loading…", muted=True))
        self.body.addStretch()
        ch = settings.load().get("channel", "release")

        def work(ctx):
            return store.project(slug), store.resolve(slug, ch)
        run_async(work, lambda r: slug == self.slug and self._show(*r),
                  lambda e: slug == self.slug and self._error(e))

    def _error(self, msg):
        clear(self.body)
        back = button("← Back")
        back.setMaximumWidth(100)
        back.clicked.connect(self.win.back)
        self.body.addWidget(back)
        self.body.addWidget(label(f"Couldn't open this project: {msg}", wrap=True))
        self.body.addStretch()

    def _show(self, data, res):
        self.data, self.res = data, res
        clear(self.body)
        back = button("← Back")
        back.setMaximumWidth(100)
        back.clicked.connect(self.win.back)
        self.body.addWidget(back)

        head = QHBoxLayout()
        head.setSpacing(18)
        icon = QLabel()
        icon.setFixedSize(96, 96)
        images.load_into(icon, data.get("icon_url"), data["title"], 96)
        head.addWidget(icon, 0, Qt.AlignTop)
        col = QVBoxLayout()
        col.addWidget(label(data["title"], h1=True))
        col.addWidget(label(" · ".join(x for x in (data.get("type_label"), data.get("author") and f"by {data['author']}",
                                                     f"{fmt_num(data.get('downloads'))} downloads") if x), muted=True))
        col.addWidget(label(data.get("summary", ""), wrap=True))
        head.addLayout(col, 1)
        actions_col = QVBoxLayout()
        self.main_btn = button("", primary=True)
        self.main_btn.setMinimumWidth(170)
        self.main_btn.clicked.connect(self._main_action)
        self.second_btn = button("")
        self.second_btn.clicked.connect(self._second_action)
        web = button("View on website")
        web.clicked.connect(lambda: webbrowser.open(data.get("page_url") or f"{STORE_URL}/project/{data['slug']}"))
        actions_col.addWidget(self.main_btn)
        actions_col.addWidget(self.second_btn)
        actions_col.addWidget(web)
        actions_col.addStretch()
        head.addLayout(actions_col)
        self.body.addLayout(head)

        box = QFrame()
        box.setObjectName("panel")
        b = QVBoxLayout(box)
        b.setContentsMargins(16, 14, 16, 14)
        if res:
            f = res["file"]
            what = "Jace Store installs it for you" if f["action"] == "install" else "Downloads it, then opens it so you can finish installing"
            b.addWidget(label(f"For your {detect().describe()}", h2=True))
            self.file_info = label("", muted=True, wrap=True)
            b.addWidget(self.file_info)
            options = [f, *res.get("alternatives", [])]
            self.file_combo = QComboBox()
            for o in options:
                self.file_combo.addItem(f"{o.get('label') or o['filename']}  ({o['format']}{', ' + fmt_bytes(o.get('size')) if o.get('size') else ''})", o)
            self.file_combo.currentIndexChanged.connect(self._file_changed)
            if len(options) > 1:
                b.addWidget(self.file_combo)
            self._file_changed()
            b.addWidget(label(f"Version {res['version']['version_number']} · {what}.", muted=True, wrap=True))
        else:
            b.addWidget(label("There's no download of this for your computer.", h2=True))
            others = sorted({fl["platform"] for v in data.get("versions", []) for fl in v.get("files", [])})
            if others:
                b.addWidget(label("Available for: " + ", ".join(others), muted=True))
        self.body.addWidget(box)

        if data.get("gallery"):
            strip = QHBoxLayout()
            for url in data["gallery"][:6]:
                im = QLabel()
                im.setFixedSize(160, 160)
                images.load_into(im, url, data["title"], 160)
                strip.addWidget(im)
            strip.addStretch()
            self.body.addLayout(strip)

        desc = QTextBrowser()
        desc.setOpenExternalLinks(True)
        desc.setMarkdown(data.get("description") or "_No description yet._")
        desc.setMinimumHeight(260)
        self.body.addWidget(desc, 1)

        if data.get("versions"):
            self.body.addWidget(label("Versions", h2=True))
            for v in data["versions"][:8]:
                plats = ", ".join(sorted({fl["platform"] for fl in v.get("files", [])}))
                self.body.addWidget(label(f"{v['name']}  ·  {v['version_number']}  ·  {v['channel']}  ·  {v['published_at'][:10]}  ·  {plats}", muted=True))
        self.refresh()

    def _file_changed(self):
        o = self.file_combo.currentData()
        size = fmt_bytes(o.get("size"))
        self.file_info.setText(f"{o.get('label') or o['filename']} · {o['format']} · {o['arch']}{' · ' + size if size else ''}")

    def record(self):
        if not self.data:
            return None
        return installed.get("jacestore", self.data["id"])

    def refresh(self):
        if not self.data or not hasattr(self, "main_btn"):
            return
        rec = self.record()
        key = f"jacestore:{self.data['id']}"
        self.second_btn.setVisible(False)
        if self.win.jobs.busy(key):
            self.main_btn.setText("Working…")
            self.main_btn.setEnabled(False)
            return
        self.main_btn.setEnabled(bool(self.res))
        if rec and self.res and rec.get("version_id") != self.res["version"]["id"]:
            self.main_btn.setText(f"Update to {self.res['version']['version_number']}")
        elif rec and rec.get("launch"):
            self.main_btn.setText("Open")
            self.main_btn.setEnabled(True)
        elif rec:
            self.main_btn.setText("Install again" if rec.get("kind") == "opened" else "Reinstall")
        else:
            self.main_btn.setText("Install" if not self.res or self.res["file"]["action"] == "install" else "Download")
        if rec:
            self.second_btn.setVisible(True)
            can = installer.can_uninstall(rec)
            self.second_btn.setText("Uninstall" if can else "Remove from list")
            self.second_btn.setToolTip("" if can else "Jace Store didn't install this itself; uninstall it in your system settings.")

    def _main_action(self):
        rec = self.record()
        if rec and rec.get("launch") and self.res and rec.get("version_id") == self.res["version"]["id"]:
            if not installer.launch(rec):
                QMessageBox.information(self, APP_NAME, "Open it from your app menu.")
            return
        o = self.file_combo.currentData() if self.res else None
        self.win.install_project(self.data["slug"], self.data["title"], self.data["id"],
                                 file_id=o and o["id"], updating=bool(rec), after=self.refresh)
        self.refresh()

    def _second_action(self):
        rec = self.record()
        if not rec:
            return
        if installer.can_uninstall(rec):
            self.win.uninstall(rec, after=self.refresh)
        else:
            installed.remove("jacestore", rec["id"])
        self.refresh()


class InstalledPage(Page):
    def shown(self):
        clear(self.body)
        self.body.addWidget(label("Installed", h1=True))
        self.body.addWidget(label("Apps you installed with Jace Store.", muted=True))
        recs = sorted(installed.load().values(), key=lambda r: (r.get("title") or "").lower())
        if not recs:
            self.body.addWidget(label("Nothing yet. Find something on Discover or Search.", muted=True))
        for r in recs:
            self.body.addWidget(self._row(r))
        self.body.addStretch()

    def _row(self, r):
        f = QFrame()
        f.setObjectName("card")
        lay = QHBoxLayout(f)
        lay.setContentsMargins(12, 10, 12, 10)
        icon = QLabel()
        icon.setFixedSize(40, 40)
        images.load_into(icon, r.get("icon_url"), r.get("title", "?"), 40)
        lay.addWidget(icon)
        col = QVBoxLayout()
        t = label(r.get("title") or r.get("id"))
        t.setStyleSheet("font-weight:700")
        col.addWidget(t)
        src = "Jace Store" if r["source"] == "jacestore" else (sources.by_id(r["source"]).name if sources.by_id(r["source"]) else r["source"])
        how = {"opened": "downloaded and opened", "package": "system package", "appimage": "AppImage", "flatpak": "Flatpak",
               "folder": "app folder", "msi": "Windows Installer", "mac_app": "app", "pkg": "macOS package"}.get(r.get("kind"), "")
        col.addWidget(label(" · ".join(x for x in (src, r.get("version_number"), how,
                                                     "finishing in a terminal" if r.get("pending") else "") if x), muted=True))
        lay.addLayout(col, 1)
        if r["source"] == "jacestore":
            page = button("Details")
            page.clicked.connect(lambda: self.win.open_project(r["slug"]))
            lay.addWidget(page)
        if r.get("launch"):
            o = button("Open", primary=True)
            o.clicked.connect(lambda: installer.launch(r) or QMessageBox.information(self, APP_NAME, "Open it from your app menu."))
            lay.addWidget(o)
        rm = button("Uninstall" if r["source"] != "jacestore" or installer.can_uninstall(r) else "Remove from list", danger=True)
        rm.clicked.connect(lambda: self._remove(r))
        lay.addWidget(rm)
        return f

    def _remove(self, r):
        if r["source"] == "jacestore" and not installer.can_uninstall(r):
            installed.remove(r["source"], r["id"])
        else:
            if QMessageBox.question(self, APP_NAME, f"Uninstall {r.get('title')}?") != QMessageBox.Yes:
                return
            self.win.uninstall(r, after=self.shown)
        self.shown()


class UpdatesPage(Page):
    def shown(self):
        clear(self.body)
        self.body.addWidget(label("Updates", h1=True))
        self.status = label("Checking Jace Store for updates…", muted=True)
        self.body.addWidget(self.status)
        self.list = QVBoxLayout()
        self.body.addLayout(self.list)
        self.body.addStretch()
        recs = installed.store_installed()
        if not recs:
            self.status.setText("Nothing installed from Jace Store yet.")
            return
        run_async(lambda ctx: store.updates([{"project_id": r["project_id"], "version_id": r["version_id"]} for r in recs]),
                  self._show, lambda e: self.status.setText(f"Couldn't check for updates: {e}"))

    def _show(self, results):
        ups = [r for r in results.values() if r.get("update_available") and r.get("file")]
        self.win.set_update_count(len(ups))
        if not ups:
            self.status.setText("Everything is up to date. Apps from other sources update through their own tools "
                                "(your system updater, flatpak update, winget upgrade, brew upgrade).")
            return
        self.status.setText(f"{len(ups)} update{'s' if len(ups) != 1 else ''} available")
        allb = button("Update all", primary=True)
        allb.setMaximumWidth(140)
        allb.clicked.connect(lambda: [self._update(u) for u in ups])
        self.list.addWidget(allb)
        for u in ups:
            f = QFrame()
            f.setObjectName("card")
            lay = QHBoxLayout(f)
            lay.setContentsMargins(12, 10, 12, 10)
            rec = installed.get("jacestore", u["project"]["id"]) or {}
            col = QVBoxLayout()
            t = label(u["project"]["title"])
            t.setStyleSheet("font-weight:700")
            col.addWidget(t)
            col.addWidget(label(f"{rec.get('version_number', '?')}  →  {u['latest_version']['version_number']}", muted=True))
            lay.addLayout(col, 1)
            b = button("Update", primary=True)
            b.clicked.connect(lambda _=False, u=u: self._update(u))
            lay.addWidget(b)
            self.list.addWidget(f)

    def _update(self, u):
        p = u["project"]
        self.win.install_project(p["slug"], p["title"], p["id"], updating=True, after=self.shown)


class SettingsPage(Page):
    def shown(self):
        clear(self.body)
        s = settings.load()
        sysinfo = detect()
        self.body.addWidget(label("Settings", h1=True))

        box = self._box("This computer")
        box.addWidget(label(sysinfo.describe(), sel=True))
        if sysinfo.os == "linux":
            box.addWidget(label(f"Package family: {sysinfo.family} · tools: {', '.join(sysinfo.has) or 'none found'}"
                                + (" · read-only system" if sysinfo.immutable else ""), muted=True, wrap=True))

        box = self._box("Software sources")
        box.addWidget(label("Jace Store always searches its own catalog. These are added for your computer:", muted=True, wrap=True))
        for src in sources.for_this_computer():
            ok = src.available()
            note = src.notice()
            box.addWidget(label(f"{'✓' if ok else '○'}  {src.name}: {src.blurb}" + (f". {note}" if note else ""), wrap=True))

        box = self._box("Jace Store catalog")
        beta = QComboBox()
        beta.addItem("Stable releases only", "release")
        beta.addItem("Include beta versions", "beta")
        beta.setCurrentIndex(0 if s.get("channel") == "release" else 1)
        beta.currentIndexChanged.connect(lambda: settings.save(channel=beta.currentData()))
        box.addWidget(beta)
        allp = QComboBox()
        allp.addItem("Show only apps for my computer", False)
        allp.addItem("Show apps for every platform", True)
        allp.setCurrentIndex(1 if s.get("all_platforms") else 0)
        allp.currentIndexChanged.connect(lambda: settings.save(all_platforms=allp.currentData()))
        box.addWidget(allp)

        box = self._box(f"{APP_NAME} {APP_VERSION}")
        self.upd = label("", muted=True, wrap=True)
        box.addWidget(self.upd)
        row = QHBoxLayout()
        chk = button("Check for updates")
        chk.clicked.connect(self._check)
        site = button("Open the website")
        site.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(STORE_URL)))
        row.addWidget(chk)
        row.addWidget(site)
        row.addStretch()
        box.addLayout(row)
        if selfinstall.frozen():
            rm = button("Remove Jace Store from this computer", danger=True)
            rm.clicked.connect(self.win.uninstall_self)
            box.addWidget(rm)
        self.body.addStretch()

    def _box(self, title):
        f = QFrame()
        f.setObjectName("panel")
        lay = QVBoxLayout(f)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.addWidget(label(title, h2=True))
        self.body.addWidget(f)
        return lay

    def _check(self):
        self.upd.setText("Checking…")
        run_async(lambda ctx: updater.check(), self._checked, lambda e: self.upd.setText(f"Couldn't check: {e}"))

    def _checked(self, info):
        if not info:
            self.upd.setText("You have the latest version.")
            return
        self.upd.setText(f"Version {info['version']} is available.")
        self.win.offer_self_update(info)


# --- window --------------------------------------------------------------------------------------------

class MainWindow(QMainWindow):
    NAV = ["Discover", "Search", "Installed", "Updates", "Settings"]

    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.setWindowIcon(QIcon(str(asset("icon.png"))))
        self.resize(1180, 780)
        self.history = []

        root = QWidget()
        outer = QVBoxLayout(root)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)
        self.banner = QFrame()
        self.banner.setObjectName("panel")
        bl = QHBoxLayout(self.banner)
        bl.setContentsMargins(14, 8, 14, 8)
        self.banner_text = label("")
        self.banner_btn = button("Update now", primary=True)
        bl.addWidget(self.banner_text, 1)
        bl.addWidget(self.banner_btn)
        self.banner.hide()
        outer.addWidget(self.banner)

        mid = QHBoxLayout()
        mid.setSpacing(0)
        side = QFrame()
        side.setObjectName("side")
        side.setFixedWidth(200)
        side.setStyleSheet("QFrame#side { background: #171a21; border-right: 1px solid #2a2f3a; }")
        sl = QVBoxLayout(side)
        sl.setContentsMargins(0, 0, 0, 0)
        sl.setSpacing(0)
        brand = QHBoxLayout()
        brand.setContentsMargins(18, 18, 12, 8)
        logo = QLabel()
        logo.setPixmap(QIcon(str(asset("icon.png"))).pixmap(28, 28))
        name = label(APP_NAME)
        name.setStyleSheet("font-weight:800; font-size:12pt")
        brand.addWidget(logo)
        brand.addWidget(name, 1)
        sl.addLayout(brand)
        self.nav = QListWidget()
        self.nav.setObjectName("nav")
        self.nav.setStyleSheet("QListWidget#nav { border-right: none; }")
        for n in self.NAV:
            self.nav.addItem(QListWidgetItem(n))
        sl.addWidget(self.nav, 1)
        mid.addWidget(side)

        self.jobs = JobPanel()
        self.stack = QStackedWidget()
        self.pages = {"Discover": DiscoverPage(self), "Search": SearchPage(self), "Installed": InstalledPage(self),
                      "Updates": UpdatesPage(self), "Settings": SettingsPage(self)}
        for p in self.pages.values():
            self.stack.addWidget(p)
        self.project = ProjectPage(self)
        self.stack.addWidget(self.project)
        right = QVBoxLayout()
        right.setSpacing(0)
        right.addWidget(self.stack, 1)
        right.addWidget(self.jobs)
        mid.addLayout(right, 1)
        outer.addLayout(mid, 1)
        self.setCentralWidget(root)

        self.nav.currentRowChanged.connect(self._nav_changed)
        self.nav.setCurrentRow(0)
        self.jobs.finished.connect(self._jobs_finished)
        QTimer.singleShot(1500, self._background_checks)

    # navigation
    def _nav_changed(self, row):
        if row < 0:
            return
        page = self.pages[self.NAV[row]]
        self.stack.setCurrentWidget(page)
        self.history.clear()
        page.shown()

    def show_page(self, name):
        self.nav.setCurrentRow(self.NAV.index(name))

    def open_project(self, slug: str):
        self.history.append(self.stack.currentWidget())
        self.project.load(slug)
        self.stack.setCurrentWidget(self.project)
        self.raise_()
        self.activateWindow()

    def back(self):
        w = self.history.pop() if self.history else self.pages["Discover"]
        self.stack.setCurrentWidget(w)
        if isinstance(w, (InstalledPage, UpdatesPage)):
            w.shown()

    def search(self, q: str):
        self.show_page("Search")
        self.pages["Search"].run(q)

    def handle_url(self, url: str):
        """jacestore://project/<slug> (from the website's "Open in Jace Store app" button)."""
        u = QUrl(url)
        if u.scheme() == "jacestore":
            parts = [p for p in (u.host() + u.path()).split("/") if p]
            if len(parts) >= 2 and parts[0] == "project":
                self.open_project(parts[1])
            elif parts and parts[0] == "search":
                self.search(u.query().removeprefix("q="))
        self.showNormal()
        self.raise_()
        self.activateWindow()

    # actions
    def install_project(self, slug, title, project_id, file_id=None, updating=False, after=None):
        ch = settings.load().get("channel", "release")
        self.jobs.add(f"jacestore:{project_id}", f"{'Updating' if updating else 'Installing'} {title}",
                      lambda log, progress: actions.install_project(slug, log, progress, ch, file_id),
                      lambda res, err: after and after())

    def install_package(self, pkg, after=None):
        self.jobs.add(f"{pkg.source}:{pkg.id}", f"Installing {pkg.name}",
                      lambda log, progress: actions.install_package(pkg, log), lambda res, err: after and after())

    def uninstall(self, rec, after=None):
        self.jobs.add(f"{rec['source']}:{rec['id']}", f"Removing {rec.get('title') or rec['id']}",
                      lambda log, progress: actions.uninstall(rec, log), lambda res, err: after and after())

    def _jobs_finished(self):
        w = self.stack.currentWidget()
        if isinstance(w, InstalledPage):
            w.shown()
        actions.cleanup_downloads()

    def set_update_count(self, n):
        self.nav.item(self.NAV.index("Updates")).setText(f"Updates  ({n})" if n else "Updates")

    def _background_checks(self):
        recs = installed.store_installed()
        if recs:
            run_async(lambda ctx: store.updates([{"project_id": r["project_id"], "version_id": r["version_id"]} for r in recs]),
                      lambda res: self.set_update_count(sum(1 for r in res.values() if r.get("update_available") and r.get("file"))))
        if selfinstall.frozen() and settings.load().get("check_self_updates"):
            run_async(lambda ctx: updater.check(), lambda info: info and self.offer_self_update(info))

    def offer_self_update(self, info):
        reason = updater.unsupported_reason()
        self.banner_text.setText(f"{APP_NAME} {info['version']} is available." + (f"  ({reason})" if reason else ""))
        self.banner_btn.setVisible(not reason)
        try:
            self.banner_btn.clicked.disconnect()
        except (RuntimeError, TypeError):
            pass
        self.banner_btn.clicked.connect(lambda: self._self_update(info))
        self.banner.show()

    def _self_update(self, info):
        self.banner_btn.setEnabled(False)
        self.banner_text.setText(f"Downloading {APP_NAME} {info['version']}…")

        def progress(done, total):
            if total:
                self.banner_text.setText(f"Downloading {APP_NAME} {info['version']}… {done * 100 // total}%")
        run_async(lambda ctx: updater.apply(info, ctx.log, ctx.progress), lambda _: self._quit_for_update(),
                  lambda e: (self.banner_text.setText(f"Update failed: {e}"), self.banner_btn.setEnabled(True)), progress)

    def _quit_for_update(self):
        from PySide6.QtWidgets import QApplication
        QApplication.quit()

    def uninstall_self(self):
        if QMessageBox.question(self, APP_NAME, "Remove Jace Store from this computer?\n\nApps you installed with it stay installed.") != QMessageBox.Yes:
            return
        selfinstall.uninstall()
        QMessageBox.information(self, APP_NAME, "Jace Store was removed. It will close now.")
        from PySide6.QtWidgets import QApplication
        QApplication.quit()

    def closeEvent(self, e):
        if self.jobs.current and QMessageBox.question(
                self, APP_NAME, "Something is still installing. Quit anyway?") != QMessageBox.Yes:
            e.ignore()
            return
        super().closeEvent(e)

