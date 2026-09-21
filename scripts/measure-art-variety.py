#!/usr/bin/env python3
"""วัดความหลากหลายของภาพการ์ด (ใช้เทียบก่อน/หลังปรับ prompt)

วิธีวัด: dHash (perceptual hash) 64 บิต ต่อภาพ → คำนวณ Hamming distance ทุกคู่
  - ค่ายิ่ง "สูง" = ภาพยิ่งต่างกัน (หลากหลาย)
  - ถ้าค่าเฉลี่ยต่ำ (< ~12 จาก 64) แปลว่าภาพออกมาแนวเดียวกันหมด (ปัญหา "ขี้เกียจทำ")
นอกจากนี้รายงานจำนวน "กลุ่มโทนสี" (quantised mean colour) และค่าเฉลี่ยสี

วิธีใช้:
  python3 scripts/measure-art-variety.py --dir var/card-art
  python3 scripts/measure-art-variety.py --dir-a /tmp/art-before --dir-b var/card-art
"""
from __future__ import annotations

import argparse
import itertools
import statistics
from pathlib import Path

from PIL import Image


def dhash(path: Path, size: int = 8) -> int:
    """dHash 64 บิต — ทนต่อการย่อ/บีบอัด"""
    with Image.open(path) as im:
        small = im.convert('L').resize((size + 1, size), Image.LANCZOS)
        px = list(small.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            left = px[row * (size + 1) + col]
            right = px[row * (size + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count('1')


def mean_colour(path: Path) -> tuple[int, int, int]:
    with Image.open(path) as im:
        small = im.convert('RGB').resize((32, 32))
        px = list(small.getdata())
    return tuple(round(sum(p[i] for p in px) / len(px)) for i in range(3))  # type: ignore[return-value]


def summarise(label: str, hashes: list[int], colours: list[tuple[int, int, int]]) -> None:
    pairs = list(itertools.combinations(hashes, 2))
    if not pairs:
        print(f'{label}: ภาพไม่พอจะเทียบ (มี {len(hashes)} ใบ)')
        return
    distances = [hamming(a, b) for a, b in pairs]
    buckets = {tuple(c // 32 for c in colour) for colour in colours}
    print(
        f'{label}: {len(hashes)} ใบ · dHash ห่างกันเฉลี่ย {statistics.mean(distances):.1f}/64 '
        f'(มัธยฐาน {statistics.median(distances):.0f}, ต่ำสุด {min(distances)}, สูงสุด {max(distances)}) '
        f'· กลุ่มโทนสี {len(buckets)} กลุ่ม'
    )
    close = sum(1 for d in distances if d <= 10)
    print(f'   คู่ที่ "คล้ายกันมาก" (≤10/64): {close}/{len(distances)} = {close / len(distances) * 100:.0f}%')


def collect(directory: Path) -> tuple[list[int], list[tuple[int, int, int]], list[Path]]:
    files = sorted(p for p in directory.glob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'})
    hashes: list[int] = []
    colours: list[tuple[int, int, int]] = []
    for path in files:
        try:
            hashes.append(dhash(path))
            colours.append(mean_colour(path))
        except Exception as error:  # pragma: no cover - ไฟล์เสีย
            print(f'   ⚠️  ข้าม {path.name}: {error}')
    return hashes, colours, files


def main() -> None:
    parser = argparse.ArgumentParser(description='วัดความหลากหลายของภาพการ์ด')
    parser.add_argument('--dir', help='โฟลเดอร์ภาพชุดเดียว')
    parser.add_argument('--dir-a', help='โฟลเดอร์ชุดก่อน (baseline)')
    parser.add_argument('--dir-b', help='โฟลเดอร์ชุดหลัง')
    args = parser.parse_args()

    if args.dir:
        hashes, colours, files = collect(Path(args.dir))
        summarise(Path(args.dir).name, hashes, colours)
        print(f'   ไฟล์ที่วัด: {len(files)}')

    if args.dir_a and args.dir_b:
        for label, directory in (('ก่อน', args.dir_a), ('หลัง', args.dir_b)):
            hashes, colours, files = collect(Path(directory))
            summarise(label, hashes, colours)
            print(f'   ไฟล์ที่วัด: {len(files)}')


if __name__ == '__main__':
    main()
