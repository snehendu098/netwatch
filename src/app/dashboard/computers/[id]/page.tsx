import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Monitor,
  Edit,
  Trash2,
  Play,
  Camera,
  Cpu,
  Globe,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import Image from "next/image";

interface Props {
  params: Promise<{ id: string }>;
}

async function getComputer(id: string) {
  const computer = await prisma.computer.findUnique({
    where: { id },
    include: {
      group: true,
      activityLogs: {
        take: 20,
        orderBy: { startedAt: "desc" },
      },
      screenshots: {
        take: 8,
        orderBy: { capturedAt: "desc" },
      },
      alerts: {
        take: 10,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return computer;
}

export default async function ComputerDetailsPage({ params }: Props) {
  const { id } = await params;
  const computer = await getComputer(id);

  if (!computer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/computers">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{computer.name}</h1>
            <Badge
              variant={computer.status === "ONLINE" ? "default" : "secondary"}
              className={
                computer.status === "ONLINE"
                  ? "bg-green-500 hover:bg-green-600"
                  : ""
              }
            >
              {computer.status}
            </Badge>
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
          </div>
          <p className="text-muted-foreground">{computer.hostname}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/monitoring/${computer.id}`}>
              <Play className="mr-2 h-4 w-4" />
              Live View
            </Link>
          </Button>
          <Button variant="outline" size="sm">
            <Camera className="mr-2 h-4 w-4" />
            Screenshot
          </Button>
          <Button variant="outline" size="sm">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" size="sm" className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Operating System
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <span className="capitalize font-medium">{computer.osType}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              IP Address
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{computer.ipAddress || "N/A"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Seen
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {computer.lastSeen
                ? formatDistanceToNow(new Date(computer.lastSeen), { addSuffix: true })
                : "Never"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Added On
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(new Date(computer.createdAt), "PP")}
            </span>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Latest application and website activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computer.activityLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline">{log.type}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{log.title}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            log.category === "productive"
                              ? "border-green-500/50 text-green-500"
                              : log.category === "unproductive"
                              ? "border-red-500/50 text-red-500"
                              : "border-yellow-500/50 text-yellow-500"
                          }
                        >
                          {log.category || "neutral"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {Math.floor(log.duration / 60)}m {log.duration % 60}s
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(log.startTime), "PPp")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="screenshots">
          <Card>
            <CardHeader>
              <CardTitle>Recent Screenshots</CardTitle>
              <CardDescription>Latest captured screenshots</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {computer.screenshots.filter(s => s.imageUrl).map((screenshot) => (
                  <div key={screenshot.id} className="overflow-hidden rounded-lg border">
                    <div className="relative aspect-video">
                      <Image
                        src={screenshot.imageUrl!}
                        alt="Screenshot"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(screenshot.capturedAt), "PPp")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Recent Alerts</CardTitle>
              <CardDescription>Alerts for this computer</CardDescription>
            </CardHeader>
            <CardContent>
              {computer.alerts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {computer.alerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <Badge variant="outline">{alert.type}</Badge>
                        </TableCell>
                        <TableCell>{alert.message}</TableCell>
                        <TableCell>
                          {alert.isRead ? (
                            <Badge variant="secondary">Read</Badge>
                          ) : (
                            <Badge>Unread</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(alert.createdAt), "PPp")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No alerts for this computer
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
