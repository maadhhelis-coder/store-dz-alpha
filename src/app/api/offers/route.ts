import { NextResponse } from "next/server";
import { getActiveOffersForProduct } from "@/server/services/offersService";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productSlug = searchParams.get("productSlug");
    if (!productSlug) return NextResponse.json({ offers: [] });

    const offers = await getActiveOffersForProduct(productSlug);

    return NextResponse.json({
      offers: offers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        offerPriceDzd: offer.offerPriceDzd,
        offerProduct: {
          slug: offer.offerProduct.slug,
          name: offer.offerProduct.name,
          priceDzd: offer.offerProduct.priceDzd,
          imageUrl: offer.offerProduct.images[0]?.url ?? null,
        },
      })),
    });
  } catch (error) {
    console.error("get public offers error", error);
    return NextResponse.json({ offers: [] });
  }
}
