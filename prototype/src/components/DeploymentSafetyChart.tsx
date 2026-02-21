import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CommitData {
  hash: string;
  consensus: number;
  vulnerabilityCount?: number;
}

interface DeploymentSafetyChartProps {
  data: CommitData[];
  currentConsensus: number;
  onPointClick: (hash: string) => void;
  selectedCommitHash: string | null;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#0F1620] border border-[#1C2430] p-3 rounded shadow-lg text-sm z-50">
        <p className="text-[#E6EEF8] font-medium mb-1">Commit: {data.hash}</p>
        <p className="text-[#4DA3FF]">Safety: {data.consensus}%</p>
        {data.vulnerabilityCount !== undefined && (
          <p className="text-[#8FA3B8] text-xs mt-1">
            Open Issues: {data.vulnerabilityCount}
          </p>
        )}
        <p className="text-[#8FA3B8]/60 text-[10px] mt-2 italic">Click to view details</p>
      </div>
    );
  }
  return null;
};

export const DeploymentSafetyChart: React.FC<DeploymentSafetyChartProps> = ({
  data,
  currentConsensus,
  onPointClick,
  selectedCommitHash,
}) => {
  // Determine status label and color based on current consensus
  let statusLabel = 'Unsafe';
  let statusColor = 'text-red-400';
  
  if (currentConsensus >= 70) {
    statusLabel = 'Safe';
    statusColor = 'text-emerald-400';
  } else if (currentConsensus >= 40) {
    statusLabel = 'Needs Work';
    statusColor = 'text-yellow-400';
  }

  // Custom dot to highlight selected commit
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
    <div className="flex flex-col h-full w-full">
      <div className="flex items-end justify-between mb-4 px-1">
        <div>
          <h2 className="text-[#8FA3B8] text-sm uppercase tracking-wider font-medium mb-1">
            Is this safe for deployment?
          </h2>
          <div className="flex items-baseline gap-3">
            <span className="text-[64px] font-display font-extrabold text-[#E6EEF8] leading-none tracking-tight drop-shadow-2xl">
              {currentConsensus}%
            </span>
            <span className={`text-lg font-medium ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
        </div>
        {selectedCommitHash && (
           <div className="text-xs text-[#8FA3B8] bg-[#1C2430] px-2 py-1 rounded">
             Viewing Commit: <span className="text-[#E6EEF8] font-mono">{selectedCommitHash.substring(0, 7)}</span>
           </div>
        )}
      </div>

      <div className="flex-1 w-full min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 10, right: 30, left: -20, bottom: 0 }}
            onClick={(e) => {
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
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#4DA3FF', strokeWidth: 1, strokeDasharray: '4 4' }} />
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
};
