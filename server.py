#!/usr/bin/env python3
"""Local data server for the Lien browser port.

The server never modifies the original game files.  It exposes decoded assets
from the installed Ikura GDL archives and the VOICE archive inside the raw game
disc image.  It binds to loopback only.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import mimetypes
import os
import struct
import threading
import webbrowser
import zlib
from dataclasses import dataclass
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import BinaryIO
from urllib.parse import unquote, urlparse


PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_GAME_DIR = Path(os.environ.get("LIEN_GAME_DIR", PROJECT_DIR.parent))
WEB_DIR = PROJECT_DIR / "web"
ARCHIVE_NAMES = ("DATA", "GGD", "ISF", "SE", "WMSC")


class FormatError(ValueError):
    pass


@dataclass(frozen=True)
class Entry:
    name: str
    offset: int
    size: int


class SliceReader:
    """Random-access view over a contiguous part of a file."""

    def __init__(self, path: Path, offset: int = 0, size: int | None = None):
        self.path = path
        self.offset = offset
        self.size = path.stat().st_size - offset if size is None else size

    def read_at(self, offset: int, size: int) -> bytes:
        if offset < 0 or size < 0 or offset + size > self.size:
            raise FormatError("read outside data source")
        with self.path.open("rb") as stream:
            stream.seek(self.offset + offset)
            data = stream.read(size)
        if len(data) != size:
            raise FormatError("short read")
        return data


class RawMode1Image:
    """Read 2048-byte ISO payloads from a MODE1/2352 CD image."""

    SECTOR = 2352
    PAYLOAD_OFFSET = 16
    PAYLOAD_SIZE = 2048

    def __init__(self, path: Path):
        self.path = path

    def read_sector(self, sector: int) -> bytes:
        with self.path.open("rb") as stream:
            stream.seek(sector * self.SECTOR + self.PAYLOAD_OFFSET)
            data = stream.read(self.PAYLOAD_SIZE)
        if len(data) != self.PAYLOAD_SIZE:
            raise FormatError(f"short CD sector {sector}")
        return data

    def read_extent(self, sector: int, size: int, relative: int = 0) -> bytes:
        if relative < 0 or size < 0:
            raise FormatError("invalid extent read")
        first = relative // self.PAYLOAD_SIZE
        skip = relative % self.PAYLOAD_SIZE
        remaining = size
        result = bytearray()
        current = sector + first
        while remaining:
            payload = self.read_sector(current)
            part = payload[skip : skip + remaining]
            result.extend(part)
            remaining -= len(part)
            current += 1
            skip = 0
        return bytes(result)

    def root_files(self) -> dict[str, tuple[int, int]]:
        pvd = self.read_sector(16)
        if pvd[1:6] != b"CD001":
            raise FormatError("disc does not contain an ISO-9660 primary volume")
        root_length = pvd[156]
        root = pvd[156 : 156 + root_length]
        sector = struct.unpack_from("<I", root, 2)[0]
        size = struct.unpack_from("<I", root, 10)[0]
        directory = self.read_extent(sector, size)
        files: dict[str, tuple[int, int]] = {}
        pos = 0
        while pos < len(directory):
            length = directory[pos]
            if length == 0:
                pos = ((pos // self.PAYLOAD_SIZE) + 1) * self.PAYLOAD_SIZE
                continue
            record = directory[pos : pos + length]
            name_length = record[32]
            raw_name = record[33 : 33 + name_length]
            if raw_name not in (b"\x00", b"\x01") and not (record[25] & 2):
                name = raw_name.decode("ascii", "replace").split(";", 1)[0]
                files[name.casefold()] = (
                    struct.unpack_from("<I", record, 2)[0],
                    struct.unpack_from("<I", record, 10)[0],
                )
            pos += length
        return files


class IsoExtentReader:
    def __init__(self, image: RawMode1Image, sector: int, size: int):
        self.image = image
        self.sector = sector
        self.size = size

    def read_at(self, offset: int, size: int) -> bytes:
        if offset < 0 or size < 0 or offset + size > self.size:
            raise FormatError("read outside ISO extent")
        return self.image.read_extent(self.sector, size, offset)


class IkuraArchive:
    """Ikura GDL archive format #1."""

    def __init__(self, source: SliceReader | IsoExtentReader, label: str):
        self.source = source
        self.label = label
        table_size = struct.unpack("<H", source.read_at(0, 2))[0]
        if table_size < 16 or table_size % 16:
            raise FormatError(f"{label}: invalid index size {table_size}")
        table = source.read_at(2, table_size)
        pending: list[tuple[str, int]] = []
        terminal_size: int | None = None
        for pos in range(0, table_size, 16):
            raw_name = table[pos : pos + 12].split(b"\0", 1)[0]
            offset = struct.unpack_from("<I", table, pos + 12)[0]
            if not raw_name:
                terminal_size = offset
                break
            pending.append((raw_name.decode("ascii", "replace"), offset))
        if not pending:
            raise FormatError(f"{label}: empty archive")
        archive_size = terminal_size or source.size
        if archive_size != source.size:
            raise FormatError(f"{label}: terminal size does not match source")
        entries: list[Entry] = []
        for index, (name, offset) in enumerate(pending):
            end = pending[index + 1][1] if index + 1 < len(pending) else archive_size
            if offset < table_size + 2 or end < offset or end > archive_size:
                raise FormatError(f"{label}: invalid offset for {name}")
            entries.append(Entry(name, offset, end - offset))
        self.entries = entries
        self._by_name = {entry.name.casefold(): entry for entry in entries}

    def get(self, name: str) -> Entry:
        try:
            return self._by_name[name.casefold()]
        except KeyError as error:
            raise FileNotFoundError(name) from error

    def read(self, name: str) -> bytes:
        entry = self.get(name)
        return self.source.read_at(entry.offset, entry.size)


