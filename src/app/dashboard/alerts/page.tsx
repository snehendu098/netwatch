import prisma from "@/lib/prisma";
import { AlertsClient } from "@/components/alerts/alerts-client";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';

async function getAlerts() {
  return prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      computer: {
        select: { name: true },
      },
    },
  });
}

async function getAlertStats() {
  const [total, unread, policyViolations, idleAlerts] = await Promise.all([
    prisma.alert.count(),
    prisma.alert.count({ where: { isRead: false } }),
    prisma.alert.count({ where: { type: "POLICY_VIOLATION" } }),
    prisma.alert.count({ where: { type: "IDLE" } }),
  ]);
  return { total, unread, policyViolations, idleAlerts };
}

export default async function AlertsPage() {
  const [alerts, stats] = await Promise.all([getAlerts(), getAlertStats()]);

  // Serialize dates for client component
  const serializedAlerts = alerts.map((alert) => ({
    ...alert,
    createdAt: alert.createdAt.toISOString(),
  }));

  return <AlertsClient initialAlerts={serializedAlerts} initialStats={stats} />;
}
