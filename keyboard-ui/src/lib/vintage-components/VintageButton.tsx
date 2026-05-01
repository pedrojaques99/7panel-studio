import { useState } from 'react';

export function VintageButton({
  label,
  active = false,
  onClick
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      className="relative group"
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onClick}
    >
      <div className={`
        w-20 h-20 rounded-full transition-all duration-75
        ${pressed
          ? 'bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] shadow-[inset_0_4px_8px_rgba(0,0,0,0.8)]'
          : 'bg-gradient-to-b from-[#4a4a4a] to-[#2a2a2a] shadow-[0_6px_0_#1a1a1a,0_8px_12px_rgba(0,0,0,0.5)]'
        }
        ${active ? 'ring-2 ring-[#ff6b35]' : ''}
      `}>
        <div className={`
          absolute inset-2 rounded-full flex items-center justify-center
          ${active
            ? 'bg-gradient-to-b from-[#ff6b35] to-[#ff4500] shadow-[0_0_20px_rgba(255,107,53,0.6)]'
            : 'bg-gradient-to-b from-[#3a3a3a] to-[#2a2a2a]'
          }
          transition-all duration-200
        `}>
          <span className={`
            text-xs font-['Orbitron',sans-serif] font-bold tracking-wider uppercase
            ${active ? 'text-white' : 'text-[#888]'}
          `}>
            {label}
          </span>
        </div>
      </div>

      {active && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-1 h-1 rounded-full bg-[#ff6b35] shadow-[0_0_10px_rgba(255,107,53,0.8)]" />
      )}
    </button>
  );
}
