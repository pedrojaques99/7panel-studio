"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useKnobDrag } from "@/hooks/use-knob-drag";

interface VintageKnobProps {
  label?: string;
  min?: number;
  max?: number;
  value?: number;
  log?: boolean;
  accent?: string;
  size?: number;
  fmt?: (v: number) => string;
  onChange?: (value: number) => void;
  className?: string;
}

/**
 * A caixa do dial dentro do quadro de 81×75. Corpo e listra desenham no MESMO
 * retângulo, um por cima do outro — é isso que mantém a listra encaixada no
 * centro do metal quando ela gira.
 */
const CAIXA_DIAL = {
  width: "43.2%",
  height: "56%",
  left: "28.5%",
  top: "24.3%",
} as const;

/**
 * O corpo: metal, chanfro e sombra. **Não gira.**
 *
 * Antes o botão inteiro girava, gradiente especular junto, e o resultado era
 * fisicamente errado — a luz do painel andava atrás do dedo do usuário. Luz e
 * sombra são da sala, não da peça; o que gira num potenciômetro é o eixo, e
 * quem denuncia o eixo é a listra.
 */
function KnobBody() {
  return (
    <div className="absolute" style={CAIXA_DIAL}>
      <svg viewBox="0 0 46 50" className="w-full h-full" fill="none">
        <defs>
          <radialGradient
            id="vk-base"
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(18 27) rotate(-62) scale(21 24)"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0.28" stopColor="#424344" />
            <stop offset="0.85" stopColor="#16171B" />
          </radialGradient>
          <linearGradient
            id="vk-stroke"
            x1="23"
            y1="3"
            x2="23"
            y2="36"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#000000" />
            <stop offset="1" stopColor="#909090" />
          </linearGradient>
          <linearGradient
            id="vk-depth"
            x1="37.5"
            y1="15"
            x2="10"
            y2="18.6"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#1D1D1D" />
            <stop offset="0.21" stopColor="#4C4A48" />
            <stop offset="0.34" stopColor="#6A6A6A" />
            <stop offset="0.53" stopColor="#6A6A6A" />
            <stop offset="0.69" stopColor="#4C4A48" />
            <stop offset="0.96" stopColor="#1D1D1D" />
          </linearGradient>
          <radialGradient
            id="vk-front"
            cx="0"
            cy="0"
            r="1"
            gradientTransform="translate(19 14) rotate(82) scale(23)"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0.04" stopColor="#878584" />
            <stop offset="1" stopColor="#33322F" />
          </radialGradient>
          <linearGradient
            id="vk-fstroke"
            x1="15"
            y1="11"
            x2="25"
            y2="38"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#EFEFEF" />
            <stop offset="0.57" stopColor="#343333" />
          </linearGradient>
          <filter id="vk-shadow" x="0" y="0" width="46.6" height="50.2">
            <feDropShadow
              dx="0"
              dy="4"
              stdDeviation="4.5"
              floodOpacity="0.6"
            />
          </filter>
        </defs>
        <circle
          cx="23"
          cy="20"
          r="16"
          fill="url(#vk-base)"
          stroke="url(#vk-stroke)"
          strokeWidth="0.4"
        />
        <path
          d="M23.293 5C31.179 5 37.573 11.386 37.586 19.269V23.321H37.578C37.338 31.005 31.035 37.159 23.293 37.159C15.551 37.159 9.248 31.005 9.008 23.321H9V19.269C9.013 11.386 15.407 5 23.293 5Z"
          fill="url(#vk-depth)"
          filter="url(#vk-shadow)"
        />
        <circle
          cx="22"
          cy="23"
          r="14"
          fill="url(#vk-front)"
          stroke="url(#vk-fstroke)"
          strokeWidth="0.2"
        />
      </svg>
    </div>
  );
}

/** A listra de direção. É a única coisa que se move quando o valor muda. */
function KnobPointer({ rotation }: { rotation: number }) {
  return (
    <div
      className="absolute transition-transform duration-75 motion-reduce:transition-none"
      style={{
        ...CAIXA_DIAL,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center center",
      }}
    >
      <svg viewBox="0 0 46 50" className="w-full h-full" fill="none">
        <rect
          fill="var(--vintage-value, #ffd700)"
          height="6"
          width="1.2"
          x="21.7"
          y="8.5"
          rx="0.6"
        />
        <path
          d="M21.66 8.54H22.87L23.28 7.45H22.07L21.66 8.54Z"
          fill="var(--vintage-value, #ffd700)"
        />
      </svg>
    </div>
  );
}

function KnobMarks({ size }: { size: number }) {
  const cx = 40.5,
    cy = 37.5,
    r = 32;
  const angles = Array.from({ length: 11 }, (_, i) => -135 + i * 27);
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      fill="none"
      viewBox="0 0 81 75"
    >
      {angles.map((deg, i) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * (r - 4);
        const y1 = cy + Math.sin(rad) * (r - 4);
        const x2 = cx + Math.cos(rad) * r;
        const y2 = cy + Math.sin(rad) * r;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="white"
            strokeWidth={1.8}
            strokeLinecap="round"
            opacity={0.5}
          />
        );
      })}
    </svg>
  );
}

export function VintageKnob({
  label = "BASS",
  min = 0,
  max = 10,
  value = 5,
  log = false,
  accent = "var(--vintage-value)",
  size = 81,
  fmt,
  onChange,
  className,
}: VintageKnobProps) {
  const [hover, setHover] = useState(false);
  const {
    currentValue,
    rotation,
    isDragging,
    handleMouseDown,
    handleDoubleClick,
    handleWheel,
  } = useKnobDrag({ min, max, value, log, onChange });

  const scale = size / 81;
  const scaledH = Math.round(75 * scale);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 select-none",
        className
      )}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${label}: ${fmt ? fmt(currentValue) : currentValue.toFixed(2)}\ndrag ↕ · shift=fine · scroll · dbl-click=reset`}
      style={{
        cursor: isDragging ? "grabbing" : "grab",
        opacity: hover || isDragging ? 1 : 0.85,
        transition: "opacity 0.15s",
      }}
    >
      <div
        style={{
          width: size,
          height: scaledH,
          position: "relative",
          filter: hover
            ? `drop-shadow(0 0 6px color-mix(in srgb, ${accent} 30%, transparent))`
            : "none",
          transition: "filter 0.15s",
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: 81,
            height: 75,
            position: "relative",
          }}
        >
          <KnobMarks size={81} />
          <KnobBody />
          <KnobPointer rotation={rotation} />
        </div>
      </div>

      <span
        className="font-vintage-mono font-bold uppercase tracking-[0.18em]"
        style={{
          fontSize: Math.max(9, size * 0.12),
          color: hover
            ? "var(--vintage-label)"
            : "var(--vintage-text-muted)",
          transition: "color 0.15s",
        }}
      >
        {label}
      </span>

      <span
        className="font-vintage-mono"
        style={{
          fontSize: Math.max(10, size * 0.14),
          color: accent,
          marginTop: -2,
        }}
      >
        {fmt ? fmt(currentValue) : currentValue.toFixed(1)}
      </span>
    </div>
  );
}
