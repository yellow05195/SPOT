"use client";

import { useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { StyleRegistry, createStyleRegistry } from "styled-jsx";

/**
 * Streams every `<style jsx>` block into the server HTML, so a page is fully styled on first paint
 * instead of waiting for hydration (which used to flash the hero and the bar unstyled).
 */
export function StyledJsxRegistry({ children }: { children: React.ReactNode }) {
  const [registry] = useState(() => createStyleRegistry());
  useServerInsertedHTML(() => {
    const styles = registry.styles();
    registry.flush();
    return <>{styles}</>;
  });
  return <StyleRegistry registry={registry}>{children}</StyleRegistry>;
}
