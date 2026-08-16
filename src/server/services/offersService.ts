import * as offersRepository from "@/server/repositories/offersRepository";
import type { OfferCreateInput, OfferUpdateInput } from "@/lib/validation/offerSchema";

export class OfferNotFoundError extends Error {
  constructor() {
    super("العرض غير موجود");
    this.name = "OfferNotFoundError";
  }
}

export class InvalidOfferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOfferError";
  }
}

export function listOffers(params: offersRepository.ListOffersParams) {
  return offersRepository.listOffers(params);
}

export async function getOffer(id: string) {
  const offer = await offersRepository.findOfferById(id);
  if (!offer) throw new OfferNotFoundError();
  return offer;
}

export async function createOffer(input: OfferCreateInput) {
  if (input.triggerProductId === input.offerProductId) {
    throw new InvalidOfferError("يجب أن يكون منتج العرض مختلفًا عن المنتج الأساسي");
  }

  const { triggerProductId, offerProductId, ...data } = input;
  return offersRepository.createOffer({
    ...data,
    triggerProduct: { connect: { id: triggerProductId } },
    offerProduct: { connect: { id: offerProductId } },
  });
}

export async function updateOffer(id: string, input: OfferUpdateInput) {
  const existing = await offersRepository.findOfferById(id);
  if (!existing) throw new OfferNotFoundError();

  const triggerProductId = input.triggerProductId ?? existing.triggerProductId;
  const offerProductId = input.offerProductId ?? existing.offerProductId;
  if (triggerProductId === offerProductId) {
    throw new InvalidOfferError("يجب أن يكون منتج العرض مختلفًا عن المنتج الأساسي");
  }

  const { triggerProductId: t, offerProductId: o, ...data } = input;
  return offersRepository.updateOffer(id, {
    ...data,
    ...(t ? { triggerProduct: { connect: { id: t } } } : {}),
    ...(o ? { offerProduct: { connect: { id: o } } } : {}),
  });
}

export async function deleteOffer(id: string) {
  const existing = await offersRepository.findOfferById(id);
  if (!existing) throw new OfferNotFoundError();
  return offersRepository.deleteOffer(id);
}

export function getActiveOffersForProduct(productSlug: string) {
  return offersRepository.findActiveOffersByTriggerSlug(productSlug);
}