class DirectoryArchive:
    """Archive-compatible view over a portable extracted directory."""

    def __init__(self, path: Path, label: str):
        self.path = path
        self.label = label
        if not path.is_dir():
            raise FileNotFoundError(path)
        files = sorted((item for item in path.iterdir() if item.is_file()), key=lambda item: item.name.casefold())
        self.entries = [Entry(item.name, 0, item.stat().st_size) for item in files]
        self._by_name = {entry.name.casefold(): entry for entry in self.entries}

    def get(self, name: str) -> Entry:
        try:
            return self._by_name[name.casefold()]
        except KeyError as error:
            raise FileNotFoundError(name) from error

    def read(self, name: str) -> bytes:
        entry = self.get(name)
        return (self.path / entry.name).read_bytes()


def decrypt_isf(data: bytes) -> bytes:
    """Decrypt an ISF while preserving its eight-byte plaintext header."""
    if len(data) < 8:
        raise FormatError("truncated ISF header")
    return data[:8] + bytes(((byte >> 2) | (byte << 6)) & 0xFF for byte in data[8:])


OPCODE_NAMES = {
    0x00: "END", 0x01: "LOAD_SCENARIO", 0x02: "LOAD_SUBSCENARIO",
    0x03: "SUBSCENARIO_RETURN", 0x04: "JUMP", 0x05: "CALL", 0x06: "RETURN",
    0x07: "JUMP_CONDITIONAL", 0x08: "CALL_CONDITIONAL", 0x09: "CHILD_PROCESS",
    0x0A: "OPEN_URL", 0x10: "COMMAND_WINDOW_POSITION", 0x11: "COMMAND_FRAME",
    0x12: "COMMAND_ICON_LOAD", 0x13: "COMMAND_PALETTE", 0x14: "COMMAND_ICON",
    0x15: "COMMAND_SET", 0x16: "COMMAND_WINDOW_OPEN", 0x17: "COMMAND_WINDOW_CLOSE",
    0x18: "COMMAND_SELECT", 0x19: "COMMAND_CLEAR", 0x1A: "COMMAND_RESET",
    0x1B: "COMMAND_RANDOM", 0x1C: "COMMAND_TEXT", 0x20: "WINDOW_POSITION",
    0x21: "WINDOW_PARTS", 0x22: "CLICK_WAIT_PARTS", 0x23: "CLICK_WAIT_SETTING",
    0x24: "CHARACTER_NAME", 0x25: "SAVE_NAME", 0x26: "MESSAGE_SPEED",
    0x27: "FONT_SIZE", 0x28: "CHARACTER_STYLE", 0x29: "WINDOW_OPEN",
    0x2A: "WINDOW_CLOSE", 0x2B: "PRINT_MESSAGE", 0x2C: "PRINT_MESSAGE_VOICE",
    0x2D: "WINDOW_HIDE", 0x2E: "WINDOW_SHOW", 0x30: "FLAG_COUNT",
    0x31: "FLAG_SET", 0x32: "FLAGS_SET", 0x33: "FLAG_JUMP", 0x34: "FLAG_COPY",
    0x35: "FLAG_PATTERN_SET", 0x36: "FLAG_PATTERN_JUMP", 0x37: "SYSTEM_FLAG",
    0x38: "FLAGS_SAVE", 0x39: "FLAGS_LOAD", 0x3A: "SYSTEM_FLAG_JUMP",
    0x3B: "VARIABLE_JUMP", 0x3C: "VARIABLE_PATTERN_JUMP", 0x40: "VARIABLE_COUNT",
    0x41: "VARIABLE_SET", 0x42: "VARIABLE_INCREMENT", 0x43: "VARIABLE_DECREMENT",
    0x44: "CALCULATE", 0x45: "VARIABLES_SET", 0x46: "VARIABLE_COPY",
    0x47: "IF", 0x48: "EXTRA_AREA", 0x49: "EXTRA_SET", 0x4A: "EXTRA_COPY",
    0x4B: "SYSTEM_COPY", 0x4C: "SYSTEM_PARAMETER_COPY", 0x50: "VRAM_SET",
    0x51: "GRAPHICS_ON", 0x52: "GRAPHICS_OFF", 0x53: "GRAPHICS_CLEAR",
    0x54: "GRAPHICS_FADE_IN", 0x55: "GRAPHICS_FADE_OUT", 0x56: "GRAPHICS_LOAD",
    0x57: "GRAPHICS_COPY", 0x58: "DRAW_RECTANGLE", 0x59: "GRAPHICS_TEXT_SIZE",
    0x5A: "GRAPHICS_TEXT_STYLE", 0x5B: "GRAPHICS_TEXT", 0x5C: "ANIMATION_START",
    0x5D: "ANIMATION_STOP", 0x5E: "GRAPHICS_FADE_IN_EFFECT",
    0x5F: "GRAPHICS_FADE_OUT_EFFECT", 0x60: "GRAYSCALE_EFFECT", 0x61: "SCALE_EFFECT",
    0x62: "SCROLL_EFFECT", 0x63: "SCREEN_SHAKE", 0x64: "ANIMATION_LOOP",
    0x65: "ANIMATION_OPEN", 0x66: "ANIMATION_SET", 0x67: "ANIMATION_POSITION",
    0x68: "ANIMATION_CLOSE", 0x69: "ANIMATION_DELETE", 0x6F: "LOAD_SAVED_IMAGE",
    0x70: "MUSIC_LOAD", 0x71: "MUSIC_PLAY", 0x72: "MUSIC_FADE", 0x73: "MUSIC_STOP",
    0x74: "EFFECT_LOAD", 0x75: "EFFECT_PLAY", 0x76: "EFFECT_DISABLE",
    0x77: "PCM_PLAY", 0x78: "PCM_LOAD", 0x79: "PCM_STOP", 0x7A: "PCM_WAIT_END",
    0x7B: "EFFECT_STOP", 0x7C: "MUSIC_POSITION", 0x7D: "EFFECT_POSITION",
    0x7E: "PCM_POSITION", 0x7F: "PCM_CACHE", 0x80: "CURSOR_LOAD",
    0x81: "CURSOR_CHANGE", 0x82: "MOUSE_RANGE", 0x83: "MOUSE_POSITION",
    0x84: "INPUT_HANDLER", 0x85: "SCREEN_MOUSE_INPUT", 0x86: "MOUSE_INPUT_INIT",
    0x87: "MOUSE_INPUT_RELEASE", 0x88: "KEY_TARGET", 0x89: "KEY_DEFAULT",
    0x8A: "IMAGE_LAYOUT_LOAD", 0x8B: "IMAGE_LAYOUT_CLEAR", 0x8C: "IMAGE_TRANSFER",
    0x8D: "CLICK_WAIT", 0x8E: "CURSOR_GET_DISABLED", 0x90: "CD_AUDIO_SET",
    0x91: "CD_AUDIO_PLAY", 0x92: "CD_AUDIO_STOP", 0x9F: "INTERNAL_VOLUME",
    0xA0: "READ_FLAGS_CLEAR", 0xA1: "READ_TEXT_COLOR", 0xA2: "READ_PAGE_INFO",
    0xA3: "READ_FLAG_SET", 0xA4: "READ_FLAG_END", 0xA5: "READ_FLAG_COUNT",
    0xA6: "READ_LINE_WIDTH", 0xA7: "READ_FLAG_SCAN", 0xAE: "TEXT_CLIP_RECT",
    0xAF: "WAIT_ANIMATION_POSITION", 0xB0: "PLAYER_NAME_INPUT", 0xB1: "NAME_COPY",
    0xB2: "WALLPAPER_CHANGE", 0xB3: "MESSAGE_BOX", 0xB4: "SAMPLE_RATE",
    0xBD: "WAIT_CURSOR_INIT", 0xBE: "CURSOR_CLOCK", 0xBF: "CURSOR_OPEN",
    0xD0: "POPUP_TITLE", 0xD1: "POPUP_ENABLE", 0xD2: "POPUP_TYPE",
    0xD3: "POPUP_RETURN", 0xD4: "POPUP_CLOSE", 0xD5: "SAVE_ENABLE",
    0xD6: "PRINT_MULTILINE", 0xD7: "VOICE_REGISTER", 0xD8: "PRINT_CHARACTER_2",
    0xD9: "PRINT_MULTILINE_2", 0xDA: "UNDOCUMENTED_DA", 0xE0: "DIALOG_TAG",
    0xE1: "DIALOG_FRAME", 0xE2: "DIALOG_RADIO", 0xE3: "DIALOG_CHECKBOX",
    0xE4: "DIALOG_SLIDER", 0xE5: "SAVE_LOAD_DIALOG", 0xE6: "OPTIONS_DIALOG",
    0xE7: "DIALOG_DISABLE", 0xE8: "DIALOG_ENABLE", 0xE9: "TITLE_SCREEN",
    0xEF: "EXTENDED_2", 0xF0: "BOUND_FILENAME", 0xF1: "WAIT_START",
    0xF2: "WAIT", 0xF3: "VIDEO_PLAY", 0xF4: "POPUP_DISPLAY",
    0xF5: "SAVE_DISABLE", 0xF6: "POPUP_ALLOWED", 0xF7: "GAME_INFO",
    0xF8: "FONT_STYLE", 0xF9: "FONT_COLOR", 0xFA: "TIMER_SET",
    0xFB: "TIMER_END", 0xFC: "TIMER_GET", 0xFD: "IMAGE_OUTPUT",
    0xFE: "BREAK", 0xFF: "EXTENDED",
}


