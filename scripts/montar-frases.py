#!/usr/bin/env python3
"""Monta o banco de frases português ⇄ inglês a partir do Tatoeba (tatoeba.org).

Baixa as frases e as ligações de tradução, junta os pares, fica com frases curtas
(as mais úteis no dia a dia) e grava um arquivo TSV: "português<TAB>inglês" por linha.

Licença das frases: CC BY 2.0 FR (Tatoeba). O app mostra o crédito.

Uso:
  python3 scripts/montar-frases.py                 # baixa do Tatoeba e grava em saida/
  python3 scripts/montar-frases.py --local PASTA   # usa arquivos .tsv(.bz2) já baixados (para testes)
"""
import argparse, bz2, io, os, re, sys, unicodedata, urllib.request

BASE = "https://downloads.tatoeba.org/exports/per_language"
ARQUIVOS = {
    "por": f"{BASE}/por/por_sentences.tsv.bz2",
    "eng": f"{BASE}/eng/eng_sentences.tsv.bz2",
    "links": f"{BASE}/por/por-eng_links.tsv.bz2",
}
MAX_PARES = int(os.environ.get("MAX_PARES", "80000"))
MAX_PT = 70   # caracteres
MAX_EN = 80


def abrir(origem):
    """Abre um .tsv ou .tsv.bz2 (local ou URL) e devolve as linhas como texto."""
    if origem.startswith("http"):
        print(f"↓ {origem}", file=sys.stderr)
        req = urllib.request.Request(origem, headers={"User-Agent": "time-to-english/1.0"})
        dados = urllib.request.urlopen(req, timeout=300).read()
    else:
        with open(origem, "rb") as f:
            dados = f.read()
    if origem.endswith(".bz2"):
        dados = bz2.decompress(dados)
    return io.StringIO(dados.decode("utf-8", errors="replace"))


def ler_frases(fonte):
    frases = {}
    for linha in fonte:
        partes = linha.rstrip("\n").split("\t")
        if len(partes) >= 3:
            frases[partes[0]] = partes[2].strip()
    return frases


def chave(texto):
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def boa(texto, limite):
    return 1 < len(texto) <= limite and "\t" not in texto and not re.search(r"https?://", texto)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", help="pasta com por_sentences.tsv, eng_sentences.tsv e por-eng_links.tsv (.bz2 opcional)")
    ap.add_argument("--saida", default="saida/frases-pt-en.tsv")
    args = ap.parse_args()

    def origem(nome):
        if not args.local:
            return ARQUIVOS[nome]
        base = {"por": "por_sentences.tsv", "eng": "eng_sentences.tsv", "links": "por-eng_links.tsv"}[nome]
        for cand in (base, base + ".bz2"):
            p = os.path.join(args.local, cand)
            if os.path.exists(p):
                return p
        sys.exit(f"Arquivo não encontrado: {base} em {args.local}")

    por = ler_frases(abrir(origem("por")))
    eng = ler_frases(abrir(origem("eng")))
    print(f"frases: {len(por)} em português, {len(eng)} em inglês", file=sys.stderr)

    # Para cada frase em português, fica com a tradução em inglês mais curta.
    melhor = {}
    for linha in abrir(origem("links")):
        partes = linha.rstrip("\n").split("\t")
        if len(partes) < 2:
            continue
        a, b = partes[0], partes[1]
        if a in por and b in eng:
            pt, en = por[a], eng[b]
        elif b in por and a in eng:
            pt, en = por[b], eng[a]
        else:
            continue
        if not (boa(pt, MAX_PT) and boa(en, MAX_EN)):
            continue
        k = chave(pt)
        if not k:
            continue
        atual = melhor.get(k)
        if atual is None or len(en) < len(atual[1]):
            melhor[k] = (pt, en)

    # Frases mais curtas primeiro: são as mais comuns na conversa do dia a dia.
    pares = sorted(melhor.values(), key=lambda p: (len(p[0]), p[0]))[:MAX_PARES]
    os.makedirs(os.path.dirname(args.saida) or ".", exist_ok=True)
    with open(args.saida, "w", encoding="utf-8") as f:
        for pt, en in pares:
            f.write(f"{pt}\t{en}\n")
    tam = os.path.getsize(args.saida)
    print(f"✓ {len(pares)} pares gravados em {args.saida} ({tam/1e6:.1f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
