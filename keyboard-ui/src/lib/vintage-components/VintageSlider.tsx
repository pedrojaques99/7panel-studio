import { useState } from 'react';

export function VintageSlider({
  label = "GAIN",
  min = 0,
  max = 10,
  value = 5,
  onChange
}: {
  label?: string;
  min?: number;
  max?: number;
  value?: number;
  onChange?: (value: number) => void;
}) {
  const [currentValue, setCurrentValue] = useState(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    setCurrentValue(newValue);
    onChange?.(newValue);
  };

  const percentage = ((currentValue - min) / (max - min)) * 100;

  return (
    <div className="relative w-[200px] h-[120px] bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] rounded-lg border-2 border-[#4a4a4a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_4px_8px_rgba(0,0,0,0.3)] p-4">
      <div className="text-center text-[#f0e68c] text-xs font-['Red_Hat_Mono',monospace] tracking-widest mb-6 opacity-80">
        {label}
      </div>

      <div className="relative h-8 mb-4">
        <div className="absolute inset-0 bg-[#1a1a1a] rounded border border-[#333] shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)]">
          <div
            className="h-full bg-gradient-to-r from-[#22c55e] via-[#eab308] to-[#ef4444] rounded transition-all duration-150"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step="0.1"
          value={currentValue}
          onChange={handleChange}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-10 bg-gradient-to-b from-[#6a6a6a] to-[#3a3a3a] border-2 border-[#888] rounded shadow-lg pointer-events-none transition-all duration-150"
          style={{ left: `calc(${percentage}% - 6px)` }}
        />
      </div>

      <div className="flex justify-between text-[9px] text-[#888] font-['Red_Hat_Mono',monospace]">
        <span>{min}</span>
        <span className="text-[#f0e68c]">{currentValue.toFixed(1)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
