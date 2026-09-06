import { api } from "@/lib/api";
import { Carnet } from "@/components/Carnet";
import "@/components/fiche.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notebook" };

/** `/carnet`: the screen that builds attachment: your cards, paginated like a notebook, never an infinite scroll. */
export default async function NotebookPage() {
  const { brands } = await api.marques();
  return <Carnet brands={brands} />;
}