def payload_text(payload: bytes) -> str | None:
    """Return a useful Shift-JIS string embedded in an opcode payload."""
    candidates: list[str] = []
    for start in range(len(payload)):
        for end in range(len(payload), start + 2, -1):
            part = payload[start:end].strip(b"\0")
            if len(part) < 2:
                continue
            try:
                text = part.decode("cp932")
            except UnicodeDecodeError:
                continue
            if all(char.isprintable() for char in text) and (
                any(ord(char) > 0x7F for char in text)
                or (len(text) >= 3 and all(char.isalnum() or char in "_.-" for char in text))
            ):
                candidates.append(text)
                break
    return max(candidates, key=len) if candidates else None


# Lien's compact, single-byte text alphabet. Kanji remain Shift-JIS pairs;
# values below 0x80 index this table. The table was verified against the one
# embedded in MYU-.exe so the portable runtime does not need the executable.
LIEN_SINGLE_BYTE_TEXT = (
    "　　、。・？！（）「」０１２３４５６７８９"
    "あいうえおかがきぎくぐ　げこごさざしじすずせぜそぞただちぢっつづてでとど"
    "なにぬねのはばひびふぶへべほぼまみむめもゃやゅゆょよらりるれろわをん"
    "アイウエオカキクケコサシスセソタチッツテトナニけネノハヒフヘホマミムメモ"
)


