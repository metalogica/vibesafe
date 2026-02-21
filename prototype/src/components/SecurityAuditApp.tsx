import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Github, Play, Loader2, GitCommit, History, ChevronRight, X, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { DeploymentSafetyChart } from './DeploymentSafetyChart';
import { AgentFeed, AgentMessage } from './AgentDiscussion';
import { VulnerabilitiesPanel, Vulnerability } from './VulnerabilitiesPanel';
import { VulnerabilityModal } from './VulnerabilityModal';

// --- Mock Data Generators ---

const generateCommitHash = () => {
  return Math.random().toString(36).substring(2, 10);
};

const INITIAL_VULNERABILITIES: Vulnerability[] = [
  {
    id: 'SEC-A-001',
    title: 'Unauthenticated Payment Session Creation',
    file: '/api/create-checkout-session.ts',
    severity: 'critical',
    description: 'The /api/create-checkout-session endpoint accepts userId directly from the request body without verifying the caller\'s identity. An attacker can create Stripe checkout sessions for any user ID, complete the payment themselves, and credit another user\'s account.',
    impact: 'Direct revenue theft and fraudulent crediting. Attackers can fund arbitrary accounts without authorization.',
    fix: "Replace client-provided userId with server-authenticated user ID. Modify /api/create-checkout-session.ts to:\n1. Accept bearer token in Authorization header\n2. Call supabaseAdmin.auth.getUser(token) to extract verified user.id\n3. Use this server-verified ID for metadata.userId\n4. Reject requests with missing/invalid tokens (401)",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-002',
    title: 'Webhook Payment Replay Attack',
    file: '/api/webhooks/stripe.ts',
    severity: 'critical',
    description: 'The Stripe webhook handler lacks idempotency controls. It inserts payment records based solely on session.metadata.userId and amount_total without checking if the stripe_payment_id already exists.',
    impact: 'Unlimited credit creation and financial loss. An attacker can replay the same webhook event indefinitely to mint credits.',
    fix: "Add idempotency key checking before payment insertion. Modify /api/webhooks/stripe.ts to:\n1. Query payments table for existing stripe_payment_id before insert\n2. If record exists, log warning and return 200\n3. Add unique constraint on stripe_payment_id column",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-003',
    title: 'Client-Side Credit Enforcement Bypass',
    file: 'services/geminiService.ts',
    severity: 'critical',
    description: 'Hybrid generation paths bypass server-side credit validation. In local mode, credit deduction occurs client-side via a "fire-and-forget" RLS insert which can be blocked or manipulated.',
    impact: 'Free unlimited usage and monetization failure. Attackers can generate content without paying.',
    fix: "Remove local generation mode from production builds.\n1. Remove API_KEY from all environment configs\n2. Force all production calls through /api/generate with server-side credit checks\n3. Add server-side rate limiting",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-004',
    title: 'Public Project UUID Enumeration',
    file: 'hooks/session/useProjectState.ts',
    severity: 'high',
    description: 'Insufficient RLS enables enumeration of project UUIDs. Client queries filter by owner_id but the RLS policy allows SELECT if is_public = true, enabling enumeration of all public projects.',
    impact: 'Cross-tenant data exposure. Attackers can scrape all public project metadata and file paths.',
    fix: "Tighten RLS policies and add explicit share tokens.\n1. Remove anonymous SELECT policy on projects table\n2. Add share_token column to projects\n3. Require share_token in RLS policy for public access",
    status: 'open',
    commitDetected: '8f2a1b',
  },
  {
    id: 'SEC-A-007',
    title: 'API Key Exposure in Client Bundle',
    file: 'services/geminiService.ts',
    severity: 'high',
    description: 'API keys risk inclusion in client bundles. The system instruction and API key logic is bundled into client-side JavaScript if process.env.API_KEY is set during build.',
    impact: 'API abuse and unexpected provider charges. Leaks proprietary prompt engineering IP.',
    fix: "Remove all Google Gemini API interaction from client.\n1. Delete API_KEY references from .env\n2. Move SYSTEM_INSTRUCTION_TEXT to server-only module\n3. Audit production bundle to confirm removal",
    status: 'open',
    commitDetected: '8f2a1b',
  },
];

