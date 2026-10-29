"""The Jace Store window: Discover, Search, project pages, Installed, Updates, Settings."""
import webbrowser

from PySide6.QtCore import QPoint, QRect, QSize, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices, QIcon, QPixmap
from PySide6.QtCore import QFileInfo
from PySide6.QtWidgets import (QButtonGroup, QCheckBox, QComboBox, QDialog, QFileDialog, QFileIconProvider, QFrame, QGridLayout, QHBoxLayout, QLabel, QLayout, QLineEdit, QMenu,
                               QListWidget, QListWidgetItem, QMainWindow, QMessageBox, QPlainTextEdit, QProgressBar,
                               QPushButton, QScrollArea, QStackedWidget, QTextBrowser, QVBoxLayout, QWidget)

from pathlib import Path

from jacestore import APP_NAME, APP_VERSION, STORE_URL, actions, cancel, installed, installer, library, selfinstall, settings, sources, store, updater
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
    b = QPushButton(text.replace("&", "&&"))     # "&" marks a keyboard shortcut in Qt
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

CANCELLED = object()

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
        self.stop = button("Cancel", danger=True)
        self.stop.clicked.connect(self.cancel_current)
        self.stop_all = button("Cancel all")
        self.stop_all.clicked.connect(self.cancel_all)
        self.token = None
        row.addWidget(self.title, 1)
        row.addWidget(self.more)
        row.addWidget(self.bar)
        row.addWidget(self.stop)
        row.addWidget(self.stop_all)
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
        self.stop.setVisible(bool(self.current))
        self.stop_all.setVisible(bool(self.queue))

    def cancel_current(self):
        if not self.current or not self.token:
            return
        self.stop.setEnabled(False)
        if self.token.cancel():
            self.title.setText(f"Cancelling {self.current[1].lower()}…")
        else:
            self.title.setText("Can't stop the system installer midway; it stops right after this step…")

    def cancel_all(self):
        dropped = self.queue
        self.queue = []
        for key, title, fn, on_done in dropped:
            self.log.appendPlainText(f"Cancelled before starting: {title}")
            if on_done:
                on_done(None, "cancelled")
        self.cancel_current()
        self._update_more()

    def _next(self):
        if not self.queue:
            self.current = None
            self.token = None
            self._update_more()
            QTimer.singleShot(4000, lambda: self.hide() if not self.current else None)
            self.finished.emit()
            return
        self.current = self.queue.pop(0)
        key, title, fn, on_done = self.current
        self.token = cancel.Token()
        self.stop.setEnabled(True)
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
            if result is CANCELLED:
                self.bar.setRange(0, 1)
                self.bar.setValue(0)
                self.title.setText(f"Cancelled: {title}")
                self.log.appendPlainText("Cancelled")
                if on_done:
                    on_done(None, "cancelled")
                self._next()
                return
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

        token = self.token

        def work(ctx):
            cancel.set_current(token)
            try:
                return fn(ctx.log, ctx.progress)
            except cancel.Cancelled:
                return CANCELLED
            finally:
                cancel.set_current(None)

        run_async(work, done, failed, progress, self.log.appendPlainText)


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


class FlowLayout(QLayout):
    """Lays widgets out left to right, wrapping onto new lines (source chips, A-Z index)."""

    def __init__(self, spacing=6):
        super().__init__()
        self.items = []
        self.setSpacing(spacing)
        self.setContentsMargins(0, 0, 0, 0)

    def addItem(self, item):
        self.items.append(item)

    def count(self):
        return len(self.items)

    def itemAt(self, i):
        return self.items[i] if 0 <= i < len(self.items) else None

    def takeAt(self, i):
        return self.items.pop(i) if 0 <= i < len(self.items) else None

    def expandingDirections(self):
        return Qt.Orientations(0)

    def hasHeightForWidth(self):
        return True

    def heightForWidth(self, w):
        return self._do(QRect(0, 0, w, 0), True)

    def setGeometry(self, rect):
        super().setGeometry(rect)
        self._do(rect, False)

    def sizeHint(self):
        return self.minimumSize()

    def minimumSize(self):
        size = QSize()
        for it in self.items:
            size = size.expandedTo(it.minimumSize())
        return size

    def _do(self, rect, test):
        x, y, line = rect.x(), rect.y(), 0
        sp = self.spacing()
        for it in self.items:
            if it.widget() and not it.widget().isVisible() and not test:
                pass
            hint = it.sizeHint()
            nx = x + hint.width() + sp
            if nx - sp > rect.right() and line > 0:
                x, y = rect.x(), y + line + sp
                nx, line = x + hint.width() + sp, 0
            if not test:
                it.setGeometry(QRect(QPoint(x, y), hint))
            x, line = nx, max(line, hint.height())
        return y + line - rect.y()


