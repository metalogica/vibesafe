'use client';

import { useEffect, useRef, useState } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Github,
  History,
  Loader2,
  Play,
  Sparkles,
  X,
} from 'lucide-react';

import { AgentFeed } from './AgentFeed';
import { DeploymentSafetyChart } from './DeploymentSafetyChart';
import { VulnerabilitiesPanel } from './VulnerabilitiesPanel';
import { VulnerabilityModal } from './VulnerabilityModal';
import {
  AUDIT_SCENARIO_MESSAGES,
  FIX_SCENARIO_MESSAGES,
  INITIAL_VULNERABILITIES,
  generateCommitHash,
} from '@/src/frontend/data/mockAuditData';
import type {
  AgentMessage,
  AuditSnapshot,
  AuditStatus,
  CommitData,
  SeverityFilter,
  Vulnerability,
} from '@/src/frontend/types';

export default function SecurityAuditApp() {
  const [repoUrl, setRepoUrl] = useState('');
  const [status, setStatus] = useState<AuditStatus>('idle');

  // Current live state
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [currentConsensus, setCurrentConsensus] = useState(0);

  // History state
  const [auditHistory, setAuditHistory] = useState<AuditSnapshot[]>([]);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
    null,
  );

  // UI state
  const [vulnFilter, setVulnFilter] = useState<SeverityFilter>('all');
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Chart data
  const [commits, setCommits] = useState<CommitData[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Derived state for view
  const activeSnapshot = selectedCommitHash
    ? auditHistory.find((h) => h.hash === selectedCommitHash)
    : null;

  const displayMessages = activeSnapshot ? activeSnapshot.messages : messages;
  const displayVulnerabilities = activeSnapshot
    ? activeSnapshot.vulnerabilities
    : vulnerabilities;
  const displayConsensus = activeSnapshot
    ? activeSnapshot.consensus
    : currentConsensus;

  const createMessage = (data: {
    agent: string;
    text: string;
    belief?: number;
  }): AgentMessage => ({
    id: Math.random().toString(36).substr(2, 9),
    agent: data.agent as AgentMessage['agent'],
    text: data.text,
    belief: data.belief,
    timestamp: Date.now(),
  });

  const startAudit = () => {
    if (!repoUrl) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    setStatus('auditing');
    setMessages([]);
    setVulnerabilities([]);
    setCommits([]);
    setAuditHistory([]);
    setSelectedCommitHash(null);
    setCurrentConsensus(50);

    const initialCommitHash = generateCommitHash();
    let msgIndex = 0;

    intervalRef.current = setInterval(() => {
      if (msgIndex >= AUDIT_SCENARIO_MESSAGES.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatus('ready');
        setVulnerabilities(INITIAL_VULNERABILITIES);

        const lastMsg =
          AUDIT_SCENARIO_MESSAGES[AUDIT_SCENARIO_MESSAGES.length - 1];
        const finalConsensus = lastMsg.belief!;
        setCurrentConsensus(finalConsensus);

        const fullMessages = AUDIT_SCENARIO_MESSAGES.map((m) =>
          createMessage(m),
        );

        const snapshot: AuditSnapshot = {
          hash: initialCommitHash,
          consensus: finalConsensus,
          messages: fullMessages,
          vulnerabilities: INITIAL_VULNERABILITIES,
        };

        setAuditHistory([snapshot]);
        setCommits([
          {
            hash: initialCommitHash,
            consensus: finalConsensus,
            vulnerabilityCount: INITIAL_VULNERABILITIES.length,
          },
        ]);

        setMessages(fullMessages);

        return;
      }

      const msgData = AUDIT_SCENARIO_MESSAGES[msgIndex];
      const newMessage = createMessage(msgData);

      setMessages((prev) => [...prev, newMessage]);
      if (msgData.belief !== undefined) {
        setCurrentConsensus(msgData.belief);
      }
      msgIndex++;
    }, 800);
  };

  const simulateNewCommit = () => {
    if (status !== 'ready') return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    setStatus('auditing');
    setSelectedCommitHash(null);

    const prevVulns = vulnerabilities;
    const newCommitHash = generateCommitHash();

    setMessages([]);

    let msgIndex = 0;

    intervalRef.current = setInterval(() => {
      if (msgIndex >= FIX_SCENARIO_MESSAGES.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatus('ready');

        const newVulns = prevVulns.map((v) =>
          v.id === 'SEC-A-001' || v.id === 'SEC-A-002' || v.id === 'SEC-A-003'
            ? { ...v, status: 'fixed' as const }
            : v,
        );
        setVulnerabilities(newVulns);

        const lastMsg =
          FIX_SCENARIO_MESSAGES[FIX_SCENARIO_MESSAGES.length - 1];
        const finalConsensus = lastMsg.belief!;
        setCurrentConsensus(finalConsensus);

        const fullMessages = FIX_SCENARIO_MESSAGES.map((m) =>
          createMessage(m),
        );

        const snapshot: AuditSnapshot = {
          hash: newCommitHash,
          consensus: finalConsensus,
          messages: fullMessages,
          vulnerabilities: newVulns,
        };

        setAuditHistory((prev) => [...prev, snapshot]);
        setCommits((prev) => [
          ...prev,
          {
            hash: newCommitHash,
            consensus: finalConsensus,
            vulnerabilityCount: newVulns.filter((v) => v.status === 'open')
              .length,
          },
        ]);

        setMessages(fullMessages);
        return;
      }

      const msgData = FIX_SCENARIO_MESSAGES[msgIndex];
      const newMessage = createMessage(msgData);

      setMessages((prev) => [...prev, newMessage]);
      if (msgData.belief !== undefined) {
        setCurrentConsensus(msgData.belief);
      }
      msgIndex++;
    }, 800);
  };

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
        <div className="flex items-center gap-3">
          <div className="rotate-3 transform rounded-xl bg-[#4DA3FF] p-2 shadow-lg shadow-blue-500/20 transition-transform hover:rotate-6">
            <Sparkles className="h-5 w-5 fill-white text-white" />
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight text-[#E6EEF8]">
            VibeSafe
          </h1>
        </div>

        <div className="mx-8 max-w-2xl flex-1">
          <div className="group relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Github className="h-5 w-5 text-[#8FA3B8]" />
            </div>
            <input
              type="text"
              className="block w-full rounded-lg border border-[#1C2430] bg-[#0F1620] py-2.5 pl-10 pr-32 text-sm placeholder-[#8FA3B8] transition-all focus:border-[#4DA3FF] focus:ring-1 focus:ring-[#4DA3FF] focus:outline-none"
              placeholder="Paste GitHub repository URL..."
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={status === 'auditing'}
            />
            <button
              onClick={startAudit}
              disabled={!repoUrl || status === 'auditing'}
              className="absolute top-1 right-1 bottom-1 flex items-center gap-2 rounded-md bg-[#4DA3FF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#3b82f6] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'auditing' ? (
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
              status === 'idle'
                ? 'border-transparent bg-[#1C2430] text-[#8FA3B8]'
                : status === 'auditing'
                  ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-500'
                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {status === 'idle'
              ? 'Idle'
              : status === 'auditing'
                ? 'Auditing...'
                : 'Report Ready'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Left Sidebar: Vulnerabilities */}
        <aside className="flex h-full w-[35%] min-w-[350px] max-w-[450px] flex-col border-r border-[#1C2430]">
          <VulnerabilitiesPanel
            vulnerabilities={displayVulnerabilities}
            filter={vulnFilter}
            setFilter={setVulnFilter}
            isLoading={
              status === 'auditing' && displayVulnerabilities.length === 0
            }
            onVulnerabilityClick={setSelectedVuln}
            onApplyFixes={simulateNewCommit}
            isAuditComplete={status === 'ready' && commits.length < 2}
          />
        </aside>

        {/* Right Content: Chart + Feed */}
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0B0F14]">
          {/* Chart Section */}
          <div className="relative z-10 flex min-h-[220px] flex-none flex-col border-b border-[#1C2430] bg-[#0B0F14] p-6 h-[40%]">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-[#E6EEF8]">
                  Audit Summary
                </h2>
                {auditHistory.length > 0 && (
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
                currentConsensus={displayConsensus}
                onPointClick={handlePointClick}
                selectedCommitHash={selectedCommitHash}
              />
            </div>

            <div className="mt-2 shrink-0 text-center">
              <p className="text-[10px] font-medium uppercase tracking-widest text-[#8FA3B8]/50">
                Interactive Timeline &bull; Click points to view history
              </p>
            </div>
          </div>

          {/* Feed Section */}
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0B0F14] p-6">
            <AgentFeed
              messages={displayMessages}
              isAuditing={status === 'auditing' && !selectedCommitHash}
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
