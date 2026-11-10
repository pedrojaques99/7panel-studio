"""Catálogo geral de som (SFX, sound design, música, gravações) por PASTA cadastrada.

`ambient_catalog.py` cataloga só ambiência, com fontes fixas no código. `sample_catalog.py`
cataloga só `assets/samples/` (e o índice `n` do Strudel depende dele). Este responde
"onde está aquele som?" pra qualquer pasta que você apontar, sem editar código:

    python backend/tools/som_catalog.py --add "Z:\\pasta\\de\\sons"      cadastra e já cataloga
    python backend/tools/som_catalog.py --add "D:\\packs" --origem pack
    python backend/tools/som_catalog.py --remove "Z:\\pasta\\de\\sons"   tira e recataloga
    python backend/tools/som_catalog.py --listar                        pastas cadastradas
    python backend/tools/som_catalog.py                                 recataloga tudo
    python backend/tools/som_catalog.py --lufs                          mede loudness também (lento)
    python backend/tools/som_catalog.py --buscar chuva                  procura no catálogo pronto

Mesmo esquema do `visual_catalog.py`: não move nem copia arquivo. As pastas ficam em
`assets/som_pastas.json` e o resultado em `assets/som_catalog.json`. `gerar(extra, progresso)`
tem a mesma assinatura do visual, pra uma rota POST cadastrar a pasta e varrer num job.

Rodar de novo é barato: `assets/som_cache.json` guarda md5 e medidas por (caminho, bytes,
mtime), então só arquivo novo ou alterado é lido. Cópia idêntica (md5) em outra pasta vira
`copias` do mesmo item, não item novo.
"""
import argparse, json, os, re, sys
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from ambient_catalog import lufs, md5, norm, sonda   # mesmas medidas do catálogo de ambiência

ASSETS = os.path.join(AQUI, "..", "assets")
SAIDA = os.path.join(ASSETS, "som_catalog.json")
PASTAS = os.path.join(ASSETS, "som_pastas.json")
CACHE = os.path.join(ASSETS, "som_cache.json")
EXTS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".opus", ".aac", ".aif", ".aiff"}
ORIGENS = ("proprio", "pack", "web", "gerado")
# pasta que nunca é acervo, mesmo dentro de uma pasta cadastrada
PULAR_DIR = {"node_modules", ".git", "__pycache__", ".snap", "_preview", "visual_thumbs"}

# tag por nome de arquivo + pastas acima dele; um item pode ter várias
CATEGORIAS = [
    ("clique", r"click|clique|tick|tap|detent|switch|button|botao|key|tecla"),
    ("whoosh", r"whoosh|swoosh|swish|sweep|pass.?by|transition|transicao"),
    ("impacto", r"impact|hit|punch|slam|boom|thud|bang|stomp|golpe"),
    ("riser", r"riser|rise|build.?up|uplift|downlifter|drop"),
    ("glitch", r"glitch|stutter|bitcrush|digital|static|interferen"),
    ("notificação", r"notif|alert|ding|chime|bell|sino|complete|success|error"),
    ("fita", r"tape|fita|vhs|vinyl|crackle|cassette|analog"),
    ("drone", r"drone|pad|atmos|texture|textura"),
    ("bateria", r"kick|bumbo|snare|caixa|hat|clap|tom|cymbal|prato|perc|drum|bd|sd|hh|808|909"),
    ("baixo", r"bass|baixo|sub"),
    ("voz", r"voz|voice|vocal|vox|fala|speech|narra"),
    ("chuva", r"chuva|rain|storm|trov|thunder"),
    ("vento", r"vento|wind|breeze"),
    ("água", r"water|agua|stream|river|rio|mar|ocean|wave"),
    ("pássaros", r"passar|bird"),
    ("fogo", r"fire|fogo|fireplace"),
    ("cidade", r"rua|bairro|cidade|city|aeroporto|traffic|transito|crowd|multidao"),
    ("ruído", r"brown|noise|ruido|white|pink"),
    ("música", r"music|musica|song|track|loop|beat|melod|chord|acorde"),
    ("gravação", r"\brec\b|rec-|capture|gravac|mesa-rec|synth-rec|take"),
]


def tipo_por_duracao(d):
    if d is None:
        return None
    return "golpe" if d < 2 else "efeito" if d < 15 else "loop" if d < 90 else "longo"


