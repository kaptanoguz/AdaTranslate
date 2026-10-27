#!/usr/bin/env python3
"""validate.py — data/*.json bütünlük denetimi.

Kullanım:  python3 tools/validate.py
Kontroller: geçerli JSON, zorunlu alanlar, benzersiz id, geçerli kategori,
            kırık related_terms, gömülü paket senkronu, çevrilmemiş kayıt.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
CATS = {'general', 'maritime', 'chartering', 'chemical_tanker', 'supply', 'medical', 'pet'}
REQUIRED = ('id', 'en', 'tr', 'category')
OPTIONAL = ('definition_en', 'definition_tr', 'example_en', 'abbreviation',
            'related_terms', 'subtags')


def main() -> int:
    errors, warnings = [], []
    ids, terms, files = {}, [], sorted(f for f in os.listdir(DATA) if f.endswith('.json'))

    for fn in files:
        path = os.path.join(DATA, fn)
        try:
            with open(path, encoding='utf-8') as fh:
                rows = json.load(fh)
        except Exception as exc:                      # noqa: BLE001
            errors.append(f'{fn}: JSON parse hatası — {exc}')
            continue
        if not isinstance(rows, list):
            errors.append(f'{fn}: kök öğe bir dizi (array) olmalı')
            continue

        for i, row in enumerate(rows):
            where = f'{fn}[{i}]'
            if not isinstance(row, dict):
                errors.append(f'{where}: nesne değil')
                continue
            for key in REQUIRED:
                if not row.get(key):
                    errors.append(f'{where}: "{key}" alanı eksik/boş')
            rid = row.get('id')
            if rid in ids:
                errors.append(f'{where}: id "{rid}" zaten {ids[rid]} içinde tanımlı')
            elif rid:
                ids[rid] = fn
            cats = row.get('category') or []
            if not isinstance(cats, list):
                errors.append(f'{where}: "category" bir dizi olmalı')
            else:
                for c in cats:
                    if c not in CATS:
                        errors.append(f'{where}: geçersiz kategori "{c}"')
            for key in row:
                if key not in REQUIRED + OPTIONAL:
                    warnings.append(f'{where}: bilinmeyen alan "{key}"')
            terms.append((where, row))
        print(f'  {fn:<26} {len(rows):>5} kayıt')

    for where, row in terms:
        for ref in row.get('related_terms') or []:
            if ref not in ids:
                warnings.append(f'{where}: related_terms → bilinmeyen id "{ref}"')

    # Aynı terim + aynı kategori + aynı karşılık = gerçek kopya (aramada iki kez çıkar).
    # Farklı kategori ya da farklı karşılık meşru çoklu anlamdır, dokunma.
    dupes = {}
    for where, row in terms:
        key = (row['en'].strip().lower(), tuple(row.get('category') or []),
               row['tr'].strip().lower())
        if key in dupes:
            errors.append(f'{where}: "{row["en"]}" kaydı {dupes[key]} ile birebir aynı')
        else:
            dupes[key] = where

    # Gömülü paket diskteki veriyle senkron mu? (file:// modu bunu kullanır)
    bundle = os.path.join(ROOT, 'js', 'data-bundle.js')
    if os.path.exists(bundle):
        raw = open(bundle, encoding='utf-8').read()
        m = re.search(r'window\.ADA_DATA\s*=\s*(\[[^\n]*\]);', raw)
        if not m:
            errors.append('js/data-bundle.js okunamadı (ADA_DATA bulunamadı)')
        elif len(json.loads(m.group(1))) != len(terms):
            errors.append('js/data-bundle.js güncel değil — '
                          'python3 tools/build_bundle.py çalıştır')
        if 'window.ADA_TR_WORDS' not in raw:
            errors.append('js/data-bundle.js ADA_TR_WORDS içermiyor — '
                          'python3 tools/build_bundle.py çalıştır')
    else:
        errors.append('js/data-bundle.js yok — python3 tools/build_bundle.py çalıştır')

    # Türkçe karşılık İngilizce terimle birebir aynıysa çeviri atlanmış demektir.
    # Kısaltmalar (NOR, DWT) ve Türkçede aynen kullanılan sözcükler (internet,
    # aspirin, manifold) meşrudur; bunları ALLOW_SAME ile geç.
    ALLOW_SAME = {
        'internet', 'park', 'aspirin', 'ibuprofen', 'manifold', 'terminal',
        'innage', 'o-ring', 'radar', 'sonar', 'video', 'metal', 'motor',
        'plan', 'sistem', 'test', 'tanker', 'kanal', 'kabin', 'palet',
        'piston', 'solenoid', 'atlantis', 'avalon', 'kaizen', 'armada',
        'alarm', 'badminton', 'blog', 'diploma', 'drama', 'euro',
        'fast food', 'festival', 'film',
        'cd', 'dvd', 'golf', 'gram', 'hey', 'hostel', 'jet', 'jogging',
        'kilogram', 'kilometre', 'litre', 'logo', 'mango', 'metre',
        'minimum', 'model', 'modern', 'normal', 'opera', 'partner',
        'pizza', 'platform', 'pop', 'pound', 'program', 'risk', 'robot',
        'site', 'tablet', 'tank', 'ton', 'van', 'zebra',
        'ah', 'campus', 'genre', 'mineral', 'panel', 'profile', 'sponsor', 'status', 'vitamin',
        'ideal', 'klasik', 'radar', 'fuel oil', 'gps', 'vhf', 'epirb', 'sart', 'navtex',
    }
    untranslated = []
    for where, row in terms:
        en, tr = row['en'].strip(), row['tr'].strip()
        if en.lower() != tr.lower():
            continue
        if en.lower() in ALLOW_SAME or row.get('abbreviation'):
            continue
        # Tamamı büyük harf / noktalı kısaltma kalıbı → kısaltma say.
        if re.fullmatch(r'[A-Z0-9][A-Z0-9./&\-]*\.?', en):
            continue
        untranslated.append(f'{where}: "{en}" çevrilmemiş (tr == en)')
    if untranslated:
        errors.extend(untranslated[:20])
        if len(untranslated) > 20:
            errors.append(f'... ve {len(untranslated) - 20} çevrilmemiş kayıt daha')

    print(f'\nTOPLAM: {len(terms)} terim · {len(files)} dosya')
    for w in warnings:
        print('UYARI:', w)
    for e in errors:
        print('HATA :', e)
    print('\n' + ('BAŞARISIZ' if errors else 'TAMAM'))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
