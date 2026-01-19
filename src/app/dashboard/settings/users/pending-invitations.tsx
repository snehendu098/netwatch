"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, RefreshCw, X, Loader2, Mail, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: {
    id: string;
    name: string;
    email: string;
  };
}

export function PendingInvitations() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();

    // Listen for new invitations
    const handleInvitationSent = () => fetchInvitations();
    window.addEventListener("invitation-sent", handleInvitationSent);
    return () => window.removeEventListener("invitation-sent", handleInvitationSent);
  }, []);

  async function fetchInvitations() {
    try {
      const res = await fetch("/api/invitations");
      if (res.ok) {
        const data = await res.json();
        setInvitations(data);
      }
    } catch (error) {
      console.error("Failed to fetch invitations:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/invitations/${id}/resend`, {
        method: "POST",
      });

      if (res.ok) {
        toast.success("Invitation resent", {
          description: "A new invitation email has been sent",
        });
        fetchInvitations();
      } else {
        const data = await res.json();
        toast.error("Error", { description: data.error || "Failed to resend invitation" });
      }
    } catch {
      toast.error("Error", { description: "Failed to resend invitation" });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/invitations/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Invitation cancelled");
        setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      } else {
        const data = await res.json();
        toast.error("Error", { description: data.error || "Failed to cancel invitation" });
      }
    } catch {
      toast.error("Error", { description: "Failed to cancel invitation" });
    } finally {
      setActionLoading(null);
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return <Badge className="bg-purple-500 hover:bg-purple-600">Admin</Badge>;
      case "MANAGER":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Manager</Badge>;
      default:
        return <Badge variant="secondary">Viewer</Badge>;
    }
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>Loading invitations...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (invitations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
          <CardDescription>Invitations waiting to be accepted</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No pending invitations</p>
            <p className="text-sm text-muted-foreground mt-1">
              Invited users will appear here until they accept
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              {invitations.length} invitation{invitations.length !== 1 ? "s" : ""} waiting to be accepted
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited by {invitation.invitedBy.name}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{getRoleBadge(invitation.role)}</TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true })}
                  </div>
                </TableCell>
                <TableCell>
                  {isExpired(invitation.expiresAt) ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {format(new Date(invitation.expiresAt), "PP")}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={actionLoading === invitation.id}
                      >
                        {actionLoading === invitation.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleResend(invitation.id)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Resend
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleCancel(invitation.id)}
                        className="text-destructive"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