def categorias(texto):
    t = norm(texto).replace("-", " ")
    return [c for c, rx in CATEGORIAS if re.search(rx, t)] or ["outro"]


def _le(caminho, padrao):
    if not os.path.isfile(caminho):
        return padrao
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def _grava(caminho, doc):
    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    os.replace(tmp, caminho)   # nunca deixa catálogo pela metade se a varredura for interrompida


def _igual(a, b):
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def _dentro(filha, mae):
    f = os.path.normcase(os.path.abspath(filha)) + os.sep
    m = os.path.normcase(os.path.abspath(mae)) + os.sep
    return f != m and f.startswith(m)


def pastas_cadastradas():
    return _le(PASTAS, {}).get("pastas", [])


def prefixo_para(pasta, existentes):
    """Prefixo curto e estável pro id: nome da pasta, com hash só se já houver outra igual."""
    base = (norm(os.path.basename(pasta.rstrip("\\/"))) or "pasta") + "-"
    if base not in existentes:
        return base
    import hashlib
    return base + hashlib.sha1(pasta.encode()).hexdigest()[:6] + "-"


def adicionar(pasta, origem="proprio"):
    """Cadastra a pasta e devolve a lista nova. ValueError se não existe ou já está lá."""
    pasta = os.path.abspath(pasta.strip().strip('"'))
    if not os.path.isdir(pasta):
        raise ValueError("pasta não encontrada no disco: %s" % pasta)
    if origem not in ORIGENS:
        raise ValueError("origem deve ser uma de: %s" % ", ".join(ORIGENS))
    lista = pastas_cadastradas()
    if any(_igual(p["pasta"], pasta) for p in lista):
        raise ValueError("essa pasta já está no catálogo")
    # Pasta dentro de pasta contaria o mesmo arquivo duas vezes (uma como original, outra
    # como "cópia" de si mesmo). A de fora vence: a de dentro sai da lista ao entrar a mãe.
    mae = next((p["pasta"] for p in lista if _dentro(pasta, p["pasta"])), None)
    if mae:
        raise ValueError("essa pasta já está coberta por %s" % mae)
    lista = [p for p in lista if not _dentro(p["pasta"], pasta)]
    lista.append({"pasta": pasta, "prefixo": prefixo_para(pasta, {p.get("prefixo") for p in lista}), "origem": origem})
    _grava(PASTAS, {"pastas": lista})
    return lista


def remover(pasta):
    lista = [p for p in pastas_cadastradas() if not _igual(p["pasta"], pasta)]
    _grava(PASTAS, {"pastas": lista})
    return lista


def _arquivos_de(pasta):
    out = []
    for raiz, dirs, arquivos in os.walk(pasta):
        dirs[:] = sorted(d for d in dirs if d not in PULAR_DIR)
        out += [os.path.join(raiz, f) for f in sorted(arquivos) if os.path.splitext(f)[1].lower() in EXTS]
    return out


