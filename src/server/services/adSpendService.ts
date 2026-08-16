import * as adSpendRepository from "@/server/repositories/adSpendRepository";
import type { AdSpendCreateInput, AdSpendUpdateInput } from "@/lib/validation/adSpendSchema";

export class DuplicateAdSpendEntryError extends Error {
  constructor() {
    super("يوجد إدخال آخر بنفس المنصة واسم الإعلان");
    this.name = "DuplicateAdSpendEntryError";
  }
}

export function listAdSpendEntries() {
  return adSpendRepository.listAdSpendEntries();
}

export async function createAdSpendEntry(input: AdSpendCreateInput) {
  const existing = await adSpendRepository.findAdSpendByPlatformAndCreative(input.platform, input.creativeName);
  if (existing) throw new DuplicateAdSpendEntryError();

  return adSpendRepository.createAdSpendEntry({
    platform: input.platform,
    creativeName: input.creativeName,
    clicks: input.clicks ?? 0,
    spendDzd: input.spendDzd ?? 0,
  });
}

export function updateAdSpendEntry(id: string, input: AdSpendUpdateInput) {
  return adSpendRepository.updateAdSpendEntry(id, input);
}

export function deleteAdSpendEntry(id: string) {
  return adSpendRepository.deleteAdSpendEntry(id);
}
