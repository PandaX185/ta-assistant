import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  name: string;
  email: string;
  onChange: (patch: { name?: string; email?: string }) => void;
}

export default function StepProfile({ name, email, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Your Profile</h2>
        <p className="text-muted-foreground mt-1">
          Enter your name and university email
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            placeholder="e.g. Ahmed Ali"
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="e.g. ahmed@university.edu"
            value={email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
