"""Catálogo único de ambiências (cave, wind, bird, rain...) espalhadas pelos projetos.

As mesmas camas existem em até 5 lugares, cada um com sua lista parcial e esquema próprio:
  7panel backend/assets (ambients, ps_, mp3, VHULTO TEXTURE, dirt/*)
  auto-video-editor-ai scripts/.render-assets (ambient, ambient-new, ambient-compressed, morning/afternoon/night)
  liminal-stage public/audio + R2 via worker (src/stage/ambients.ts, ganhos/loop em ambientMix.ts)
  Jacão Ambients raw_records (gravações próprias), _tratados, assets/ambiencia-limpa
Este script varre tudo, junta cópia idêntica (md5) numa entrada, agrupa variante do mesmo nome
(ex.: cave.mp3 original x comprimido x R2 mono), mede e classifica. Não move nem copia arquivo.

    python backend/tools/ambient_catalog.py                 -> backend/assets/ambients_catalog.json
    python backend/tools/ambient_catalog.py --sem-lufs      (rápido, pula a medição de loudness)
"""
import argparse, hashlib, json, os, re, subprocess, sys, unicodedata, urllib.parse
from datetime import datetime, timezone

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "..", "assets", "ambients_catalog.json")
EXTS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".opus", ".aac"}

P7 = r"Z:\Cursor\7panel_studio\backend\assets"
AVE = r"Z:\Cursor\auto-video-editor-ai\scripts\.render-assets"
LIM = r"Z:\Cursor\liminal-stage"
JAC = r"Z:\jaques.dsgn\sfx_music\Jacão Ambients"

# (pasta, origem, recursivo). Só pasta de AMBIÊNCIA: narração, beds de música, one-shots e drones musicais ficam de fora.
FONTES = [
    (rf"{P7}\ambients", "web", True),
    (rf"{P7}\ps_", "web", False),
    (rf"{P7}\samples\- VHULTO SAMPLING THE WORLD DRUMKIT -\TEXTURE", "pack", False),
    *[(rf"{P7}\samples\dirt\{d}", "pack", False) for d in ("wind", "birds", "birds3", "outdoor", "insect", "fire")],
    (rf"{AVE}\ambient", "web", True),
    (rf"{AVE}\ambient-new", "web", False),
    (rf"{AVE}\ambient-compressed", "web", False),
    (rf"{LIM}\public\audio", "web", False),
    (rf"{JAC}\raw_records", "proprio", True),
    (rf"{JAC}\assets\ambiencia-limpa", "proprio", False),
]
# arquivos soltos que são ambiência
AVULSOS = [
    (rf"{P7}\mp3\Gentle Woodland Stream and Birdsong.mp3", "web"),
    (rf"{P7}\mp3\enchanted-forest.mp3", "web"),
    (rf"{P7}\mp3\wint-before-rain.mp3", "web"),
    (rf"{P7}\Bairro e Passarinho - Smoking.m4a", "proprio"),
    (rf"{JAC}\era - eno 2\Chuva trovao na telha.m4a", "proprio"),
]
# liminal: beds de música e one-shots | raw_records: memes/notificação que moram junto das gravações
FORA = re.compile(r"worlds|\\sfx\\|dread\.mp3|byd-nooo|discord-nofications|trevor-e-ai-bombado", re.I)

# R2 da conta do auto-video-editor, listado com `aws s3 ls` em 2026-09-14. Nada ali é exclusivo: são
# cópias comprimidas/normalizadas das camas locais, então entram como VARIANTE remota do mesmo id.
# Só `bible-radio/radio/*` tem URL pública conhecida (a do SoundboardPanel); o resto fica como chave s3://.
R2_PUBLICO = {"bible-radio/radio/": "https://pub-a34407c2e9b94158b151491b952e7441.r2.dev/radio/"}
_POOL = ["Emaús 33 dC", "aether", "birds-2", "brown-noise", "cave", "distant-thunder", "fireplace",
         "forest-rain", "library", "morning-birds", "vinyl-crackle", "wheat-breeze"]
R2_CHAVES = (
    [f"bible-radio/radio/ambient/pool/{n}.mp3" for n in _POOL]
    + [f"bible-radio/radio-normalized/ambient/pool/{n}.mp3" for n in _POOL]
    + ["bible-radio/radio-normalized/ambient/afternoon/FX - BIRDS.mp3",
       "bible-radio/radio-normalized/ambient/morning/Birds.mp3",
       "bible-radio/radio-normalized/ambient/morning/Gentle Woodland Stream and Birdsong.mp3",
       "bible-radio/radio-normalized/ambient/night/enchanted-forest.mp3",
       "bible-radio/radio-normalized/ambient/rain/wint-before-rain.mp3",
       "auto-video-editor/radio/ambient/afternoon/FX - BIRDS.wav",
       "auto-video-editor/radio/ambient/morning/Birds.m4a",
       "auto-video-editor/radio/ambient/morning/Gentle Woodland Stream and Birdsong.mp3",
       "auto-video-editor/radio/ambient/night/enchanted-forest.mp3",
       "auto-video-editor/radio/ambient/rain/wint-before-rain.mp3"]
)


