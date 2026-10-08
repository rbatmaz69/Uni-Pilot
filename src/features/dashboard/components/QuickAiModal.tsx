import { useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';

interface QuickAiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickAiModal({ isOpen, onClose }: QuickAiModalProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: "Hi Alex! I'm your Uni Pilot AI study companion. Need a summary of today's Programming II lab, help with SQL queries, or an exam study schedule?",
    },
  ]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!prompt.trim()) return;
    const userText = prompt;
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setPrompt('');

    setTimeout(() => {
      let reply =
        "Here's what you need to know: Database Systems Lab 4 is due tomorrow at 23:59. I've highlighted the 3 core Normalization rules in your documents!";
      if (userText.toLowerCase().includes('sql') || userText.toLowerCase().includes('database')) {
        reply =
          'In 3NF (Third Normal Form), every non-prime attribute must be non-transitively dependent on every candidate key. Need an example schema?';
      } else if (
        userText.toLowerCase().includes('focus') ||
        userText.toLowerCase().includes('plan')
      ) {
        reply =
          'I recommend 45 minutes on Programming II pointers, followed by a 10 minute break before your 15:00 meeting in B200.';
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    }, 600);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Study Assistant"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm animate-page-enter"
    >
      <div className="relative flex h-[520px] w-full max-w-lg flex-col rounded-3xl border border-line-soft bg-surface shadow-raised overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-accent">
              <Sparkles size={16} />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-primary">Uni Pilot Copilot</h2>
              <p className="text-[11.5px] text-muted">Powered by semester knowledge</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI assistant"
            className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-secondary hover:text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Chat message body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3 scroll-area">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' ? (
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface-secondary text-primary mt-0.5">
                  <Bot size={15} />
                </span>
              ) : null}

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-primary text-inverted'
                    : 'bg-surface-secondary/80 text-primary border border-line-soft'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Quick prompt suggestions */}
        <div className="border-t border-line-soft bg-surface-secondary/30 px-5 py-2 flex items-center gap-1.5 overflow-x-auto">
          {['Explain 3NF SQL', 'Prepare for Lab 4', 'Study schedule'].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setPrompt(suggestion);
              }}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-secondary hover:text-primary whitespace-nowrap transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Input box */}
        <div className="border-t border-line-soft p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask anything about your courses, deadlines..."
              className="flex-1 rounded-full border border-line-soft bg-surface-secondary px-4 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-accent"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="rounded-full h-9 w-9 p-0 bg-primary text-inverted flex items-center justify-center"
              aria-label="Send message"
            >
              <Send size={14} />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