class SearchPage(Page):
    """Search, or browse each source's catalog (categories, an A-Z index, pages) when nothing's typed."""
    JACE_CATS = [("", "Everything"), ("app", "Apps"), ("game", "Games")]

    def __init__(self, win):
        super().__init__(win)
        row = QHBoxLayout()
        self.q = QLineEdit()
        self.q.setPlaceholderText("Search, or browse below…")
        self.q.setClearButtonEnabled(True)
        self.q.returnPressed.connect(lambda: self.run())
        go = button("Search", primary=True)
        go.clicked.connect(lambda: self.run())
        row.addWidget(self.q, 1)
        row.addWidget(go)
        self.body.addLayout(row)
        self.chip_box = QWidget()
        self.chips = FlowLayout()
        self.chip_box.setLayout(self.chips)
        self.body.addWidget(self.chip_box)
        self.index_box = QWidget()
        self.index = FlowLayout(4)
        self.index_box.setLayout(self.index)
        self.body.addWidget(self.index_box)
        self.status = label("", muted=True, wrap=True)
        self.body.addWidget(self.status)
        self.grid = CardGrid()
        self.grid.open_project.connect(win.open_project)
        self.body.addWidget(self.grid)
        self.rows = QVBoxLayout()
        self.rows.setSpacing(8)
        self.body.addLayout(self.rows)
        self.more = button("Load more")
        self.more.clicked.connect(self._load_more)
        self.more.hide()
        self.body.addWidget(self.more, 0, Qt.AlignHCenter)
        self.body.addStretch()
        self.gen = 0
        self.src = None              # None = Jace Store
        self.category = None
        self.letter = None
        self.page = 1
        self.hits = []
        self.build_chips()

    def build_chips(self):
        clear(self.chips)
        self.srcs = [None, *sources.for_this_computer()]
        self.group = QButtonGroup(self)
        for i, s in enumerate(self.srcs):
            b = button("Jace Store" if s is None else ("🌐 Web" if s.id == "web" else s.name), chip=True)
            b.setChecked(s is self.src or (s is None and self.src is None))
            self.group.addButton(b, i)
            self.chips.addWidget(b)
        self.group.idClicked.connect(self._pick_source)

    def shown(self):
        if not self.hits and not self.q.text():
            self.run()

    def _pick_source(self, i):
        self.src = self.srcs[i]
        self.category, self.letter = None, None
        self.run()

    def _build_index(self):
        clear(self.index)
        src = self.src
        if self.q.text().strip() or (src is not None and src.id == "web"):
            self.index_box.hide()
            return
        cats = self.JACE_CATS if src is None else src.categories()
        if cats:
            if self.category is None:
                self.category = cats[0][0]
            for cid, lab in cats:
                b = button(lab, chip=True)
                b.setChecked(cid == self.category)
                b.clicked.connect(lambda _=False, c=cid: self._set(category=c))
                self.index.addWidget(b)
        if src is not None and src.letters:
            for L in ["All", *"ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"]:
                b = button(L, chip=True)
                b.setChecked((self.letter or "All") == L)
                b.setMinimumWidth(34)
                b.clicked.connect(lambda _=False, x=L: self._set(letter=None if x == "All" else x))
                self.index.addWidget(b)
        self.index_box.setVisible(self.index.count() > 0)

    def _set(self, category=..., letter=...):
        if category is not ...:
            self.category = category
        if letter is not ...:
            self.letter = letter
        self.run()

    def run(self, q: str | None = None):
        if q is not None:
            self.q.setText(q)
            self.src = None
            for b in self.group.buttons():
                b.setChecked(self.group.id(b) == 0)
        self.gen += 1
        self.page = 1
        self.hits = []
        clear(self.rows)
        self.grid.set_hits([], "")
        self.more.hide()
        self._build_index()
        self._fetch()

    def _load_more(self):
        self.page += 1
        self.more.hide()
        self._fetch()

    def _fetch(self):
        gen, page, src = self.gen, self.page, self.src
        q = self.q.text().strip()
        cat, letter = self.category, self.letter
        if src is None:
            self.status.setText("Loading Jace Store…")
            all_p = settings.load().get("all_platforms")
            run_async(lambda ctx: store.search(q, type_=cat or None, all_platforms=all_p, page=page, limit=48),
                      lambda d: gen == self.gen and self._store(d, q), lambda e: gen == self.gen and self.status.setText(f"Couldn't load Jace Store: {e}"))
            return
        if not src.available() and src.id != "web":
            self.status.setText(src.notice() or f"{src.name} isn't available on this computer.")
            return
        if not q and src.id == "web":
            self.status.setText("Type what you're looking for to search the web, e.g. \"obs studio download\".")
            return
        if not q and not src.categories() and not src.letters:
            self.status.setText(f"{src.name} can't be browsed. Type what you're looking for to search it.")
            return
        self.status.setText(f"Searching {src.name}…" if q else f"Loading {src.name}…")

        def work(ctx):
            return (src.search(q), False) if q else src.browse(page, cat or None, letter)
        run_async(work, lambda r: gen == self.gen and self._pkgs(src, *r, q),
                  lambda e: gen == self.gen and self.status.setText(f"{src.name} failed: {e}"))

    def _store(self, data, q):
        hits = data.get("hits", [])
        self.hits += hits
        total = data.get("total", len(self.hits))
        self.status.setText(f"{total} on Jace Store" + (f" for “{q}”" if q else "") + ("" if total else ". Try another source above."))
        self.grid.set_hits(self.hits, "")
        self.more.setVisible(data.get("page", 1) < data.get("pages", 1))

    def _pkgs(self, src, pkgs, more, q):
        self.hits += pkgs
        note = src.notice()
        what = f"for “{q}”" if q else ""
        self.status.setText(f"{len(self.hits)}{'+' if more else ''} from {src.name} {what}.{('  ' + note) if note else ''}".replace(" .", "."))
        for p in pkgs:
            self.rows.addWidget(WebRow(p, self.win) if src.id == "web" else PackageRow(p, self.win))
        self.more.setVisible(bool(more))