def r2_variantes():
    """id normalizado -> [variante remota]. URL pública quando o prefixo tem uma; senão s3://bucket/chave."""
    out = {}
    for k in R2_CHAVES:
        pub = next((base + k[len(pre):] for pre, base in R2_PUBLICO.items() if k.startswith(pre)), None)
        v = dict(formato=os.path.splitext(k)[1][1:], remoto="r2-" + k.split("/")[0])
        v.update(url=urllib.parse.quote(pub, safe=":/") if pub else None, chave=None if pub else f"s3://{k}")
        out.setdefault(norm(os.path.splitext(os.path.basename(k))[0]), []).append(v)
    return out

CATEGORIAS = [  # ordem importa só pra exibição; um item pode ter várias
    ("chuva", r"chuva|rain|storm|trov|thunder|calha|telha|toldo"),
    ("vento", r"vento|wind|breeze|brisa|costa"),
    ("passaros", r"passar|bird|bem te vi|hawk|crow|birdsong"),
    ("caverna", r"cave|caverna"),
    ("fogo", r"fire|fogo|fireplace|isqueiro"),
    ("agua", r"water|stream|river|rio|mar|ocean|costa"),
    ("floresta", r"forest|bosque|woodland|amazon|mata|enchanted|nature"),
    ("noite", r"night|noite|grilo|cricket|insect"),
    ("cidade", r"rua |rua$|bairro|cidade|city|mercearia|aeroporto|ubs|universidade|dogs|outdoor"),
    ("interior", r"library|room|sala|asmr|rasgando|rolling"),
    ("ruido", r"brown|noise|ruido|mechatronic"),
    ("textura", r"vinyl|crackle|vhs|tape|fita|texture"),
]


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def md5(p, bloco=1 << 20):
    h = hashlib.md5()
    with open(p, "rb") as f:
        while b := f.read(bloco):
            h.update(b)
    return h.hexdigest()


def sonda(alvo):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                        "stream=sample_rate,channels,bit_rate:format=duration,bit_rate", "-of", "json", alvo],
                       capture_output=True, text=True, encoding="utf-8", errors="ignore")
    try:
        j = json.loads(r.stdout); st = (j.get("streams") or [{}])[0]; fm = j.get("format", {})
        br = st.get("bit_rate") or fm.get("bit_rate")
        return dict(dur_s=round(float(fm.get("duration", 0)), 2), sr=int(st.get("sample_rate", 0)),
                    canais=int(st.get("channels", 0)), kbps=int(int(br) / 1000) if br else None)
    except Exception:
        return dict(dur_s=None, sr=None, canais=None, kbps=None)


def lufs(alvo, max_s=180):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-t", str(max_s), "-i", alvo, "-map", "a:0",
                        "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    return float(m[-1]) if m else None


def categorias(nome):
    n = nome.lower()
    return [c for c, rx in CATEGORIAS if re.search(rx, n)] or ["outro"]


def liminal_remotos():
    """Lê ambients.ts (id, título, url) e ambientMix.ts (ganho, head, end) do liminal-stage."""
    out = {}
    try:
        ts = open(rf"{LIM}\src\stage\ambients.ts", encoding="utf-8").read()
        base = re.search(r"const W = '([^']+)'", ts).group(1)
        for m in re.finditer(r"\{\s*id:\s*'([^']+)',\s*title:\s*'([^']+)'(.*?)url:\s*`\$\{W\}/([^`]+)`", ts, re.S):
            out[m.group(1)] = dict(titulo=m.group(2), url=f"{base}/{m.group(4)}", seamless="seamless: true" in m.group(3))
        mix = open(rf"{LIM}\src\stage\ambientMix.ts", encoding="utf-8").read()
        for m in re.finditer(r'"([^"]+)":\s*\{\s*"gain":\s*([\d.]+),\s*"head":\s*([\d.]+),\s*"end":\s*([\d.]+)', mix):
            if m.group(1) in out:
                out[m.group(1)]["loop"] = dict(gain=float(m.group(2)), head=float(m.group(3)), end=float(m.group(4)))
    except Exception as e:
        print("aviso: liminal não lido:", e, file=sys.stderr)
    return out


