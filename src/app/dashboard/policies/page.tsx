import prisma from "@/lib/prisma";
import { PoliciesClient } from "@/components/policies/policies-client";

// Force dynamic rendering to avoid static generation errors
export const dynamic = 'force-dynamic';

async function getBlockRules() {
  return prisma.blockRule.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export default async function PoliciesPage() {
  const rules = await getBlockRules();

  // Serialize dates for client component
  const serializedRules = rules.map((rule) => ({
    ...rule,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  }));

  return <PoliciesClient initialRules={serializedRules} />;
}
