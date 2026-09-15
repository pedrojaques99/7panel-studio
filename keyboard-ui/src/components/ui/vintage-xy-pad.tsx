"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * VintageXYPad — dois parâmetros num gesto só.
 *
 * O que estava errado ("faz alterar algo"): a peça já emitia `onChange`, mas
 * ninguém do lado de fora escutava, então na vitrine ela era um ponto que
 * andava dentro de uma caixa. O conserto de verdade é a cena — o pad ligado a
 * um tubo que muda de desenho — mas três defeitos eram do componente:
 *
 * 1. **Sem teclado.** O gesto era o único jeito de mexer. Um controle de dois
 *    eixos que só obedece ao ponteiro exclui quem navega por Tab, e o dado é
 *    contínuo: seta anda 2%, com Shift anda 10%.
 * 2. **Sem captura de ponteiro.** Os ouvintes iam no `window`; arrastar pra
 *    fora, soltar em cima de outro card e voltar deixava o pad "colado" no
 *    cursor. `setPointerCapture` entrega o gesto ao alvo e devolve no `up`.
 * 3. **Rótulo em `--vintage-text-dim`.** Sobre o painel escuro isso dá 2,8:1,
 *    abaixo do piso de 3:1 — e é justamente o número que a pessoa quer ler
 *    enquanto arrasta. Passou a `--vintage-text-muted` (5,4:1).
 *
 * O rastro curto do cursor não é enfeite: num pad sem rastro, movimento rápido
 * some entre um quadro e outro, e a mão perde a noção do caminho que fez.
 */
interface VintageXYPadProps {
  size?: number;
  value?: { x: number; y: number };
  onChange?: (x: number, y: number) => void;
  labelX?: string;
  labelY?: string;
  color?: string;
  className?: string;
}

const PASSOS_RASTRO = 12;

export function VintageXYPad({
  size = 160,
  value,
  onChange,
  labelX = "X",
  labelY = "Y",
  color = "var(--vintage-accent)",
  className,
}: VintageXYPadProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState(value ?? { x: 0.5, y: 0.5 });
  const [rastro, setRastro] = React.useState<{ x: number; y: number }[]>([]);
  const arrastando = React.useRef(false);

  const atual = value ?? pos;

  const aplicar = React.useCallback(
    (x: number, y: number) => {
      const cx = Math.max(0, Math.min(1, x));
      const cy = Math.max(0, Math.min(1, y));
      if (!value) setPos({ x: cx, y: cy });
      setRastro((p) => [...p, { x: cx, y: cy }].slice(-PASSOS_RASTRO));
      onChange?.(cx, cy);
    },
    [onChange, value]
  );

  const doPonteiro = React.useCallback(
    (e: React.PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      aplicar((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    },
    [aplicar]
  );

  const porTecla = (e: React.KeyboardEvent) => {
    const passo = e.shiftKey ? 0.1 : 0.02;
    const mapa: Record<string, [number, number]> = {
      ArrowLeft: [-passo, 0],
      ArrowRight: [passo, 0],
      ArrowUp: [0, passo],
      ArrowDown: [0, -passo],
    };
    const d = mapa[e.key];
    if (d) {
      e.preventDefault();
      aplicar(atual.x + d[0], atual.y + d[1]);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      aplicar(0.5, 0.5);
    }
  };

  const leitura = `${labelX} ${(atual.x * 100).toFixed(0)}%, ${labelY} ${(atual.y * 100).toFixed(0)}%`;

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`Campo de dois eixos: ${labelX} e ${labelY}. Setas movem, Shift acelera, Home centraliza.`}
        className={cn(
          "relative rounded-lg cursor-crosshair touch-none",
          "outline-none focus-visible:ring-2"
        )}
        style={{
          width: size,
          height: size,
          background: "var(--vintage-surface-1)",
          border: "1px solid var(--vintage-border)",
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.5)",
          ["--tw-ring-color" as string]: color,
        }}
        onPointerDown={(e) => {
          arrastando.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          e.currentTarget.focus();
          doPonteiro(e);
        }}
        onPointerMove={(e) => {
          if (arrastando.current) doPonteiro(e);
        }}
        onPointerUp={() => {
          arrastando.current = false;
        }}
        onPointerCancel={() => {
          arrastando.current = false;
        }}
        onKeyDown={porTecla}
      >
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox={`0 0 ${size} ${size}`}
        >
          {[0.25, 0.5, 0.75].map((t) => (
            <g key={t}>
              <line
                x1={t * size}
                y1={0}
                x2={t * size}
                y2={size}
                stroke="var(--vintage-border)"
                strokeWidth={0.5}
                opacity={t === 0.5 ? 0.6 : 0.3}
              />
              <line
                x1={0}
                y1={t * size}
                x2={size}
                y2={t * size}
                stroke="var(--vintage-border)"
                strokeWidth={0.5}
                opacity={t === 0.5 ? 0.6 : 0.3}
              />
            </g>
          ))}

          {/* Rastro: o caminho recente da mão, apagando. */}
          {rastro.length > 1 && (
            <polyline
              points={rastro
                .map((p) => `${p.x * size},${(1 - p.y) * size}`)
                .join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.35}
            />
          )}
        </svg>

        <div
          className="absolute pointer-events-none"
          style={{
            left: `${atual.x * 100}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: color,
            opacity: 0.3,
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            top: `${(1 - atual.y) * 100}%`,
            left: 0,
            right: 0,
            height: 1,
            background: color,
            opacity: 0.3,
          }}
        />

        <div
          className="absolute rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${atual.x * 100}%`,
            top: `${(1 - atual.y) * 100}%`,
            width: 12,
            height: 12,
            background: color,
            boxShadow: `0 0 10px ${color}, 0 0 20px color-mix(in srgb, ${color} 40%, transparent)`,
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2 border-2 border-white/30"
          style={{
            left: `${atual.x * 100}%`,
            top: `${(1 - atual.y) * 100}%`,
            width: 20,
            height: 20,
          }}
        />
      </div>

      <div
        className="flex justify-between"
        style={{ width: size }}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="sr-only">{leitura}</span>
        {[
          [labelX, atual.x],
          [labelY, atual.y],
        ].map(([rotulo, v]) => (
          <span
            key={String(rotulo)}
            aria-hidden
            className="text-[9px] font-bold uppercase tracking-wider tabular-nums"
            style={{
              color: "var(--vintage-text-muted)",
              fontFamily: "var(--font-vintage-mono, monospace)",
            }}
          >
            {rotulo}: {((v as number) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}
