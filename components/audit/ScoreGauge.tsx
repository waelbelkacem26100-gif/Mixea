"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

interface Props {
  score: number;
}

function gaugeColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#eab308";
  if (score >= 50) return "#f97316";
  return "#ef4444";
}

function gaugeLabel(score: number): { text: string; className: string } {
  if (score >= 85) return { text: "EXCELLENT", className: "text-green-400" };
  if (score >= 70) return { text: "BON", className: "text-yellow-400" };
  if (score >= 50) return { text: "À AMÉLIORER", className: "text-orange-400" };
  return { text: "CRITIQUE", className: "text-red-400" };
}

const RADIUS = 80;
const STROKE = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ScoreGauge({ score }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = gaugeColor(clamped);
  const label = gaugeLabel(clamped);

  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    const controls = animate(count, clamped, {
      duration: 1.2,
      ease: "easeOut",
    });
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [clamped, count, rounded]);

  const dashOffset = CIRCUMFERENCE * (1 - clamped / 100);
  const size = (RADIUS + STROKE) * 2;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={center}
            cy={center}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold" style={{ color }}>
            {display}
          </span>
          <span className="text-sm text-white/40">/ 100</span>
        </div>
      </div>
      <span
        className={`mt-4 px-3 py-1 rounded-full text-xs font-bold tracking-wide ${label.className} bg-white/5 border border-white/10`}
      >
        {label.text}
      </span>
    </div>
  );
}
