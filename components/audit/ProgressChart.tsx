"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartPoint {
  date: string;
  score: number;
}

interface Props {
  data: ChartPoint[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

interface TooltipPayloadItem {
  value: number;
  payload: ChartPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  return (
    <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-xs shadow-lg">
      <p className="text-white/40">{formatDate(point.payload.date)}</p>
      <p className="font-semibold text-green-400">{point.value} / 100</p>
    </div>
  );
}

export default function ProgressChart({ data }: Props) {
  return (
    <div className="mt-4 w-full" style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: -16 }}
        >
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, index, key } = props as {
                cx: number;
                cy: number;
                index: number;
                key?: string;
              };
              const isLast = index === data.length - 1;
              if (!isLast) {
                return <g key={key} />;
              }
              return (
                <circle
                  key={key}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="#22c55e"
                  stroke="#0a0a0a"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 5, fill: "#22c55e" }}
            isAnimationActive
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
