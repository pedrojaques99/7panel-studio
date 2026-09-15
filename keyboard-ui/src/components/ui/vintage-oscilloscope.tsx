"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * VintageOscilloscope — o tubo, e os cinco programas que passam nele.
 *
 * ── De onde vieram os modos novos ──────────────────────────────────────────
 *
 * `scope`, `rings` e `grid` são porte direto do **7panel_studio**
 * (`Z:/Cursor/7panel_studio/keyboard-ui/src/lib/visualizers/scope.ts`,
 * `rings.ts` e `grid-vis.ts`), onde rodam no visualizador de teclado ao vivo.
 * `particles` e os modos de shader ficaram de fora de propósito: o primeiro
 * depende de `simplex-noise` e os outros de WebGL, e este item promete canvas 2D
 * sem dependência — trazer a lib junto mudaria o preço da peça.
 *
 * ── O que mudou no porte, e por quê ────────────────────────────────────────
 *
 * 1. **As bandas saem do tempo, não de uma FFT.** No 7panel um `AnalyserNode`
 *    entrega seis bandas prontas. Aqui a peça também aceita só um buffer de
 *    amostras, então grave/médio/agudo saem de dois passa-baixas de um polo em
 *    série — três somas por amostra, sem lib. Não é análise de espectro, é
 *    energia por faixa, que é tudo que um desenho reativo consome.
 * 2. **A matiz vem do token.** O original cravava `hsl(120…)`. Aqui a cor
 *    passada em `color` é resolvida pelo navegador (`getComputedStyle`) e vira
 *    a matiz base dos três modos — o fósforo continua sendo escolha de tema.
 * 3. **O laço para quando mandam parar.** `active={false}` desliga o rAF; o
 *    original rodava sempre porque vivia sozinho em tela cheia, e aqui a peça
 *    vive numa grade com uma dúzia de vizinhas.
 * 4. **`prefers-reduced-motion` desenha um quadro e sai.** Traço parado ainda
 *    diz o que a peça é; traço piscando não é negociável com quem pediu calma.
 */

export type VintageScopeMode = "wave" | "fft" | "scope" | "rings" | "grid";

export interface VintageScopeParams {
  /** Frequência base do traço sintético (modos `wave` e `scope`). */
  freq?: number;
  /** Halo em px. Zero deixa o traço seco, como tubo velho. */
  glow?: number;
  /** Quanto do quadro anterior sobra (modos com rastro). 0.02 = fantasma longo. */
  trail?: number;
}

interface VintageOscilloscopeProps {
  /**
   * Amostras. Em `wave`/`scope`/`rings`/`grid` são do domínio do tempo (−1…1);
   * em `fft`, magnitudes em dB, como o modo sempre leu.
   */
  data?: Float32Array | number[];
  /**
   * Fonte ao vivo. Quando vem, manda no `data`: a peça lê o buffer a cada
   * quadro e não passa por estado do React — sessenta `setState` por segundo
   * repintariam a árvore inteira pra mexer um pixel.
   */
  analyser?: AnalyserNode | null;
  mode?: VintageScopeMode;
  params?: VintageScopeParams;
  color?: string;
  /** Largura natural do desenho. Com `fill`, vira só o piso do buffer. */
  width?: number;
  height?: number;
  /** Ocupa o pai inteiro em vez de `width`×`height`. É como a TV o encaixa. */
  fill?: boolean;
  /** Moldura, scanlines e rótulo do modo. Desligue quando o tubo já é do pai. */
  chrome?: boolean;
  /** Relógio. `false` congela o desenho — use com o palco fora da tela. */
  active?: boolean;
  className?: string;
}

/** Energia por faixa. É o mínimo que os desenhos portados consomem. */
interface Bandas {
  bass: number;
  mid: number;
  high: number;
  volume: number;
  kick: boolean;
  snare: boolean;
  hat: boolean;
}

const BANDAS_ZERO: Bandas = {
  bass: 0,
  mid: 0,
  high: 0,
  volume: 0,
  kick: false,
  snare: false,
  hat: false,
};

