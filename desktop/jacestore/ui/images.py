"""Icons from the web, cached on disk and in memory."""
import hashlib

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QFont, QPainter, QPainterPath, QPixmap

from jacestore.net import session
from jacestore.paths import cache_dir
from jacestore.ui.worker import run_async

_mem: dict = {}
_waiting: dict = {}


def _fetch(url: str) -> bytes:
    f = cache_dir() / "img" / hashlib.sha1(url.encode()).hexdigest()
    if f.exists():
        return f.read_bytes()
    r = session.get(url, timeout=20)
    r.raise_for_status()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(r.content)
    return r.content


def rounded(pm: QPixmap, size: int, radius: float = 0.22) -> QPixmap:
    pm = pm.scaled(size, size, Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
    out = QPixmap(size, size)
    out.fill(Qt.transparent)
    p = QPainter(out)
    p.setRenderHint(QPainter.Antialiasing)
    path = QPainterPath()
    path.addRoundedRect(0, 0, size, size, size * radius, size * radius)
    p.setClipPath(path)
    p.drawPixmap((size - pm.width()) // 2, (size - pm.height()) // 2, pm)
    p.end()
    return out


def letter_icon(title: str, size: int) -> QPixmap:
    """Same placeholder as the website: first letter on a colour from the title."""
    hue = sum(map(ord, title or "?")) % 360
    out = QPixmap(size, size)
    out.fill(Qt.transparent)
    p = QPainter(out)
    p.setRenderHint(QPainter.Antialiasing)
    p.setBrush(QColor.fromHsl(hue, 115, 72))
    p.setPen(Qt.NoPen)
    p.drawRoundedRect(0, 0, size, size, size * 0.22, size * 0.22)
    f = QFont()
    f.setBold(True)
    f.setPixelSize(int(size * 0.45))
    p.setFont(f)
    p.setPen(QColor(255, 255, 255, 230))
    p.drawText(out.rect(), Qt.AlignCenter, (title or "?")[0].upper())
    p.end()
    return out


def load_into(label, url: str | None, title: str, size: int):
    """Show a placeholder now and the real icon when it has loaded."""
    label.setPixmap(letter_icon(title, size))
    if not url:
        return
    key = (url, size)
    if key in _mem:
        label.setPixmap(_mem[key])
        return
    _waiting.setdefault(url, []).append((label, size))
    if len(_waiting[url]) > 1:
        return

    def done(data):
        pm = QPixmap()
        ok = pm.loadFromData(data)
        for lab, sz in _waiting.pop(url, []):
            if ok:
                _mem[(url, sz)] = rounded(pm, sz)
                try:
                    lab.setPixmap(_mem[(url, sz)])
                except RuntimeError:
                    pass  # the label was closed meanwhile

    run_async(lambda ctx: _fetch(url), done, lambda e: _waiting.pop(url, None))
