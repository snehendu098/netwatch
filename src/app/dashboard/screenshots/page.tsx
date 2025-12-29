import prisma from "@/lib/prisma";
import { ScreenshotsClient } from "@/components/screenshots/screenshots-client";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';

async function getScreenshots() {
  return prisma.screenshot.findMany({
    where: {
      imageUrl: { not: null },
    },
    take: 100,
    orderBy: { capturedAt: "desc" },
    include: {
      computer: {
        select: { name: true, hostname: true },
      },
    },
  });
}

async function getComputers() {
  return prisma.computer.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export default async function ScreenshotsPage() {
  const [screenshots, computers] = await Promise.all([
    getScreenshots(),
    getComputers(),
  ]);

  // Serialize dates for client component
  const serializedScreenshots = screenshots.map((s) => ({
    ...s,
    capturedAt: s.capturedAt.toISOString(),
  }));

  return (
    <ScreenshotsClient
      initialScreenshots={serializedScreenshots}
      computers={computers}
    />
  );
}
