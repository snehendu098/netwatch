"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Globe, AppWindow, Edit, Trash2, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BlockRule {
  id: string;
  type: string;
  pattern: string;
  action: string;
  groupIds: string | null;
  isActive: boolean;
  createdAt: string;
}

interface PoliciesClientProps {
  initialRules: BlockRule[];
}

export function PoliciesClient({ initialRules }: PoliciesClientProps) {
  const [rules, setRules] = useState<BlockRule[]>(initialRules);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BlockRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<BlockRule | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    type: "WEBSITE",
    pattern: "",
    action: "BLOCK",
    groupIds: "",
    isActive: true,
  });

  const websiteRules = rules.filter((r) => r.type === "WEBSITE");
  const appRules = rules.filter((r) => r.type === "APP");

  const getActionBadge = (action: string) => {
    switch (action) {
      case "BLOCK":
        return <Badge variant="destructive">Block</Badge>;
      case "WARN":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Warn</Badge>;
      case "LOG":
        return <Badge variant="secondary">Log Only</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const openCreateDialog = (type: string = "WEBSITE") => {
    setEditingRule(null);
    setFormData({
      type,
      pattern: "",
      action: "BLOCK",
      groupIds: "",
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (rule: BlockRule) => {
    setEditingRule(rule);
    setFormData({
      type: rule.type,
      pattern: rule.pattern,
      action: rule.action,
      groupIds: rule.groupIds || "",
      isActive: rule.isActive,
    });
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (rule: BlockRule) => {
    setDeletingRule(rule);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.pattern.trim()) {
      toast.error("Pattern is required");
      return;
    }

    setIsLoading(true);
    try {
      if (editingRule) {
        // Update existing rule
        const res = await fetch(`/api/policies/${editingRule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) throw new Error("Failed to update rule");

        const updated = await res.json();
        setRules(rules.map((r) => (r.id === editingRule.id ? updated : r)));
        toast.success("Rule updated successfully");
      } else {
        // Create new rule
        const res = await fetch("/api/policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) throw new Error("Failed to create rule");

        const created = await res.json();
        setRules([created, ...rules]);
        toast.success("Rule created successfully");
      }
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(editingRule ? "Failed to update rule" : "Failed to create rule");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRule) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/policies/${deletingRule.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete rule");

      setRules(rules.filter((r) => r.id !== deletingRule.id));
      toast.success("Rule deleted successfully");
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast.error("Failed to delete rule");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (rule: BlockRule) => {
    try {
      const res = await fetch(`/api/policies/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });

      if (!res.ok) throw new Error("Failed to update rule");

      const updated = await res.json();
      setRules(rules.map((r) => (r.id === rule.id ? updated : r)));
      toast.success(`Rule ${updated.isActive ? "enabled" : "disabled"}`);
    } catch (error) {
      toast.error("Failed to update rule");
      console.error(error);
    }
  };

  const addQuickRule = async (category: string) => {
    const quickRules: Record<string, { type: string; patterns: string[] }> = {
      "social": {
        type: "WEBSITE",
        patterns: ["*facebook.com*", "*twitter.com*", "*instagram.com*", "*tiktok.com*", "*snapchat.com*"],
      },
      "streaming": {
        type: "WEBSITE",
        patterns: ["*netflix.com*", "*youtube.com*", "*twitch.tv*", "*hulu.com*", "*disneyplus.com*"],
      },
      "gaming": {
        type: "WEBSITE",
        patterns: ["*steampowered.com*", "*epicgames.com*", "*roblox.com*", "*minecraft.net*"],
      },
      "adult": {
        type: "WEBSITE",
        patterns: ["*porn*", "*xxx*", "*adult*"],
      },
      "filesharing": {
        type: "WEBSITE",
        patterns: ["*torrent*", "*piratebay*", "*1337x*", "*rapidshare*"],
      },
    };

    const config = quickRules[category];
    if (!config) return;

    setIsLoading(true);
    try {
      for (const pattern of config.patterns) {
        const res = await fetch("/api/policies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: config.type,
            pattern,
            action: "BLOCK",
            isActive: true,
          }),
        });

        if (res.ok) {
          const created = await res.json();
          setRules((prev) => [created, ...prev]);
        }
      }
      toast.success(`Added ${config.patterns.length} ${category} blocking rules`);
    } catch (error) {
      toast.error("Failed to add some rules");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderRulesTable = (rulesList: BlockRule[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pattern</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Groups</TableHead>
          <TableHead>Active</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rulesList.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              No rules configured. Click &quot;Add Rule&quot; to create one.
            </TableCell>
          </TableRow>
        ) : (
          rulesList.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell className="font-mono">{rule.pattern}</TableCell>
              <TableCell>{getActionBadge(rule.action)}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {rule.groupIds || "All Groups"}
                </Badge>
              </TableCell>
              <TableCell>
                <Switch
                  checked={rule.isActive}
                  onCheckedChange={() => handleToggleActive(rule)}
                />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(rule)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => openDeleteDialog(rule)}
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
          <p className="text-muted-foreground">
            Manage website and application blocking rules
          </p>
        </div>
        <Button onClick={() => openCreateDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{rules.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">
              {rules.filter((r) => r.isActive).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Website Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-500">{websiteRules.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="websites">
        <TabsList>
          <TabsTrigger value="websites" className="gap-2">
            <Globe className="h-4 w-4" />
            Website Rules ({websiteRules.length})
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2">
            <AppWindow className="h-4 w-4" />
            Application Rules ({appRules.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="websites">
          <Card>
            <CardHeader>
              <CardTitle>Website Blocking Rules</CardTitle>
              <CardDescription>
                Control access to websites across all monitored computers
              </CardDescription>
            </CardHeader>
            <CardContent>{renderRulesTable(websiteRules)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications">
          <Card>
            <CardHeader>
              <CardTitle>Application Blocking Rules</CardTitle>
              <CardDescription>
                Control which applications can be used on monitored computers
              </CardDescription>
            </CardHeader>
            <CardContent>{renderRulesTable(appRules)}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Quick Add Common Rules</CardTitle>
          </div>
          <CardDescription>
            Add commonly blocked websites and applications with one click
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addQuickRule("social")}
              disabled={isLoading}
            >
              Block Social Media
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addQuickRule("streaming")}
              disabled={isLoading}
            >
              Block Streaming Sites
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addQuickRule("gaming")}
              disabled={isLoading}
            >
              Block Gaming Sites
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addQuickRule("adult")}
              disabled={isLoading}
            >
              Block Adult Content
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addQuickRule("filesharing")}
              disabled={isLoading}
            >
              Block File Sharing
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Rule" : "Create New Rule"}
            </DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Update the blocking rule configuration"
                : "Add a new website or application blocking rule"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBSITE">Website</SelectItem>
                  <SelectItem value="APP">Application</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pattern</Label>
              <Input
                placeholder={formData.type === "WEBSITE" ? "*facebook.com*" : "chrome.exe"}
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use * as wildcard. Example: *facebook.com* blocks all Facebook URLs
              </p>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={formData.action}
                onValueChange={(v) => setFormData({ ...formData, action: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOCK">Block</SelectItem>
                  <SelectItem value="WARN">Warn</SelectItem>
                  <SelectItem value="LOG">Log Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRule ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this rule? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {deletingRule && (
              <div className="rounded-lg border p-4">
                <p className="font-mono text-sm">{deletingRule.pattern}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Type: {deletingRule.type} | Action: {deletingRule.action}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
