"""Catálogo de vídeo/imagem pra combinar com o render de 1h da /mix (footage já usado no
canal: naufrágio/corredores do Half-Life 2, mais uns clipes de IA e stills).

Mesmo esquema do `ambient_catalog.py`: não move nem copia arquivo, só varre, gera uma
miniatura em `assets/visual_thumbs/` e escreve `assets/visual_catalog.json`. Rodar de novo
não pede restart do backend (o /mix relê pelo mtime do JSON, igual o catálogo de ambiência).

    python backend/tools/visual_catalog.py
"""
import json, os, re, subprocess, unicodedata
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "..", "assets", "visual_catalog.json")
THUMBS = os.path.join(AQUI, "..", "assets", "visual_thumbs")
PASTA = r"Z:\jaques.dsgn\sfx_music\Jacão Ambients\visual"
EXTS_VIDEO = {".mp4", ".mov", ".webm"}
EXTS_IMG = {".jpg", ".jpeg", ".png"}
# fora do catalogo: nao e footage pra loop (icone de marca de outro projeto, still solta sem uso)
IGNORAR = {"icon visant.png", "unnamed.jpg"}

# tag por padrão de nome — nada de IA adivinhando categoria toda vez que o catalogo roda
REGRAS = [
    (re.compile(r"ps1-og|old-game"), ["jogo antigo", "costa"]),
    (re.compile(r"naufragio"), ["jogo antigo", "costa", "naufrágio"]),
    (re.compile(r"coral"), ["jogo antigo", "costa"]),
    (re.compile(r"^ps1[\\/]2026"), ["jogo antigo", "cidade", "interior"]),
    (re.compile(r"social_.*rave"), ["ia", "neon", "festa"]),
    (re.compile(r"social_.*slid"), ["ia", "túnel", "abstrato"]),
    (re.compile(r"cientista"), ["still", "jogo antigo"]),
]


def slug(nome):
    n = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", n.lower())).strip("-")


def duracao(caminho):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "csv=p=0", caminho], capture_output=True, text=True, timeout=30)
        return round(float(r.stdout.strip()), 1) if r.stdout.strip() else None
    except Exception:
        return None


def categorias(caminho_rel):
    for rx, cats in REGRAS:
        if rx.search(caminho_rel.replace("\\", "/")):
            return cats
    return ["outro"]


def gerar_thumb(caminho, ident, dur, is_video):
    os.makedirs(THUMBS, exist_ok=True)
    alvo = os.path.join(THUMBS, ident + ".jpg")
    if os.path.exists(alvo):
        return alvo
    if is_video:
        t = str(min(2.0, (dur or 4) / 3))
        cmd = ["ffmpeg", "-v", "error", "-color_primaries", "bt709", "-color_trc", "bt709",
               "-colorspace", "bt709", "-y", "-ss", t, "-i", caminho, "-frames:v", "1",
               "-vf", "scale=480:-1", alvo]
    else:
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", caminho, "-vf", "scale=480:-1", alvo]
    try:
        subprocess.run(cmd, capture_output=True, timeout=60, check=True)
        return alvo if os.path.exists(alvo) else None
    except Exception:
        return None


def main():
    itens = []
    for raiz, _, arquivos in os.walk(PASTA):
        for f in sorted(arquivos):
            if f in IGNORAR:
                continue
            ext = os.path.splitext(f)[1].lower()
            is_video = ext in EXTS_VIDEO
            if not is_video and ext not in EXTS_IMG:
                continue
            caminho = os.path.join(raiz, f)
            rel = os.path.relpath(caminho, PASTA)
            ident = slug(os.path.splitext(rel)[0].replace(os.sep, "-"))
            dur = duracao(caminho) if is_video else None
            thumb = gerar_thumb(caminho, ident, dur, is_video)
            itens.append(dict(
                id=ident, titulo=os.path.splitext(f)[0], caminho=caminho,
                tipo="video" if is_video else "imagem", dur_s=dur,
                categorias=categorias(rel), thumb=thumb,
            ))
            print(f"  {ident:45s} {dur or '—':>6}  {','.join(categorias(rel))}")
    doc = dict(gerado_em=datetime.now(timezone.utc).isoformat(timespec="seconds"),
              gerador="backend/tools/visual_catalog.py", total=len(itens), itens=itens)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as fp:
        json.dump(doc, fp, ensure_ascii=False, indent=1)
    print(f"-> {SAIDA} ({len(itens)} itens)")


if __name__ == "__main__":
    main()
