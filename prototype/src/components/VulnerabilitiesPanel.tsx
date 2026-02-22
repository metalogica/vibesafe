import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle, AlertOctagon, Info, Maximize2 } from 'lucide-react';

export interface Vulnerability {
  id: string;
  title: string;
  file: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  fix: string;
  status: 'open' | 'fixed';
  commitDetected: string;
}

interface VulnerabilitiesPanelProps {
  vulnerabilities: Vulnerability[];
  filter: 'all' | 'critical' | 'high' | 'medium' | 'low';
  setFilter: (filter: 'all' | 'critical' | 'high' | 'medium' | 'low') => void;
  isLoading?: boolean;
  onVulnerabilityClick: (vuln: Vulnerability) => void;
  onApplyFixes?: () => void;
  isAuditComplete?: boolean;
}

export const VulnerabilitiesPanel: React.FC<VulnerabilitiesPanelProps> = ({
  vulnerabilities,
  filter,
  setFilter,
  isLoading = false,
  onVulnerabilityClick,
  onApplyFixes,
  isAuditComplete = false,
}) => {
  const filteredVulnerabilities = vulnerabilities.filter(
    (v) => filter === 'all' || v.severity === filter
  );

  const getSeverityColor = (severity: string) => {
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
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertOctagon className="w-4 h-4" />;
      case 'high':
        return <AlertTriangle className="w-4 h-4" />;
      case 'medium':
        return <AlertTriangle className="w-4 h-4" />;
      case 'low':
        return <Info className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0F1620] border-r border-[#1C2430]">
      <div className="p-4 border-b border-[#1C2430]">
        <h2 className="text-[#E6EEF8] font-semibold text-lg mb-4">
          Vulnerabilities
        </h2>
        
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap border ${
                filter === f
                  ? 'bg-[#4DA3FF]/20 text-[#4DA3FF] border-[#4DA3FF]/30'
                  : 'bg-[#131B26] text-[#8FA3B8] border-[#1C2430] hover:bg-[#1C2430]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          // Skeleton loading
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-[#131B26] rounded-lg animate-pulse border border-[#1C2430]"
            />
          ))
        ) : filteredVulnerabilities.length === 0 ? (
          <div className="text-center py-10 text-[#8FA3B8]">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium text-[#E6EEF8] mb-1">Clean as a whistle...</p>
            <p className="text-xs opacity-60">...or maybe you just haven't looked yet? 👀</p>
          </div>
        ) : (
          filteredVulnerabilities.map((vuln) => (
            <div
              key={vuln.id}
              onClick={() => onVulnerabilityClick(vuln)}
              className={`group p-4 rounded-lg border transition-all hover:border-[#4DA3FF]/50 cursor-pointer relative ${
                vuln.status === 'fixed'
                  ? 'bg-[#131B26]/50 border-[#1C2430] opacity-60'
                  : 'bg-[#131B26] border-[#1C2430] hover:bg-[#1C2430]/80'
              }`}
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-4 h-4 text-[#4DA3FF]" />
              </div>

              <div className="flex items-start justify-between mb-2 pr-6">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getSeverityColor(
                      vuln.severity
                    )}`}
                  >
                    {getSeverityIcon(vuln.severity)}
                    {vuln.severity}
                  </span>
                  <span className="text-[#8FA3B8] text-xs font-mono">
                    {vuln.id}
                  </span>
                </div>
                {vuln.status === 'fixed' ? (
                  <span className="flex items-center gap-1 text-emerald-500 text-xs font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Fixed
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                    <XCircle className="w-3 h-3" /> Open
                  </span>
                )}
              </div>

              <h3 className="text-[#E6EEF8] text-sm font-semibold mb-1 group-hover:text-[#4DA3FF] transition-colors line-clamp-1">
                {vuln.title}
              </h3>
              <p className="text-[#8FA3B8] text-xs font-mono mb-2 opacity-75">
                {vuln.file}
              </p>
              <p className="text-[#8FA3B8] text-xs leading-relaxed mb-3 line-clamp-2">
                {vuln.description}
              </p>

              <div className="bg-[#0B0F14] p-2 rounded border border-[#1C2430] text-xs">
                <span className="text-[#4DA3FF] font-medium mr-1">Fix:</span>
                <span className="text-[#E6EEF8]/80 font-mono line-clamp-1">{vuln.fix}</span>
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

      {/* Action Footer */}
      {onApplyFixes && isAuditComplete && (
        <div className="p-4 border-t border-[#1C2430] bg-[#0B0F14]">
          <button
            onClick={onApplyFixes}
            className="w-full flex items-center justify-center gap-2 bg-[#4DA3FF] hover:bg-[#3b82f6] text-white py-3 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
          >
            <CheckCircle2 className="w-4 h-4" />
            Apply Fixes & Commit
          </button>
        </div>
      )}
    </div>
  );
};