class WebRow(QFrame):
    """A web search result: open it, download-and-install it (direct file links), or add it to My apps."""

    def __init__(self, pkg: sources.Package, win: "MainWindow"):
        super().__init__()
        self.setObjectName("card")
        lay = QHBoxLayout(self)
        lay.setContentsMargins(12, 10, 12, 10)
        col = QVBoxLayout()
        t = label(pkg.name)
        t.setStyleSheet("font-weight:700")
        col.addWidget(t)
        col.addWidget(label(pkg.extra.get("host", ""), muted=True))
        if pkg.summary:
            col.addWidget(label(pkg.summary, muted=True, wrap=True))
        lay.addLayout(col, 1)
        o = button("Open")
        o.clicked.connect(lambda: webbrowser.open(pkg.id))
        lay.addWidget(o)
        add = button("Add to My apps")
        add.setToolTip("Keep this website in My apps (only on this computer)")
        add.clicked.connect(lambda: win.add_to_library(name=pkg.name, kind="url", target=pkg.id, website=pkg.id))
        lay.addWidget(add)
        if pkg.extra.get("direct"):
            d = button("Download & install", primary=True)
            d.setToolTip("This link is the app's file itself. Only use files from websites you trust.")
            d.clicked.connect(lambda: win.install_package(pkg))
            lay.addWidget(d)


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


