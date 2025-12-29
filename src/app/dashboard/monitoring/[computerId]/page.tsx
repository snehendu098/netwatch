import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';
import { SingleComputerView } from "@/components/monitoring/single-computer-view";

interface Props {
  params: Promise<{ computerId: string }>;
}

async function getComputer(computerId: string) {
  const computer = await prisma.computer.findUnique({
    where: { id: computerId },
    include: {
      group: true,
      activityLogs: {
        take: 10,
        orderBy: { startedAt: "desc" },
      },
    },
  });

  if (!computer) return null;

  return {
    id: computer.id,
    name: computer.name,
    hostname: computer.hostname,
    ipAddress: computer.ipAddress,
    osType: computer.osType,
    status: computer.status,
    lastSeen: computer.lastSeen,
    groupName: computer.group?.name || "Ungrouped",
    groupColor: computer.group?.color || "#6B7280",
    activities: computer.activityLogs.map((log) => ({
      id: log.id,
      type: log.type || "UNKNOWN",
      title: log.title || log.applicationName || "Unknown",
      startedAt: log.startedAt || log.startTime,
      category: log.category,
    })),
  };
}

export default async function SingleComputerPage({ params }: Props) {
  const { computerId } = await params;
  const computer = await getComputer(computerId);

  if (!computer) {
    notFound();
  }

  return <SingleComputerView computer={computer} />;
}
