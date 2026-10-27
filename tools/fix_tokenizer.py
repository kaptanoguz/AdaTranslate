#!/usr/bin/env python3
"""fix_tokenizer.py — Marian tokenizer.json kelime sırasını modelin vocab.json'una eşitler.

onnx-community'nin opus-mt-tc-big-* paketlerindeki tokenizer.json, kelimeleri
SentencePiece sırasıyla listeliyor; model ise Helsinki-NLP vocab.json numaralarını
bekliyor. Sonuç: anlamsız çeviri. Bu betik sırayı vocab.json'a göre yeniden kurar.

Kullanım: python3 tools/fix_tokenizer.py models/en-tr/tokenizer.json vocab.json
(vocab.json: https://huggingface.co/Helsinki-NLP/<model>/resolve/main/vocab.json)
"""
import json
import sys


def main(tok_path: str, vocab_path: str) -> int:
    vocab = json.load(open(vocab_path, encoding='utf-8'))
    tok = json.load(open(tok_path, encoding='utf-8'))
    scores = {p: s for p, s in tok['model']['vocab']}
    order = sorted(vocab.items(), key=lambda kv: kv[1])
    if [i for _, i in order] != list(range(len(order))):
        raise SystemExit('vocab.json numaraları ardışık değil')

    tok['model']['vocab'] = [[p, scores.get(p, -100.0)] for p, _ in order]
    tok['model']['unk_id'] = vocab['<unk>']
    for a in tok['added_tokens']:
        a['id'] = vocab[a['content']]

    def fix(o):
        if isinstance(o, dict):
            for st in (o.get('special_tokens') or {}).values():
                st['ids'] = [vocab[t] for t in st['tokens']]
            for v in o.values():
                fix(v)
        elif isinstance(o, list):
            for v in o:
                fix(v)
    fix(tok.get('post_processor'))

    json.dump(tok, open(tok_path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{tok_path}: {len(order)} kelime yeniden sıralandı')
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
