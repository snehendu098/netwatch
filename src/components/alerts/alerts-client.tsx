"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Shield,
  Clock,
  Wifi,
  Trash2,
  Loader2,
  CheckCheck,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Alert {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  computer: { name: string } | null;
}

interface AlertsClientProps {
  initialAlerts: Alert[];
  initialStats: {
    total: number;
    unread: number;
    policyViolations: number;
    idleAlerts: number;
  };
}

export function AlertsClient({ initialAlerts, initialStats }: AlertsClientProps) {
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [stats, setStats] = useState(initialStats);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "POLICY_VIOLATION":
        return <Shield className="h-4 w-4 text-red-500" />;
      case "IDLE":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "OFFLINE":
        return <Wifi className="h-4 w-4 text-gray-500" />;
      case "SUSPICIOUS":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getAlertBadgeColor = (type: string) => {
    switch (type) {
      case "POLICY_VIOLATION":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "IDLE":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "OFFLINE":
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
      case "SUSPICIOUS":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "";
    }
  };

  const filteredAlerts = alerts.filter((alert) => {
    switch (activeTab) {
      case "unread":
        return !alert.isRead;
      case "policy":
        return alert.type === "POLICY_VIOLATION";
      case "idle":
        return alert.type === "IDLE";
      default:
        return true;
    }
  });

  const markAsRead = async (alertId: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });

      if (!res.ok) throw new Error("Failed to mark as read");

      setAlerts(alerts.map((a) => (a.id === alertId ? { ...a, isRead: true } : a)));
      setStats({ ...stats, unread: Math.max(0, stats.unread - 1) });
      toast.success("Alert marked as read");
    } catch (error) {
      toast.error("Failed to mark alert as read");
      console.error(error);
    }
  };

  const markAllAsRead = async () => {
    setIsLoading(true);
    try {
      const unreadAlerts = alerts.filter((a) => !a.isRead);
      const alertIds = unreadAlerts.map((a) => a.id);

      if (alertIds.length === 0) {
        toast.info("No unread alerts");
        return;
      }

      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds, isRead: true }),
      });

      if (!res.ok) throw new Error("Failed to mark all as read");

      setAlerts(alerts.map((a) => ({ ...a, isRead: true })));
      setStats({ ...stats, unread: 0 });
      toast.success(`Marked ${alertIds.length} alerts as read`);
    } catch (error) {
      toast.error("Failed to mark all as read");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAlert = async (alertId: string) => {
    try {
      const res = await fetch(`/api/alerts/${alertId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete alert");

      const deletedAlert = alerts.find((a) => a.id === alertId);
      setAlerts(alerts.filter((a) => a.id !== alertId));
      setStats({
        ...stats,
        total: stats.total - 1,
        unread: deletedAlert && !deletedAlert.isRead ? stats.unread - 1 : stats.unread,
      });
      toast.success("Alert deleted");
    } catch (error) {
      toast.error("Failed to delete alert");
      console.error(error);
    }
  };

  const clearAllAlerts = async () => {
    setIsLoading(true);
    try {
      // Delete all alerts one by one (could be optimized with bulk delete API)
      for (const alert of alerts) {
        await fetch(`/api/alerts/${alert.id}`, { method: "DELETE" });
      }

      setAlerts([]);
      setStats({ total: 0, unread: 0, policyViolations: 0, idleAlerts: 0 });
      setClearAllDialogOpen(false);
      toast.success("All alerts cleared");
    } catch (error) {
      toast.error("Failed to clear all alerts");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
          <p className="text-muted-foreground">
            Monitor and manage system alerts and notifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={markAllAsRead}
            disabled={isLoading || stats.unread === 0}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Mark All as Read
          </Button>
          <Button
            variant="outline"
            onClick={() => setClearAllDialogOpen(true)}
            disabled={isLoading || alerts.length === 0}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unread
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-500">{stats.unread}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Policy Violations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.policyViolations}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Idle Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.idleAlerts}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All Alerts ({alerts.length})</TabsTrigger>
              <TabsTrigger value="unread">Unread ({stats.unread})</TabsTrigger>
              <TabsTrigger value="policy">Policy Violations</TabsTrigger>
              <TabsTrigger value="idle">Idle</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Computer</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAlerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No alerts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredAlerts.map((alert) => (
                  <TableRow key={alert.id} className={alert.isRead ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getAlertIcon(alert.type)}
                        <Badge variant="outline" className={getAlertBadgeColor(alert.type)}>
                          {alert.type.replace("_", " ")}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {alert.message}
                    </TableCell>
                    <TableCell>{alert.computer?.name || "System"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(alert.createdAt), "PPp")}
                    </TableCell>
                    <TableCell>
                      {alert.isRead ? (
                        <Badge variant="secondary">Read</Badge>
                      ) : (
                        <Badge>Unread</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!alert.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => markAsRead(alert.id)}
                            title="Mark as read"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => deleteAlert(alert.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Clear All Confirmation Dialog */}
      <Dialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Alerts</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all {alerts.length} alerts? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearAllDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={clearAllAlerts} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