def decode_lien_text(data: bytes) -> str:
    """Decode one null-free text run from a PRINT_MESSAGE command."""
    result: list[str] = []
    pos = 0
    while pos < len(data):
        value = data[pos]
        if value >= 0x80 and pos + 1 < len(data):
            try:
                result.append(data[pos : pos + 2].decode("cp932"))
            except UnicodeDecodeError:
                result.append("�")
            pos += 2
        else:
            result.append(LIEN_SINGLE_BYTE_TEXT[value] if value < len(LIEN_SINGLE_BYTE_TEXT) else "�")
            pos += 1
    return "".join(result)


def parse_lien_message(payload: bytes) -> dict[str, object]:
    """Parse the inline command stream used by PRINT_MESSAGE."""
    if not payload:
        return {"window": 0, "tokens": [], "text": ""}
    tokens: list[dict[str, object]] = []
    texts: list[str] = []
    pos = 1
    while pos < len(payload):
        command = payload[pos]
        pos += 1
        if command == 0:
            break
        if command == 0xFF:
            end = payload.find(b"\0", pos)
            if end < 0:
                end = len(payload)
            text = decode_lien_text(payload[pos:end])
            tokens.append({"type": "text", "text": text})
            texts.append(text)
            pos = end + 1
        elif command == 0x03:
            tokens.append({"type": "clear"})
        elif command == 0x06:
            tokens.append({"type": "break"})
        elif command == 0x01 and pos < len(payload):
            subtype = payload[pos]
            if subtype == 0 and pos + 3 < len(payload):
                tokens.append(
                    {
                        "type": "color",
                        "red": payload[pos + 1],
                        "green": payload[pos + 2],
                        "blue": payload[pos + 3],
                    }
                )
                pos += 4
            else:
                tokens.append({"type": "format", "command": subtype})
                pos += min(2, len(payload) - pos)
        elif command == 0x04 and pos < len(payload):
            tokens.append({"type": "format", "command": payload[pos]})
            pos += 1
        elif command == 0x08 and pos + 4 <= len(payload):
            tokens.append({"type": "read", "line": struct.unpack_from("<I", payload, pos)[0]})
            pos += 4
        elif command == 0x11 and pos + 4 <= len(payload):
            tokens.append({"type": "character-image", "value": struct.unpack_from("<I", payload, pos)[0]})
            pos += 4
        elif command == 0x13 and pos < len(payload):
            if payload[pos] > 0x1F:
                end = payload.find(b"\0", pos)
                if end < 0:
                    end = len(payload)
                tokens.append({"type": "voice", "name": payload[pos:end].decode("ascii", "replace")})
                pos = end + 1
            elif payload[pos] == 0x04 and pos + 3 <= len(payload):
                tokens.append({"type": "character-name", "index": struct.unpack_from("<H", payload, pos + 1)[0]})
                pos += 3
            else:
                tokens.append({"type": "unknown", "command": command, "value": payload[pos]})
                pos += 1
        else:
            tokens.append({"type": "unknown", "command": command})
    return {"window": payload[0], "tokens": tokens, "text": "".join(texts)}


