"use client";

import { AddComputerDialog } from "./add-computer-dialog";
import { AddGroupDialog } from "./add-group-dialog";
import { AddPolicyDialog } from "./add-policy-dialog";
import { InviteUserDialog } from "./invite-user-dialog";

export function Modals() {
  return (
    <>
      <AddComputerDialog />
      <AddGroupDialog />
      <AddPolicyDialog />
      <InviteUserDialog />
    </>
  );
}
