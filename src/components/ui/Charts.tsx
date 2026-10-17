import { useMemo } from 'react';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}

export function BarChart({
  data,
  height = 200,
  color = '#22d3ee',
}: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;

  return (
    <div className="w-full" style={{ height }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 30);
          const x = i * barWidth + barWidth * 0.15;
          const w = barWidth * 0.7;
          const y = height - h - 20;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                opacity={d.value === 0 ? 0.15 : 0.8}
                rx="0.5"
                className="transition-all duration-500"
              >
                <animate
                  attributeName="height"
                  from="0"
                  to={h}
                  dur="0.6s"
                  fill="freeze"
                />
                <animate
                  attributeName="y"
                  from={height - 20}
                  to={y}
                  dur="0.6s"
                  fill="freeze"
                />
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between -mt-1">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center"
            style={{ paddingLeft: `${barWidth * 0.15}%`, paddingRight: `${barWidth * 0.15}%` }}
          >
            <span className="text-[10px] font-medium text-slate-400">
              {d.value}
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export function DonutChart({
  data,
  size = 180,
  thickness = 24,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const segments = useMemo(() => {
    let offset = 0;
    return data.map((d) => {
      const fraction = total === 0 ? 0 : d.value / total;
      const dash = fraction * circumference;
      const segment = {
        ...d,
        dash,
        gap: circumference - dash,
        offset: -offset,
      };
      offset += dash;
      return segment;
    });
  }, [data, total, circumference]);

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={thickness}
          />
          {total > 0 &&
            segments.map((seg, i) => (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeDasharray={`${seg.dash} ${seg.gap}`}
                strokeDashoffset={seg.offset}
                strokeLinecap="butt"
                className="transition-all duration-700"
              />
            ))}
        </svg>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-100">
              {centerValue}
            </span>
            <span className="text-xs text-slate-500 mt-0.5">{centerLabel}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2.5 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-sm text-slate-300 truncate flex-1">
              {d.label}
            </span>
            <span className="text-sm font-medium text-slate-400">
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = '#22d3ee',
}: SparklineProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1 || 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill={color}
        opacity="0.1"
      />
    </svg>
  );
}