/** Estado que sobrevive entre quadros. Um por instância, guardado em ref. */
interface Estado {
  fase: number;
  historico: Float32Array[];
  flash: number;
  aneis: {
    raio: number;
    raioMax: number;
    alfa: number;
    matiz: number;
    largura: number;
    passo: number;
  }[];
  colunas: Float32Array;
  t: number;
  varreduraInvertida: boolean;
  histBass: number[];
  histMid: number[];
  histHigh: number[];
  esperaKick: number;
  esperaSnare: number;
  esperaHat: number;
  lp1: number;
  lp2: number;
}

function estadoNovo(): Estado {
  return {
    fase: 0,
    historico: [],
    flash: 0,
    aneis: [],
    colunas: new Float32Array(32),
    t: 0,
    varreduraInvertida: false,
    histBass: [],
    histMid: [],
    histHigh: [],
    esperaKick: 0,
    esperaSnare: 0,
    esperaHat: 0,
    lp1: 0,
    lp2: 0,
  };
}

/**
 * Bandas a partir do domínio do tempo.
 *
 * Dois passa-baixas de um polo em série (0.06 e 0.28 de coeficiente, ~ 300 Hz e
 * ~ 2 kHz a 44,1 kHz): o primeiro isola o grave, a diferença entre os dois é o
 * médio e o que sobra do sinal cru é o agudo. É o divisor de três vias mais
 * barato que existe, e como só interessa a ENERGIA de cada faixa, a fase torta
 * que ele produz não aparece no desenho.
 */
function lerBandas(amostras: ArrayLike<number>, st: Estado): Bandas {
  const n = amostras.length;
  if (n === 0) return BANDAS_ZERO;

  let somaB = 0;
  let somaM = 0;
  let somaA = 0;
  let somaV = 0;
  let lp1 = st.lp1;
  let lp2 = st.lp2;

  for (let i = 0; i < n; i++) {
    const x = amostras[i];
    lp1 += (x - lp1) * 0.06;
    lp2 += (x - lp2) * 0.28;
    const m = lp2 - lp1;
    const a = x - lp2;
    somaB += lp1 * lp1;
    somaM += m * m;
    somaA += a * a;
    somaV += x * x;
  }
  st.lp1 = lp1;
  st.lp2 = lp2;

  // O grave sai do passa-baixa com amplitude bem menor que o sinal; os fatores
  // só recolocam as três faixas na mesma régua de 0…1.
  const bass = Math.min(1, Math.sqrt(somaB / n) * 3.2);
  const mid = Math.min(1, Math.sqrt(somaM / n) * 2.6);
  const high = Math.min(1, Math.sqrt(somaA / n) * 2.2);
  const volume = Math.min(1, Math.sqrt(somaV / n) * 1.8);

  const media = (arr: number[]) => {
    if (arr.length === 0) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  };
  const empurra = (arr: number[], v: number) => {
    arr.push(v);
    if (arr.length > 20) arr.shift();
  };
  empurra(st.histBass, bass);
  empurra(st.histMid, mid);
  empurra(st.histHigh, high);

  st.esperaKick = Math.max(0, st.esperaKick - 1);
  st.esperaSnare = Math.max(0, st.esperaSnare - 1);
  st.esperaHat = Math.max(0, st.esperaHat - 1);

  let kick = false;
  let snare = false;
  let hat = false;
  // Batida é energia acima da própria média recente, e não acima de um limiar
  // fixo: com limiar fixo a peça só reage a sinal alto, e um sinal baixo vira
  // desenho morto em vez de desenho discreto.
  if (st.esperaKick <= 0 && bass > media(st.histBass) * 1.4 && bass > 0.12) {
    kick = true;
    st.esperaKick = 8;
  }
  if (st.esperaSnare <= 0 && mid > media(st.histMid) * 1.3 && mid > 0.08) {
    snare = true;
    st.esperaSnare = 5;
  }
  if (st.esperaHat <= 0 && high > media(st.histHigh) * 1.3 && high > 0.06) {
    hat = true;
    st.esperaHat = 3;
  }

  return { bass, mid, high, volume, kick, snare, hat };
}

