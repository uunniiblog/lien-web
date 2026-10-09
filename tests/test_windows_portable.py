#!/usr/bin/env python3
import ast
import unittest
import zipfile
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
PYTHON = PROJECT / "python"


class WindowsPortableTests(unittest.TestCase):
    def test_embeddable_runtime_is_complete_and_isolated(self):
        required = [
            "python.exe", "python3.dll", "python310.dll", "python310.zip",
            "python310._pth", "vcruntime140.dll", "vcruntime140_1.dll",
            "LICENSE.txt",
        ]
        for name in required:
            self.assertTrue((PYTHON / name).is_file(), name)
        self.assertEqual(b"MZ", (PYTHON / "python.exe").read_bytes()[:2])
        self.assertEqual(
            ["python310.zip", "."],
            (PYTHON / "python310._pth").read_text(encoding="utf-8").splitlines(),
        )
        self.assertFalse((PYTHON / "Lib" / "site-packages").exists())

        with zipfile.ZipFile(PYTHON / "python310.zip") as archive:
            names = set(archive.namelist())
        for name in ["argparse.pyc", "http/server.pyc", "urllib/parse.pyc", "webbrowser.pyc"]:
            self.assertIn(name, names)

    def test_server_and_launcher_support_portable_python_310(self):
        source = (PROJECT / "server.py").read_text(encoding="utf-8")
        ast.parse(source, filename="server.py", feature_version=(3, 10))
        launcher = (PROJECT / "Launch Lien.bat").read_text(encoding="utf-8")
        self.assertIn("python\\python.exe", launcher)
        self.assertIn("LIEN_GAME_DIR", launcher)
        self.assertIn("--open", launcher)


if __name__ == "__main__":
    unittest.main()
