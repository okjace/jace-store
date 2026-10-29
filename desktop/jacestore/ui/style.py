"""Dark theme matching the Jace Store website."""
BG, PANEL, PANEL2, LINE, MUTED, TEXT, BRAND, BRAND_DARK = (
    "#0f1115", "#171a21", "#1f232c", "#2a2f3a", "#8b93a3", "#e6e8ec", "#4ade80", "#22a559")

QSS = f"""
* {{ font-size: 10pt; }}
QWidget {{ background: {BG}; color: {TEXT}; }}
QLabel {{ background: transparent; }}
QLabel[muted="true"] {{ color: {MUTED}; }}
QLabel[h1="true"] {{ font-size: 20pt; font-weight: 800; }}
QLabel[h2="true"] {{ font-size: 13pt; font-weight: 700; }}
QFrame#card, QFrame#panel {{ background: {PANEL}; border: 1px solid {LINE}; border-radius: 12px; }}
QFrame#card:hover {{ border-color: {MUTED}; }}
QFrame#card QLabel, QFrame#panel QLabel {{ background: transparent; }}
QListWidget#nav {{ background: {PANEL}; border: none; border-right: 1px solid {LINE}; padding: 8px; outline: 0; }}
QListWidget#nav::item {{ padding: 10px 12px; border-radius: 8px; margin: 2px 0; color: {MUTED}; }}
QListWidget#nav::item:selected {{ background: {PANEL2}; color: {TEXT}; }}
QListWidget#nav::item:hover {{ color: {TEXT}; }}
QPushButton {{ background: {PANEL2}; border: 1px solid {LINE}; border-radius: 8px; padding: 7px 14px; font-weight: 600; }}
QPushButton:hover {{ border-color: {MUTED}; }}
QPushButton:disabled {{ color: {MUTED}; }}
QPushButton[primary="true"] {{ background: {BRAND}; color: #000; border: none; }}
QPushButton[primary="true"]:hover {{ background: {BRAND_DARK}; }}
QPushButton[primary="true"]:disabled {{ background: {LINE}; color: {MUTED}; }}
QPushButton[danger="true"] {{ color: #fca5a5; border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.08); }}
QPushButton[chip="true"] {{ border-radius: 14px; padding: 4px 12px; color: {MUTED}; font-weight: 500; }}
QPushButton[chip="true"]:checked {{ color: {BRAND}; border-color: {BRAND}; background: rgba(74,222,128,.1); }}
QLineEdit, QComboBox, QPlainTextEdit, QTextBrowser {{ background: {PANEL2}; border: 1px solid {LINE}; border-radius: 8px; padding: 7px 10px; selection-background-color: {BRAND_DARK}; }}
QLineEdit:focus {{ border-color: {BRAND}; }}
QTextBrowser {{ background: {PANEL}; padding: 14px; }}
QScrollArea {{ border: none; }}
QScrollBar:vertical {{ background: transparent; width: 10px; }}
QScrollBar::handle:vertical {{ background: {LINE}; border-radius: 5px; min-height: 30px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; }}
QProgressBar {{ background: {PANEL2}; border: 1px solid {LINE}; border-radius: 6px; text-align: center; height: 14px; }}
QProgressBar::chunk {{ background: {BRAND}; border-radius: 5px; }}
QCheckBox::indicator {{ width: 16px; height: 16px; }}
QToolTip {{ background: {PANEL2}; color: {TEXT}; border: 1px solid {LINE}; }}
"""
