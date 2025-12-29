import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Laptop,
  Activity,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Monitor,
  Plus,
  RefreshCw,
} from "lucide-react";
import prisma from "@/lib/prisma";
import { DashboardCharts } from "@/components/dashboard/charts";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import Link from "next/link";

async function getStats() {
  const [
    totalComputers,
    onlineComputers,
    alerts,
    recentActivities,
  ] = await Promise.all([
    prisma.computer.count(),
    prisma.computer.count({ where: { status: "ONLINE" } }),
    prisma.alert.count({ where: { isRead: false } }),
    prisma.activityLog.count({
      where: {
        startedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    totalComputers,
    onlineComputers,
    alerts,
    recentActivities,
    productivityScore: 78,
  };
}

async function getTopApps() {
  const apps = await prisma.activityLog.groupBy({
    by: ["title"],
    where: {
      type: "APP",
      startedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    _sum: {
      duration: true,
    },
    orderBy: {
      _sum: {
        duration: "desc",
      },
    },
    take: 5,
  });

  return apps.map((app) => ({
    name: app.title,
    duration: Math.round((app._sum.duration || 0) / 3600),
  }));
}

async function getTopWebsites() {
  const websites = await prisma.activityLog.groupBy({
    by: ["title"],
    where: {
      type: "WEBSITE",
      startedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    _sum: {
      duration: true,
    },
    orderBy: {
      _sum: {
        duration: "desc",
      },
    },
    take: 5,
  });

  return websites.map((site) => ({
    name: site.title,
    duration: Math.round((site._sum.duration || 0) / 3600),
  }));
}

async function getRecentActivity() {
  const activities = await prisma.activityLog.findMany({
    take: 10,
    orderBy: { startedAt: "desc" },
    include: {
      computer: {
        select: {
          name: true,
        },
      },
    },
  });

  return activities.map((activity) => ({
    id: activity.id,
    type: activity.type || "APP",
    title: activity.title || activity.applicationName || "Unknown",
    computerName: activity.computer.name,
    startedAt: activity.startedAt || activity.startTime,
    category: activity.category,
  }));
}

export default async function DashboardPage() {
  const stats = await getStats();
  const topApps = await getTopApps();
  const topWebsites = await getTopWebsites();
  const recentActivity = await getRecentActivity();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your team&apos;s activity and productivity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/computers">
              <Plus className="mr-2 h-4 w-4" />
              Add Computer
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online Computers</CardTitle>
            <Laptop className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.onlineComputers}/{stats.totalComputers}
            </div>
            <div className="flex items-center pt-1">
              <ArrowUpRight className="mr-1 h-3 w-3 text-green-500" />
              <span className="text-xs text-green-500">+2 from yesterday</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.alerts}</div>
            <div className="flex items-center pt-1">
              <ArrowDownRight className="mr-1 h-3 w-3 text-red-500" />
              <span className="text-xs text-red-500">+3 new alerts</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity Today</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentActivities}</div>
            <div className="flex items-center pt-1">
              <ArrowUpRight className="mr-1 h-3 w-3 text-green-500" />
              <span className="text-xs text-green-500">+12% from yesterday</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Productivity Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.productivityScore}%</div>
            <div className="flex items-center pt-1">
              <ArrowUpRight className="mr-1 h-3 w-3 text-green-500" />
              <span className="text-xs text-green-500">+5% from last week</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Weekly Activity Overview</CardTitle>
            <CardDescription>
              Hours of activity tracked per day this week
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <Suspense fallback={<div className="h-[350px] flex items-center justify-center">Loading...</div>}>
              <DashboardCharts />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions from your team</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityFeed activities={recentActivity} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Applications</CardTitle>
              <CardDescription>Most used apps this week</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/reports/applications">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topApps.map((app, index) => (
                <div key={app.name} className="flex items-center">
                  <div className="w-8 text-sm font-medium text-muted-foreground">
                    #{index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{app.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {app.duration}h
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, (app.duration / (topApps[0]?.duration || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Websites</CardTitle>
              <CardDescription>Most visited sites this week</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/reports/websites">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topWebsites.map((site, index) => (
                <div key={site.name} className="flex items-center">
                  <div className="w-8 text-sm font-medium text-muted-foreground">
                    #{index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{site.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {site.duration}h
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-chart-2"
                        style={{
                          width: `${Math.min(100, (site.duration / (topWebsites[0]?.duration || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" asChild>
              <Link href="/dashboard/monitoring">
                <Monitor className="h-6 w-6" />
                <span>Live Monitoring</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" asChild>
              <Link href="/dashboard/screenshots">
                <Activity className="h-6 w-6" />
                <span>View Screenshots</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" asChild>
              <Link href="/dashboard/reports">
                <TrendingUp className="h-6 w-6" />
                <span>Generate Report</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" asChild>
              <Link href="/dashboard/policies">
                <AlertTriangle className="h-6 w-6" />
                <span>Manage Policies</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
