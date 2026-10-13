#!/usr/bin/env python3
"""Builds the LVGL Thai fonts (src/font_th_18.c, src/font_th_24.c) from Sarabun (SIL OFL).

LVGL draws one glyph after another and has no OpenType mark positioning, so a tone mark after an
upper vowel (เพิ่ม, สั่ง, น้ำ) would land on top of the vowel. This script adds raised copies of the
five tone marks at the legacy Thai PUA code points U+F70A..U+F70E; src/thai.cpp swaps them in.

    pip install fonttools && python3 tools/make_fonts.py      (needs Node for lv_font_conv)
"""
import copy
import os
import subprocess
import tempfile
import urllib.request

from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src')
BASE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/'
TONES = ['uni0E48', 'uni0E49', 'uni0E4A', 'uni0E4B', 'uni0E4C']  # ่ ้ ๊ ๋ ์
RAISE = 290  # font units (1000/em): tone bottom 689 -> clears the tallest upper vowel (952)
RANGES = ['0x20-0x7E', '0xB7', '0xD7', '0x2026', '0x0E01-0x0E5B', '0xF70A-0xF70E']


def add_raised_tones(path_in, path_out):
    font = TTFont(path_in)
    glyf, hmtx = font['glyf'], font['hmtx']
    for i, name in enumerate(TONES):
        raised = name + '.raised'
        g = copy.deepcopy(glyf[name])
        g.coordinates.translate((0, RAISE))
        g.recalcBounds(glyf)
        glyf[raised] = g  # also appends it to the font's glyph order
        hmtx[raised] = hmtx[name]
        for table in font['cmap'].tables:
            if table.isUnicode():
                table.cmap[0xF70A + i] = raised
    font.save(path_out)


def main():
    tmp = tempfile.mkdtemp()
    for weight, size, name in (('Regular', 18, 'font_th_18'), ('SemiBold', 24, 'font_th_24')):
        ttf = os.path.join(tmp, f'Sarabun-{weight}.ttf')
        urllib.request.urlretrieve(f'{BASE_URL}Sarabun-{weight}.ttf', ttf)
        patched = os.path.join(tmp, f'Sarabun-{weight}-lvgl.ttf')
        add_raised_tones(ttf, patched)
        cmd = ['npx', '-y', 'lv_font_conv@1.5.3', '--font', patched, '--size', str(size), '--bpp', '4',
               '--format', 'lvgl', '--no-compress', '--lv-include', 'lvgl.h',
               '--lv-fallback', 'lv_font_montserrat_16', '-o', os.path.join(SRC, name + '.c')]
        for r in RANGES:
            cmd += ['-r', r]
        subprocess.run(cmd, check=True)
        # Keep the generated header free of this machine's temp paths
        out = os.path.join(SRC, name + '.c')
        text = open(out, encoding='utf-8').read().replace(patched, os.path.basename(patched))
        open(out, 'w', encoding='utf-8').write(text.replace(os.path.join(SRC, ''), 'src/'))
        print('wrote', name)


if __name__ == '__main__':
    main()
