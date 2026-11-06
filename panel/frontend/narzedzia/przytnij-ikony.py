#!/usr/bin/env python3
"""Przycina czcionkę Material Symbols (4 MB) do ikon używanych w panelu.

Uruchamiane PRZED `ng build` (npm run build): zapisuje src/czcionki/ikony.woff2,
który Angular dostaje jako zwykły zasób i nadaje mu nazwę z sumą kontrolną –
dzięki temu przeglądarka nigdy nie użyje starej wersji z pamięci podręcznej.

Ikony: każde słowo z kodu (src/), które jest nazwą ligatury w czcionce –
łapie też nazwy w wyrażeniach, np. `dziala ? 'check_circle' : 'cancel'`.
"""
import glob
import os
import re

from fontTools import subset
from fontTools.ttLib import TTFont

KATALOG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZRODLO = os.path.join(KATALOG, 'node_modules', 'material-symbols', 'material-symbols-outlined.woff2')
CEL = os.path.join(KATALOG, 'src', 'czcionki', 'ikony.woff2')

font = TTFont(ZRODLO)
# glif -> znak; litery są w cmap dwa razy (A i a), bierzemy małą
znak = {}
for kod, glif in font.getBestCmap().items():
    znak[glif] = max(znak.get(glif, 0), kod)
ligatury = {}
for lookup in font['GSUB'].table.LookupList.Lookup:
    for st in lookup.SubTable:
        st = getattr(st, 'ExtSubTable', st)
        for pierwszy, lista in getattr(st, 'ligatures', {}).items():
            for lig in lista:
                ligatury[''.join(chr(znak[g]) for g in [pierwszy] + lig.Component)] = lig.LigGlyph

slowa = set()
for plik in glob.glob(os.path.join(KATALOG, 'src', '**', '*.ts'), recursive=True) + \
        glob.glob(os.path.join(KATALOG, 'src', '**', '*.html'), recursive=True):
    slowa.update(re.findall(r'[a-z][a-z0-9_]{2,}', open(plik, encoding='utf-8').read()))
ikony = sorted(s for s in slowa if s in ligatury)

opcje = subset.Options()
opcje.flavor = 'woff2'
opcje.layout_features = ['liga', 'rlig', 'rclt', 'calt', 'ccmp']
opcje.layout_closure = False
s = subset.Subsetter(opcje)
s.populate(unicodes=[ord(c) for c in set(''.join(ikony)) | {' '}],
           glyphs=[ligatury[i] for i in ikony])
s.subset(font)
os.makedirs(os.path.dirname(CEL), exist_ok=True)
font.save(CEL)
print(f'ikony.woff2: {len(ikony)} ikon, {os.path.getsize(ZRODLO) // 1024} KB -> {os.path.getsize(CEL) // 1024} KB')
