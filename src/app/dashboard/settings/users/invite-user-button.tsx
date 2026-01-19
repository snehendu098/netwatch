"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useUIStore } from "@/stores/ui";

export function InviteUserButton() {
  const { openModal } = useUIStore();

  return (
    <Button onClick={() => openModal("invite-user")}>
      <Plus className="mr-2 h-4 w-4" />
      Invite User
    </Button>
  );
}
