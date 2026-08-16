import { prisma } from "@/server/db/prisma";
import type { LeadStatus, Prisma } from "@prisma/client";

export type ListLeadsParams = {
  page: number;
  pageSize: number;
  status?: LeadStatus;
  search?: string;
};

export async function listLeads(params: ListLeadsParams) {
  const where: Prisma.LeadWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { phone: { contains: params.search } },
            { firstName: { contains: params.search, mode: "insensitive" } },
            { lastName: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.lead.count({ where }),
  ]);

  return { items, total };
}

export function createLead(data: Prisma.LeadUncheckedCreateInput) {
  return prisma.lead.create({ data });
}

export function findLeadById(id: string) {
  return prisma.lead.findUnique({ where: { id } });
}

export function updateLeadStatus(id: string, status: LeadStatus, notes?: string) {
  return prisma.lead.update({
    where: { id },
    data: { status, ...(notes !== undefined ? { notes } : {}) },
  });
}

export function countNewLeads() {
  return prisma.lead.count({ where: { status: "new" } });
}

export function deleteLead(id: string) {
  return prisma.lead.delete({ where: { id } });
}
