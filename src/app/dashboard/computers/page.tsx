import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddComputerDialog } from "@/components/computers/add-computer-dialog";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, MoreHorizontal, Monitor, Edit, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

async function getComputers(organizationId: string) {
  return prisma.computer.findMany({
    where: { organizationId },
    include: { group: true },
    orderBy: { name: "asc" },
  });
}

async function getGroups(organizationId: string) {
  return prisma.computerGroup.findMany({
    where: { organizationId },
    include: { _count: { select: { computers: true } } },
    orderBy: { name: "asc" },
  });
}

async function getStats(organizationId: string) {
  const [total, online, offline] = await Promise.all([
    prisma.computer.count({ where: { organizationId } }),
    prisma.computer.count({ where: { organizationId, status: "ONLINE" } }),
    prisma.computer.count({ where: { organizationId, status: "OFFLINE" } }),
  ]);
  return { total, online, offline };
}

export default async function ComputersPage() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return <div>Unauthorized</div>;
  }

  const organizationId = session.user.organizationId;
  const [computers, groups, stats] = await Promise.all([
    getComputers(organizationId),
    getGroups(organizationId),
    getStats(organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Computers</h1>
          <p className="text-muted-foreground">
            Manage all monitored computers and their groups
          </p>
        </div>
        <AddComputerDialog groups={groups} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Computers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">{stats.online}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Offline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{stats.offline}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Groups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{groups.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Groups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="font-medium">{group.name}</span>
                </div>
                <Badge variant="secondary">{group._count.computers}</Badge>
              </div>
            ))}
            <Button variant="outline" className="w-full mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Add Group
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Computers</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search computers..." className="pl-8" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {computers.map((computer) => (
                  <TableRow key={computer.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{computer.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {computer.hostname}
                    </TableCell>
                    <TableCell>
                      {computer.group && (
                        <Badge
                          style={{
                            backgroundColor: computer.group.color,
                            color: "white",
                          }}
                        >
                          {computer.group.name}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{computer.osType}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          computer.status === "ONLINE" ? "default" : "secondary"
                        }
                        className={
                          computer.status === "ONLINE"
                            ? "bg-green-500 hover:bg-green-600"
                            : ""
                        }
                      >
                        {computer.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {computer.lastSeen
                        ? formatDistanceToNow(new Date(computer.lastSeen), {
                            addSuffix: true,
                          })
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/monitoring/${computer.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              Monitor
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/computers/${computer.id}`}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
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
      </div>
    </div>
  );
}
