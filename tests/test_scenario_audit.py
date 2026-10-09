#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from scenario_audit import OpeningTrace  # noqa: E402
from server import GameData, parse_isf  # noqa: E402


class ScenarioAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = GameData(PROJECT.parent)

    def test_every_scenario_decodes_to_its_exact_file_boundary(self):
        for entry in self.data.archives["ISF"].entries:
            raw = self.data.archives["ISF"].read(entry.name)
            scenario = parse_isf(raw)
            self.assertTrue(scenario["operations"], entry.name)
            final = scenario["operations"][-1]
            self.assertEqual(len(raw), final["offset"] + final["length"] + 2, entry.name)

    def test_all_jump_table_destinations_are_instruction_boundaries(self):
        for entry in self.data.archives["ISF"].entries:
            scenario = parse_isf(self.data.archives["ISF"].read(entry.name))
            offsets = {operation["offset"] for operation in scenario["operations"]}
            for relative in scenario["jumps"]:
                self.assertIn(scenario["scriptOffset"] + relative, offsets, entry.name)

    def test_original_opening_reaches_voice_before_choice(self):
        tracer = OpeningTrace(self.data)
        report = tracer.run(voice_limit=3)
        order = report["scenarioOrder"]
        expected = ["LOAD.isf", "EV_SET.isf", "VRAM_CLR.isf", "MAIN.isf", "NT_OP01.isf", "BL_MO.isf", "EV_BUNKI.isf", "MO_OP01.isf"]
        cursor = 0
        for name in order:
            if cursor < len(expected) and name.upper() == expected[cursor].upper():
                cursor += 1
        self.assertEqual(len(expected), cursor, order)
        self.assertIsNone(report["choice"])
        # C0001 is intentionally replayed later in the scene before C0002.
        self.assertEqual(["C0001", "C0001", "C0002"], [event["voice"] for event in report["voices"]])
        self.assertEqual(
            {"audio": 45, "control": 1085, "graphics": 705, "message": 564},
            report["eventCounts"],
        )
        self.assertEqual(
            "95a52fcd6db4823877c4e87868a4391ac37f1b047d7af882549a1e6af568de99",
            report["traceSha256"],
        )

        inventories = {
            name: {entry.name.upper() for entry in archive.entries}
            for name, archive in self.data.archives.items()
        }
        assert self.data.voice is not None
        inventories["VOICE"] = {entry.name.upper() for entry in self.data.voice.entries}
        for event in tracer.operations:
            scenario = tracer.cache[event["scenario"].upper()]
            operation = next(item for item in scenario["operations"] if item["offset"] == event["offset"])
            data = bytes.fromhex(operation["dataHex"])
            if operation["name"] == "GRAPHICS_LOAD":
                group, name = "GGD", data[4:].split(b"\0", 1)[0].decode("ascii") + ".GGD"
            elif operation["name"] == "MUSIC_LOAD":
                group, name = "WMSC", data.split(b"\0", 1)[0].decode("ascii")
            elif operation["name"] == "EFFECT_LOAD":
                group, name = "SE", data.split(b"\0", 1)[0].decode("ascii") + ".WAV"
            elif operation["name"] == "PCM_PLAY":
                group, name = "VOICE", data.split(b"\0", 1)[0].decode("ascii") + ".WAV"
            else:
                continue
            self.assertIn(name.upper(), inventories[group], f'{event["scenario"]}:{event["offset"]:#x} {name}')

    def test_fresh_game_reaches_first_map_with_one_active_destination(self):
        tracer = OpeningTrace(self.data)
        report = tracer.run(voice_limit=999)
        self.assertEqual(
            {"scenario": "MAP2.isf", "offset": 0x4AB, "name": "SCREEN_MOUSE_INPUT"},
            report["choice"],
        )
        active_destinations = [
            index for index, value in enumerate(tracer.variables[0xDC:0xE7]) if value
        ]
        self.assertEqual([1], active_destinations)
        self.assertEqual(6, tracer.variables[0xDD])

    def test_global_route_flags_are_monotonic_game_sav_unlocks(self):
        saved_ranges = set()
        persistent_sets = []
        for entry in self.data.archives["ISF"].entries:
            scenario = parse_isf(self.data.archives["ISF"].read(entry.name))
            for operation in scenario["operations"]:
                raw = bytes.fromhex(operation["dataHex"])
                if operation["name"] == "FLAGS_SAVE":
                    saved_ranges.add((int.from_bytes(raw[:2], "little"), int.from_bytes(raw[2:4], "little")))
                elif operation["name"] == "FLAG_SET" and len(raw) >= 3:
                    index = int.from_bytes(raw[:2], "little")
                    if 700 <= index < 1000:
                        persistent_sets.append((entry.name, index, raw[2]))

        self.assertEqual({(700, 1000)}, saved_ranges)
        self.assertTrue(persistent_sets)
        self.assertTrue(all(mode == 1 for _, _, mode in persistent_sets), persistent_sets)
        self.assertEqual(104, len({index for _, index, _ in persistent_sets}))

    def test_ghost_action_scripts_enable_disable_and_dispatch_alternate_events(self):
        def flag_values(name, index):
            scenario = parse_isf(self.data.archives["ISF"].read(name))
            values = []
            for operation in scenario["operations"]:
                if operation["name"] != "FLAG_SET":
                    continue
                raw = bytes.fromhex(operation["dataHex"])
                if int.from_bytes(raw[:2], "little") == index:
                    values.append(raw[2])
            return values

        self.assertIn(0, flag_values("TUKI_ON.isf", 0x50))
        self.assertIn(1, flag_values("TUKI_OFF.isf", 0x50))
        self.assertIn(1, flag_values("TORITUKI.isf", 0x50))

        table = parse_isf(self.data.archives["ISF"].read("TUKI_TBL.isf"))
        alternate_events = [
            operation["text"] for operation in table["operations"]
            if operation["name"] == "LOAD_SUBSCENARIO"
        ]
        self.assertEqual(12, len(alternate_events))
        self.assertTrue(all(name.endswith("B") for name in alternate_events), alternate_events)
        for name in alternate_events:
            alternate = parse_isf(self.data.archives["ISF"].read(f"{name}.isf"))
            loads = [
                operation["text"] for operation in alternate["operations"]
                if operation["name"] == "LOAD_SUBSCENARIO"
            ]
            self.assertIn("TUKI_NOW", loads, name)

    def test_title_initializes_possession_gauge_above_load_threshold(self):
        def assigned_value(name, variable):
            scenario = parse_isf(self.data.archives["ISF"].read(name))
            for operation in scenario["operations"]:
                if operation["name"] != "VARIABLE_SET":
                    continue
                raw = bytes.fromhex(operation["dataHex"])
                if int.from_bytes(raw[:2], "little") == variable:
                    return int.from_bytes(raw[2:6], "little")
            return None

        self.assertEqual(100, assigned_value("TITLE.isf", 0x0A))
        self.assertEqual(100, assigned_value("G_START.isf", 0x0A))
        self.assertEqual(10, assigned_value("LOAD.isf", 0x10))


if __name__ == "__main__":
    unittest.main()
