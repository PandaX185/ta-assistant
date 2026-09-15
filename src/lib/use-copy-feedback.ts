import { useCallback, useRef, useState } from "react";
import { copyText } from "./copy-text";

interface Options {
  resetMs?: number;
}

export function useCopyFeedback({ resetMs = 1500 }: Options = {}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(
    async (key: string, text: string) => {
      await copyText(text);
      setCopiedKey(key);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedKey(null), resetMs);
    },
    [resetMs],
  );

  const isCopied = (key: string) => copiedKey === key;

  return { copy, isCopied };
}