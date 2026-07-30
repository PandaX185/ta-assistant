import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (shortcut: string) => void;
}

export default function StepShortcut({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      const key = e.key;
      // Skip modifier-only presses
      if (["Control", "Alt", "Shift", "Meta"].includes(key)) return;
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      onChange(parts.join("+"));
    };

    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [onChange]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Global Shortcut</h2>
        <p className="text-muted-foreground mt-1">
          Press a key combination to open the search overlay from anywhere
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="shortcut">Keybinding</Label>
        <Input
          ref={inputRef}
          id="shortcut"
          value={value}
          readOnly
          placeholder="Press a key combination..."
          className="text-center font-mono text-lg cursor-pointer"
          onClick={() => inputRef.current?.focus()}
        />
        <p className="text-xs text-muted-foreground text-center">
          Click the field and press your desired shortcut
        </p>
      </div>
    </div>
  );
}