def gerar(extra=None, progresso=None, com_lufs=False, saida=SAIDA):
    """Varre as pastas cadastradas (ou `extra`, mesmo formato do som_pastas.json), escreve
    som_catalog.json e devolve o total de itens. `progresso(pct)` é chamado por arquivo."""
    fontes = list(extra if extra is not None else pastas_cadastradas())
    plano = []
    for fonte in fontes:
        if not os.path.isdir(fonte["pasta"]):
            print("aviso: pasta cadastrada não existe mais:", fonte["pasta"], file=sys.stderr)
            continue
        plano += [(fonte, p) for p in _arquivos_de(fonte["pasta"])]

    cache = _le(CACHE, {})
    novo_cache, por_md5, lidos = {}, {}, 0
    for i, (fonte, p) in enumerate(plano):
        try:
            st = os.stat(p)
        except OSError:
            continue
        c = cache.get(p)
        if not (c and c["bytes"] == st.st_size and c["mtime"] == int(st.st_mtime)):
            lidos += 1
            print(f"[{i + 1}/{len(plano)}] {os.path.basename(p)}", file=sys.stderr)
            c = dict(bytes=st.st_size, mtime=int(st.st_mtime), md5=md5(p), lufs=None, **sonda(p))
        if com_lufs and c.get("lufs") is None:
            c["lufs"] = lufs(p)
        novo_cache[p] = c
        if lidos and lidos % 200 == 0:
            _grava(CACHE, {**cache, **novo_cache})   # varredura longa interrompida não recomeça do zero

        if c["md5"] in por_md5:
            por_md5[c["md5"]]["copias"].append(p)
        else:
            rel = os.path.relpath(p, fonte["pasta"])
            stem = os.path.splitext(rel)[0]
            por_md5[c["md5"]] = dict(
                id=(fonte.get("prefixo") or "") + norm(stem), titulo=os.path.basename(stem),
                caminho=p, fonte=fonte["pasta"], subpasta=os.path.dirname(rel).replace("\\", "/"),
                origem=fonte.get("origem", "proprio"), formato=os.path.splitext(p)[1][1:].lower(),
                # O nome da pasta cadastrada só classifica o que está SOLTO na raiz dela. Dentro de
                # subpasta quem fala é a subpasta: senão tudo em `sfx_music` virava "música".
                categorias=categorias(stem if os.path.dirname(rel) else os.path.basename(fonte["pasta"]) + " " + stem),
                tipo=tipo_por_duracao(c.get("dur_s")), copias=[],
                **{k: c.get(k) for k in ("bytes", "mtime", "md5", "dur_s", "sr", "canais", "kbps", "lufs")})
        if progresso:
            progresso((i + 1) / max(len(plano), 1) * 100)

    itens = sorted(por_md5.values(), key=lambda x: x["id"])
    vistos = {}
    for it in itens:                       # dois arquivos que normalizam pro mesmo id (a.wav e a.mp3)
        n = vistos[it["id"]] = vistos.get(it["id"], 0) + 1
        if n > 1:
            it["id"] = f"{it['id']}-{it['formato']}" if n == 2 else f"{it['id']}-{it['formato']}-{n}"
    _grava(CACHE, novo_cache)
    _grava(saida, dict(gerado_em=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                       gerador="backend/tools/som_catalog.py", fontes=fontes, total=len(itens), itens=itens))

    copias = sum(len(it["copias"]) for it in itens)
    cont = {}
    for it in itens:
        for c in it["categorias"]:
            cont[c] = cont.get(c, 0) + 1
    print(f"\n{len(plano)} arquivos em {len(fontes)} pasta(s) -> {len(itens)} únicos ({copias} cópias idênticas), {lidos} lidos agora")
    print("por categoria: " + "  ".join(f"{c} {n}" for c, n in sorted(cont.items(), key=lambda x: -x[1])))
    print("salvo:", os.path.abspath(saida))
    return len(itens)


def buscar(termo, saida=SAIDA):
    """Todas as palavras do termo têm que aparecer em id, título, subpasta ou categoria."""
    palavras = norm(termo).split("-")
    achados = []
    for it in _le(saida, {}).get("itens", []):
        alvo = " ".join([it["id"], norm(it["titulo"]), norm(it["subpasta"]), *map(norm, it["categorias"]), it["tipo"] or ""])
        if all(p in alvo for p in palavras):
            achados.append(it)
    return achados


def main():
    for s in (sys.stdout, sys.stderr):
        s.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Catálogo geral de som por pasta cadastrada.")
    ap.add_argument("--add", metavar="PASTA", help="cadastra a pasta e cataloga")
    ap.add_argument("--origem", default="proprio", choices=ORIGENS, help="de onde vem o som da pasta (com --add)")
    ap.add_argument("--remove", metavar="PASTA", help="tira a pasta e recataloga")
    ap.add_argument("--listar", action="store_true", help="mostra as pastas cadastradas")
    ap.add_argument("--buscar", metavar="TERMO", help="procura no catálogo já gerado")
    ap.add_argument("--lufs", action="store_true", help="mede loudness (lento na primeira vez)")
    a = ap.parse_args()

    if a.listar:
        for p in pastas_cadastradas():
            print(f"{p['origem']:8s} {p['prefixo']:28s} {p['pasta']}")
        return
    if a.buscar:
        achados = buscar(a.buscar)
        for it in achados[:60]:
            print(f"{it['dur_s'] or 0:8.1f}s  {it['tipo'] or '-':7s} {','.join(it['categorias']):28s} {it['caminho']}")
        print(f"{len(achados)} achado(s)" + (" (mostrando 60)" if len(achados) > 60 else ""))
        return
    try:
        if a.add:
            adicionar(a.add, a.origem)
        if a.remove:
            remover(a.remove)
    except ValueError as e:
        sys.exit("erro: %s" % e)
    gerar(com_lufs=a.lufs)


if __name__ == "__main__":
    main()
