import Link from "next/link";
import { Reveal } from "@/components/Reveal";

export const metadata = { title: "Privacy" };

/** `/vie-privee`: what we keep, what we never keep. Plain words, not a legal wall. */
export default function PrivacyPage() {
  return (
    <div className="page dog-ear">
      <Reveal>
        <p className="eyebrow">privacy · a field note</p>
        <h1 style={{ marginTop: ".4rem" }}>What we keep, and what we never keep</h1>
        <div style={{ maxWidth: "62ch", marginTop: "1rem", display: "grid", gap: "0.9rem" }}>
          <p className="lede">You photograph real places, sometimes with people in them. Here is exactly what happens to your picture.</p>
          <h2 style={{ fontSize: "1.1rem", marginTop: ".5rem" }}>What is stored</h2>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            <li>
              <strong>a processed image</strong>: file metadata stripped, faces and number plates blurred, resized to 1,600 pixels at most;
            </li>
            <li>
              <strong>the fingerprint</strong> (SHA-256) of that processed image, written on-chain: it proves the photo was not altered afterwards;
            </li>
            <li>
              <strong>a city</strong>, “Chicago, US”, nothing finer;
            </li>
            <li>the date and time of the shot.</li>
          </ul>
          <h2 style={{ fontSize: "1.1rem", marginTop: ".5rem" }}>What is never stored</h2>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            <li>
              <strong>the original</strong>: it is processed in memory and never written to disk. If processing fails, nothing remains;
            </li>
            <li>
              <strong>EXIF metadata</strong> (phone model, settings, coordinates);
            </li>
            <li>
              <strong>GPS coordinates</strong>, in any form;
            </li>
            <li>
              <strong>sharp faces</strong>.
            </li>
          </ul>
          <h2 style={{ fontSize: "1.1rem", marginTop: ".5rem" }}>Deleting a card</h2>
          <p>
            On every card in your{" "}
            <Link href="/carnet" className="wobble-underline">
              notebook
            </Link>
            , “delete the image” really removes the image from our servers, at once. You sign the request with your wallet, that is all. The fragment you received stays yours, and the fingerprint stays on-chain, and it cannot rebuild the image.
          </p>
          <h2 style={{ fontSize: "1.1rem", marginTop: ".5rem" }}>What we see of you</h2>
          <p>Your wallet address, a fingerprint of your browser, your IP address and the country it points to. They enforce the quotas and catch account farms. They do not follow you elsewhere. We sell none of it.</p>
        </div>
      </Reveal>
    </div>
  );
}