const AUDIT_SCENARIO_MESSAGES = [
  {
    agent: 'retriever',
    text: "Scanning Dreamtable repository... Found Supabase configuration, Stripe integration, and Gemini AI service wrappers. Identifying auth patterns...",
    delay: 500,
  },
  {
    agent: 'retriever',
    text: "Retrieved Stripe documentation on Webhook Best Practices. Idempotency checks are required to prevent double-crediting. Checking /api/webhooks/stripe.ts...",
    delay: 1500,
  },
  {
    agent: 'security',
    text: "Critical finding in /api/webhooks/stripe.ts. No check for existing stripe_payment_id before inserting credits. This allows replay attacks.",
    delay: 2500,
  },
  {
    agent: 'retriever',
    text: "Analyzing /api/create-checkout-session.ts against authentication specs. Endpoint accepts 'userId' in request body.",
    delay: 3500,
  },
  {
    agent: 'security',
    text: "Confirmed. The endpoint trusts the client-provided userId. I can create a session for any user. This is a Critical broken access control vulnerability (SEC-A-001).",
    delay: 4500,
  },
  {
    agent: 'security',
    text: "Also found API_KEY usage in client-side geminiService.ts. This exposes the LLM credentials to the browser.",
    delay: 5500,
  },
  {
    agent: 'evaluator',
    text: "Audit Complete. 3 Critical and 2 High severity vulnerabilities found. Payment system is insecure and API keys are exposed. Deployment unsafe.",
    belief: 12,
    delay: 6500,
  },
];

const FIX_SCENARIO_MESSAGES = [
  {
    agent: 'retriever',
    text: "Detecting changes... /api/create-checkout-session.ts now verifies Bearer tokens. /api/webhooks/stripe.ts added idempotency check.",
    delay: 500,
  },
  {
    agent: 'security',
    text: "Verifying SEC-A-001 fix. The endpoint now derives userId from supabaseAdmin.auth.getUser(). Client-side spoofing is impossible.",
    delay: 1500,
  },
  {
    agent: 'security',
    text: "Verifying SEC-A-002 fix. Database constraint added for stripe_payment_id. Replay attacks will now fail at the database level.",
    delay: 2500,
  },
  {
    agent: 'retriever',
    text: "Checking geminiService.ts. Client-side generation code removed. All calls routed through /api/generate.",
    delay: 3500,
  },
  {
    agent: 'evaluator',
    text: "Re-evaluation complete. Critical payment and auth vulnerabilities resolved. RLS policies tightened. Deployment approved.",
    belief: 94,
    delay: 4500,
  },
];

// --- Types ---

interface AuditSnapshot {
  hash: string;
  consensus: number;
  messages: AgentMessage[];
  vulnerabilities: Vulnerability[];
}

// --- Main Component ---