def parse_isf(data: bytes) -> dict[str, object]:
    decoded = decrypt_isf(data)
    script_offset = struct.unpack_from("<I", decoded)[0]
    if script_offset < 8 or script_offset > len(decoded) or (script_offset - 8) % 4:
        raise FormatError(f"invalid ISF script offset {script_offset}")
    jump_count = (script_offset - 8) // 4
    jumps = [struct.unpack_from("<I", decoded, 8 + index * 4)[0] for index in range(jump_count)]
    operations: list[dict[str, object]] = []
    pos = script_offset
    while pos < len(decoded):
        start = pos
        if pos + 2 > len(decoded):
            raise FormatError(f"truncated opcode header at {pos:#x}")
        opcode = decoded[pos]
        first_length = decoded[pos + 1]
        if first_length & 0x80:
            if pos + 3 > len(decoded):
                raise FormatError(f"truncated long opcode header at {pos:#x}")
            record_length = ((first_length & 0x7F) << 8) | decoded[pos + 2]
            header_length = 3
        else:
            record_length = first_length
            header_length = 2
        if record_length < header_length or pos + record_length > len(decoded):
            raise FormatError(f"invalid opcode length {record_length} at {pos:#x}")
        payload = decoded[pos + header_length : pos + record_length]
        operation: dict[str, object] = {
            "offset": start,
            "opcode": opcode,
            "name": OPCODE_NAMES.get(opcode, f"UNKNOWN_{opcode:02X}"),
            "length": len(payload),
            "dataHex": payload.hex(),
        }
        if opcode in (0x2B, 0x2C):
            message = parse_lien_message(payload)
            operation["message"] = message
            text = str(message["text"])
        else:
            text = payload_text(payload)
        if text:
            operation["text"] = text
        operations.append(operation)
        pos += record_length
    return {
        "scriptOffset": script_offset,
        "revision": (decoded[4] << 8) | decoded[5],
        "xorKey": decoded[6],
        "reserved": decoded[7],
        "jumps": jumps,
        "operations": operations,
    }


