import { FAQ_ITEMS } from "@/data/faq";

export async function GET() {
  return Response.json(
    { faq: FAQ_ITEMS.map((item) => ({ question: item.question, answer: item.answer })) },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