/** A matiz do fósforo, resolvida do token. Cai no verde de tubo se falhar. */
function matizDe(el: HTMLElement | null): number {
  if (!el || typeof window === "undefined") return 120;
  const cor = getComputedStyle(el).color;
  const m = cor.match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 3) return 120;
  const r = Number(m[0]) / 255;
  const g = Number(m[1]) / 255;
  const b = Number(m[2]) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 120;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function grade(ctx: CanvasRenderingContext2D, w: number, h: number, matiz: number) {
  ctx.strokeStyle = `hsla(${matiz}, 50%, 40%, 0.09)`;
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 8; i++) {
    const x = (w / 8) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// ── Modo `wave` — o traço original, sem rastro ────────────────────────────────

function desenharWave(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amostras: ArrayLike<number> | null,
  cor: string,
  p: VintageScopeParams,
) {
  ctx.fillStyle = "rgba(8,10,7,0.92)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const x = (w / 8) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = cor;
  ctx.shadowColor = cor;
  ctx.shadowBlur = p.glow ?? 8;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (!amostras || amostras.length === 0) {
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
  } else {
    for (let i = 0; i < amostras.length; i++) {
      const x = (i / (amostras.length - 1)) * w;
      const y = h / 2 - amostras[i] * (h / 2) * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Modo `fft` — barras log, como já era ──────────────────────────────────────

function desenharFft(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amostras: ArrayLike<number> | null,
  cor: string,
) {
  ctx.fillStyle = "rgba(8,10,7,0.92)";
  ctx.fillRect(0, 0, w, h);
  if (!amostras || amostras.length === 0) return;
  const barras = Math.min(amostras.length / 2, 128);
  ctx.fillStyle = cor;
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < barras; i++) {
    const logI = Math.pow(i / barras, 2) * (amostras.length / 2);
    const idx = Math.min(Math.floor(logI), amostras.length - 1);
    const norm = Math.max(0, Math.min(1, (amostras[idx] + 100) / 100));
    const bw = w / barras;
    ctx.fillRect(i * bw, h - norm * h, bw - 1, norm * h);
  }
  ctx.globalAlpha = 1;
}

// ── Modo `scope` — porte de 7panel_studio/.../visualizers/scope.ts ────────────

function desenharScope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amostras: ArrayLike<number> | null,
  b: Bandas,
  matiz: number,
  p: VintageScopeParams,
  st: Estado,
) {
  const trail = p.trail ?? 0.15;
  const glow = p.glow ?? 8;
  const maxHist = 8;

  if (b.kick) st.flash = 1;
  st.flash *= 0.85;

  // Apagamento parcial: é o rastro. Na batida ele apaga menos, e a sobra do
  // quadro anterior vira o "borrão" que um tubo de fósforo lento faz sozinho.
  ctx.fillStyle = `hsla(${matiz}, 40%, 3%, ${trail * (1 - st.flash * 0.6)})`;
  ctx.fillRect(0, 0, w, h);
  grade(ctx, w, h, matiz);

  const cy = h / 2;
  const passos = Math.max(2, Math.floor(w));
  const freq = (p.freq ?? 2) + b.mid * 6;
  st.fase += 0.02 + b.bass * 0.08;
  const amp = 0.3 + b.volume * 0.7;

  const pts = new Float32Array(passos);
  for (let i = 0; i < passos; i++) {
    const x = i / passos;
    if (amostras && amostras.length > 0) {
      const src = x * (amostras.length - 1);
      const lo = Math.floor(src);
      const hi = Math.min(lo + 1, amostras.length - 1);
      const f = src - lo;
      pts[i] = amostras[lo] * (1 - f) + amostras[hi] * f;
    } else {
      // Sem sinal o tubo não fica reto: gera o próprio programa, senão a peça
      // parada lê como peça quebrada.
      let y = Math.sin(x * Math.PI * 2 * freq + st.fase) * amp;
      y += Math.sin(x * Math.PI * 2 * freq * 2.01 + st.fase * 1.5) * amp * 0.3;
      y += Math.cos(x * Math.PI * 2 * 0.5 + st.fase * 0.3) * amp * 0.5;
      pts[i] = y;
    }
  }

  st.historico.push(pts);
  if (st.historico.length > maxHist) st.historico.shift();

  for (let hi = 0; hi < st.historico.length; hi++) {
    const idade = (hi + 1) / st.historico.length;
    ctx.strokeStyle = `hsla(${matiz}, 80%, 65%, ${idade * 0.15})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    const linha = st.historico[hi];
    for (let i = 0; i < linha.length; i++) {
      const x = (i / (linha.length - 1)) * w;
      const y = cy - linha[i] * (h * 0.45);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const kick = st.flash;
  ctx.strokeStyle = `hsla(${matiz}, 80%, ${65 + kick * 30}%, ${0.75 + b.volume * 0.25})`;
  ctx.lineWidth = 1.5 + b.bass * 2 + kick * 3;
  ctx.shadowColor = `hsla(${matiz}, 80%, 70%, ${0.8 + (b.snare ? 0.2 : 0)})`;
  ctx.shadowBlur = glow + b.volume * 12 + (b.snare ? 20 : 0) + kick * 15;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = (i / (pts.length - 1)) * w;
    const y = cy - pts[i] * (h * 0.45);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = `hsla(${matiz}, 80%, 65%, 0.06)`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
}

// ── Modo `rings` — porte de 7panel_studio/.../visualizers/rings.ts ────────────

function desenharRings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  b: Bandas,
  matiz: number,
  p: VintageScopeParams,
  st: Estado,
) {
  st.t += 0.016;
  ctx.fillStyle = `hsla(${matiz}, 30%, 3%, ${0.1 + b.volume * 0.05})`;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.45;

  if (b.kick) {
    st.aneis.push({
      raio: 5,
      raioMax: maxR * 0.95,
      alfa: 0.9,
      matiz: (matiz + st.t * 20) % 360,
      largura: 3 + b.bass * 4,
      passo: 3 + b.bass * 4,
    });
  }
  if (b.snare) {
    st.aneis.push({
      raio: 8,
      raioMax: maxR * 0.6,
      alfa: 0.6,
      matiz: (matiz + 40 + st.t * 30) % 360,
      largura: 1.5 + b.mid * 2,
      passo: 3,
    });
  }
  if (b.hat) {
    for (let i = 0; i < 3; i++) {
      st.aneis.push({
        raio: 3,
        raioMax: maxR * (0.2 + Math.random() * 0.2),
        alfa: 0.4,
        matiz: (matiz - 30 + i * 20) % 360,
        largura: 0.5,
        passo: 4 + Math.random() * 3,
      });
    }
  }
  // Rega ambiente: sem ela um sinal calmo deixa a tela vazia, e vazia lê como
  // desligada. O original tinha a mesma válvula, pela mesma razão.
  if (st.aneis.length < 3 && Math.random() < 0.08) {
    st.aneis.push({
      raio: 2,
      raioMax: maxR * 0.5,
      alfa: 0.25,
      matiz,
      largura: 1,
      passo: 1.5,
    });
  }

  for (let i = st.aneis.length - 1; i >= 0; i--) {
    const r = st.aneis[i];
    r.raio += r.passo;
    const idade = r.raio / r.raioMax;
    const a = r.alfa * (1 - idade * idade);
    if (a > 0.01 && r.raio < r.raioMax) {
      ctx.beginPath();
      ctx.arc(cx, cy, r.raio, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${r.matiz}, 70%, 60%, ${a})`;
      ctx.lineWidth = r.largura * (1 - idade * 0.5);
      ctx.shadowColor = `hsla(${r.matiz}, 80%, 70%, ${a * 0.5})`;
      ctx.shadowBlur = (p.glow ?? 6) + b.volume * 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (r.raio >= r.raioMax) st.aneis.splice(i, 1);
  }
  if (st.aneis.length > 40) st.aneis.splice(0, st.aneis.length - 40);

  // Arcos girando por banda: é o que dá leitura de "medidor" ao anel, senão
  // seria só água na poça.
  const faixas = [b.bass, b.mid, b.high, b.volume, b.bass, b.mid];
  for (let i = 0; i < faixas.length; i++) {
    const ang = (i / faixas.length) * Math.PI * 2 + st.t * 0.5;
    const v = faixas[i];
    const r = maxR * 0.62 + v * maxR * 0.32;
    ctx.beginPath();
    ctx.arc(cx, cy, r, ang, ang + 0.3 + v * 0.4);
    ctx.strokeStyle = `hsla(${(matiz + i * 12) % 360}, 60%, 58%, ${0.12 + v * 0.35})`;
    ctx.lineWidth = 1 + v * 2;
    ctx.stroke();
  }
}

// ── Modo `grid` — porte de 7panel_studio/.../visualizers/grid-vis.ts ──────────

function desenharGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amostras: ArrayLike<number> | null,
  b: Bandas,
  matiz: number,
  st: Estado,
) {
  if (b.kick) st.flash = 1;
  if (b.snare) st.varreduraInvertida = !st.varreduraInvertida;
  st.flash *= 0.88;
  st.t += 0.016;

  ctx.fillStyle = `hsla(${matiz}, 35%, 4%, 1)`;
  ctx.fillRect(0, 0, w, h);

  const cols = Math.max(8, Math.min(40, Math.round(w / 14)));
  const rows = Math.max(4, Math.min(20, Math.round(h / 12)));
  if (st.colunas.length !== cols) st.colunas = new Float32Array(cols);

  const vao = 2;
  const cw = (w - vao * (cols + 1)) / cols;
  const ch = (h - vao * (rows + 1)) / rows;
  const faixas = [b.bass, b.bass, b.mid, b.mid, b.high, b.high, b.volume];

  // Energia por coluna vinda da onda: é o que faz a grade "andar" com o sinal
  // em vez de pulsar em bloco.
  const energia = new Float32Array(cols);
  if (amostras && amostras.length > 0) {
    const razao = amostras.length / cols;
    for (let c = 0; c < cols; c++) {
      const lo = Math.floor(c * razao);
      const hi = Math.min(Math.floor((c + 1) * razao), amostras.length);
      let s = 0;
      for (let j = lo; j < hi; j++) s += Math.abs(amostras[j]);
      energia[c] = hi > lo ? (s / (hi - lo)) * 2 : 0;
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = vao + c * (cw + vao);
      const y = vao + r * (ch + vao);
      const idx = Math.floor((c / cols) * faixas.length);
      const faixa = faixas[Math.min(idx, faixas.length - 1)];
      const fatorLinha = 1 - Math.abs(r - rows / 2) / (rows / 2);
      const alvo = faixa * 0.4 + energia[c] * 0.6;
      st.colunas[c] += (alvo - st.colunas[c]) * 0.3;
      const v = Math.max(0, st.colunas[c] * fatorLinha);

      const escala = 0.3 + Math.min(1, v) * 0.7;
      const dh = ch * escala;
      const dy = y + (ch - dh) / 2;
      const mt = (matiz + idx * 8 + st.t * 6) % 360;
      ctx.fillStyle = `hsla(${mt}, ${50 + v * 30}%, ${32 + v * 40}%, ${0.35 + v * 0.65})`;
      ctx.fillRect(x, dy, cw, dh);
    }
  }

  if (st.flash > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${st.flash * 0.1})`;
    ctx.fillRect(0, 0, w, h);
  }

  const dir = st.varreduraInvertida ? -1 : 1;
  const span = w + 40;
  const sx = ((((st.t * 80 * dir + b.bass * 200) % span) + span) % span) - 20;
  ctx.fillStyle = `rgba(255,255,255,${0.02 + b.volume * 0.03})`;
  ctx.fillRect(sx - 2, 0, 4, h);
}

const ROTULO: Record<VintageScopeMode, string> = {
  wave: "WAVE",
  fft: "FFT",
  scope: "SCOPE",
  rings: "RINGS",
  grid: "GRID",
};

export function VintageOscilloscope({
  data,
  analyser,
  mode = "wave",
  params,
  color = "var(--vintage-meter-green)",
  width = 320,
  height = 120,
  fill = false,
  chrome = true,
  active = true,
  className,
}: VintageOscilloscopeProps) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rafRef = React.useRef(0);
  const estadoRef = React.useRef<Estado>(estadoNovo());
  // `Float32Array<ArrayBuffer>` e não `Float32Array` solto: desde o TS 5.7 o
  // tipo é genérico no buffer, e `getFloatTimeDomainData` recusa o que puder
  // ser `SharedArrayBuffer`.
  const bufRef = React.useRef<Float32Array<ArrayBuffer> | null>(null);

  // Props lidas dentro do laço de desenho: guardá-las em ref é o que impede o
  // rAF de ser desmontado e remontado a cada quadro de um pai que rerenderiza.
  const vivo = React.useRef({ data, analyser, mode, params, color });
  vivo.current = { data, analyser, mode, params, color };

  React.useEffect(() => {
    estadoRef.current = estadoNovo();
  }, [mode]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;

    let calmo = false;
    try {
      calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      calmo = false;
    }

    let rodando = true;
    let larguraCss = 0;
    let alturaCss = 0;

    const dimensionar = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = fill ? Math.max(1, Math.round(box.clientWidth)) : width;
      const chh = fill ? Math.max(1, Math.round(box.clientHeight)) : height;
      if (cw === larguraCss && chh === alturaCss) return false;
      larguraCss = cw;
      alturaCss = chh;
      // Mexer em `canvas.width` limpa o buffer, então só na mudança de tamanho:
      // fazer isso todo quadro apagaria justamente o rastro dos modos com cauda.
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(chh * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${chh}px`;
      return true;
    };

    const quadro = () => {
      if (!rodando) return;
      dimensionar();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const { data: d, analyser: an, mode: m, params: p, color: c } = vivo.current;
      const st = estadoRef.current;
      const matiz = matizDe(box);
      const cor = getComputedStyle(box).color || c;

      let amostras: ArrayLike<number> | null = null;
      if (an) {
        if (!bufRef.current || bufRef.current.length !== an.fftSize) {
          bufRef.current = new Float32Array(an.fftSize);
        }
        an.getFloatTimeDomainData(bufRef.current);
        amostras = bufRef.current;
      } else if (d && d.length > 0) {
        amostras = d;
      }

      const w = larguraCss;
      const h = alturaCss;
      const pp = p ?? {};

      if (m === "fft") {
        desenharFft(ctx, w, h, amostras, cor);
      } else if (m === "wave") {
        desenharWave(ctx, w, h, amostras, cor, pp);
      } else {
        const b = amostras ? lerBandas(amostras, st) : BANDAS_ZERO;
        if (m === "scope") desenharScope(ctx, w, h, amostras, b, matiz, pp, st);
        else if (m === "rings") desenharRings(ctx, w, h, b, matiz, pp, st);
        else desenharGrid(ctx, w, h, amostras, b, matiz, st);
      }

      // Parado ainda desenha UM quadro: card fora da tela com tubo em branco lê
      // como peça quebrada, e o que se quer economizar é o laço, não a imagem.
      if (calmo || !active) return;
      rafRef.current = requestAnimationFrame(quadro);
    };

    quadro();

    const ro = fill && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (!active || calmo) quadro();
    }) : null;
    ro?.observe(box);

    return () => {
      rodando = false;
      cancelAnimationFrame(rafRef.current);
      ro?.disconnect();
    };
  }, [active, fill, width, height]);

  return (
    <div
      ref={boxRef}
      className={cn("relative overflow-hidden", chrome && "rounded-lg", fill ? "block h-full w-full" : "inline-block", className)}
      // `color` no contêiner e não no canvas: é daqui que a matiz do fósforo é
      // resolvida, e é o que mantém a cor sendo token em vez de hex no JS.
      style={{
        color,
        background: "#080a07",
        border: chrome ? "1px solid var(--vintage-border)" : undefined,
        boxShadow: chrome
          ? "inset 0 0 20px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.3)"
          : undefined,
        width: fill ? undefined : width,
        height: fill ? undefined : height,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />

      {chrome && (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-lg"
            style={{ boxShadow: "inset 0 0 30px rgba(0,0,0,0.4)" }}
          />
          <div
            className="pointer-events-none absolute right-2 top-1.5 text-[9px] font-bold uppercase tracking-wider"
            style={{
              // Era `opacity: 0.5`, que sobre o fundo do tubo dá 2,9:1 — abaixo
              // do piso de 3:1 pra texto. Em 0,9 o rótulo continua discreto
              // (é fósforo apagando) e passa.
              color: "currentColor",
              opacity: 0.9,
              fontFamily: "var(--font-vintage-mono, monospace)",
              textShadow: "0 0 4px currentColor",
            }}
          >
            {ROTULO[mode]}
          </div>
        </>
      )}
    </div>
  );
}