def decode_ggd(data: bytes) -> tuple[int, int, bytes]:
    if len(data) < 8 or data[:4] != bytes.fromhex("b9aab3b3"):
        raise FormatError("unsupported GGD signature")
    width, height = struct.unpack_from("<HH", data, 4)
    stride = (width * 3 + 3) & ~3
    target_size = stride * height
    source = memoryview(data)[8:]
    src = 0
    output = bytearray()

    def take(count: int) -> memoryview:
        nonlocal src
        if src + count > len(source):
            raise FormatError("truncated GGD stream")
        value = source[src : src + count]
        src += count
        return value

    def copy_back(distance: int, count: int) -> None:
        position = len(output) - distance
        if position < 0:
            raise FormatError("invalid GGD back-reference")
        for _ in range(count):
            if position >= len(output):
                raise FormatError("invalid GGD overlapping reference")
            output.append(output[position])
            position += 1

    while len(output) < target_size:
        control = take(1)[0]
        if control == 0:
            count = take(1)[0]
            if len(output) < 3:
                raise FormatError("GGD repeat before first pixel")
            output.extend(output[-3:] * count)
        elif control == 1:
            count, distance = take(2)
            copy_back(distance * 3, count * 3)
        elif control == 2:
            count, low, high = take(3)
            copy_back((low | high << 8) * 3, count * 3)
        elif control == 3:
            copy_back(take(1)[0] * 3, 3)
        elif control == 4:
            low, high = take(2)
            copy_back((low | high << 8) * 3, 3)
        else:
            output.extend(take((control - 4) * 3))
        if len(output) > target_size + 768:
            raise FormatError("GGD output exceeds expected size")
    return width, height, bytes(output[:target_size])


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))


def ggd_to_png(data: bytes) -> bytes:
    width, height, pixels = decode_ggd(data)
    stride = (width * 3 + 3) & ~3
    scanlines = bytearray()
    # GGD stores scanlines in display order.  It resembles BMP pixel data in
    # other respects, but is not bottom-up like a conventional Windows DIB.
    for row_index in range(height):
        row = pixels[row_index * stride : row_index * stride + width * 3]
        scanlines.append(0)
        for pos in range(0, len(row), 3):
            blue, green, red = row[pos : pos + 3]
            scanlines.extend((red, green, blue))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header) + png_chunk(
        b"IDAT", zlib.compress(scanlines, 9)
    ) + png_chunk(b"IEND", b"")


def extract_isf_strings(data: bytes) -> list[dict[str, object]]:
    """Diagnostic Shift-JIS runs. This is not the final bytecode parser."""
    decoded = decrypt_isf(data)
    results: list[dict[str, object]] = []
    pos = 0
    while pos < len(decoded):
        best: tuple[int, str] | None = None
        limit = min(len(decoded), pos + 512)
        for end in range(pos + 1, limit + 1):
            try:
                text = decoded[pos:end].decode("cp932")
            except UnicodeDecodeError:
                continue
            if text and all(char.isprintable() for char in text):
                best = (end, text)
            else:
                break
        if best and len(best[1]) >= 3:
            end, text = best
            useful = len(text) >= 5 or any(ord(char) > 0x7F for char in text)
            if useful:
                results.append({"offset": pos, "text": text})
                pos = end
                continue
        pos += 1
    return results


