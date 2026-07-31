"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { KeyRound, Loader2, Monitor, Moon, Sun, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** Profile + appearance settings, opened from the avatar menu. */
export function SettingsDialog({ initialName }: { initialName: string }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(initialName);
  const [busy, setBusy] = React.useState(false);

  async function saveProfile() {
    if (name.trim().length < 2) return toast.error("Please enter your name.");
    setBusy(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Profile updated");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  }

  const themes = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setOpen(true); }}>
        <SettingsIcon className="size-4" /> Settings
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Profile and appearance. Your savings rate and plan live on the dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="settings-name">Display name</Label>
              <div className="flex gap-2">
                <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={saveProfile} disabled={busy || name.trim() === initialName.trim()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Appearance</Label>
              <div className="flex rounded-lg bg-secondary p-0.5">
                {themes.map((t) => (
                  <button key={t.value} onClick={() => setTheme(t.value)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                      theme === t.value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                    <t.icon className="size-3.5" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <PasswordSection />

            <p className="text-[11px] text-muted-foreground">
              Auto-save rate: use the sliders button in the top bar (writes to the Stellar
              contract). Goal allocation: “Savings Plan” section on the dashboard.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasswordSection() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function changePassword() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Password changed");
      setCurrent("");
      setNext("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-border/70 p-3.5">
      <Label className="flex items-center gap-1.5">
        <KeyRound className="size-3.5 text-primary" /> Change password
      </Label>
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Current password"
        aria-label="Current password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="New password (8+ chars, letter + number)"
        aria-label="New password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <Button
        variant="outline"
        className="w-full"
        onClick={changePassword}
        disabled={busy || !current || next.length < 8}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
      </Button>
    </div>
  );
}