def medidas_jacao():
    """voz/evento/oscila do catalogo-geral.json (ambiencias.py), por nome de arquivo."""
    try:
        j = json.load(open(rf"{JAC}\_prod\_tools\catalogo-geral.json", encoding="utf-8"))
        return {d["arquivo"].lower(): dict(voz=d.get("voz"), evento=d.get("evento"), oscila_db=d.get("oscila_db"),
                                           veredito=d.get("amb"), uso=d.get("uso")) for d in j}
    except Exception:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem-lufs", action="store_true")
    ap.add_argument("-o", "--out", default=SAIDA)
    a = ap.parse_args()

    achados = []
    for pasta, origem, rec in FONTES:
        if not os.path.isdir(pasta):
            print("aviso: não existe", pasta, file=sys.stderr); continue
        for raiz, _, arqs in (os.walk(pasta) if rec else [(pasta, [], os.listdir(pasta))]):
            for f in arqs:
                p = os.path.join(raiz, f)
                if os.path.isfile(p) and os.path.splitext(f)[1].lower() in EXTS and not FORA.search(p):
                    achados.append((p, origem))
    achados += [(p, o) for p, o in AVULSOS if os.path.isfile(p)]

    med = medidas_jacao()
    por_md5 = {}
    for i, (p, origem) in enumerate(achados, 1):
        print(f"[{i}/{len(achados)}] {os.path.basename(p)}", file=sys.stderr)
        h = md5(p)
        if h in por_md5:
            por_md5[h]["copias"].append(p); continue
        v = dict(caminho=p, formato=os.path.splitext(p)[1][1:].lower(), bytes=os.path.getsize(p), md5=h, copias=[], **sonda(p))
        v["lufs"] = None if a.sem_lufs else lufs(p)
        v["_origem"] = origem
        v["_medidas"] = med.get(os.path.basename(p).lower())
        por_md5[h] = v

    # agrupa variantes pelo nome normalizado (cave.mp3 original x comprimido x ambient-new).
    # Pack tem nome genérico que repete entre pastas (dirt/birds/000_1 x dirt/birds3/000_1): prefixa a pasta.
    def chave_de(v):
        stem = norm(os.path.splitext(os.path.basename(v["caminho"]))[0])
        return f"{norm(os.path.basename(os.path.dirname(v['caminho'])))}-{stem}" if v["_origem"] == "pack" else stem

    grupos = {}
    for v in por_md5.values():
        grupos.setdefault(chave_de(v), []).append(v)

    remotos = liminal_remotos()
    r2 = r2_variantes()
    itens = []
    for chave, vs in sorted(grupos.items()):
        vs.sort(key=lambda v: (-(v["kbps"] or 0) * (v["dur_s"] or 0)))      # principal = mais informação
        principal = vs[0]
        # o mesmo conteúdo pode ter nomes diferentes em cada projeto (cópia renomeada): todo nome de
        # cópia vira apelido, e o remoto (liminal/R2) casa com qualquer um deles, não só com o id
        apelidos = [chave] + sorted({chave_de(dict(caminho=c, _origem=v["_origem"]))   # mesma regra do id: pack prefixa a pasta
                                     for v in vs for c in [v["caminho"], *v["copias"]]} - {chave})
        rem = next((remotos.pop(s) for s in apelidos if s in remotos), None)
        variantes = [{k: x for k, x in v.items() if not k.startswith("_")} for v in vs]
        if rem:
            variantes.append(dict(url=rem["url"], formato="mp3", remoto="r2-liminal"))
        for s in apelidos:
            variantes += r2.pop(s, [])
        nome = os.path.splitext(os.path.basename(principal["caminho"]))[0]
        pasta = os.path.basename(os.path.dirname(principal["caminho"]))
        if principal["_origem"] == "pack":
            nome = f"{pasta}/{nome}"
        # a pasta entra na classificação: sample de pack chama `000_1.wav`, quem diz o que é é `dirt/birds`
        cats = categorias(" ".join({nome, pasta, (rem or {}).get("titulo") or ""}))
        itens.append(dict(
            id=chave, apelidos=apelidos[1:], titulo=(rem or {}).get("titulo") or nome, categorias=cats,
            origem="proprio" if any(v["_origem"] == "proprio" for v in vs) else principal["_origem"],
            principal=variantes[0], variantes=variantes[1:], loop=(rem or {}).get("loop"),
            medidas=next((v["_medidas"] for v in vs if v["_medidas"]), None)))
    for chave, rem in remotos.items():   # só existe no R2 (ex.: costa gerada, chuva-leve)
        itens.append(dict(id=chave, titulo=rem["titulo"], categorias=categorias(chave + " " + rem["titulo"]),
                          origem="gerado" if rem.get("seamless") else "web",
                          principal=dict(url=rem["url"], formato="mp3", remoto="r2-liminal"),
                          variantes=[], loop=rem.get("loop"), medidas=None))

    doc = dict(gerado_em=datetime.now(timezone.utc).isoformat(timespec="seconds"),
               gerador="backend/tools/ambient_catalog.py",
               r2_sem_local=sorted(r2),   # chave remota sem arquivo local de mesmo nome (esperado: vazio)
               total=len(itens), itens=itens)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(doc, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    cont = {}
    for it in itens:
        for c in it["categorias"]:
            cont[c] = cont.get(c, 0) + 1
    copias = sum(len(v["copias"]) for it in itens for v in [it["principal"], *it["variantes"]] if "copias" in v)
    print(f"\n{len(achados)} arquivos -> {len(por_md5)} únicos (md5) -> {len(itens)} ambiências ({copias} cópias idênticas agrupadas)")
    print("por categoria: " + "  ".join(f"{c} {n}" for c, n in sorted(cont.items(), key=lambda x: -x[1])))
    print("por origem:    " + "  ".join(f"{o} {sum(1 for it in itens if it['origem'] == o)}" for o in ("proprio", "web", "pack", "gerado")))
    print("salvo:", os.path.abspath(a.out))


if __name__ == "__main__":
    main()
