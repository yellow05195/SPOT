import { api } from "@/lib/api";
import { FicheDetail } from "@/components/FicheDetail";
import "@/components/fiche.css";

export const dynamic = "force-dynamic";

/** A single card: front, then on tap the back (the proof, laid out like the back of a lab card). */
export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brands } = await api.marques();
  return <FicheDetail id={Number(id)} brands={brands} />;
}
