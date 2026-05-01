import { useState, useRef, useEffect } from 'react';

export function InteractiveSliders({
  labels = ['63Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz']
}: {
  labels?: string[];
}) {
  const [values, setValues] = useState(labels.map(() => 5));
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingIndex === null) return;

      const slider = document.getElementById(`slider-${draggingIndex}`);
      if (!slider) return;

      const rect = slider.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const percentage = 1 - Math.max(0, Math.min(1, y / rect.height));
      const newValue = percentage * 10;

      const newValues = [...values];
      newValues[draggingIndex] = newValue;
      setValues(newValues);
    };

    const handleMouseUp = () => {
      setDraggingIndex(null);
    };

    if (draggingIndex !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingIndex, values]);

  return (
    <div className="inline-block bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] rounded-2xl p-8 border border-[#333]">
      <h3 className="text-center text-[#5c5c5c] text-2xl font-['Helvetica',sans-serif] font-bold mb-6">
        GRAPHIC EQ
      </h3>
      <div className="flex gap-6 items-end">
        {labels.map((label, index) => (
          <div key={index} className="flex flex-col items-center gap-4">
            <div
              id={`slider-${index}`}
              className="relative h-[300px] w-12 cursor-pointer"
              onMouseDown={() => setDraggingIndex(index)}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] rounded-lg border border-[#4a4a4a] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                <div className="absolute inset-x-0 top-0 h-full flex flex-col justify-between p-2">
                  {[...Array(16)].map((_, i) => (
                    <div key={i} className="w-full h-px bg-[#BBBABA] opacity-30" />
                  ))}
                </div>
              </div>

              <div
                className="absolute left-1/2 -translate-x-1/2 w-10 h-14 bg-gradient-to-b from-[#BEBEBE] via-[#FFFFFF] to-[#A9A9A9] border-2 border-[#888] rounded shadow-lg pointer-events-none transition-all duration-100"
                style={{
                  bottom: `calc(${(values[index] / 10) * 100}% - 28px)`
                }}
              >
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-full bg-[#5C5C5C] rounded-sm shadow-inner" />
              </div>
            </div>

            <div className="text-center">
              <div className="text-[#888] text-xs font-['Red_Hat_Mono',monospace] mb-1">
                {values[index].toFixed(1)}
              </div>
              <div className="text-[#666] text-[10px] font-['Helvetica',sans-serif]">
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