class FlatpakPage(Page):
    """An app opened from flathub.org (its Install button / appstream:// link) or a .flatpak file."""

    def load(self, target):
        self.target = target
        self.info = {}
        clear(self.body)
        self._back()
        self.body.addWidget(label("Loading…", muted=True))
        self.body.addStretch()
        if target.kind == "flathub":
            run_async(lambda ctx: sources.FLATHUB.app_info(target.app_id), self._show, lambda e: self._show({}))
        else:
            self._show({})

    def _back(self):
        back = button("← Back")
        back.setMaximumWidth(100)
        back.clicked.connect(self.win.back)
        self.body.addWidget(back)

    def _pkg(self) -> sources.Package:
        t, d = self.target, self.info
        if t.kind == "flathub":
            return sources.Package("flathub", t.app_id, d.get("name") or t.app_id, d.get("summary") or "", "",
                                   d.get("icon"), f"https://flathub.org/apps/{t.app_id}")
        return sources.Package("flatpak", t.app_id or (t.path.stem if t.path else "app"), t.title or t.app_id, "", "", None, None,
                               {"path": str(t.path), "bundle": t.kind == "bundle"})

    def _show(self, info):
        self.info = info or {}
        clear(self.body)
        self._back()
        t, d = self.target, self.info
        pkg = self._pkg()
        head = QHBoxLayout()
        head.setSpacing(18)
        icon = QLabel()
        icon.setFixedSize(96, 96)
        images.load_into(icon, d.get("icon"), pkg.name, 96)
        head.addWidget(icon, 0, Qt.AlignTop)
        col = QVBoxLayout()
        col.addWidget(label(pkg.name, h1=True))
        src = "Flathub" if t.kind == "flathub" else ("Flatpak bundle file" if t.kind == "bundle" else f"Flatpak from {t.remote_url}")
        col.addWidget(label(" · ".join(x for x in (d.get("developer_name"), src, d.get("project_license")) if x), muted=True))
        if pkg.summary:
            col.addWidget(label(pkg.summary, wrap=True))
        head.addLayout(col, 1)
        acts = QVBoxLayout()
        self.main_btn = button("", primary=True)
        self.main_btn.setMinimumWidth(170)
        self.main_btn.clicked.connect(self._main)
        self.remove_btn = button("Uninstall", danger=True)
        self.remove_btn.clicked.connect(self._remove)
        acts.addWidget(self.main_btn)
        acts.addWidget(self.remove_btn)
        if t.kind == "flathub":
            web = button("View on Flathub")
            web.clicked.connect(lambda: webbrowser.open(f"https://flathub.org/apps/{t.app_id}"))
            acts.addWidget(web)
        acts.addStretch()
        head.addLayout(acts)
        self.body.addLayout(head)
        if not sources.FLATHUB.available():
            self.body.addWidget(label("Flatpak isn't installed on this computer. Install it from your distro's packages first.", wrap=True))
        if t.kind == "ref":
            self.body.addWidget(label("This app comes from a Flatpak remote other than Flathub. Only install it if you trust that website.", wrap=True))
        shots = [s for s in d.get("screenshots") or [] if s.get("sizes")]
        if shots:
            strip = QHBoxLayout()
            for s in shots[:5]:
                sizes = sorted(s["sizes"], key=lambda z: int(z.get("width") or 0))
                small = next((z for z in sizes if int(z.get("width") or 0) >= 400), sizes[-1])
                im = QLabel()
                im.setFixedSize(160, 160)
                images.load_into(im, small.get("src"), pkg.name, 160)
                strip.addWidget(im)
            strip.addStretch()
            self.body.addLayout(strip)
        desc = QTextBrowser()
        desc.setOpenExternalLinks(True)
        desc.setHtml(d.get("description") or "<i>No description.</i>")
        desc.setMinimumHeight(240)
        self.body.addWidget(desc, 1)
        self.refresh()

    def _source_id(self):
        return "flathub" if self.target.kind == "flathub" else "flatpak"

    def record(self):
        return installed.get(self._source_id(), self._pkg().id)

    def refresh(self):
        if not hasattr(self, "main_btn"):
            return
        rec = self.record()
        key = f"{self._source_id()}:{self._pkg().id}"
        busy = self.win.jobs.busy(key)
        self.main_btn.setEnabled(not busy and sources.FLATHUB.available())
        self.main_btn.setText("Working…" if busy else ("Open" if rec else "Install"))
        self.remove_btn.setVisible(bool(rec) and not busy)

    def _main(self):
        rec = self.record()
        if rec:
            installer.launch(rec)
            return
        self.win.install_package(self._pkg(), after=self.refresh)
        self.refresh()

    def _remove(self):
        rec = self.record()
        if rec and QMessageBox.question(self, APP_NAME, f"Uninstall {rec.get('title')}?") == QMessageBox.Yes:
            self.win.uninstall(rec, after=self.refresh)
            self.refresh()


def app_pixmap(app: dict, size: int) -> QPixmap:
    """A library app's logo: the user's own picture, the system icon, or a letter."""
    icon = app.get("icon")
    if icon and Path(icon).exists():
        pm = QIcon(icon).pixmap(size * 2, size * 2) if icon.endswith(".svg") else QPixmap(icon)
        if not pm.isNull():
            return images.rounded(pm, size, 0.18)
    if app.get("kind") in ("app", "shortcut", "exec") and Path(app.get("target", "")).exists():
        pm = QFileIconProvider().icon(QFileInfo(app["target"])).pixmap(size, size)
        if not pm.isNull():
            return pm
    return images.letter_icon(app.get("name", "?"), size)