class GameData:
    def __init__(
        self,
        game_dir: Path,
        portable_dir: Path | None = None,
        prefer_portable: bool = True,
        install_image: Path | None = None,
        game_image: Path | None = None,
    ):
        self.game_dir = game_dir
        self.portable_dir = portable_dir or PROJECT_DIR / "assets"
        self.archives: dict[str, IkuraArchive | DirectoryArchive] = {}
        marker = self.portable_dir / ".complete.json"
        self.using_portable_assets = prefer_portable and marker.is_file()
        if self.using_portable_assets:
            for name in ARCHIVE_NAMES:
                self.archives[name] = DirectoryArchive(self.portable_dir / name, name)
            self.voice: IkuraArchive | DirectoryArchive | None = DirectoryArchive(
                self.portable_dir / "VOICE", "VOICE"
            )
            return

        # A moved viewer may sit beside the original CD images rather than the
        # installed archive files.  Search the explicit paths first, then the
        # supplied game directory, the viewer directory, and its parent.
        candidates = []
        for directory in (game_dir, PROJECT_DIR, PROJECT_DIR.parent):
            if directory not in candidates:
                candidates.append(directory)

        def first_file(explicit: Path | None, names: tuple[str, ...]) -> Path | None:
            if explicit is not None:
                return explicit if explicit.is_file() else None
            for directory in candidates:
                for name in names:
                    path = directory / name
                    if path.is_file():
                        return path
            return None

        install_path = first_file(install_image, ("lien_inst.img", "LIEN_INST.IMG"))
        game_path = first_file(game_image, ("lien_game.img", "LIEN_GAME.IMG"))
        # Disc dumps are often renamed by imaging tools.  Identify those by
        # their ISO root contents when the conventional names are absent.
        inspected_images: dict[Path, dict[str, tuple[int, int]]] = {}
        for directory in candidates:
            for path in sorted(directory.glob("*.img")) if directory.is_dir() else ():
                if path in inspected_images or path in {install_path, game_path}:
                    continue
                try:
                    inspected_images[path] = RawMode1Image(path).root_files()
                except (OSError, FormatError):
                    continue
                root = inspected_images[path]
                if install_path is None and any(name.casefold() in root for name in ARCHIVE_NAMES):
                    install_path = path
                if game_path is None and "voice" in root:
                    game_path = path
        install_root: dict[str, tuple[int, int]] = {}
        install_disc: RawMode1Image | None = None
        if install_path is not None:
            install_disc = RawMode1Image(install_path)
            install_root = install_disc.root_files()

        for name in ARCHIVE_NAMES:
            path = first_file(None, (name, name.lower()))
            if path is not None:
                self.archives[name] = IkuraArchive(SliceReader(path), name)
            elif install_disc is not None and name.casefold() in install_root:
                sector, size = install_root[name.casefold()]
                self.archives[name] = IkuraArchive(
                    IsoExtentReader(install_disc, sector, size), name
                )

        self.voice: IkuraArchive | None = None
        if game_path is not None:
            image = RawMode1Image(game_path)
            root = image.root_files()
            if "voice" in root:
                sector, size = root["voice"]
                self.voice = IkuraArchive(IsoExtentReader(image, sector, size), "VOICE")

    def manifest(self) -> dict[str, object]:
        archives = {
            name: {
                "count": len(archive.entries),
                "bytes": sum(entry.size for entry in archive.entries),
                "entries": [entry.name for entry in archive.entries],
            }
            for name, archive in self.archives.items()
        }
        if self.voice:
            archives["VOICE"] = {
                "count": len(self.voice.entries),
                "bytes": sum(entry.size for entry in self.voice.entries),
                "entries": [entry.name for entry in self.voice.entries],
            }
        return {
            "title": "Lien ～終わらない君の唄～",
            "startScenario": "START.isf",
            "logicalSize": {"width": 640, "height": 480},
            "dataSource": (
                "portable-assets" if self.using_portable_assets
                else "disc-images" if any(
                    isinstance(archive.source, IsoExtentReader)
                    for archive in self.archives.values()
                ) or (self.voice and isinstance(self.voice.source, IsoExtentReader))
                else "original-archives"
            ),
            "archives": archives,
        }


