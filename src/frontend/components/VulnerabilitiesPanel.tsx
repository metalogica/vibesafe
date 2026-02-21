'use client';

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Maximize2,
  XCircle,
} from 'lucide-react';

import type { SeverityFilter, Vulnerability } from '@/src/frontend/types';

interface VulnerabilitiesPanelProps {
  vulnerabilities: Vulnerability[];
  filter: SeverityFilter;
  setFilter: (filter: SeverityFilter) => void;
  isLoading?: boolean;
  onVulnerabilityClick: (vuln: Vulnerability) => void;
  onApplyFixes?: () => void;
  isAuditComplete?: boolean;
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical':
      return 'text-red-500 bg-red-500/10 border-red-500/20';
    case 'high':
      return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    case 'medium':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    case 'low':
      return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    default:
      return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
  }
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case 'critical':
      return <AlertOctagon className="h-4 w-4" />;
    case 'high':
      return <AlertTriangle className="h-4 w-4" />;
    case 'medium':
      return <AlertTriangle className="h-4 w-4" />;
    case 'low':
      return <Info className="h-4 w-4" />;
    default:
      return <Info className="h-4 w-4" />;
  }
}

const FILTER_OPTIONS: SeverityFilter[] = [
  'all',
  'critical',
  'high',
  'medium',
  'low',
];

export function VulnerabilitiesPanel({
  vulnerabilities,
  filter,
  setFilter,
  isLoading = false,
  onVulnerabilityClick,
  onApplyFixes,
  isAuditComplete = false,
}: VulnerabilitiesPanelProps) {
  const filteredVulnerabilities = vulnerabilities.filter(
    (v) => filter === 'all' || v.severity === filter,
  );

  return (
    <div className="flex h-full flex-col border-r border-[#1C2430] bg-[#0F1620]">
      <div className="border-b border-[#1C2430] p-4">
        <h2 className="mb-4 text-lg font-semibold text-[#E6EEF8]">
          Vulnerabilities
        </h2>

        <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? 'border-[#4DA3FF]/30 bg-[#4DA3FF]/20 text-[#4DA3FF]'
                  : 'border-[#1C2430] bg-[#131B26] text-[#8FA3B8] hover:bg-[#1C2430]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-[#1C2430] bg-[#131B26]"
            />
          ))
        ) : filteredVulnerabilities.length === 0 ? (
          <div className="py-10 text-center text-[#8FA3B8]">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 opacity-20" />
            <p className="text-sm">
              No vulnerabilities found matching filter.
            </p>
          </div>
        ) : (
          filteredVulnerabilities.map((vuln) => (
            <div
              key={vuln.id}
              onClick={() => onVulnerabilityClick(vuln)}
              className={`group relative cursor-pointer rounded-lg border p-4 transition-all hover:border-[#4DA3FF]/50 ${
                vuln.status === 'fixed'
                  ? 'border-[#1C2430] bg-[#131B26]/50 opacity-60'
                  : 'border-[#1C2430] bg-[#131B26] hover:bg-[#1C2430]/80'
              }`}
            >
              <div className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="h-4 w-4 text-[#4DA3FF]" />
              </div>

              <div className="mb-2 flex items-start justify-between pr-6">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getSeverityColor(
                      vuln.severity,
                    )}`}
                  >
                    {getSeverityIcon(vuln.severity)}
                    {vuln.severity}
                  </span>
                  <span className="font-mono text-xs text-[#8FA3B8]">
                    {vuln.id}
                  </span>
                </div>
                {vuln.status === 'fixed' ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" /> Fixed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-red-400">
                    <XCircle className="h-3 w-3" /> Open
                  </span>
                )}
              </div>

              <h3 className="mb-1 line-clamp-1 text-sm font-semibold text-[#E6EEF8] transition-colors group-hover:text-[#4DA3FF]">
                {vuln.title}
              </h3>
              <p className="mb-2 font-mono text-xs text-[#8FA3B8] opacity-75">
                {vuln.file}
              </p>
              <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-[#8FA3B8]">
                {vuln.description}
              </p>

              <div className="rounded border border-[#1C2430] bg-[#0B0F14] p-2 text-xs">
                <span className="mr-1 font-medium text-[#4DA3FF]">Fix:</span>
                <span className="line-clamp-1 font-mono text-[#E6EEF8]/80">
                  {vuln.fix}
                </span>
              </div>

              <div className="mt-2 flex justify-end">
                <span className="text-[10px] text-[#8FA3B8]/50">
                  Detected in {vuln.commitDetected.substring(0, 7)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {onApplyFixes && isAuditComplete && (
        <div className="border-t border-[#1C2430] bg-[#0B0F14] p-4">
          <button
            onClick={onApplyFixes}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4DA3FF] py-3 font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-[#3b82f6] active:scale-[0.98]"
          >
            <CheckCircle2 className="h-4 w-4" />
            Apply Fixes & Commit
          </button>
        </div>
      )}
    </div>
  );
}
