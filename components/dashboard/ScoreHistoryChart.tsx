"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  data: { date: string; score: number }[];
}

interface MiniTooltipProps {
  active?: boolean;
  payload?: { value?: number | string }[];
}

function MiniTooltip({ active, payload }: MiniTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const score = payload[0]?.value;
  if (score == null) return null;
  return (
    <div className="rounded-md border border-white/10 bg-[#0a0a0a] px-2 py-1 text-xs text-white shadow-lg">
      Score : <span className="font-semibold text-green-400">{score}</span>
    </div>
  );
}

export default function ScoreHistoryChart({ data }: Props) {
  return (
    <div className="h-[60px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 4, left: 4 }}
        >
          <Tooltip
            content={<MiniTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
