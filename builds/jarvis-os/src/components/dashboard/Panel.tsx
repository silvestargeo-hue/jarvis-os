"use client";

import { motion, useMotionValue, type PanInfo } from "framer-motion";
import { GripHorizontal, X } from "lucide-react";
import { useEffect, useState, type ReactNode, type RefObject } from "react";

export interface PanelPosition {
  x: number;
  y: number;
}

export interface PanelProps {
  id: string;
  title: string;
  /** Committed position (starts from localStorage or a default). */
  position: PanelPosition;
  width?: number;
  zIndex: number;
  constraintsRef: RefObject<HTMLDivElement | null>;
  onFocus: (id: string) => void;
  onMove: (id: string, pos: PanelPosition) => void;
  onClose?: (id: string) => void;
  children: ReactNode;
}

/**
 * Draggable HUD panel. Owns its live position as motion values so dragging is
 * butter-smooth; commits the final offset to the parent (which persists it).
 */
export function Panel({
  id,
  title,
  position,
  width = 300,
  zIndex,
  constraintsRef,
  onFocus,
  onMove,
  onClose,
  children,
}: PanelProps) {
  const [pos, setPos] = useState<PanelPosition>(position);
  const x = useMotionValue(pos.x);
  const y = useMotionValue(pos.y);

  // Follow external position changes (RESET LAYOUT, layout reloaded from
  // storage) — without this the panel kept its first-mount position forever.
  useEffect(() => {
    setPos(position);
  }, [position]);

  // Re-sync when the committed position changes (e.g. restored from storage).
  useEffect(() => {
    x.set(pos.x);
    y.set(pos.y);
  }, [pos, x, y]);

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    const next = { x: Math.round(pos.x + info.offset.x), y: Math.round(pos.y + info.offset.y) };
    setPos(next);
    onMove(id, next);
  };

  return (
    <motion.div
      drag
      dragConstraints={constraintsRef}
      dragMomentum={false}
      dragElastic={0.04}
      onDragEnd={handleDragEnd}
      onPointerDown={() => onFocus(id)}
      style={{ x, y, width, zIndex }}
      className="hud-panel hud-corner absolute left-0 top-0 cursor-grab touch-none select-none active:cursor-grabbing"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
    >
      <div className="flex items-center justify-between border-b border-cyan-400/20 px-3 py-2">
        <div className="flex items-center gap-2 text-cyan-300/80">
          <GripHorizontal size={13} />
          <span className="hud-label !tracking-[0.2em]">{title}</span>
        </div>
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded p-1 text-cyan-300/60 transition hover:bg-red-400/10 hover:text-red-300"
            aria-label={`Close ${title}`}
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="p-4" onPointerDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </motion.div>
  );
}
