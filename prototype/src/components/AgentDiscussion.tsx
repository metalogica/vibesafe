import React, { useEffect, useRef } from 'react';
import { Bot, FileSearch, ShieldAlert, Terminal, Gavel } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface AgentMessage {
  id: string;
  agent: 'retriever' | 'security' | 'evaluator';
  text: string;
  belief?: number; // 0-100, optional now
  timestamp: number;
}

interface AgentFeedProps {
  messages: AgentMessage[];
  isAuditing: boolean;
}

export const AgentFeed: React.FC<AgentFeedProps> = ({
  messages,
  isAuditing,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getAgentIcon = (agent: string) => {
    switch (agent) {
      case 'retriever':
        return <FileSearch className="w-4 h-4" />;
      case 'security':
        return <ShieldAlert className="w-4 h-4" />;
      case 'evaluator':
        return <Gavel className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  const getAgentColorStyles = (agent: string) => {
    switch (agent) {
      case 'retriever':
        return 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400';
      case 'security':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'evaluator':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      default:
        return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
    }
  };

  const getAgentName = (agent: string) => {
    switch (agent) {
      case 'retriever': return 'Retriever';
      case 'security': return 'Security Analyst';
      case 'evaluator': return 'Evaluator';
      default: return 'Agent';
    }
  };

  const getAgentTextColor = (agent: string) => {
    switch (agent) {
      case 'retriever': return 'text-indigo-400';
      case 'security': return 'text-emerald-400';
      case 'evaluator': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0F1620] rounded-xl border border-[#1C2430] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1C2430] flex items-center justify-between bg-[#0B0F14]/50 backdrop-blur-sm">
        <h3 className="text-[#E6EEF8] font-medium flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#4DA3FF]" />
          Agent Activity Feed
        </h3>
        {isAuditing && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4DA3FF] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4DA3FF]"></span>
            </span>
            <span className="text-xs text-[#4DA3FF] font-medium uppercase tracking-wider">
              Live
            </span>
          </div>
        )}
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-0 scroll-smooth"
      >
        <div className="flex flex-col">
          <AnimatePresence initial={false}>
            {messages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-4 p-4 border-b border-[#1C2430]/50 hover:bg-[#131B26] transition-colors ${
                  index % 2 === 0 ? 'bg-[#0B0F14]/30' : ''
                } ${msg.agent === 'evaluator' ? 'bg-purple-500/5' : ''}`}
              >
                {/* Icon Column */}
                <div className="flex-shrink-0 pt-1">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border ${getAgentColorStyles(msg.agent)}`}
                  >
                    {getAgentIcon(msg.agent)}
                  </div>
                </div>

                {/* Content Column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${getAgentTextColor(msg.agent)}`}>
                        {getAgentName(msg.agent)}
                      </span>
                      <span className="text-[10px] text-[#8FA3B8]/60 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        })}
                      </span>
                    </div>
                  </div>

                  <p className="text-[#E6EEF8] text-sm leading-relaxed font-light">
                    {msg.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {messages.length === 0 && !isAuditing && (
            <div className="py-12 flex flex-col items-center justify-center text-[#8FA3B8] opacity-50">
              <Bot className="w-12 h-12 mb-2" />
              <p className="text-sm">Waiting for audit to start...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
