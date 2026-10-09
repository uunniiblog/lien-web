#!/usr/bin/env python3
import struct
import sys
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from server import (  # noqa: E402
    GameData,
    decode_lien_text,
    decode_ggd,
    decrypt_isf,
    ggd_to_png,
    parse_isf,
)


GAME_DIR = PROJECT.parent


class FormatTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = GameData(GAME_DIR)

    def test_expected_archive_inventory(self):
        expected = {"DATA": 3, "GGD": 599, "ISF": 321, "SE": 2, "WMSC": 13}
        self.assertEqual(expected, {name: len(arc.entries) for name, arc in self.data.archives.items()})
        self.assertIsNotNone(self.data.voice)
        self.assertEqual(3457, len(self.data.voice.entries))

    def test_title_decodes(self):
        raw = self.data.archives["GGD"].read("title.GGD")
        width, height, pixels = decode_ggd(raw)
        self.assertEqual((640, 480), (width, height))
        self.assertEqual(((width * 3 + 3) & ~3) * height, len(pixels))
        png = ggd_to_png(raw)
        self.assertEqual(b"\x89PNG\r\n\x1a\n", png[:8])

    def test_start_scenario_decrypts_known_asset(self):
        raw = self.data.archives["ISF"].read("START.isf")
        decoded = decrypt_isf(raw)
        self.assertIn(b"MSG_WIN2", decoded)
        self.assertIn(b"TITLE", decoded)
        parsed = parse_isf(raw)
        self.assertGreater(len(parsed["operations"]), 20)
        self.assertEqual(len(raw), parsed["operations"][-1]["offset"] + parsed["operations"][-1]["length"] + 2)

    def test_lien_compact_text_decoding(self):
        self.assertEqual("　夕暮れ。", decode_lien_text(bytes.fromhex("01975b95e95603")))
        scenario = parse_isf(self.data.archives["ISF"].read("NT_OP01.isf"))
        message = next(operation for operation in scenario["operations"] if operation["name"] == "PRINT_MESSAGE")
        self.assertEqual("　夕暮れ。", message["message"]["text"])

    def test_voice_is_wave(self):
        assert self.data.voice is not None
        name = self.data.voice.entries[0].name
        wav = self.data.voice.read(name)
        self.assertEqual(b"RIFF", wav[:4])
        self.assertEqual(b"WAVE", wav[8:12])

    def test_portable_export_is_independent(self):
        marker = PROJECT / "assets" / ".complete.json"
        if not marker.is_file():
            self.skipTest("portable extraction has not been run")
        portable = GameData(Path("/original-game-is-not-present"), portable_dir=PROJECT / "assets")
        self.assertTrue(portable.using_portable_assets)
        self.assertEqual("portable-assets", portable.manifest()["dataSource"])
        self.assertEqual(599, len(portable.archives["GGD"].entries))
        self.assertEqual(321, len(portable.archives["ISF"].entries))
        self.assertIsNotNone(portable.voice)
        self.assertEqual(3457, len(portable.voice.entries))

    def test_cd_images_are_independent_of_install_directory(self):
        install_image = GAME_DIR / "lien_inst.img"
        game_image = GAME_DIR / "lien_game.img"
        if not (install_image.is_file() and game_image.is_file()):
            self.skipTest("original CD images are not present")
        disc_data = GameData(
            Path("/missing-lien-install"),
            portable_dir=Path("/missing-lien-assets"),
            prefer_portable=False,
            install_image=install_image,
            game_image=game_image,
        )
        self.assertEqual(
            {name: len(archive.entries) for name, archive in self.data.archives.items()},
            {name: len(archive.entries) for name, archive in disc_data.archives.items()},
        )
        self.assertIsNotNone(disc_data.voice)
        self.assertEqual(3457, len(disc_data.voice.entries))
        self.assertEqual("disc-images", disc_data.manifest()["dataSource"])


if __name__ == "__main__":
    unittest.main()
