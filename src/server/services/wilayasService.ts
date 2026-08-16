import * as wilayasRepository from "@/server/repositories/wilayasRepository";
import type { WilayaPricingUpdateInput } from "@/lib/validation/wilayaSchema";

export function listWilayas() {
  return wilayasRepository.listAllWilayas();
}

export function updateWilayaPricing(input: WilayaPricingUpdateInput) {
  return wilayasRepository.bulkUpdateWilayaPricing(input.wilayas);
}
