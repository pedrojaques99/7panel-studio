import { useState, useRef, useEffect, useCallback } from "react";

interface UseKnobDragOptions {
  min?: number;
  max?: number;
  value?: number;
  sensitivity?: number;
  log?: boolean;
  onChange?: (value: number) => void;
}

export function useKnobDrag({
  min = 0,
  max = 10,
  value = 5,
  sensitivity = 0.022,
  log = false,
  onChange,
}: UseKnobDragOptions = {}) {
  const [currentValue, setCurrentValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const lastY = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const valRef = useRef(currentValue);
  valRef.current = currentValue;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const minRef = useRef(min);
  minRef.current = min;
  const maxRef = useRef(max);
  maxRef.current = max;
  const logRef = useRef(log);
  logRef.current = log;

  const toNorm = useCallback((v: number) => {
    const mn = minRef.current, mx = maxRef.current;
    return logRef.current
      ? Math.log(v / mn) / Math.log(mx / mn)
      : (v - mn) / (mx - mn);
  }, []);

  const fromNorm = useCallback((n: number) => {
    const mn = minRef.current, mx = maxRef.current;
    return logRef.current ? mn * Math.pow(mx / mn, n) : mn + n * (mx - mn);
  }, []);

  const clamp = useCallback(
    (v: number) => Math.max(minRef.current, Math.min(maxRef.current, v)),
    []
  );

  const rotation = -135 + toNorm(currentValue) * 270;

  useEffect(() => {
    if (value !== valRef.current) {
      setCurrentValue(value);
    }
  }, [value]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    lastY.current = e.clientY;
    e.preventDefault();
  }, []);

  const handleDoubleClick = useCallback(() => {
    const mid = fromNorm(0.5);
    setCurrentValue(mid);
    onChangeRef.current?.(mid);
  }, [fromNorm]);

  // React 17+ registra o listener de wheel da raiz como passive — dentro de um onWheel do
  // JSX, e.preventDefault() é ignorado em silêncio (sem warning, sem erro: só não faz nada).
  // O scroll da página "vence" e o knob nunca muda. Só um listener nativo (addEventListener
  // com passive:false) consegue de fato bloquear o scroll — por isso o wheel mora num
  // useEffect com ref, não num handler React comum como os outros (mouseDown/doubleClick).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const fine = e.shiftKey ? 0.002 : 0.012;
      const dir = e.deltaY < 0 ? 1 : -1;
      const norm = toNorm(valRef.current) + dir * fine;
      const next = clamp(fromNorm(Math.max(0, Math.min(1, norm))));
      valRef.current = next;
      setCurrentValue(next);
      onChangeRef.current?.(next);
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [toNorm, fromNorm, clamp]);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const dy = lastY.current - e.clientY;
      lastY.current = e.clientY;
      const fine = e.shiftKey ? 0.004 : sensitivity;
      const norm = toNorm(valRef.current) + dy * fine;
      const next = clamp(fromNorm(Math.max(0, Math.min(1, norm))));
      valRef.current = next;
      setCurrentValue(next);
      onChangeRef.current?.(next);
    };

    const onUp = () => setIsDragging(false);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, sensitivity, toNorm, fromNorm, clamp]);

  return {
    currentValue,
    rotation,
    isDragging,
    containerRef,
    handleMouseDown,
    handleDoubleClick,
  };
}
