import { useState } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { aiApi } from '@/api/ai';
import { propertiesApi } from '@/api/properties';
import { getApiError } from '@/api/client';
import { cn } from '@/utils/cn';

const EXAMPLE_PROMPTS = [
  'How many vacant plots do I have?',
  'Which tenants currently have arrears?',
  'What is my total rent collected this month?',
  'Are there any active geofence alerts?',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function useCurrentPropertyId(): string | undefined {
  const location = useLocation();
  const propertyMatch = matchPath('/properties/:propertyId', location.pathname);

  const { data: firstProperty } = useQuery({
    queryKey: ['ai-default-property'],
    queryFn: async () => {
      const result = await propertiesApi.list({ limit: 1 });
      return result.data[0] ?? null;
    },
    enabled: !propertyMatch,
    staleTime: 5 * 60 * 1000,
  });

  return propertyMatch?.params.propertyId ?? firstProperty?.id;
}

export function AIAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const propertyId = useCurrentPropertyId();

  const askMutation = useMutation({
    mutationFn: (q: string) => aiApi.assistant(q, propertyId!),
    onSuccess: (answer) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    },
  });

  const handleSend = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || askMutation.isPending || !propertyId) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    askMutation.mutate(trimmed);
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-96 max-w-[calc(100vw-2rem)] h-[28rem] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-brand-600 text-white">
            <div className="flex items-center gap-2">
              <Sparkles size={17} />
              <div>
                <p className="text-sm font-semibold leading-tight">Property Assistant</p>
                <p className="text-xs text-brand-100 leading-tight">Ask anything about your property</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Try asking</p>
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                  m.role === 'user'
                    ? 'ml-auto bg-brand-600 text-white'
                    : 'mr-auto bg-slate-100 text-slate-800'
                )}
              >
                {m.content}
              </div>
            ))}

            {askMutation.isPending && (
              <div className="mr-auto flex items-center gap-2 text-sm text-slate-400 px-3 py-2">
                <Spinner size="sm" /> Thinking…
              </div>
            )}

            {askMutation.isError && (
              <div className="mr-auto max-w-[85%] rounded-xl px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-100">
                {getApiError(askMutation.error)}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(question);
            }}
            className="flex items-center gap-2 p-3 border-t border-slate-100"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your property…"
              disabled={!propertyId}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!question.trim() || askMutation.isPending || !propertyId}
              className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300 transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-brand-600 text-white shadow-xl hover:bg-brand-700 transition-colors flex items-center justify-center"
        aria-label="Open property assistant"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  );
}