export default function SecurityAuditApp() {
  const [repoUrl, setRepoUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'auditing' | 'ready'>('idle');
  
  // Current live state
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [currentConsensus, setCurrentConsensus] = useState(0);
  
  // History state
  const [auditHistory, setAuditHistory] = useState<AuditSnapshot[]>([]);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  
  // UI state
  const [vulnFilter, setVulnFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [selectedVuln, setSelectedVuln] = useState<Vulnerability | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Derived state for view
  const activeSnapshot = selectedCommitHash 
    ? auditHistory.find(h => h.hash === selectedCommitHash) 
    : null;

  const displayMessages = activeSnapshot ? activeSnapshot.messages : messages;
  const displayVulnerabilities = activeSnapshot ? activeSnapshot.vulnerabilities : vulnerabilities;
  const displayConsensus = activeSnapshot ? activeSnapshot.consensus : currentConsensus;

  // Chart data derived from history + current live state (if auditing/ready)
  const chartData = auditHistory.map(h => ({
    hash: h.hash,
    consensus: h.consensus,
    vulnerabilityCount: h.vulnerabilities.filter(v => v.status === 'open').length
  }));

  // If we are currently auditing or have a latest state that isn't in history yet (during live update),
  // we might want to show it. But for simplicity, we'll push to history ONLY when audit completes.
  // However, to show live chart updates, we need to append the "current" state to the chart data if it's not saved yet.
  // Actually, let's push to history at the END of the audit.
  
  // Wait, if we push to history at the end, the chart won't update live.
  // Let's keep a separate "live commit" object if needed, or just rely on history.
  // Better approach: When audit starts, create a "pending" snapshot entry?
  // Let's stick to the previous pattern: `commits` state for chart, and `auditHistory` for full details.
  
  // Let's reconstruct chart data from history.
  // And if we are 'auditing', we show a temporary point?
  // Let's simplify: `auditHistory` is the source of truth for COMPLETED audits.
  // While auditing, we update `currentConsensus` but don't add to history until finished.
  
  // Actually, the previous chart implementation had `commits` state. Let's keep `commits` for the chart
  // and `auditHistory` for the detailed lookback.
  const [commits, setCommits] = useState<{ hash: string; consensus: number; vulnerabilityCount: number }[]>([]);

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
        
        const lastMsg = AUDIT_SCENARIO_MESSAGES[AUDIT_SCENARIO_MESSAGES.length - 1];
        const finalConsensus = lastMsg.belief;
        setCurrentConsensus(finalConsensus);
        
        const newSnapshot: AuditSnapshot = {
          hash: initialCommitHash,
          consensus: finalConsensus,
          messages: [...messages, { // Include the last message which we haven't added to state yet in this closure? 
            // Actually `messages` state is stale here. We should rebuild it or use functional update.
            // For simplicity in this mock, let's just use the full static array mapped.
             ...createMessage(AUDIT_SCENARIO_MESSAGES[msgIndex-1]) // This is tricky.
          }].slice(0, 0), // Resetting logic is hard with closure.
          vulnerabilities: INITIAL_VULNERABILITIES
        };
        
        // Let's just rebuild the full message history for the snapshot from the scenario
        const fullMessages = AUDIT_SCENARIO_MESSAGES.map(m => createMessage(m));
        
        const snapshot = {
            hash: initialCommitHash,
            consensus: finalConsensus,
            messages: fullMessages,
            vulnerabilities: INITIAL_VULNERABILITIES
        };

        setAuditHistory([snapshot]);
        setCommits([{ 
            hash: initialCommitHash, 
            consensus: finalConsensus,
            vulnerabilityCount: INITIAL_VULNERABILITIES.length
        }]);
        
        // Ensure local state matches
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
    }, 800); // Faster for demo
  };

  const simulateNewCommit = () => {
    if (status !== 'ready') return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    setStatus('auditing');
    setSelectedCommitHash(null); // Switch to live view
    
    // Start with previous state
    const prevVulns = vulnerabilities;
    const newCommitHash = generateCommitHash();
    
    // We want to show the NEW messages appearing.
    setMessages([]); 
    
    let msgIndex = 0;
    
    intervalRef.current = setInterval(() => {
      if (msgIndex >= FIX_SCENARIO_MESSAGES.length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatus('ready');
        
        // Update vulnerabilities
        const newVulns = prevVulns.map(v => 
            (v.id === 'SEC-A-001' || v.id === 'SEC-A-002' || v.id === 'SEC-A-003') 
              ? { ...v, status: 'fixed' as const } 
              : v
        );
        setVulnerabilities(newVulns);

        const lastMsg = FIX_SCENARIO_MESSAGES[FIX_SCENARIO_MESSAGES.length - 1];
        const finalConsensus = lastMsg.belief;
        setCurrentConsensus(finalConsensus);
        
        const fullMessages = FIX_SCENARIO_MESSAGES.map(m => createMessage(m));
        
        const snapshot = {
            hash: newCommitHash,
            consensus: finalConsensus,
            messages: fullMessages,
            vulnerabilities: newVulns
        };
        
        setAuditHistory(prev => [...prev, snapshot]);
        setCommits(prev => [...prev, { 
            hash: newCommitHash, 
            consensus: finalConsensus,
            vulnerabilityCount: newVulns.filter(v => v.status === 'open').length
        }]);
        
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

  const createMessage = (data: any): AgentMessage => ({
    id: Math.random().toString(36).substr(2, 9),
    agent: data.agent,
    text: data.text,
    belief: data.belief,
    timestamp: Date.now(),
  });

  const handlePointClick = (hash: string) => {
    if (hash === selectedCommitHash) {
      setSelectedCommitHash(null); // Toggle off
    } else {
      setSelectedCommitHash(hash);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0B0F14] text-[#E6EEF8] font-sans overflow-hidden">
      {/* Top Bar */}
      <header className="h-16 border-b border-[#1C2430] flex items-center justify-between px-6 bg-[#0B0F14] z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#4DA3FF] p-2 rounded-xl shadow-lg shadow-blue-500/20 transform rotate-3 transition-transform hover:rotate-6">
            <Sparkles className="w-5 h-5 text-white fill-white" />
          </div>
          <h1 className="text-xl font-display font-bold tracking-tight text-[#E6EEF8]">VibeSafe</h1>
        </div>

        <div className="flex-1 max-w-2xl mx-8">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Github className="h-5 w-5 text-[#8FA3B8]" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-32 py-2.5 bg-[#0F1620] border border-[#1C2430] rounded-lg text-sm placeholder-[#8FA3B8] focus:outline-none focus:border-[#4DA3FF] focus:ring-1 focus:ring-[#4DA3FF] transition-all"
              placeholder="Paste GitHub repository URL..."
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={status === 'auditing'}
            />
            <button
              onClick={startAudit}
              disabled={!repoUrl || status === 'auditing'}
              className="absolute right-1 top-1 bottom-1 bg-[#4DA3FF] hover:bg-[#3b82f6] text-white px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {status === 'auditing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Auditing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Audit
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1C2430] hover:bg-[#2a3441] text-[#8FA3B8] hover:text-[#E6EEF8] transition-colors text-xs font-medium border border-[#1C2430]"
          >
            <History className="w-4 h-4" />
            <span>History</span>
            <span className="bg-[#0B0F14] px-1.5 rounded text-[10px] text-[#4DA3FF]">{commits.length}</span>
          </button>
          
          <div className={`px-3 py-1 rounded-full text-xs font-medium border ${
            status === 'idle' 
              ? 'bg-[#1C2430] text-[#8FA3B8] border-transparent' 
              : status === 'auditing'
                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
          }`}>
            {status === 'idle' ? 'Idle' : status === 'auditing' ? 'Auditing...' : 'Report Ready'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Vulnerabilities */}
        <aside className="w-[35%] min-w-[350px] max-w-[450px] flex flex-col h-full border-r border-[#1C2430]">
          <VulnerabilitiesPanel 
            vulnerabilities={displayVulnerabilities}
            filter={vulnFilter}
            setFilter={setVulnFilter}
            isLoading={status === 'auditing' && displayVulnerabilities.length === 0}
            onVulnerabilityClick={setSelectedVuln}
            onApplyFixes={simulateNewCommit}
            isAuditComplete={status === 'ready' && commits.length < 2}
          />
        </aside>

        {/* Right Content: Chart + Feed */}
        <section className="flex-1 flex flex-col h-full bg-[#0B0F14] relative min-w-0 overflow-hidden">
          
          {/* Chart Section - Fixed Height (Reduced by ~20%) */}
          <div className="flex-none h-[40%] min-h-[220px] p-6 border-b border-[#1C2430] flex flex-col bg-[#0B0F14] z-10 relative">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-[#E6EEF8] font-semibold text-lg">Audit Summary</h2>
                {auditHistory.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#1C2430] border border-[#1C2430]">
                    <History className="w-3 h-3 text-[#8FA3B8]" />
                    <span className="text-xs text-[#8FA3B8]">
                      {selectedCommitHash 
                        ? `Viewing Commit: ${selectedCommitHash.substring(0, 7)}`
                        : "Viewing Latest Live State"}
                    </span>
                    {selectedCommitHash && (
                      <button 
                        onClick={() => setSelectedCommitHash(null)}
                        className="ml-1 hover:text-[#E6EEF8]"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex-1 min-h-0 pb-2 overflow-hidden">
              <DeploymentSafetyChart 
                data={commits} 
                currentConsensus={displayConsensus} 
                onPointClick={handlePointClick}
                selectedCommitHash={selectedCommitHash}
              />
            </div>
            
            <div className="mt-2 text-center shrink-0">
               <p className="text-[10px] text-[#8FA3B8]/50 uppercase tracking-widest font-medium">
                 Interactive Timeline • Click points to view history
               </p>
            </div>
          </div>

          {/* Feed Section - Scrollable */}
          <div className="flex-1 min-h-0 overflow-hidden bg-[#0B0F14] relative p-6">
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
            <div className="relative w-80 bg-[#0F1620] border-l border-[#1C2430] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
              <div className="p-4 border-b border-[#1C2430] flex items-center justify-between bg-[#0B0F14]">
                <h3 className="text-[#E6EEF8] font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#4DA3FF]" />
                  Version History
                </h3>
                <button 
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-[#8FA3B8] hover:text-[#E6EEF8] p-1 rounded hover:bg-[#1C2430]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {commits.length === 0 ? (
                  <div className="text-center py-8 text-[#8FA3B8] text-sm">
                    No history available yet.
                  </div>
                ) : (
                  [...commits].reverse().map((commit, index) => (
                    <div 
                      key={commit.hash}
                      onClick={() => {
                        handlePointClick(commit.hash);
                        // Optional: Close drawer on select? User might want to browse. Let's keep open.
                      }}
                      className={`p-3 rounded-lg cursor-pointer border transition-all ${
                        selectedCommitHash === commit.hash || (!selectedCommitHash && index === 0)
                          ? 'bg-[#1C2430] border-[#4DA3FF]/50'
                          : 'bg-[#131B26] border-[#1C2430] hover:border-[#8FA3B8]/30'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-xs text-[#4DA3FF] bg-[#4DA3FF]/10 px-1.5 py-0.5 rounded">
                          {commit.hash.substring(0, 7)}
                        </span>
                        <span className={`font-display font-bold text-lg ${
                          commit.consensus >= 90 ? 'text-emerald-400' :
                          commit.consensus >= 70 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {commit.consensus}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#8FA3B8] mt-2">
                        {commit.vulnerabilityCount === 0 ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> Safe
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-orange-400">
                            <AlertTriangle className="w-3 h-3" /> {commit.vulnerabilityCount} Issues
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
