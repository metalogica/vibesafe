'use client';

import { useMutation, useQuery } from 'convex/react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Github,
  History,
  Loader2,
  Play,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { calculateSafetyProbability } from '@/src/domain/audit/evaluator';
import { parseGitHubUrl } from '@/src/domain/audit/parseGitHubUrl';
import type {
  AuditStatus,
  CommitData,
  SeverityFilter,
  Vulnerability,
} from '@/src/frontend/types';

import Link from 'next/link';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  mapAnalysisToVulnerability,
  mapEventToMessage,
} from '../lib/auditMappers';
import { AgentFeed } from './AgentFeed';
import { DeploymentSafetyChart } from './DeploymentSafetyChart';
import { VulnerabilitiesPanel } from './VulnerabilitiesPanel';
import { VulnerabilityModal } from './VulnerabilityModal';

export default function SecurityAuditApp({
  initialUrl,
}: {
  initialUrl?: string;
}) {
  // User input
  const [repoUrl, setRepoUrl] = useState(initialUrl ?? '');

  // Current audit tracking
  const [currentAuditId, setCurrentAuditId] = useState<Id<'audits'> | null>(
    null,
  );

  // UI state
  const [vulnFilter, setVulnFilter] = useState<SeverityFilter>('all');
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
    null,
  );

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Mutation to start audit
  const createAndStart = useMutation(api.audits.createAndStart);

  // Real-time subscriptions (skip when no auditId)
  const audit = useQuery(
    api.audits.get,
    currentAuditId ? { auditId: currentAuditId } : 'skip',
  );
  const events = useQuery(
    api.auditEvents.listByAudit,
    currentAuditId ? { auditId: currentAuditId } : 'skip',
  );
  const analyses = useQuery(
    api.analyses.listByAudit,
    currentAuditId ? { auditId: currentAuditId } : 'skip',
  );
  const evaluation = useQuery(
    api.evaluations.getByAudit,
    currentAuditId ? { auditId: currentAuditId } : 'skip',
  );
  const streamingInference = useQuery(
    api.inferences.getStreamingByAudit,
    currentAuditId ? { auditId: currentAuditId } : 'skip',
  );

  // Audit history for this repo
  const normalizedUrl = useMemo(() => {
    const parsed = parseGitHubUrl(repoUrl);
    return parsed ? `https://github.com/${parsed.owner}/${parsed.repo}` : null;
  }, [repoUrl]);

  const history = useQuery(
    api.audits.listByRepoWithEvaluation,
    normalizedUrl ? { repoUrl: normalizedUrl } : 'skip',
  );

  // Map Convex status to UI status
  const uiStatus: AuditStatus = !audit
    ? 'idle'
    : audit.status === 'complete' || audit.status === 'failed'
      ? 'ready'
      : 'auditing';

  // Map events to messages
  const messages = useMemo(
    () => (events ?? []).map(mapEventToMessage),
    [events],
  );

  // Map analyses to vulnerabilities
  const vulnerabilities = useMemo(
    () => (analyses ?? []).map(mapAnalysisToVulnerability),
    [analyses],
  );

  // Running probability (updates in real-time as vulns stream in)
  const currentConsensus = useMemo(() => {
    if (evaluation) return evaluation.probability;
    if (!analyses || analyses.length === 0) return 100;
    return calculateSafetyProbability(analyses);
  }, [analyses, evaluation]);

  // Chart data from history
  const commits: CommitData[] = useMemo(() => {
    if (!history) return [];
    return history
      .filter((a) => a.status === 'complete' && a.evaluation)
      .reverse()
      .map((a) => ({
        hash: a.commitHash ?? a._id.slice(0, 7),
        consensus: a.evaluation!.probability,
        vulnerabilityCount: a.evaluation!.vulnerabilityCount,
      }));
  }, [history]);

  // Start audit handler
  const handleStartAudit = async () => {
    if (!repoUrl) return;
    setError(null);
    try {
      const result = await createAndStart({ repoUrl });
      setCurrentAuditId(result.auditId);
      setSelectedCommitHash(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };

  // Auto-start audit when navigated from landing page with URL param
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (initialUrl && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      handleStartAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointClick = (hash: string) => {
    if (hash === selectedCommitHash) {
      setSelectedCommitHash(null);
    } else {
      setSelectedCommitHash(hash);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B0F14] font-sans text-[#E6EEF8]">
      {/* Top Bar */}
      <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-[#1C2430] bg-[#0B0F14] px-6">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/roastybara-logo.png"
            alt="Roastybara"
            className="h-9 w-9 rotate-3 transform rounded-xl shadow-lg shadow-blue-500/20 transition-transform hover:rotate-6"
          />
          <h1 className="font-display text-xl font-bold tracking-tight text-[#E6EEF8]">
            Roastybara
          </h1>
        </Link>

        <div className="mx-8 max-w-2xl flex-1">
          <div className="group relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Github className="h-5 w-5 text-[#8FA3B8]" />
            </div>
            <input
              type="text"
              className="block w-full rounded-lg border border-[#1C2430] bg-[#0F1620] py-2.5 pr-32 pl-10 text-sm placeholder-[#8FA3B8] transition-all focus:border-[#4DA3FF] focus:ring-1 focus:ring-[#4DA3FF] focus:outline-none"
              placeholder="Paste GitHub repository URL..."
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={uiStatus === 'auditing'}
            />
            <button
              onClick={handleStartAudit}
              disabled={!repoUrl || uiStatus === 'auditing'}
              className="absolute top-1 right-1 bottom-1 flex items-center gap-2 rounded-md bg-[#4DA3FF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#3b82f6] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uiStatus === 'auditing' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Auditing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Audit
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-[#1C2430] bg-[#1C2430] px-3 py-1.5 text-xs font-medium text-[#8FA3B8] transition-colors hover:bg-[#2a3441] hover:text-[#E6EEF8]"
          >
            <History className="h-4 w-4" />
            <span>History</span>
            <span className="rounded bg-[#0B0F14] px-1.5 text-[10px] text-[#4DA3FF]">
              {commits.length}
            </span>
          </button>

          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              uiStatus === 'idle'
                ? 'border-transparent bg-[#1C2430] text-[#8FA3B8]'
                : uiStatus === 'auditing'
                  ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500'
                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {uiStatus === 'idle'
              ? 'Idle'
              : uiStatus === 'auditing'
                ? 'Auditing...'
                : 'Report Ready'}
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {(error || audit?.status === 'failed') && (
        <div className="flex items-center gap-3 border-b border-red-500/20 bg-red-500/10 px-6 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="flex-1 text-sm text-red-400">
            {audit?.status === 'failed' ? audit.error : error}
          </p>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-red-400 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Truncation Warning */}
      {audit?.truncated && (
        <div className="flex items-center gap-3 border-b border-yellow-500/20 bg-yellow-500/10 px-6 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
          <p className="text-xs text-yellow-400">
            Repository was too large to fully analyze. Results are based on a
            subset of files prioritized by security relevance.
          </p>
        </div>
      )}

      {/* Main Content */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Left Sidebar: Vulnerabilities */}
        <aside className="flex h-full w-[35%] max-w-[450px] min-w-[350px] flex-col border-r border-[#1C2430]">
          <VulnerabilitiesPanel
            vulnerabilities={vulnerabilities}
            filter={vulnFilter}
            setFilter={setVulnFilter}
            isLoading={uiStatus === 'auditing' && vulnerabilities.length === 0}
            onVulnerabilityClick={setSelectedVuln}
          />
        </aside>

        {/* Right Content: Chart + Feed */}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0B0F14]">
          {/* Chart Section */}
          <div className="relative z-10 flex h-[40%] min-h-[220px] flex-none flex-col border-b border-[#1C2430] bg-[#0B0F14] p-6">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-[#E6EEF8]">
                  Audit Summary
                </h2>
                {commits.length > 0 && (
                  <div className="flex items-center gap-2 rounded-full border border-[#1C2430] bg-[#1C2430] px-3 py-1">
                    <History className="h-3 w-3 text-[#8FA3B8]" />
                    <span className="text-xs text-[#8FA3B8]">
                      {selectedCommitHash
                        ? `Viewing Commit: ${selectedCommitHash.substring(0, 7)}`
                        : 'Viewing Latest Live State'}
                    </span>
                    {selectedCommitHash && (
                      <button
                        onClick={() => setSelectedCommitHash(null)}
                        className="ml-1 hover:text-[#E6EEF8]"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden pb-2">
              <DeploymentSafetyChart
                data={commits}
                currentConsensus={currentConsensus}
                onPointClick={handlePointClick}
                selectedCommitHash={selectedCommitHash}
              />
            </div>

            <div className="mt-2 shrink-0 text-center">
              <p className="text-[10px] font-medium tracking-widest text-[#8FA3B8]/50 uppercase">
                Interactive Timeline &bull; Click points to view history
              </p>
            </div>
          </div>

          {/* Feed Section */}
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0B0F14] p-6">
            <AgentFeed
              messages={messages}
              isAuditing={uiStatus === 'auditing' && !selectedCommitHash}
              streamingText={streamingInference?.streamingText ?? null}
            />
          </div>
        </section>

        {/* Version History Drawer */}
        {isHistoryOpen && (
          <div className="absolute inset-0 z-50 flex justify-end">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsHistoryOpen(false)}
            />
            <div className="animate-in slide-in-from-right relative flex h-full w-80 flex-col border-l border-[#1C2430] bg-[#0F1620] shadow-2xl duration-200">
              <div className="flex items-center justify-between border-b border-[#1C2430] bg-[#0B0F14] p-4">
                <h3 className="flex items-center gap-2 font-semibold text-[#E6EEF8]">
                  <Clock className="h-4 w-4 text-[#4DA3FF]" />
                  Version History
                </h3>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="rounded p-1 text-[#8FA3B8] hover:bg-[#1C2430] hover:text-[#E6EEF8]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {commits.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[#8FA3B8]">
                    No history available yet.
                  </div>
                ) : (
                  [...commits].reverse().map((commit, index) => (
                    <div
                      key={commit.hash}
                      onClick={() => handlePointClick(commit.hash)}
                      className={`cursor-pointer rounded-lg border p-3 transition-all ${
                        selectedCommitHash === commit.hash ||
                        (!selectedCommitHash && index === 0)
                          ? 'border-[#4DA3FF]/50 bg-[#1C2430]'
                          : 'border-[#1C2430] bg-[#131B26] hover:border-[#8FA3B8]/30'
                      }`}
                    >
                      <div className="mb-1 flex items-start justify-between">
                        <span className="rounded bg-[#4DA3FF]/10 px-1.5 py-0.5 font-mono text-xs text-[#4DA3FF]">
                          {commit.hash.substring(0, 7)}
                        </span>
                        <span
                          className={`font-display text-lg font-bold ${
                            commit.consensus >= 90
                              ? 'text-emerald-400'
                              : commit.consensus >= 70
                                ? 'text-yellow-400'
                                : 'text-red-400'
                          }`}
                        >
                          {commit.consensus}%
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-[#8FA3B8]">
                        {commit.vulnerabilityCount === 0 ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Safe
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-orange-400">
                            <AlertTriangle className="h-3 w-3" />{' '}
                            {commit.vulnerabilityCount} Issues
                          </span>
                        )}
                        <span className="text-[#1C2430]">|</span>
                        <span>{index === 0 ? 'Latest' : 'Previous'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      <VulnerabilityModal
        vulnerability={selectedVuln}
        isOpen={!!selectedVuln}
        onClose={() => setSelectedVuln(null)}
      />
    </div>
  );
}