class AppDialog(QDialog):
    """Add or edit an app in My apps: name, what to start, a website, notes and your own logo."""

    def __init__(self, parent, app: dict | None = None, **prefill):
        super().__init__(parent)
        self.app = app or {}
        data = {**prefill, **self.app}
        self.setWindowTitle("Edit app" if app else "Add an app")
        self.setMinimumWidth(520)
        lay = QVBoxLayout(self)
        lay.setSpacing(8)
        self.logo_file = None
        top = QHBoxLayout()
        self.logo = QLabel()
        self.logo.setFixedSize(72, 72)
        self.logo.setPixmap(app_pixmap(data, 72) if data.get("name") else images.letter_icon("?", 72))
        top.addWidget(self.logo)
        pick = button("Choose a logo…")
        pick.clicked.connect(self._pick_logo)
        top.addWidget(pick)
        top.addStretch()
        lay.addLayout(top)
        self.name = QLineEdit(data.get("name", ""))
        self.kind = QComboBox()
        for k, lab in (("exec", "A program on this computer"), ("url", "A website"), ("desktop", "A Linux .desktop entry"),
                       ("app", "A macOS app (.app)"), ("shortcut", "A Windows shortcut (.lnk)")):
            if k in ("desktop",) and detect().os != "linux" or k == "app" and detect().os != "macos" or k == "shortcut" and detect().os != "windows":
                continue
            self.kind.addItem(lab, k)
        i = self.kind.findData(data.get("kind", "exec"))
        self.kind.setCurrentIndex(max(0, i))
        self.target = QLineEdit(data.get("target", ""))
        self.target.setPlaceholderText("/path/to/program  or  https://…")
        browse = button("Browse…")
        browse.clicked.connect(self._pick_target)
        trow = QHBoxLayout()
        trow.addWidget(self.target, 1)
        trow.addWidget(browse)
        self.args = QLineEdit(data.get("args", ""))
        self.args.setPlaceholderText("Optional, e.g. --fullscreen")
        self.website = QLineEdit(data.get("website", ""))
        self.notes = QPlainTextEdit(data.get("notes", ""))
        self.notes.setMaximumHeight(80)
        for lab, w in (("Name", self.name), ("What is it?", self.kind)):
            lay.addWidget(label(lab, muted=True))
            lay.addWidget(w)
        lay.addWidget(label("What to start", muted=True))
        lay.addLayout(trow)
        for lab, w in (("Start it with (arguments)", self.args), ("Website", self.website), ("Notes", self.notes)):
            lay.addWidget(label(lab, muted=True))
            lay.addWidget(w)
        lay.addWidget(label("Only on this computer. Apps you add here are never uploaded or shown to anyone.", muted=True, wrap=True))
        row = QHBoxLayout()
        row.addStretch()
        cancel_b = button("Cancel")
        cancel_b.clicked.connect(self.reject)
        ok = button("Save", primary=True)
        ok.clicked.connect(self._save)
        row.addWidget(cancel_b)
        row.addWidget(ok)
        lay.addLayout(row)

    def _pick_logo(self):
        f, _ = QFileDialog.getOpenFileName(self, "Choose a logo", str(Path.home() / "Pictures"), "Pictures (*.png *.jpg *.jpeg *.webp *.svg *.ico *.bmp)")
        if f:
            self.logo_file = f
            self.logo.setPixmap(app_pixmap({"icon": f, "name": self.name.text()}, 72))

    def _pick_target(self):
        if self.kind.currentData() == "url":
            return
        if detect().os == "macos" and self.kind.currentData() == "app":
            f = QFileDialog.getExistingDirectory(self, "Choose the app", "/Applications")
        else:
            f, _ = QFileDialog.getOpenFileName(self, "Choose the program", str(Path.home()))
        if f:
            self.target.setText(f)
            if not self.name.text().strip():
                self.name.setText(Path(f).stem.replace("-", " ").replace("_", " ").title())

    def _save(self):
        name, target, kind = self.name.text().strip(), self.target.text().strip(), self.kind.currentData()
        if not name or not target:
            QMessageBox.warning(self, APP_NAME, "Give it a name and say what to start.")
            return
        if kind == "url" and not target.startswith(("http://", "https://")):
            target = "https://" + target
        if kind != "url" and not Path(target).exists():
            QMessageBox.warning(self, APP_NAME, f"{target} doesn't exist.")
            return
        fields = {"name": name, "kind": kind, "target": target, "args": self.args.text().strip(),
                  "website": self.website.text().strip(), "notes": self.notes.toPlainText().strip()}
        if self.app.get("id"):
            library.update(self.app["id"], **fields)
            app_id = self.app["id"]
        else:
            app_id = library.add(fields["name"], target, kind, None, fields["website"], fields["notes"], "manual", None, fields["args"])["id"]
        if self.logo_file:
            library.set_logo(app_id, self.logo_file)
        self.accept()


