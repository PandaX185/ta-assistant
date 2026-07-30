import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const [rustMsg, setRustMsg] = useState("");

  useEffect(() => {
    invoke("greet", { name: "Abdullah" })
      .then((msg) => setRustMsg(msg as string))
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">
        Welcome to TA Assistant. Select a year, semester, and subject above to
        get started.
      </p>
      {rustMsg && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-sm">Rust Bridge Test</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-mono">{rustMsg}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
