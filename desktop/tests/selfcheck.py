"""Offline checks for the install logic. Runs on Windows, macOS and Linux (CI and locally).
Everything happens in temporary folders; nothing is installed on the real system.

    python tests/selfcheck.py
"""
import io
import os
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
TMP = Path(tempfile.mkdtemp(prefix="jacestore-test-"))
os.environ["JACE_STORE_HOME"] = str(TMP / "home")
os.environ["JACE_STORE_APPS"] = str(TMP / "apps")
os.environ["XDG_DATA_HOME"] = str(TMP / "xdg")

from jacestore import installed, installer, sources, system  # noqa: E402

failures = []


def check(name, cond, detail=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        failures.append(name)


# --- distro detection --------------------------------------------------------------------------
for osr, fam in [({"ID": "ubuntu", "ID_LIKE": "debian"}, "deb"), ({"ID": "linuxmint", "ID_LIKE": "ubuntu debian"}, "deb"),
                 ({"ID": "fedora"}, "rpm"), ({"ID": "opensuse-tumbleweed", "ID_LIKE": "opensuse suse"}, "rpm"),
                 ({"ID": "cachyos", "ID_LIKE": "arch"}, "arch"), ({"ID": "endeavouros", "ID_LIKE": "arch"}, "arch"),
                 ({"ID": "nixos"}, "other"), ({"ID": "pop", "ID_LIKE": "ubuntu debian"}, "deb")]:
    check(f"family {osr['ID']} -> {fam}", system.family_from(osr) == fam, system.family_from(osr))
s = system.detect()
check("detect() gives os/arch", s.os in ("windows", "macos", "linux") and s.arch in ("x64", "arm64"), str(s))
print("     this computer:", s.describe(), s.query())

# --- winget table parsing -----------------------------------------------------------------------------
rows_txt = [("Name", "Id", "Version", "Match", "Source"),
            ("Visual Studio Code", "Microsoft.VisualStudioCode", "1.95.3", "Moniker: vscode", "winget"),
            ("Firefox", "Mozilla.Firefox", "132.0.2", "", "winget")]
widths = [20, 28, 10, 17, 6]
lines = ["".join(c.ljust(w) for c, w in zip(r, widths)).rstrip() for r in rows_txt]
sample = "   -  \\  |\n" + lines[0] + "\n" + "-" * 81 + "\n" + "\n".join(lines[1:]) + "\n"
rows = sources._table(sample)
check("winget table: 2 rows", len(rows) == 2, rows)
check("winget table: ids", [r.get("Id") for r in rows] == ["Microsoft.VisualStudioCode", "Mozilla.Firefox"], rows)

# --- installed.json --------------------------------------------------------------------------------------
installed.put("test", "a", {"title": "A"})
check("installed put/get", installed.get("test", "a")["title"] == "A")
installed.remove("test", "a")
check("installed remove", installed.get("test", "a") is None)

# --- installing an app from an archive ------------------------------------------------------------------
def exe_bytes():
    # Windows: a real program (a copy of python.exe), so shortcuts point at a valid executable
    return b"#!/bin/sh\necho hello\n" if sys.platform != "win32" else Path(sys.executable).read_bytes()


if sys.platform == "darwin":
    # a zipped .app
    app = TMP / "src" / "Hello.app" / "Contents" / "MacOS"
    app.mkdir(parents=True)
    (app / "Hello").write_bytes(exe_bytes())
    (app / "Hello").chmod(0o755)
    z = TMP / "Hello-macos.app.zip"
    import subprocess
    subprocess.run(["ditto", "-c", "-k", "--keepParent", str(TMP / "src" / "Hello.app"), str(z)], check=True)
    rec = installer.install_file(z, "app_zip", slug="hello", title="Hello", log=lambda *_: None)
    check("mac app_zip installed", Path(rec["launch"]).name == "Hello.app" and Path(rec["launch"]).exists(), rec)
    installer.uninstall(rec, log=lambda *_: None)
    check("mac app removed", not Path(rec["launch"]).exists())
else:
    # a .zip with a folder inside, a program, a helper and an uninstaller
    z = TMP / "hello-1.0.zip"
    main_name = "Hello.exe" if sys.platform == "win32" else "hello"
    with zipfile.ZipFile(z, "w") as zf:
        for name in (main_name, "unins000.exe" if sys.platform == "win32" else "uninstall.sh", "readme.txt"):
            info = zipfile.ZipInfo(f"Hello-1.0/{name}")
            info.external_attr = (0o755 if name != "readme.txt" else 0o644) << 16
            zf.writestr(info, exe_bytes() if name != "readme.txt" else b"hi")
    rec = installer.install_file(z, "zip", slug="hello", title="Hello", log=lambda *_: None)
    launch = Path(rec.get("launch", ""))
    check("zip: picked the main program", launch.name == main_name, rec)
    check("zip: one folder level flattened", launch.parent.name == "Hello", launch)
    if sys.platform != "win32":
        check("zip: executable bit kept", os.access(launch, os.X_OK))
        check("zip: menu entry written", Path(rec["desktop_file"]).exists() and f'"{launch}"' in Path(rec["desktop_file"]).read_text())
    else:
        check("zip: Start menu shortcut", any(p.endswith(".lnk") and Path(p).exists() for p in rec["paths"]), rec)
    installer.uninstall(rec, log=lambda *_: None)
    check("zip: uninstall removed everything", not any(Path(p).exists() for p in rec["paths"]), rec)

if sys.platform.startswith("linux"):
    # tar.gz (with a path-traversal entry, which must be refused)
    t = TMP / "tool.tar.gz"
    with tarfile.open(t, "w:gz") as tf:
        data = exe_bytes()
        ti = tarfile.TarInfo("tool/bin/tool")
        ti.size, ti.mode = len(data), 0o755
        tf.addfile(ti, io.BytesIO(data))
        evil = tarfile.TarInfo("../evil.txt")
        evil.size = 1
        tf.addfile(evil, io.BytesIO(b"x"))
    try:
        installer.install_file(t, "tar", slug="tool", title="Tool", log=lambda *_: None)
        check("tar: path traversal refused", False, "extracted an archive with ../")
    except Exception:  # noqa: BLE001
        check("tar: path traversal refused", not (TMP / "apps" / "evil.txt").exists())
    t2 = TMP / "tool2.tar.gz"
    with tarfile.open(t2, "w:gz") as tf:
        ti = tarfile.TarInfo("tool/bin/tool")
        ti.size, ti.mode = len(data), 0o755
        tf.addfile(ti, io.BytesIO(data))
    rec = installer.install_file(t2, "tar", slug="tool", title="Tool", log=lambda *_: None)
    check("tar: installed", Path(rec["launch"]).name == "tool", rec)
    installer.uninstall(rec, log=lambda *_: None)

    # an AppImage (any executable file works for this test)
    a = TMP / "Thing-x86_64.AppImage"
    a.write_bytes(exe_bytes())
    rec = installer.install_file(a, "appimage", slug="thing", title="Thing", log=lambda *_: None)
    check("appimage: moved to Applications", Path(rec["launch"]).name == "Thing.AppImage" and os.access(rec["launch"], os.X_OK), rec)
    check("appimage: menu entry", Path(rec["desktop_file"]).exists())
    check("appimage: menu entry skips AppImageLauncher", "Exec=env APPIMAGELAUNCHER_DISABLE=1 " in Path(rec["desktop_file"]).read_text())
    installer.uninstall(rec, log=lambda *_: None)
    check("appimage: removed", not Path(rec["launch"]).exists() and not Path(rec["desktop_file"]).exists())

    # wrong package type for this distro is refused with a clear message
    wrong = {"deb": "rpm", "rpm": "pacman", "arch": "deb", "other": "deb"}[s.family or "other"]
    p = TMP / f"x.{ 'pkg.tar.zst' if wrong == 'pacman' else wrong}"
    p.write_bytes(b"x")
    try:
        installer.install_file(p, wrong, slug="x", title="X", log=lambda *_: None)
        check("wrong package type refused", False)
    except installer.InstallError as e:
        check("wrong package type refused", "doesn't use" in str(e) or "read-only" in str(e), str(e))

# --- links from flathub.org -----------------------------------------------------------------------------
from jacestore.flatpak_links import is_flatpak_arg, target_from_arg  # noqa: E402
t = target_from_arg("appstream://org.blender.Blender")
check("appstream:// link -> Flathub app", t and t.kind == "flathub" and t.app_id == "org.blender.Blender", t)
check("appstream: with .desktop", target_from_arg("appstream:org.gimp.GIMP.desktop").app_id == "org.gimp.GIMP")
ref = TMP / "org.blender.Blender.flatpakref"
ref.write_text("[Flatpak Ref]\nName=org.blender.Blender\nBranch=stable\nTitle=org.blender.Blender from flathub\n"
               "IsRuntime=false\nUrl=https://dl.flathub.org/repo/\nSuggestRemoteName=flathub\nGPGKey=abc\n")
t = target_from_arg(str(ref))
check(".flatpakref from flathub.org -> Flathub app", t and t.kind == "flathub" and t.app_id == "org.blender.Blender", t)
check("file:// URL to a .flatpakref", target_from_arg(ref.as_uri()).app_id == "org.blender.Blender")
other = TMP / "thing.flatpakref"
other.write_text("[Flatpak Ref]\nName=com.example.Thing\nTitle=Thing\nUrl=https://example.com/repo/\n")
t = target_from_arg(str(other))
check("other remote's .flatpakref -> ref", t and t.kind == "ref" and t.app_id == "com.example.Thing", t)
check("is_flatpak_arg", is_flatpak_arg("appstream://x") and is_flatpak_arg("/tmp/a.flatpakref") and not is_flatpak_arg("jacestore://project/x"))

# --- package managers described by their commands ----------------------------------------------------------
from jacestore import cancel, library, settings  # noqa: E402
specs = {s_["id"]: s_ for s_ in sources.BUILTIN_SPECS}
samples = {
    "choco": ("firefox|133.0.3\ngoogle-chrome|131.0\n", [("firefox", "133.0.3")]),
    "cargo": ('ripgrep = "14.1.1"    # ripgrep is a line-oriented search tool\n... and 300 crates more\n', [("ripgrep", "14.1.1")]),
    "xbps": ("[-] firefox-133.0_1     Lightweight web browser\n", [("firefox", "133.0_1")]),
    "apk": ("firefox-133.0-r0 - Firefox web browser\n", [("firefox", "133.0-r0")]),
    "mas": ("  497799835  Xcode           (16.2)\n 1295203466  Microsoft Remote Desktop  (10.9.10)\n", [("497799835", "16.2")]),
    "macports": ("firefox\t133.0\twww\tMozilla Firefox\n", [("firefox", "133.0")]),
    "eopkg": ("firefox - Mozilla Firefox\n", [("firefox", "")]),
    "npm": ('[{"name":"typescript","version":"5.7.2","description":"TS","links":{"npm":"https://npmjs.com/typescript"}}]', [("typescript", "5.7.2")]),
    "nix": ('{"legacyPackages.x86_64-linux.firefox":{"pname":"firefox","version":"133.0","description":"Web browser"}}', [("firefox", "133.0")]),
}
for sid, (text, want) in samples.items():
    got = [(p_.id, p_.version) for p_ in sources.CommandSource(specs[sid])._parse(text)][:len(want)]
    check(f"{sid} output parsed", got == want, got)
check("command placeholders", sources._fill("pkg install {id} --yes", id="a b") == ["pkg", "install", "a b", "--yes"])
check("command placeholders (list)", sources._fill(["nix", "profile", "install", "nixpkgs#{id}"], id="hello")[-1] == "nixpkgs#hello")
settings.save(custom_sources=[{"name": "My PM", "program": sys.executable, "search": f'"{sys.executable}" -c "print(\'pkg-{{query}} A thing\')"',
                               "install": "true {id}", "systems": [s.os], "parse": "regex"}])
cs = sources.custom_sources()
check("custom package manager loads", len(cs) == 1 and cs[0].id == "custom-my-pm" and cs[0].available(), [c.id for c in cs])
res = cs[0].search("zz") if cs else []
check("custom package manager searches", [p_.id for p_ in res] == ["pkg-zz"] and res[0].summary == "A thing", [(p_.id, p_.summary) for p_ in res])
check("custom package manager is offered", any(x.id == "custom-my-pm" for x in sources.for_this_computer()))
settings.save(custom_sources=[])

# --- My apps (private library) --------------------------------------------------------------------------------
a1 = library.add("Thing", sys.executable, "exec", website="https://example.com")
check("library add", any(x["id"] == a1["id"] for x in library.load()))
logo = TMP / "logo.png"
logo.write_bytes(b"\x89PNG\r\n\x1a\n")
path = library.set_logo(a1["id"], str(logo))
check("custom logo stored", Path(path).exists() and next(x for x in library.load() if x["id"] == a1["id"])["icon"] == path)
library.update(a1["id"], name="Renamed")
check("library edit", next(x for x in library.load() if x["id"] == a1["id"])["name"] == "Renamed")
library.remove(a1["id"])
check("library remove (and its logo)", not any(x["id"] == a1["id"] for x in library.load()) and not Path(path).exists())
found = library.scan_system()
check("scan this computer", isinstance(found, list), type(found))
print(f"     found {len(found)} apps on this computer")
n = library.import_system(found[:3])
check("add scanned apps (no duplicates on a second run)", library.import_system(found[:3]) == 0 and n == len(found[:3]))

if sys.platform.startswith("linux"):
    # uninstalling a program from My apps: an AppImage with a menu entry (in the test folders)
    fake = TMP / "apps" / "Fake.AppImage"
    fake.parent.mkdir(parents=True, exist_ok=True)
    fake.write_bytes(b"#!/bin/sh\n")
    fake.chmod(0o755)
    entry = Path(os.environ["XDG_DATA_HOME"]) / "applications" / "fake-test.desktop"
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text(f"[Desktop Entry]\nType=Application\nName=Fake Test App\nExec=env APPIMAGELAUNCHER_DISABLE=1 \"{fake}\" %U\n")
    found_fake = [x for x in library.scan_system() if x["name"] == "Fake Test App"]
    check("scan finds an AppImage's menu entry", len(found_fake) == 1, found_fake)
    library.import_system(found_fake)
    lib_fake = next(x for x in library.load() if x["name"] == "Fake Test App")
    plan = library.uninstall_plan(lib_fake)
    check("uninstall plan for an AppImage", plan and plan["method"] == "files" and str(fake) in plan["files"], plan)
    library.uninstall_app(lib_fake, plan, log=lambda *_: None)
    check("uninstall removes the AppImage, its entry and the library item",
          not fake.exists() and not entry.exists() and not any(x["id"] == lib_fake["id"] for x in library.load()))
    check("websites can't be uninstalled", library.uninstall_plan({"kind": "url", "target": "https://x"}) is None)

# --- apps Jace Store installs show up in My apps -------------------------------------------------------------
folder = TMP / "apps" / "Synced App"
folder.mkdir(parents=True, exist_ok=True)
(folder / "run").write_bytes(b"x")
installed.put("jacestore", "proj-123", {"title": "Synced App", "slug": "synced-app", "project_id": "proj-123", "version_id": "v1",
                                        "kind": "folder", "paths": [str(folder)], "icon_url": None})
installed.put("flathub", "org.example.Thing", {"title": "Flat Thing", "kind": "source", "launch_kind": "flatpak", "launch": "org.example.Thing"})
library.sync_installed()
lib = {a_["name"]: a_ for a_ in library.load()}
check("installed apps appear in My apps", "Synced App" in lib and "Flat Thing" in lib and lib["Synced App"]["kind"] == "installed", list(lib))
library.sync_installed()
check("syncing twice doesn't duplicate", sum(1 for a_ in library.load() if a_["name"] == "Synced App") == 1)
plan = library.uninstall_plan(lib["Synced App"])
check("installed app has an uninstall plan", plan and plan["method"] == "installed", plan)
library.uninstall_app(lib["Synced App"], plan, log=lambda *_: None)
check("uninstall from My apps removes files, record and tile",
      not folder.exists() and installed.get("jacestore", "proj-123") is None and not any(a_["name"] == "Synced App" for a_ in library.load()))
installed.remove("flathub", "org.example.Thing")
library.sync_installed()
check("an install removed elsewhere drops out of My apps", not any(a_["name"] == "Flat Thing" for a_ in library.load()))

# --- cancelling ------------------------------------------------------------------------------------------------
import threading  # noqa: E402
tok = cancel.Token()
result = {}


def job():
    cancel.set_current(tok)
    try:
        installer.run([sys.executable, "-c", "import time; time.sleep(30)"], log=lambda *_: None)
        result["r"] = "finished"
    except cancel.Cancelled:
        result["r"] = "cancelled"


th = threading.Thread(target=job)
th.start()
import time as _t  # noqa: E402
_t.sleep(1.5)
tok.cancel()
th.join(10)
check("cancel stops a running command", result.get("r") == "cancelled" and not th.is_alive(), result)

# --- main-program guessing ---------------------------------------------------------------------------------
g = TMP / "guess"
for name, size in (("bin/helper", 10), ("MyGame", 5_000_000), ("bin/crashreporter", 9_000_000)):
    f = g / (name + (".exe" if sys.platform == "win32" else ""))
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(b"x" * size)
    f.chmod(0o755)
best = installer.find_main_program(g, "My Game")
check("find_main_program prefers the named, top-level program", best and best.stem == "MyGame", best)

print()
if failures:
    print(f"{len(failures)} FAILED: {', '.join(failures)}")
    sys.exit(1)
print("ALL CHECKS OK")
