import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";

interface SearchResult {
  kind: string;
  id: string;
  label: string;
  subtitle: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}

export function SpotlightSearch({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await invoke<SearchResult[]>("global_search", { query: q });
      setResults(data);
      setSelectedIndex(0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && results[selectedIndex]) {
      onSelect(results[selectedIndex]);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-background border rounded-xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search students, subjects..."
            className="border-0 shadow-none text-lg px-0 focus-visible:ring-0"
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <span className="animate-pulse mr-2">⏳</span>
              Searching...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              No results for "{query}"
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="py-2">
              {results.map((result, i) => (
                <button
                  key={`${result.kind}:${result.id}`}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                    i === selectedIndex ? "bg-muted" : ""
                  }`}
                  onClick={() => {
                    onSelect(result);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <span className="text-lg">{result.kind === "student" ? "👤" : "📚"}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{result.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!query && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Type to search students across all subjects or find subjects
            </div>
          )}
        </div>

        <div className="p-3 border-t bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground">
          <span><kbd className="px-1.5 py-0.5 bg-muted border rounded text-[10px]">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted border rounded text-[10px]">Enter</kbd> Select</span>
          <span><kbd className="px-1.5 py-0.5 bg-muted border rounded text-[10px]">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
