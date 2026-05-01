import { useState } from 'react';
import ToggleMiddle from '../vintage-imports/ToggleMiddle';

export function InteractiveToggle({
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

  const rotation = position === 'up' ? -30 : position === 'down' ? 30 : 0;

  return (
    <div className="relative inline-block">
      <div
        onClick={handleClick}
        className="cursor-pointer transition-transform duration-200 hover:scale-105"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <div className="w-[100px] h-[264px]">
          <ToggleMiddle />
        </div>
      </div>
      <div className="text-center mt-2 text-[#5c5c5c] text-xs font-['Helvetica',sans-serif]">
        {position.toUpperCase()}
      </div>
    </div>
  );
}
