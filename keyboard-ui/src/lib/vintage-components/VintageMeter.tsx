import { useState, useEffect } from "react";

export function VintageMeter({
  label = "LEVEL",
  value = 0,
}: {
  label?: string;
  value?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const needleRotation = -45 + (displayValue / 10) * 90;

  return (
    <div className="relative w-[180px] h-[140px] bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] rounded-lg border-2 border-[#4a4a4a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_4px_8px_rgba(0,0,0,0.3)]">
      <div className="absolute top-3 left-0 right-0 text-center text-[#f0e68c] text-xs font-['Red_Hat_Mono',monospace] tracking-widest opacity-80">
        {label}
      </div>

      <div className="absolute top-[45px] left-1/2 -translate-x-1/2 w-[140px] h-[70px]">
        <svg viewBox="0 0 140 70" className="w-full h-full">
          <defs>
            <linearGradient
              id="meterGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="60%" stopColor="#eab308" />
              <stop offset="85%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          <path
            d="M 10 65 A 60 60 0 0 1 130 65"
            fill="none"
            stroke="url(#meterGradient)"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((tick) => {
            const angle = -45 + (tick / 10) * 90;
            const rad = (angle * Math.PI) / 180;
            const x1 = 70 + Math.cos(rad) * 50;
            const y1 = 65 - Math.sin(rad) * 50;
            const x2 =
              70 + Math.cos(rad) * (tick % 5 === 0 ? 42 : 45);
            const y2 =
              65 - Math.sin(rad) * (tick % 5 === 0 ? 42 : 45);

            return (
              <line
                key={tick}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#888"
                strokeWidth={tick % 5 === 0 ? "2" : "1"}
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
                fill="#999"
                fontSize="8"
                fontFamily="Red Hat Mono, monospace"
              >
                {num}
              </text>
            );
          })}

          <g transform={`rotate(${needleRotation} 70 65)`}>
            <line
              x1="70"
              y1="65"
              x2="70"
              y2="20"
              stroke="#ff0000"
              strokeWidth="2"
              strokeLinecap="round"
              filter="drop-shadow(0 0 3px rgba(255,0,0,0.5))"
            />
            <circle
              cx="70"
              cy="65"
              r="4"
              fill="#333"
              stroke="#666"
              strokeWidth="1"
            />
          </g>
        </svg>
      </div>

      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
        {[-10, -5, 0, 5, 10].map((db) => (
          <span
            key={db}
            className="text-[8px] text-[#888] font-['Red_Hat_Mono',monospace]"
          >
            {db > 0 ? "+" : ""}
            {db}
          </span>
        ))}
      </div>
    </div>
  );
}