import { api } from "@/lib/api";
import { Prise } from "@/components/prise/Prise";
import "@/components/fiche.css";
import "@/components/prise/prise.css";

export const dynamic = "force-dynamic";

/** `/prise/[brandId]`: the central screen of the product. */
export default async function ShotPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const id = Number(brandId);
  const [{ brands }, chasse] = await Promise.all([api.marques(), api.chasse()]);
  const brand = brands.find((b) => b.id === id);
  if (!brand) {
    return (
      <div className="page">
        <p className="legend">This brand is no longer in the game.</p>
      </div>
    );
  }
  const inHunt = chasse.brands.some((b) => b.id === id);
  return <Prise brand={brand} inHunt={inHunt} budgetExhausted={chasse.budgetExhausted} resetInSeconds={chasse.resetInSeconds} />;
}