class AppTile(QFrame):
    def __init__(self, app: dict, page: "MyAppsPage"):
        super().__init__()
        self.setObjectName("card")
        self.app, self.page = app, page
        self.setCursor(Qt.PointingHandCursor)
        self.setFixedSize(150, 150)
        self.setToolTip((app.get("notes") or app["name"]) + "\n\nClick to open · right-click for more")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(10, 14, 10, 10)
        ic = QLabel()
        ic.setFixedSize(64, 64)
        ic.setPixmap(app_pixmap(app, 64))
        lay.addWidget(ic, 0, Qt.AlignHCenter)
        n = label(app["name"])
        n.setAlignment(Qt.AlignHCenter | Qt.AlignTop)
        n.setWordWrap(True)
        n.setStyleSheet("font-weight:600")
        lay.addWidget(n)
        lay.addStretch()

    def mouseReleaseEvent(self, e):
        if e.button() == Qt.LeftButton:
            self.page.open_app(self.app)

    def contextMenuEvent(self, e):
        m = QMenu(self)
        m.addAction("Open", lambda: self.page.open_app(self.app))
        m.addAction("Edit…", lambda: self.page.edit(self.app))
        m.addAction("Change logo…", lambda: self.page.change_logo(self.app))
        if self.app.get("website"):
            m.addAction("Website", lambda: webbrowser.open(self.app["website"]))
        m.addSeparator()
        m.addAction("Remove from My apps", lambda: self.page.remove(self.app))
        m.exec(e.globalPos())


class MyAppsPage(Page):
    """Your own app library: anything, from anywhere, with your own logos. Private to this computer."""

    def __init__(self, win):
        super().__init__(win)
        self.body.addWidget(label("My apps", h1=True))
        self.body.addWidget(label("Your own library: programs from anywhere, websites, games, with your own logos. "
                                  "It stays on this computer and is never uploaded or shown to anyone.", muted=True, wrap=True))
        bar = QHBoxLayout()
        self.filter = QLineEdit()
        self.filter.setPlaceholderText("Filter…")
        self.filter.setClearButtonEnabled(True)
        self.filter.textChanged.connect(self._render)
        add = button("Add an app", primary=True)
        add.clicked.connect(lambda: self.win.add_to_library())
        scan = button("Add all apps on this computer")
        scan.clicked.connect(self.scan)
        bar.addWidget(self.filter, 1)
        bar.addWidget(add)
        bar.addWidget(scan)
        self.body.addLayout(bar)
        self.status = label("", muted=True)
        self.body.addWidget(self.status)
        self.tiles = QWidget()
        self.flow = FlowLayout(10)
        self.tiles.setLayout(self.flow)
        self.body.addWidget(self.tiles)
        self.body.addStretch()

    def shown(self):
        self._render()

    def _render(self):
        clear(self.flow)
        apps = sorted(library.load(), key=lambda a: a["name"].lower())
        f = self.filter.text().strip().lower()
        shown = [a for a in apps if not f or f in a["name"].lower() or f in (a.get("notes") or "").lower()]
        self.status.setText(f"{len(apps)} apps" + (f", {len(shown)} shown" if f else "") if apps
                            else "Nothing here yet: add an app, or let Jace Store add every app on this computer.")
        for a in shown:
            self.flow.addWidget(AppTile(a, self))

    def open_app(self, app):
        try:
            library.launch(app)
        except Exception as e:  # noqa: BLE001 - shown to the user
            QMessageBox.warning(self, APP_NAME, f"Couldn't open {app['name']}: {e}")

    def edit(self, app):
        if AppDialog(self, app).exec():
            self._render()

    def change_logo(self, app):
        f, _ = QFileDialog.getOpenFileName(self, "Choose a logo", str(Path.home() / "Pictures"), "Pictures (*.png *.jpg *.jpeg *.webp *.svg *.ico *.bmp)")
        if f:
            library.set_logo(app["id"], f)
            self._render()

    def remove(self, app):
        if QMessageBox.question(self, APP_NAME, f"Remove {app['name']} from My apps?\n\nThis doesn't uninstall it.") == QMessageBox.Yes:
            library.remove(app["id"])
            self._render()

    def scan(self):
        self.status.setText("Looking for apps on this computer…")

        def done(found):
            n = library.import_system(found)
            self.status.setText(f"Added {n} app{'s' if n != 1 else ''}." if n else "Every app on this computer is already here.")
            self._render()
        run_async(lambda ctx: library.scan_system(), done, lambda e: self.status.setText(f"Couldn't look for apps: {e}"))


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


