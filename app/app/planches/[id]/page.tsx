import { api } from "@/lib/api";
import { Planche } from "@/components/Planche";
import "@/components/fiche.css";

export const dynamic = "force-dynamic";

export default async function PlatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ plates }, { brands }] = await Promise.all([api.planches(), api.marques()]);
  const plate = plates.find((p) => p.id === Number(id));
  if (!plate) {
    return (
      <div className="page">
        <p className="legend">Plate not found.</p>
      </div>
    );
  }
  return <Planche plate={plate} brands={brands} />;
}
