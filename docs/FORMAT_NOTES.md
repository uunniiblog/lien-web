# Verified format notes

## Ikura archive format 1

- `uint16_le index_size`
- Repeated entries: `char name[12]`, `uint32_le offset`
- Terminal entry: twelve zero bytes and the total archive size
- Entry size is the next entry offset minus the current offset

Verified archives: `DATA`, `GGD`, `ISF`, `SE`, `WMSC`, and disc-resident
`VOICE`.

## Raw discs

Both images use MODE1/2352 sectors. ISO-9660 payload bytes occupy offsets
16–2063 of each sector. The runtime locates `VOICE` through the ISO root
directory instead of relying on a fixed sector number.

## GGD

- Signature bytes: `b9 aa b3 b3` (`FULL` bitwise inverted)
- `uint16_le width`, `uint16_le height`
- 24-bit BGR, DWORD-aligned scanlines, stored in display order
- Custom literal/repeat/back-reference encoding

All 599 images in this release use this variant.

## ISF

Bytes zero through seven are a plaintext header. Bytes starting at offset eight
use the standard Ikura two-bit left rotation. Decryption is:

```text
plain = (stored >> 2) | (stored << 6)
```

The first four bytes specify the script start. The region from byte eight to the
script start is a table of little-endian 32-bit jump offsets. Instructions have
an opcode followed by either a one-byte record length, or a two-byte big-endian
record length with bit 15 set. Record lengths include the instruction header.

### Message text

`PRINT_MESSAGE` contains an inline command stream. Text runs begin with `FF`
and end with `00`. Bytes at or above `80` are Shift-JIS pairs. Lower bytes use
Lien's compact 127-character punctuation, digit, hiragana, and katakana table,
verified against the table embedded in `MYU-.exe`. The API returns both the
Unicode text and structured inline tokens so the browser does not need the
original executable.
