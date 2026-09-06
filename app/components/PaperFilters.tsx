/** Le grain du papier et l'encre inégale des tampons : des filtres SVG, jamais des images. */
export function PaperFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="3" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <filter id="ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="noise" />
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.35" in="noise" result="alpha" />
        <feComposite operator="in" in="SourceGraphic" in2="alpha" />
      </filter>
      <mask id="inkMask" maskContentUnits="objectBoundingBox">
        <rect width="1" height="1" fill="white" filter="url(#inkNoise)" />
      </mask>
      <filter id="inkNoise" x="0" y="0" width="1" height="1">
        <feTurbulence type="fractalNoise" baseFrequency="12" numOctaves="2" seed="5" />
        <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.2 -0.55" />
      </filter>
    </svg>
  );
}
