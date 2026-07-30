import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface Props {
  password: string;
  onChange: (password: string) => void;
}

export default function StepPassword({ password, onChange }: Props) {
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 6;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Set a Password</h2>
        <p className="text-muted-foreground mt-1">
          This unlocks the app. No recovery option — don't forget it.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
          {tooShort && (
            <p className="text-xs text-destructive">
              Must be at least 6 characters
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <Input
            id="confirm"
            type="password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {mismatch && (
            <p className="text-xs text-destructive">Passwords don't match</p>
          )}
        </div>
      </div>
    </div>
  );
}
