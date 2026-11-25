"""Catálogo de vídeo/imagem pra combinar com o render de 1h da /mix (footage já usado no
canal: naufrágio/corredores do Half-Life 2, mais uns clipes de IA e stills).

Mesmo esquema do `ambient_catalog.py`: não move nem copia arquivo, só varre, gera uma
miniatura em `assets/visual_thumbs/` e escreve `assets/visual_catalog.json`. Rodar de novo
não pede restart do backend (o /mix relê pelo mtime do JSON, igual o catálogo de ambiência).

    python backend/tools/visual_catalog.py

## Pastas extras, escolhidas pela tela

A varredura sempre inclui `PASTA_PADRAO`, mais qualquer pasta que a rota
`POST /api/mix/visual-pastas` (`mix_routes.py`) tiver gravado em `assets/visual_pastas.json`
— é o que o botão "escolher pasta" da /mix aciona, sem precisar rodar este script à mão
toda vez. Rodar o script direto no terminal também lê esse arquivo, então os dois caminhos
(botão e CLI) enxergam o mesmo conjunto de pastas.

Cada pasta extra ganha um `prefixo` pro id (gravado junto no visual_pastas.json) — sem
isso, dois arquivos de mesmo nome relativo em pastas diferentes colidiriam no mesmo id e
um sobrescreveria o outro no catálogo. A `PASTA_PADRAO` mantém prefixo vazio de propósito:
são os ids que já existem em `visual_picks.json` (escolha de vídeo por música) — mudar
esses ids agora desconectaria toda escolha já salva.
"""
import json, os, re, subprocess, unicodedata
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "..", "assets", "visual_catalog.json")
THUMBS = os.path.join(AQUI, "..", "assets", "visual_thumbs")
PASTAS_EXTRA = os.path.join(AQUI, "..", "assets", "visual_pastas.json")
PASTA_PADRAO = r"Z:\jaques.dsgn\sfx_music\Jacão Ambients\visual"
PASTA = PASTA_PADRAO   # nome antigo, mantido por compat de quem importava PASTA daqui
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


def pastas_extra():
    """Le assets/visual_pastas.json — [] se nao existir (nenhuma pasta extra ainda)."""
    if not os.path.isfile(PASTAS_EXTRA):
        return []
    with open(PASTAS_EXTRA, encoding="utf-8") as f:
        return json.load(f).get("pastas", [])


def grava_pastas_extra(lista):
    os.makedirs(os.path.dirname(PASTAS_EXTRA), exist_ok=True)
    with open(PASTAS_EXTRA, "w", encoding="utf-8") as f:
        json.dump({"pastas": lista}, f, ensure_ascii=False, indent=1)


def prefixo_para(pasta, existentes):
    """Prefixo curto e estavel pro id — nome da pasta, e so cai pra hash se colidir com
    um prefixo que ja existe (duas pastas com o mesmo nome base, caminhos diferentes)."""
    base = slug(os.path.basename(pasta.rstrip("\\/")) or "pasta") + "-"
    if base not in existentes:
        return base
    import hashlib
    return base + hashlib.sha1(pasta.encode()).hexdigest()[:6] + "-"


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


def _arquivos_de(pasta):
    """Lista (raiz, f) de todo video/imagem elegivel dentro de `pasta`, ja ordenada —
    separado de `gerar` pra poder contar o total ANTES de processar (progresso por arquivo,
    nao por pasta — uma pasta com 200 videos nao pode travar a barra em 0% ate acabar)."""
    out = []
    if not os.path.isdir(pasta):
        return out
    for raiz, _, arquivos in os.walk(pasta):
        for f in sorted(arquivos):
            if f in IGNORAR:
                continue
            if os.path.splitext(f)[1].lower() not in (EXTS_VIDEO | EXTS_IMG):
                continue
            out.append((raiz, f))
    return out


def gerar(extra=None, progresso=None):
    """Escaneia PASTA_PADRAO + `extra` (mesmo formato do visual_pastas.json:
    [{'pasta', 'prefixo'}]; None = le o arquivo). Escreve visual_catalog.json e devolve o
    total de itens. `progresso(pct)` e chamado por arquivo processado, 0..100."""
    fontes = [{"pasta": PASTA_PADRAO, "prefixo": ""}] + list(extra if extra is not None else pastas_extra())
    plano = [(fonte, raiz, f) for fonte in fontes for raiz, f in _arquivos_de(fonte["pasta"])]

    itens = []
    for i, (fonte, raiz, f) in enumerate(plano):
        pasta, prefixo = fonte["pasta"], fonte.get("prefixo") or ""
        ext = os.path.splitext(f)[1].lower()
        is_video = ext in EXTS_VIDEO
        caminho = os.path.join(raiz, f)
        rel = os.path.relpath(caminho, pasta)
        ident = prefixo + slug(os.path.splitext(rel)[0].replace(os.sep, "-"))
        dur = duracao(caminho) if is_video else None
        thumb = gerar_thumb(caminho, ident, dur, is_video)
        itens.append(dict(
            id=ident, titulo=os.path.splitext(f)[0], caminho=caminho,
            tipo="video" if is_video else "imagem", dur_s=dur,
            categorias=categorias(rel), thumb=thumb,
        ))
        print(f"  {ident:45s} {dur or '—':>6}  {','.join(categorias(rel))}")
        if progresso:
            progresso((i + 1) / max(len(plano), 1) * 100)

    doc = dict(gerado_em=datetime.now(timezone.utc).isoformat(timespec="seconds"),
              gerador="backend/tools/visual_catalog.py", total=len(itens), itens=itens)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as fp:
        json.dump(doc, fp, ensure_ascii=False, indent=1)
    print(f"-> {SAIDA} ({len(itens)} itens)")
    return len(itens)


def main():
    gerar()


if __name__ == "__main__":
    main()