class LienRequestHandler(SimpleHTTPRequestHandler):
    server_version = "LienWeb/0.1"

    def __init__(self, *args, game_data: GameData, **kwargs):
        self.game_data = game_data
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def end_headers(self) -> None:
        # Runtime HTML/CSS/JS changes frequently during work.
        # Do not let a browser profile retain an older interpreter build.
        # API-served game assets keep their separate cache policy below.
        if not urlparse(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def send_bytes(self, data: bytes, content_type: str, cache: bool = True) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "private, max-age=86400" if cache else "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        # Media elements routinely cancel an in-flight request when changing
        # tracks or pages.  That is a normal client disconnect, not a server
        # failure and must not trigger a second response on a closed socket.
        with contextlib.suppress(BrokenPipeError, ConnectionResetError):
            self.wfile.write(data)

    def send_json(self, value: object) -> None:
        self.send_bytes(
            json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
            "application/json; charset=utf-8",
            cache=False,
        )

    def send_api_error(self, status: HTTPStatus, message: str) -> None:
        payload = json.dumps({"error": message}, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return super().do_GET()
        parts = [unquote(part) for part in parsed.path.split("/") if part]
        try:
            if parts == ["api", "health"]:
                return self.send_json({"ok": True})
            if parts == ["api", "manifest"]:
                return self.send_json(self.game_data.manifest())
            if len(parts) == 3 and parts[:2] == ["api", "image"]:
                data = self.game_data.archives["GGD"].read(parts[2])
                return self.send_bytes(ggd_to_png(data), "image/png")
            if len(parts) == 4 and parts[:2] == ["api", "audio"]:
                group, name = parts[2], parts[3]
                archive = self.game_data.voice if group == "VOICE" else self.game_data.archives[group]
                if archive is None:
                    raise FileNotFoundError(group)
                return self.send_bytes(archive.read(name), "audio/wav")
            if len(parts) == 3 and parts[:2] == ["api", "scenario"]:
                raw = self.game_data.archives["ISF"].read(parts[2])
                parsed_scenario = parse_isf(raw)
                return self.send_json(
                    {
                        "name": parts[2],
                        "bytes": len(raw),
                        **parsed_scenario,
                        "strings": extract_isf_strings(raw),
                    }
                )
            if len(parts) == 4 and parts[:2] == ["api", "archive"]:
                group, name = parts[2], parts[3]
                archive = self.game_data.voice if group == "VOICE" else self.game_data.archives[group]
                if archive is None:
                    raise FileNotFoundError(group)
                content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
                return self.send_bytes(archive.read(name), content_type)
            self.send_api_error(HTTPStatus.NOT_FOUND, "unknown API endpoint")
        except (FileNotFoundError, KeyError):
            self.send_api_error(HTTPStatus.NOT_FOUND, "asset not found")
        except FormatError as error:
            self.send_api_error(HTTPStatus.UNPROCESSABLE_ENTITY, str(error))
        except Exception as error:
            self.send_api_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(error))

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler API
        parsed = urlparse(self.path)
        if parsed.path != "/api/log":
            return self.send_api_error(HTTPStatus.NOT_FOUND, "unknown API endpoint")
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 65536)
            payload = json.loads(self.rfile.read(length) or b"{}")
            event = str(payload.get("event", "client"))[:80]
            detail = payload.get("detail", {})
            rendered = json.dumps(detail, ensure_ascii=False, separators=(",", ":"))[:4000]
            print(f"[Lien runtime] {event} {rendered}", flush=True)
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
        except (ValueError, json.JSONDecodeError) as error:
            self.send_api_error(HTTPStatus.BAD_REQUEST, str(error))


def make_server(
    game_dir: Path,
    host: str,
    port: int,
    install_image: Path | None = None,
    game_image: Path | None = None,
) -> ThreadingHTTPServer:
    game_data = GameData(game_dir, install_image=install_image, game_image=game_image)

    def handler(*args, **kwargs):
        return LienRequestHandler(*args, game_data=game_data, **kwargs)

    return ThreadingHTTPServer((host, port), handler)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", type=Path, default=DEFAULT_GAME_DIR)
    parser.add_argument("--install-image", "--install-disc", dest="install_image", type=Path, help="installation CD image containing DATA/GGD/ISF/SE/WMSC")
    parser.add_argument("--game-image", "--game-disc", dest="game_image", type=Path, help="game CD image containing VOICE")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--open", action="store_true", help="open the browser after startup")
    args = parser.parse_args()
    server = make_server(
        args.game_dir.resolve(), args.host, args.port,
        args.install_image.resolve() if args.install_image else None,
        args.game_image.resolve() if args.game_image else None,
    )
    url = f"http://{args.host}:{server.server_port}/"
    print(f"Lien-web runtime: {url}")
    print("Press Ctrl+C to stop.")
    if args.open:
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
