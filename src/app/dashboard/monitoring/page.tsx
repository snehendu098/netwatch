import { Suspense } from "react";
import prisma from "@/lib/prisma";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';
import { MonitoringGrid } from "@/components/monitoring/monitoring-grid";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, RefreshCw, Grid3X3, LayoutGrid } from "lucide-react";

async function getComputers() {
  const computers = await prisma.computer.findMany({
    include: {
      group: true,
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return computers.map((computer) => ({
    id: computer.id,
    name: computer.name,
    hostname: computer.hostname,
    status: computer.status,
    osType: computer.osType,
    lastSeen: computer.lastSeen,
    groupName: computer.group?.name || "Ungrouped",
    groupColor: computer.group?.color || "#6B7280",
    imageUrl: `https://picsum.photos/seed/${computer.id}/400/300`,
  }));
}

async function getGroups() {
  return prisma.computerGroup.findMany({
    orderBy: { name: "asc" },
  });
}

export default async function MonitoringPage() {
  const [computers, groups] = await Promise.all([getComputers(), getGroups()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Monitoring</h1>
          <p className="text-muted-foreground">
            View real-time screens of all connected computers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input type="search" placeholder="Search computers..." className="pl-8" />
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-video rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        }
      >
        <MonitoringGrid computers={computers} />
      </Suspense>
    </div>
  );
}
