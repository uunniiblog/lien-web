#!/usr/bin/env python3
"""Export Lien's archive entries into a self-contained portable asset tree."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from server import ARCHIVE_NAMES, DEFAULT_GAME_DIR, PROJECT_DIR, GameData


FORMAT_VERSION = 1


def safe_target(directory: Path, name: str) -> Path:
    if not name or Path(name).name != name or name in {".", ".."}:
        raise ValueError(f"unsafe archive entry name: {name!r}")
    return directory / name


def write_atomic(target: Path, data: bytes) -> None:
    temporary = target.with_name(f".{target.name}.partial")
    temporary.write_bytes(data)
    os.replace(temporary, target)


def extract(
    game_dir: Path,
    output: Path,
    force: bool = False,
    install_image: Path | None = None,
    game_image: Path | None = None,
) -> dict[str, object]:
    source = GameData(
        game_dir,
        portable_dir=output,
        prefer_portable=False,
        install_image=install_image,
        game_image=game_image,
    )
    missing = [name for name in ARCHIVE_NAMES if name not in source.archives]
    if missing:
        raise FileNotFoundError(
            "Required archive(s) not found: " + ", ".join(missing)
            + ". Use --install-image/--install-disc for the installation CD"
            + " (the disc containing DATA/GGD/ISF/SE/WMSC)."
        )
    groups = {name: source.archives[name] for name in ARCHIVE_NAMES}
    if source.voice is None:
        raise FileNotFoundError(
            "VOICE archive was not found. Use --game-image/--game-disc for the"
            " game CD (the disc containing VOICE)."
        )
    groups["VOICE"] = source.voice

    inventory: dict[str, dict[str, int]] = {}
    total_files = sum(len(archive.entries) for archive in groups.values())
    completed = 0
    output.mkdir(parents=True, exist_ok=True)

    for group, archive in groups.items():
        destination = output / group
        destination.mkdir(parents=True, exist_ok=True)
        group_bytes = 0
        for entry in archive.entries:
            target = safe_target(destination, entry.name)
            if force or not target.is_file() or target.stat().st_size != entry.size:
                write_atomic(target, archive.read(entry.name))
            group_bytes += entry.size
            completed += 1
            if completed == total_files or completed % 250 == 0:
                print(f"Extracted {completed}/{total_files} files", flush=True)
        inventory[group] = {"count": len(archive.entries), "bytes": group_bytes}

    manifest: dict[str, object] = {
        "format": "lien-portable-assets",
        "version": FORMAT_VERSION,
        "source": str((game_image or game_dir).resolve()),
        "groups": inventory,
        "files": total_files,
        "bytes": sum(item["bytes"] for item in inventory.values()),
    }
    write_atomic(
        output / ".complete.json",
        (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-dir", type=Path, default=DEFAULT_GAME_DIR)
    parser.add_argument(
        "--install-image", "--install-disc", dest="install_image", type=Path,
        help="installation CD image containing DATA/GGD/ISF/SE/WMSC",
    )
    parser.add_argument(
        "--game-image", "--game-disc", dest="game_image", type=Path,
        help="game CD image containing VOICE",
    )
    parser.add_argument("--output", type=Path, default=PROJECT_DIR / "assets")
    parser.add_argument("--force", action="store_true", help="rewrite files even when their sizes match")
    args = parser.parse_args()
    manifest = extract(
        args.game_dir.resolve(), args.output.resolve(), args.force,
        args.install_image.resolve() if args.install_image else None,
        args.game_image.resolve() if args.game_image else None,
    )
    size_mib = int(manifest["bytes"]) / (1024 * 1024)
    print(f"Portable asset export complete: {manifest['files']} files, {size_mib:.1f} MiB")


if __name__ == "__main__":
    main()
