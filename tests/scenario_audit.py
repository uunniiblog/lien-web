#!/usr/bin/env python3
"""Deterministically trace Lien's original opening script without rendering.

This is deliberately independent of browser timing.  It follows the same ISF
jump tables, calls, variables, and flags as the web VM and stops at a requested
number of voice commands or at the first interactive mouse choice.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from server import GameData, parse_isf


def word(data: bytes, offset: int = 0) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def dword(data: bytes, offset: int = 0) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def cstring(data: bytes, offset: int = 0) -> str:
    return data[offset:].split(b"\0", 1)[0].decode("ascii")


@dataclass
class Frame:
    scenario: dict[str, Any]
    ip: int = 0
    calls: list[int] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.offsets = {operation["offset"]: index for index, operation in enumerate(self.scenario["operations"])}


class OpeningTrace:
    """Small control-flow oracle used to guard the browser port's opening."""

    def __init__(self, game_data: GameData):
        self.game_data = game_data
        self.cache: dict[str, dict[str, Any]] = {}
        self.variables = [0] * 8192
        self.flags = [0] * 8192
        self.system_flags = [0] * 8192
        self.frames: list[Frame] = []
        self.operations: list[dict[str, Any]] = []
        self.scenarios: list[str] = []
        self.voices: list[dict[str, Any]] = []
        self.choice: dict[str, Any] | None = None

    def scenario(self, name: str) -> dict[str, Any]:
        filename = name if name.lower().endswith(".isf") else f"{name}.isf"
        key = filename.upper()
        if key not in self.cache:
            parsed = parse_isf(self.game_data.archives["ISF"].read(filename))
            parsed["name"] = filename
            self.cache[key] = parsed
        return self.cache[key]

    def push(self, name: str, replace: bool = False) -> None:
        frame = Frame(self.scenario(name))
        if replace:
            self.frames[-1] = frame
        else:
            self.frames.append(frame)
        self.scenarios.append(frame.scenario["name"])

    def value(self, raw: int) -> int:
        value = raw
        if value & 0x80000000:
            value = self.variables[value & 0x7FFFFFFF] & 0xFFFFFFFF
        if value & 0x40000000:
            value |= 0x80000000
        return value - 0x100000000 if value & 0x80000000 else value

    def set_variable(self, index: int, value: int) -> None:
        self.variables[index] = value

    def jump(self, frame: Frame, index: int) -> None:
        relative = frame.scenario["jumps"][index]
        target = frame.scenario["scriptOffset"] + relative
        frame.ip = frame.offsets[target]

    @staticmethod
    def compare(left: int, operator: int, right: int) -> bool:
        tests = (left == right, left < right, left <= right, left > right, left >= right, left != right)
        return tests[operator] if operator < len(tests) else False

    def calculate(self, data: bytes) -> None:
        result = self.value(dword(data, 3))
        offset = 7
        while offset < len(data) and data[offset] != 0x05:
            operator = data[offset]
            operand = self.value(dword(data, offset + 1))
            if operator == 0:
                result += operand
            elif operator == 1:
                result -= operand
            elif operator == 2:
                result *= operand
            elif operator == 3 and operand:
                result = int(result / operand)
            elif operator == 4 and operand:
                result %= operand
            offset += 5
        self.set_variable(word(data), result)

    def run(self, voice_limit: int = 3, instruction_limit: int = 100_000) -> dict[str, Any]:
        self.push("LOAD.isf")
        while self.frames and len(self.operations) < instruction_limit:
            frame = self.frames[-1]
            if frame.ip >= len(frame.scenario["operations"]):
                self.frames.pop()
                continue
            operation = frame.scenario["operations"][frame.ip]
            frame.ip += 1
            event = {"scenario": frame.scenario["name"], "offset": operation["offset"], "name": operation["name"]}
            self.operations.append(event)
            data = bytes.fromhex(operation["dataHex"])
            opcode = operation["opcode"]

            if opcode == 0x00:
                self.frames.pop()
            elif opcode == 0x01:
                self.push(cstring(data), replace=True)
            elif opcode == 0x02:
                self.push(cstring(data))
            elif opcode == 0x03:
                self.frames.pop()
            elif opcode == 0x04:
                self.jump(frame, word(data))
            elif opcode == 0x05:
                target = word(data)
                if target:
                    frame.calls.append(frame.ip)
                    self.jump(frame, target)
            elif opcode == 0x06:
                frame.ip = frame.calls.pop() if frame.calls else len(frame.scenario["operations"])
            elif opcode == 0x07:
                selected, count = self.value(dword(data)), data[4]
                if 0 <= selected < count:
                    self.jump(frame, word(data, 5 + selected * 2))
            elif opcode == 0x31:
                index, mode = word(data), data[2]
                self.flags[index] = self.flags[index] ^ 1 if mode == 2 else int(bool(mode))
            elif opcode == 0x32:
                for index in range(word(data), word(data, 2)):
                    self.flags[index] = self.flags[index] ^ 1 if data[4] == 2 else int(bool(data[4]))
            elif opcode == 0x33 and self.flags[word(data)]:
                self.jump(frame, word(data, 2))
            elif opcode == 0x39:
                self.flags = [0] * len(self.flags)
            elif opcode == 0x37:
                self.system_flags[data[0]] = int(bool(data[1]))
            elif opcode == 0x3A and self.system_flags[word(data)]:
                self.jump(frame, word(data, 2))
            elif opcode == 0x3B and not self.flags[word(data)]:
                self.jump(frame, word(data, 2))
            elif opcode == 0x41:
                self.set_variable(word(data), self.value(dword(data, 2)))
            elif opcode == 0x42:
                self.set_variable(word(data), self.variables[word(data)] + 1)
            elif opcode == 0x43:
                self.set_variable(word(data), self.variables[word(data)] - 1)
            elif opcode == 0x44:
                self.calculate(data)
            elif opcode == 0x45:
                for index in range(word(data), word(data, 2)):
                    self.set_variable(index, self.value(dword(data, 4)))
            elif opcode == 0x46:
                source, destination, count = word(data), word(data, 2), word(data, 4)
                self.variables[destination : destination + count] = self.variables[source : source + count]
            elif opcode == 0x47:
                for offset in range(0, len(data) - 9, 10):
                    if not self.compare(self.value(dword(data, offset)), data[offset + 4], self.value(dword(data, offset + 5))):
                        break
                    action = data[offset + 9]
                    if action == 0 and offset + 11 < len(data):
                        self.jump(frame, word(data, offset + 10))
                    elif action == 1 and offset + 15 < len(data):
                        self.set_variable(word(data, offset + 10), self.value(dword(data, offset + 12)))
                    if action != 2:
                        break
            elif opcode == 0x77:
                voice = {**event, "voice": cstring(data)}
                self.voices.append(voice)
                if len(self.voices) >= voice_limit:
                    break
            elif opcode == 0x85 and frame.scenario["name"].upper().startswith("MAP"):
                self.choice = event
                break
        else:
            if len(self.operations) >= instruction_limit:
                raise RuntimeError("opening trace instruction limit exhausted")

        return {
            "operations": len(self.operations),
            "scenarioOrder": self.scenarios,
            "voices": self.voices,
            "choice": self.choice,
            "eventCounts": dict(sorted(Counter(
                "message" if event["name"] in ("PRINT_MESSAGE", "PRINT_MESSAGE_VOICE")
                else "graphics" if event["name"].startswith(("GRAPHICS_", "ANIMATION_"))
                else "audio" if event["name"].startswith(("MUSIC_", "EFFECT_", "PCM_"))
                else "control"
                for event in self.operations
            ).items())),
            "traceSha256": hashlib.sha256("\n".join(
                f'{event["scenario"].upper()}:{event["offset"]:X}:{event["name"]}'
                for event in self.operations
            ).encode()).hexdigest(),
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--voices", type=int, default=3)
    args = parser.parse_args()
    report = OpeningTrace(GameData(args.game_dir.resolve())).run(args.voices)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