class CustomSourceDialog(QDialog):
    """Add (or edit) a package manager Jace Store doesn't know: its commands, with {query} and {id}."""
    FORMATS = [("regex", "Each line: the package's name, then a description"), ("lines", "Each line: just a package name"),
               ("custom", "My own pattern (a regular expression)")]

    def __init__(self, parent, spec: dict | None):
        super().__init__(parent)
        self.old = spec
        spec = spec or {}
        self.setWindowTitle("Edit package manager" if self.old else "Add a package manager")
        self.setMinimumWidth(620)
        lay = QVBoxLayout(self)
        lay.setSpacing(6)
        lay.addWidget(label("Tell Jace Store how to use it from a terminal. Write {query} where the search words go "
                            "and {id} where the package name goes.", muted=True, wrap=True))
        self.f = {}
        for key, lab, ph in (("name", "Name", "e.g. Pacstall"), ("program", "Program (to check it's installed)", "e.g. pacstall"),
                             ("search", "Search command", "e.g. pacstall -S {query}"), ("install", "Install command", "e.g. pacstall -I {id}"),
                             ("uninstall", "Uninstall command (optional)", "e.g. pacstall -R {id}"),
                             ("browse", "List everything (optional, for the A-Z index)", "e.g. pacstall -L")):
            w = QLineEdit(spec.get(key, "") if isinstance(spec.get(key, ""), str) else " ".join(spec.get(key)))
            w.setPlaceholderText(ph)
            self.f[key] = w
            lay.addWidget(label(lab, muted=True))
            lay.addWidget(w)
        self.fmt = QComboBox()
        for k, lab in self.FORMATS:
            self.fmt.addItem(lab, k)
        cur = spec.get("parse", "regex")
        cur = "custom" if cur == "regex" and spec.get("regex") else cur
        self.fmt.setCurrentIndex(max(0, self.fmt.findData(cur)))
        self.regex = QLineEdit(spec.get("regex", ""))
        self.regex.setPlaceholderText(r"e.g. ^(?P<id>\S+)\s+(?P<version>\S+)\s+(?P<summary>.*)$   (groups: id, name, version, summary)")
        lay.addWidget(label("Search results look like", muted=True))
        lay.addWidget(self.fmt)
        lay.addWidget(self.regex)
        self.root = QCheckBox("Needs administrator (it asks for your password)")
        self.root.setChecked(bool(spec.get("root")))
        self.term = QCheckBox("Run install / uninstall in a terminal window (when it asks questions)")
        self.term.setChecked(bool(spec.get("terminal")))
        self.term.setVisible(detect().os == "linux")
        lay.addWidget(self.root)
        lay.addWidget(self.term)
        self.test = label("", muted=True, wrap=True)
        lay.addWidget(self.test)
        row = QHBoxLayout()
        tb = button("Test search")
        tb.clicked.connect(self._test)
        row.addWidget(tb)
        row.addStretch()
        cancel_b = button("Cancel")
        cancel_b.clicked.connect(self.reject)
        ok = button("Save", primary=True)
        ok.clicked.connect(self._save)
        row.addWidget(cancel_b)
        row.addWidget(ok)
        lay.addLayout(row)

    def _spec(self) -> dict | None:
        v = {k: w.text().strip() for k, w in self.f.items()}
        if not v["name"] or not v["install"]:
            QMessageBox.warning(self, APP_NAME, "It needs at least a name and an install command.")
            return None
        if "{id}" not in v["install"]:
            QMessageBox.warning(self, APP_NAME, "The install command needs {id} where the package name goes.")
            return None
        if v["search"] and "{query}" not in v["search"]:
            QMessageBox.warning(self, APP_NAME, "The search command needs {query} where the search words go.")
            return None
        fmt = self.fmt.currentData()
        spec = {**{k: x for k, x in v.items() if x}, "systems": [detect().os], "root": self.root.isChecked(),
                "terminal": self.term.isChecked() and detect().os == "linux", "parse": "lines" if fmt == "lines" else "regex"}
        if not spec.get("program"):
            spec["program"] = v["install"].split()[0]
        if fmt == "custom":
            import re as _re
            try:
                rx = _re.compile(self.regex.text().strip())
            except _re.error as e:
                QMessageBox.warning(self, APP_NAME, f"That pattern isn't valid: {e}")
                return None
            if "id" not in rx.groupindex:
                QMessageBox.warning(self, APP_NAME, "The pattern needs a (?P<id>…) group for the package name.")
                return None
            spec["regex"] = self.regex.text().strip()
        return spec

    def _test(self):
        spec = self._spec()
        if not spec:
            return
        src = sources.CommandSource({**spec, "id": "test"}, custom=True)
        if not src.available():
            self.test.setText(f"Can't find {spec['program']} on this computer.")
            return
        self.test.setText("Searching for “a”…")
        run_async(lambda ctx: src.search("a", 5), lambda r: self.test.setText(
            "Found: " + ", ".join(f"{p.id}" + (f" ({p.summary[:40]})" if p.summary else "") for p in r) if r else "No results; check the search command and format."),
            lambda e: self.test.setText(f"Search failed: {e}"))

    def _save(self):
        spec = self._spec()
        if not spec:
            return
        customs = [c for c in settings.load().get("custom_sources", []) if not self.old or c.get("name") != self.old.get("name")]
        if any(c.get("name", "").lower() == spec["name"].lower() for c in customs):
            QMessageBox.warning(self, APP_NAME, "You already have a package manager with that name.")
            return
        settings.save(custom_sources=[*customs, spec])
        self.accept()


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

        box = self._box("Package managers")
        box.addWidget(label("Jace Store always searches its own catalog. Tick the others you want in Search. "
                            "Ones that aren't installed on this computer are greyed out.", muted=True, wrap=True))
        off = set(s.get("disabled_sources", []))
        for src in sources.all_sources():
            row = QHBoxLayout()
            ok = src.available()
            cb = QCheckBox(f"{src.name}{'  (yours)' if getattr(src, 'custom', False) else ''}")
            cb.setChecked(src.id not in off)
            cb.setEnabled(ok or src.id == "flathub")
            if not ok and src.id != "flathub":
                cb.setStyleSheet("color: #8b93a3")
            cb.toggled.connect(lambda on, sid=src.id: self._toggle_source(sid, on))
            row.addWidget(cb)
            note = src.blurb + ("" if ok else f". {src.notice() or 'Not installed'}")
            row.addWidget(label(note, muted=True, wrap=True), 1)
            if getattr(src, "custom", False):
                e = button("Edit")
                e.clicked.connect(lambda _=False, sp=src.spec: self._edit_custom(sp))
                r = button("Remove", danger=True)
                r.clicked.connect(lambda _=False, sp=src.spec: self._remove_custom(sp))
                row.addWidget(e)
                row.addWidget(r)
            box.addLayout(row)
        add = button("Add your own package manager…")
        add.clicked.connect(lambda: self._edit_custom(None))
        box.addWidget(add, 0, Qt.AlignLeft)

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

        if sysinfo.os == "linux" and selfinstall.running_installed():
            box = self._box("Flathub links")
            fh = QComboBox()
            fh.addItem("Open Flathub \"Install\" links with Jace Store", True)
            fh.addItem("Let my software center open them", False)
            fh.setCurrentIndex(0 if s.get("flathub_links", True) else 1)
            fh.currentIndexChanged.connect(lambda: selfinstall.set_flatpak_handler(fh.currentData()))
            box.addWidget(fh)
            box.addWidget(label("Clicking Install on flathub.org downloads a .flatpakref file; with this on, opening it shows the app here.", muted=True, wrap=True))

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

    def _toggle_source(self, sid, on):
        off = set(settings.load().get("disabled_sources", []))
        off.discard(sid) if on else off.add(sid)
        settings.save(disabled_sources=sorted(off))
        self.win.pages["Search"].build_chips()

    def _edit_custom(self, spec):
        if CustomSourceDialog(self, spec).exec():
            self.win.pages["Search"].build_chips()
            self.shown()

    def _remove_custom(self, spec):
        if QMessageBox.question(self, APP_NAME, f"Remove {spec['name']}?") == QMessageBox.Yes:
            customs = [c for c in settings.load().get("custom_sources", []) if c.get("name") != spec["name"]]
            settings.save(custom_sources=customs)
            self.win.pages["Search"].build_chips()
            self.shown()

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
    NAV = ["Discover", "Search", "Installed", "My apps", "Updates", "Settings"]

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
        self.pages = {"Discover": DiscoverPage(self), "Search": SearchPage(self), "Installed": InstalledPage(self), "My apps": MyAppsPage(self),
                      "Updates": UpdatesPage(self), "Settings": SettingsPage(self)}
        for p in self.pages.values():
            self.stack.addWidget(p)
        self.project = ProjectPage(self)
        self.stack.addWidget(self.project)
        self.flatpak = FlatpakPage(self)
        self.stack.addWidget(self.flatpak)
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
        """jacestore://project/<slug> (the website's "Open in Jace Store app" button), or something
        from flathub.org: appstream://<app id> or a downloaded .flatpakref / .flatpak file."""
        from jacestore.flatpak_links import is_flatpak_arg, target_from_arg
        if is_flatpak_arg(url):
            target = target_from_arg(url)
            if target:
                self.history.append(self.stack.currentWidget())
                self.flatpak.load(target)
                self.stack.setCurrentWidget(self.flatpak)
            else:
                QMessageBox.warning(self, APP_NAME, f"Couldn't read {url}.")
            self.showNormal()
            self.raise_()
            self.activateWindow()
            return
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

    def add_to_library(self, **prefill):
        if AppDialog(self, None, **prefill).exec():
            self.show_page("My apps")
            self.pages["My apps"].shown()

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

