import { useState } from 'react';

export function SimpleToggle({
  onChange
}: {
  onChange?: (position: 'up' | 'middle' | 'down') => void;
}) {
  const [position, setPosition] = useState<'up' | 'middle' | 'down'>('middle');

  const handleClick = () => {
    const positions: ('up' | 'middle' | 'down')[] = ['up', 'middle', 'down'];
    const currentIndex = positions.indexOf(position);
    const nextIndex = (currentIndex + 1) % positions.length;
    const nextPosition = positions[nextIndex];

    setPosition(nextPosition);
    onChange?.(nextPosition);
  };

  const toggleY = position === 'up' ? 25 : position === 'down' ? 75 : 50;

  return (
    <div className="relative inline-block">
      <div
        onClick={handleClick}
        className="cursor-pointer transition-all duration-200 hover:scale-105 relative w-[100px] h-[250px]"
      >
        {/* Toggle background/housing */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#6d757e] via-[#d9dee3] to-[#9ba0a6] rounded-lg shadow-lg">
          {/* Inner channel */}
          <div className="absolute left-1/2 top-[30px] bottom-[30px] w-[40px] -ml-[20px] bg-gradient-to-b from-[#bebebe] via-[#ffffff] to-[#a9a9a9] rounded-full shadow-[inset_0_4px_8px_rgba(0,0,0,0.3)]" />

          {/* Track line */}
          <div className="absolute left-1/2 top-[60px] bottom-[60px] w-[2px] -ml-px bg-[#403f3f] shadow-[inset_2px_2px_2px_rgba(0,0,0,0.4)]" />
        </div>

        {/* Labels */}
        <div className="absolute left-[-50px] top-[20px] text-[#5c5c5c] text-xl font-['Helvetica',sans-serif] font-bold">
          U
        </div>
        <div className="absolute left-[-50px] top-[110px] text-[#5c5c5c] text-xl font-['Helvetica',sans-serif] font-bold">
          M
        </div>
        <div className="absolute left-[-50px] top-[200px] text-[#5c5c5c] text-xl font-['Helvetica',sans-serif] font-bold">
          D
        </div>

        {/* Toggle handle */}
        <div
          className="absolute left-1/2 w-[50px] h-[50px] -ml-[25px] transition-all duration-200 ease-out"
          style={{ top: `${toggleY}%`, transform: 'translateY(-50%)' }}
        >
          <div className="w-full h-full rounded-full bg-gradient-to-b from-[#bebebe] via-[#ffffff] to-[#a9a9a9] shadow-[0_4px_8px_rgba(0,0,0,0.4)]" />
          <div className="absolute inset-2 rounded-full bg-white opacity-30" />
        </div>

        {/* Title */}
        <div className="absolute left-1/2 -top-[35px] -translate-x-1/2 text-[#5c5c5c] text-xl font-['Helvetica',sans-serif] font-bold whitespace-nowrap">
          TOGGLE
        </div>
      </div>
      <div className="text-center mt-4 text-[#5c5c5c] text-sm font-['Helvetica',sans-serif]">
        {position.toUpperCase()}
      </div>
    </div>
  );
}
