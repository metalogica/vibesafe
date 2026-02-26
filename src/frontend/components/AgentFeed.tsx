'use client';

import { useEffect, useRef } from 'react';

import { Bot, FileSearch, Gavel, ShieldAlert, Terminal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { AgentMessage } from '@/src/frontend/types';

interface AgentFeedProps {
  messages: AgentMessage[];
  isAuditing: boolean;
  streamingText: string | null;
}

function getAgentIcon(agent: string) {
  switch (agent) {
    case 'ingestion':
      return <FileSearch className="h-4 w-4" />;
    case 'security':
      return <ShieldAlert className="h-4 w-4" />;
    case 'evaluator':
      return <Gavel className="h-4 w-4" />;
    default:
      return <Bot className="h-4 w-4" />;
  }
}

function getAgentColorStyles(agent: string) {
  switch (agent) {
    case 'ingestion':
      return 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400';
    case 'security':
      return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    case 'evaluator':
      return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
    default:
      return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
  }
}

function getAgentName(agent: string) {
  switch (agent) {
    case 'ingestion':
      return 'Ingestion';
    case 'security':
      return 'Security Analyst';
    case 'evaluator':
      return 'Evaluator';
    default:
      return 'Agent';
  }
}

function getAgentTextColor(agent: string) {
  switch (agent) {
    case 'ingestion':
      return 'text-indigo-400';
    case 'security':
      return 'text-emerald-400';
    case 'evaluator':
      return 'text-purple-400';
    default:
      return 'text-gray-400';
  }
}

export function AgentFeed({ messages, isAuditing, streamingText }: AgentFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[#1C2430] bg-[#0F1620]">
      <div className="flex items-center justify-between border-b border-[#1C2430] bg-[#0B0F14]/50 px-4 py-3 backdrop-blur-sm">
        <h3 className="flex items-center gap-2 font-medium text-[#E6EEF8]">
          <Terminal className="h-4 w-4 text-[#4DA3FF]" />
          Agent Activity Feed
        </h3>
        {isAuditing && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4DA3FF] opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#4DA3FF]"></span>
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-[#4DA3FF]">
              Live
            </span>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 scroll-smooth overflow-y-auto p-0">
        <div className="flex flex-col">
          <AnimatePresence initial={false}>
            {messages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-4 border-b border-[#1C2430]/50 p-4 transition-colors hover:bg-[#131B26] ${
                  index % 2 === 0 ? 'bg-[#0B0F14]/30' : ''
                } ${msg.agent === 'evaluator' ? 'bg-purple-500/5' : ''}`}
              >
                <div className="shrink-0 pt-1">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border ${getAgentColorStyles(msg.agent)}`}
                  >
                    {getAgentIcon(msg.agent)}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider ${getAgentTextColor(msg.agent)}`}
                      >
                        {getAgentName(msg.agent)}
                      </span>
                      <span className="font-mono text-[10px] text-[#8FA3B8]/60">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false,
                        })}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm font-light leading-relaxed text-[#E6EEF8]">
                    {msg.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {streamingText && (
            <motion.div
              key="streaming-text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4 border-b border-[#1C2430]/50 p-4 bg-emerald-500/5"
            >
              <div className="shrink-0 pt-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                  <ShieldAlert className="h-4 w-4" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Security Analyst
                  </span>
                  <span className="text-[10px] text-emerald-400/60 animate-pulse">
                    analyzing...
                  </span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs font-light leading-relaxed text-[#E6EEF8]/70 max-h-48 overflow-y-auto">
                  {streamingText}
                </pre>
              </div>
            </motion.div>
          )}

          {messages.length === 0 && !isAuditing && (
            <div className="flex flex-col items-center justify-center py-12 text-[#8FA3B8] opacity-50">
              <Bot className="mb-2 h-12 w-12" />
              <p className="text-sm">Waiting for audit to start...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
