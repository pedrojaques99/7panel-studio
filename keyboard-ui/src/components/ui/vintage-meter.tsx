"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface VintageMeterProps {
  label?: string;
  /** Controlado. Sem ele o medidor guarda o próprio nível. */
  value?: number;
  /** Nível inicial quando o medidor é não-controlado. */
  defaultValue?: number;
  min?: number;
  max?: number;
  /**
   * Chamado a cada mudança vinda do usuário (arraste, roda, teclado).
   *
   * No modo controlado ele é obrigatório para a peça aceitar entrada: sem
   * `onChange` não há para onde escrever, e um arraste que não move o ponteiro
   * é pior do que um medidor assumidamente passivo.
   */
  onChange?: (value: number) => void;
  /** Desliga a entrada do usuário e devolve o VU de vitrine, só leitura. */
  readOnly?: boolean;
  className?: string;
}

/** Ângulo do ponteiro, em graus a partir da vertical. */
const ARCO = 90;

export function VintageMeter({
  label = "LEVEL",
  value,
  defaultValue = 0,
  min = 0,
  max = 10,
  onChange,
  readOnly = false,
  className,
}: VintageMeterProps) {
  const controlado = value !== undefined;
  const [interno, setInterno] = useState(value ?? defaultValue);
  const nivel = value ?? interno;

  // No controlado sem `onChange` não existe entrada possível — ver a prop.
  const interativo = !readOnly && (!controlado || Boolean(onChange));

  const faceRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const peakRef = useRef<SVGLineElement>(null);
  const targetRef = useRef(nivel);
  const currentRef = useRef(nivel);
  const peakRefVal = useRef(nivel);
  const peakHold = useRef(0);
  const rafRef = useRef<number>(0);

  targetRef.current = nivel;

  useEffect(() => {
    let running = true;
    function animate() {
      if (!running) return;
      const diff = targetRef.current - currentRef.current;
      // Ataque rápido, queda lenta: é a balística de um VU de verdade.
      const speed = diff > 0 ? 0.25 : 0.08;
      currentRef.current += diff * speed;

      const normalized = (currentRef.current - min) / (max - min);
      const rotation = -ARCO / 2 + normalized * ARCO;

      if (needleRef.current) {
        needleRef.current.setAttribute(
          "transform",
          `rotate(${rotation} 70 65)`
        );
      }

      // Retentor de pico: sobe na hora, segura ~1s e desce devagar. É o que
      // deixa o transiente visível depois que a agulha já voltou.
      const agora = performance.now();
      if (currentRef.current > peakRefVal.current) {
        peakRefVal.current = currentRef.current;
        peakHold.current = agora;
      } else if (agora - peakHold.current > 900) {
        peakRefVal.current -= (max - min) * 0.004;
        if (peakRefVal.current < currentRef.current) {
          peakRefVal.current = currentRef.current;
        }
      }
      if (peakRef.current) {
        const pn = (peakRefVal.current - min) / (max - min);
        peakRef.current.setAttribute(
          "transform",
          `rotate(${-ARCO / 2 + pn * ARCO} 70 65)`
        );
      }

      rafRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [min, max]);

  const emitir = useCallback(
    (v: number) => {
      const clamped = Math.max(min, Math.min(max, v));
      if (!controlado) setInterno(clamped);
      onChange?.(clamped);
    },
    [controlado, min, max, onChange]
  );

  /**
   * O arraste é angular, não horizontal: o dedo empurra a agulha em volta do
   * eixo dela. Qualquer ponto da face serve, porque o que conta é a direção do
   * cursor em relação ao pivô — o mesmo gesto de encostar o dedo no ponteiro.
   */
  const doPonteiro = useCallback(
    (clientX: number, clientY: number) => {
      const r = faceRef.current?.getBoundingClientRect();
      if (!r) return;
      // O pivô mora em (70,65) de um viewBox 140×70 — daí as frações.
      const px = r.left + r.width * 0.5;
      const py = r.top + r.height * (65 / 70);
      const theta = (Math.atan2(py - clientY, clientX - px) * 180) / Math.PI;
      const n = (135 - theta) / ARCO;
      emitir(min + Math.max(0, Math.min(1, n)) * (max - min));
    },
    [emitir, min, max]
  );

  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interativo) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    doPonteiro(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) doPonteiro(e.clientX, e.clientY);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interativo) return;
    const passo = (max - min) * (e.shiftKey ? 0.01 : 0.05);
    if (e.key === "ArrowUp" || e.key === "ArrowRight") emitir(nivel + passo);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") emitir(nivel - passo);
    else if (e.key === "Home") emitir(min);
    else if (e.key === "End") emitir(max);
    else return;
    e.preventDefault();
  };

  const normalized = (nivel - min) / (max - min);
  const isClipping = normalized > 0.85;

  return (
    <div
      className={cn(
        "relative w-[180px] h-[140px] bg-gradient-to-b from-[var(--vintage-surface-3)] to-[var(--vintage-surface-2)] rounded-lg border-2 border-[var(--vintage-surface-4)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_4px_8px_rgba(0,0,0,0.3)]",
        className
      )}
    >
      <div className="absolute top-3 left-0 right-0 text-center text-[var(--vintage-label)] text-xs font-vintage-mono tracking-widest opacity-80">
        {label}
      </div>

      <div
        ref={faceRef}
        className={cn(
          // `touch-none`: sem isso o arraste na face vira rolagem da página no
          // celular e o medidor não anda.
          "absolute top-[45px] left-1/2 -translate-x-1/2 w-[140px] h-[70px] outline-none",
          interativo && "touch-none cursor-grab active:cursor-grabbing"
        )}
        role={interativo ? "slider" : undefined}
        tabIndex={interativo ? 0 : undefined}
        aria-label={interativo ? label : undefined}
        aria-valuemin={interativo ? min : undefined}
        aria-valuemax={interativo ? max : undefined}
        aria-valuenow={interativo ? Number(nivel.toFixed(2)) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 140 70" className="w-full h-full">
          <defs>
            <linearGradient
              id="vm-grad"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="var(--vintage-meter-green)" />
              <stop offset="60%" stopColor="var(--vintage-meter-yellow)" />
              <stop offset="85%" stopColor="var(--vintage-meter-orange)" />
              <stop offset="100%" stopColor="var(--vintage-meter-red)" />
            </linearGradient>
            <filter id="vm-needle-glow">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="2"
                floodColor="var(--vintage-needle)"
                floodOpacity="0.6"
              />
            </filter>
          </defs>

          <path
            d="M 10 65 A 60 60 0 0 1 130 65"
            fill="none"
            stroke="url(#vm-grad)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {Array.from({ length: 11 }, (_, i) => {
            const angle = -45 + (i / 10) * 90;
            const rad = (angle * Math.PI) / 180;
            const isMajor = i % 5 === 0;
            const x1 = 70 + Math.cos(rad) * 50;
            const y1 = 65 - Math.sin(rad) * 50;
            const x2 = 70 + Math.cos(rad) * (isMajor ? 42 : 45);
            const y2 = 65 - Math.sin(rad) * (isMajor ? 42 : 45);

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--vintage-text-muted)"
                strokeWidth={isMajor ? "2" : "1"}
              />
            );
          })}

          {[0, 5, 10].map((num) => {
            const angle = -45 + (num / 10) * 90;
            const rad = (angle * Math.PI) / 180;
            const x = 70 + Math.cos(rad) * 35;
            const y = 65 - Math.sin(rad) * 35;

            return (
              <text
                key={num}
                x={x}
                y={y + 2}
                textAnchor="middle"
                fill="var(--vintage-text-dim)"
                fontSize="8"
                fontFamily="var(--font-vintage-mono)"
              >
                {num}
              </text>
            );
          })}

          {/* Retentor de pico — traço curto na ponta do arco. */}
          <line
            ref={peakRef}
            x1="70"
            y1="22"
            x2="70"
            y2="15"
            stroke="var(--vintage-label)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.8"
            transform="rotate(-45 70 65)"
          />

          {/* Ponteiro — animado por ref, não por estado do React. */}
          <g ref={needleRef} transform="rotate(-45 70 65)">
            <line
              x1="70"
              y1="65"
              x2="70"
              y2="20"
              stroke="var(--vintage-needle)"
              strokeWidth="2"
              strokeLinecap="round"
              filter="url(#vm-needle-glow)"
            />
            <circle
              cx="70"
              cy="65"
              r="4"
              fill="var(--vintage-border)"
              stroke="var(--vintage-text-dim)"
              strokeWidth="1"
            />
          </g>

          {/* Indicador de clip */}
          {isClipping && (
            <circle
              cx="130"
              cy="65"
              r="3"
              fill="var(--vintage-meter-red)"
              opacity={0.9}
            >
              <animate
                attributeName="opacity"
                values="0.9;0.3;0.9"
                dur="0.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </svg>
      </div>

      {/* A régua de baixo agora diz o nível de fato, em vez de imprimir uma
          escala fixa que nunca correspondeu ao que a agulha marcava. */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 font-vintage-mono text-[9px]">
        <span className="text-[var(--vintage-text-muted)]">{min}</span>
        <span style={{ color: isClipping ? "var(--vintage-meter-red)" : "var(--vintage-label)" }}>
          {nivel.toFixed(1)}
        </span>
        <span className="text-[var(--vintage-text-muted)]">{max}</span>
      </div>
    </div>
  );
}
