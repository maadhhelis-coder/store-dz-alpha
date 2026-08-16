import * as leadsRepository from "@/server/repositories/leadsRepository";
import { findWilayaByCode } from "@/server/repositories/wilayasRepository";
import type { LeadCreateInput } from "@/lib/validation/leadSchema";
import type { LeadStatus } from "@prisma/client";

export class LeadNotFoundError extends Error {
  constructor() {
    super("العميل المحتمل غير موجود");
    this.name = "LeadNotFoundError";
  }
}

export type CreateLeadMeta = {
  ipAddress?: string;
  userAgent?: string;
};

export async function createLead(input: LeadCreateInput, meta: CreateLeadMeta) {
  const wilaya = input.wilayaCode ? await findWilayaByCode(input.wilayaCode) : null;

  return leadsRepository.createLead({
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    wilayaCode: wilaya?.code,
    wilayaName: wilaya?.name,
    commune: input.commune,
    address: input.address,
    productSlug: input.productSlug,
    productName: input.productName,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export function listLeads(params: leadsRepository.ListLeadsParams) {
  return leadsRepository.listLeads(params);
}

export async function updateLeadStatus(id: string, status: LeadStatus, notes?: string) {
  const existing = await leadsRepository.findLeadById(id);
  if (!existing) throw new LeadNotFoundError();
  return leadsRepository.updateLeadStatus(id, status, notes);
}

export async function deleteLead(id: string) {
  const existing = await leadsRepository.findLeadById(id);
  if (!existing) throw new LeadNotFoundError();
  return leadsRepository.deleteLead(id);
}
