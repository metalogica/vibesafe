'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { CommitData } from '@/src/frontend/types';

interface DeploymentSafetyChartProps {
  data: CommitData[];
  currentConsensus: number;
  onPointClick: (hash: string) => void;
  selectedCommitHash: string | null;
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="z-50 rounded border border-[#1C2430] bg-[#0F1620] p-3 text-sm shadow-lg">
        <p className="mb-1 font-medium text-[#E6EEF8]">
          Commit: {data.hash}
        </p>
        <p className="text-[#4DA3FF]">Safety: {data.consensus}%</p>
        {data.vulnerabilityCount !== undefined && (
          <p className="mt-1 text-xs text-[#8FA3B8]">
            Open Issues: {data.vulnerabilityCount}
          </p>
        )}
        <p className="mt-2 text-[10px] italic text-[#8FA3B8]/60">
          Click to view details
        </p>
      </div>
    );
  }
  return null;
}

export function DeploymentSafetyChart({
  data,
  currentConsensus,
  onPointClick,
  selectedCommitHash,
}: DeploymentSafetyChartProps) {
  let statusLabel = 'Unsafe';
  let statusColor = 'text-red-400';

  if (currentConsensus >= 70) {
    statusLabel = 'Safe';
    statusColor = 'text-emerald-400';
  } else if (currentConsensus >= 40) {
    statusLabel = 'Needs Work';
    statusColor = 'text-yellow-400';
  }

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const isSelected = selectedCommitHash === payload.hash;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 6 : 4}
        stroke={isSelected ? '#fff' : '#4DA3FF'}
        strokeWidth={2}
        fill={isSelected ? '#4DA3FF' : '#0B0F14'}
        className="cursor-pointer transition-all duration-300"
        onClick={() => onPointClick(payload.hash)}
      />
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-4 flex items-end justify-between px-1">
        <div>
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-[#8FA3B8]">
            Is this safe for deployment?
          </h2>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[64px] font-extrabold leading-none tracking-tight text-[#E6EEF8] drop-shadow-2xl">
              {currentConsensus}%
            </span>
            <span className={`text-lg font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        {selectedCommitHash && (
          <div className="rounded bg-[#1C2430] px-2 py-1 text-xs text-[#8FA3B8]">
            Viewing Commit:{' '}
            <span className="font-mono text-[#E6EEF8]">
              {selectedCommitHash.substring(0, 7)}
            </span>
          </div>
        )}
      </div>

      <div className="min-h-[250px] w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 30, left: -20, bottom: 0 }}
            onClick={(e: any) => {
              if (e && e.activePayload && e.activePayload[0]) {
                onPointClick(e.activePayload[0].payload.hash);
              }
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1C2430"
              vertical={false}
            />
            <XAxis
              dataKey="hash"
              stroke="#8FA3B8"
              tick={{ fill: '#8FA3B8', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#1C2430' }}
              tickFormatter={(hash) => hash.substring(0, 7)}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#8FA3B8"
              tick={{ fill: '#8FA3B8', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: '#4DA3FF',
                strokeWidth: 1,
                strokeDasharray: '4 4',
              }}
            />
            <Line
              type="monotone"
              dataKey="consensus"
              stroke="#4DA3FF"
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{
                r: 6,
                fill: '#4DA3FF',
                stroke: '#fff',
                strokeWidth: 2,
              }}
              animationDuration={1000}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
