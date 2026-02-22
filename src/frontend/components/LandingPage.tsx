'use client';

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Flame,
  Search,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LandingPage() {
  const [url, setUrl] = useState('');
  const router = useRouter();

  const handleRoast = () => {
    if (url.trim()) {
      router.push('/roast?url=' + encodeURIComponent(url));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRoast();
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0F14] text-[#E6EEF8] font-sans overflow-x-hidden selection:bg-[#4DA3FF]/30">
      {/* Background Gradients */}
      <div className="fixed top-[-20%] left-[-10%] w-[800px] h-[800px] bg-[#4DA3FF]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-[#FF4D4D]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-6 max-w-7xl mx-auto relative z-10">
        <div className="flex items-center gap-2">
          <img
            src="/roastybara-logo.png"
            alt="Roastybara Logo"
            className="w-8 h-8 object-contain transform -rotate-3"
          />
          <span className="font-display font-bold text-xl tracking-tight">Roastybara</span>
        </div>
        <button
          onClick={() => document.getElementById('hero-input')?.focus()}
          className="text-sm font-medium text-[#8FA3B8] hover:text-[#E6EEF8] transition-colors"
        >
          Roast my repo
        </button>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-32 px-6 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1C2430] border border-[#4DA3FF]/20 text-[#4DA3FF] text-xs font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Flame className="w-3 h-3 fill-[#4DA3FF]" />
              <span>For programmers and vibe coders alike</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-display font-extrabold text-[#E6EEF8] mb-6 tracking-tight leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              Your repo gets roasted.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4DA3FF] to-[#7dd3fc]">You get LGTM.</span>
            </h1>

            <p className="text-xl text-[#8FA3B8] mb-12 max-w-2xl leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
              Roastybara sends AI agents through your codebase to find vulnerabilities, suggest fixes, and turn chaotic AI-generated code into something safe to merge.
            </p>

            <div className="max-w-xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#4DA3FF] to-[#FF4D4D] rounded-xl opacity-20 group-hover:opacity-40 blur transition duration-500" />
                <div className="relative flex items-center bg-[#0F1620] rounded-xl border border-[#1C2430] p-2 shadow-2xl">
                  <input
                    id="hero-input"
                    type="text"
                    placeholder="Paste your GitHub repo URL..."
                    className="flex-1 bg-transparent border-none text-[#E6EEF8] placeholder-[#8FA3B8]/50 px-4 py-3 focus:outline-none text-lg w-full"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    onClick={handleRoast}
                    className="bg-[#E6EEF8] hover:bg-white text-[#0B0F14] px-6 py-3 rounded-lg font-bold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 whitespace-nowrap"
                  >
                    <span>Roast my repo</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="mt-4 text-sm text-[#8FA3B8]/60 font-medium">
                No setup. No OAuth. Just paste and roast.
              </p>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end animate-in fade-in slide-in-from-right-8 duration-1000 delay-200">
            <div className="relative w-full max-w-[500px] aspect-square">
              <div className="absolute inset-0 bg-[#4DA3FF]/20 rounded-full blur-[80px]" />
              <img
                src="https://res.cloudinary.com/dk9mn4cvz/image/upload/v1771718850/Roastybara-Character-Hero-transparent_e9v8yi.png"
                alt="Roastybara Hero"
                className="relative z-10 w-full h-full object-contain drop-shadow-2xl transform hover:scale-105 transition-transform duration-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-[#0F1620]/50 border-y border-[#1C2430]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-block p-3 bg-[#1C2430] rounded-2xl mb-4">
              <Flame className="w-8 h-8 text-[#FF4D4D]" />
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Roast &rarr; Fix &rarr; LGTM</h2>
            <p className="text-[#8FA3B8] max-w-xl mx-auto">
              From vibe-coded prototype to production-ready code in four steps.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Terminal, title: '1. Paste your repo', desc: 'Drop in any GitHub link — side project, vibe-coded app, or production code.' },
              { icon: Search, title: '2. Agents roast it live', desc: 'Two AI reviewers scan your code, dependencies, and docs — calling out risks.' },
              { icon: CheckCircle2, title: '3. Get fixes', desc: 'Every issue comes with clear suggestions you can commit immediately.' },
              { icon: Shield, title: '4. Reach LGTM', desc: 'Each push gets re-audited. Your repo moves toward approval.' },
            ].map((step, i) => (
              <div key={i} className="relative p-6 rounded-2xl bg-[#0B0F14] border border-[#1C2430] hover:border-[#4DA3FF]/30 transition-colors group">
                <div className="absolute -top-4 -left-4 w-8 h-8 bg-[#1C2430] rounded-full flex items-center justify-center font-mono font-bold text-[#4DA3FF] border border-[#1C2430] group-hover:border-[#4DA3FF] transition-colors">
                  {i + 1}
                </div>
                <step.icon className="w-8 h-8 text-[#8FA3B8] mb-4 group-hover:text-[#4DA3FF] transition-colors" />
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-[#8FA3B8] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The LGTM Score */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">
              Is this safe to merge?
            </h2>
            <p className="text-lg text-[#8FA3B8] mb-8 leading-relaxed">
              Roastybara produces a single verdict: a deployment-readiness score from <span className="text-[#FF4D4D] font-bold">1%</span> (absolutely not shipping) to <span className="text-[#4DA3FF] font-bold">100%</span> (LGTM).
            </p>
            <p className="text-lg text-[#8FA3B8] mb-8 leading-relaxed">
              Each commit becomes a new point — so you can watch your repo get safer over time.
            </p>
            <div className="flex items-center gap-4 text-sm font-mono text-[#8FA3B8]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF4D4D]" /> Unsafe
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#F59E0B]" /> Needs Work
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#4DA3FF]" /> LGTM
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-[#4DA3FF]/20 blur-[100px] rounded-full" />
            <div className="relative bg-[#0F1620] border border-[#1C2430] rounded-2xl p-8 text-center transform rotate-2 hover:rotate-0 transition-transform duration-500">
              <div className="text-sm font-mono text-[#8FA3B8] uppercase tracking-widest mb-2">Deployment Safety</div>
              <div className="text-[120px] leading-none font-display font-extrabold text-[#E6EEF8] mb-4">
                94%
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4DA3FF]/10 text-[#4DA3FF] font-bold border border-[#4DA3FF]/20">
                <CheckCircle2 className="w-4 h-4" />
                LGTM
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Roastybara Catches */}
      <section className="py-24 bg-[#0F1620]/30 border-y border-[#1C2430]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-12">What Roastybara Catches</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              'Auth mistakes',
              'Dependency risks',
              'Secrets exposure',
              'Validation gaps',
              '\u201CLooks fine\u201D AI code',
              'Logic errors',
            ].map((item, i) => (
              <div key={i} className="bg-[#0B0F14] border border-[#1C2430] p-4 rounded-xl flex items-center justify-center gap-3 hover:border-[#FF4D4D]/40 transition-colors group">
                <AlertTriangle className="w-4 h-4 text-[#FF4D4D] opacity-50 group-hover:opacity-100" />
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-12 text-[#8FA3B8]">
            Roastybara doesn&apos;t just roast — it shows exactly what to fix.
          </p>
        </div>
      </section>

      {/* The Agents */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">The Agents</h2>
            <p className="text-[#8FA3B8]">Together they produce your Roastybara score.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#0F1620] border border-[#1C2430] p-8 rounded-2xl hover:bg-[#131B26] transition-colors">
              <div className="w-12 h-12 bg-[#4DA3FF]/10 rounded-xl flex items-center justify-center mb-6">
                <Search className="w-6 h-6 text-[#4DA3FF]" />
              </div>
              <h3 className="text-xl font-bold mb-3">Retriever Agent</h3>
              <p className="text-[#8FA3B8] leading-relaxed">
                Pulls best practices, dependency intel, and security context. It knows what &quot;good&quot; looks like.
              </p>
            </div>

            <div className="bg-[#0F1620] border border-[#1C2430] p-8 rounded-2xl hover:bg-[#131B26] transition-colors">
              <div className="w-12 h-12 bg-[#FF4D4D]/10 rounded-xl flex items-center justify-center mb-6">
                <Shield className="w-6 h-6 text-[#FF4D4D]" />
              </div>
              <h3 className="text-xl font-bold mb-3">Security Agent</h3>
              <p className="text-[#8FA3B8] leading-relaxed">
                Finds vulnerabilities and decides if your code deserves LGTM. It&apos;s the gatekeeper.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Roastybara */}
      <section className="py-24 bg-[#0F1620]/50 border-y border-[#1C2430] text-center px-6">
        <div className="max-w-3xl mx-auto">
          <Zap className="w-12 h-12 text-[#E6EEF8] mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-8">
            AI is generating more code than humans can review.
          </h2>
          <p className="text-xl text-[#8FA3B8] mb-8 leading-relaxed">
            Security reviews don&apos;t scale. Roastybara turns repo safety into a fast, automated consensus — commit by commit.
          </p>
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-[#1C2430] rounded-full text-[#E6EEF8] font-mono text-sm border border-[#4DA3FF]/20">
            <span>vibe-coded</span>
            <ArrowRight className="w-4 h-4 text-[#4DA3FF]" />
            <span>merge-ready</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">Ready to get roasted?</h2>
          <p className="text-xl text-[#8FA3B8] mb-12">
            Paste your repo and see if it earns LGTM.
          </p>

          <div className="relative group max-w-lg mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#4DA3FF] to-[#FF4D4D] rounded-xl opacity-20 group-hover:opacity-40 blur transition duration-500" />
            <div className="relative flex items-center bg-[#0F1620] rounded-xl border border-[#1C2430] p-2 shadow-2xl">
              <input
                type="text"
                placeholder="Paste your GitHub repo URL..."
                className="flex-1 bg-transparent border-none text-[#E6EEF8] placeholder-[#8FA3B8]/50 px-4 py-3 focus:outline-none text-lg w-full"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                onClick={handleRoast}
                className="bg-[#E6EEF8] hover:bg-white text-[#0B0F14] px-6 py-3 rounded-lg font-bold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 whitespace-nowrap"
              >
                <span>Roast my repo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-[#1C2430] text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <img
            src="/roastybara-logo.png"
            alt="Roastybara Logo"
            className="w-4 h-4 object-contain"
          />
          <span className="font-display font-bold text-[#E6EEF8]">Roastybara</span>
        </div>
        <p className="text-[#8FA3B8] text-sm font-mono">
          Roast &rarr; Fix &rarr; LGTM
        </p>
      </footer>
    </div>
  );
}
