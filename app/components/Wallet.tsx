"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@/lib/wagmi";
import { shortAddr } from "@/lib/format";

/** The wallet: a name written by hand in the margin. Wrong network → a switch button to 4663. No balances in dollars. */
export function Wallet({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected || !address) {
    const c = connectors[0];
    return (
      <button className={compact ? "btn-quiet" : "btn btn-secondary"} onClick={() => c && connect({ connector: c })} disabled={isPending || !c}>
        {isPending ? "connecting…" : compact ? "Connect" : "sign the notebook"}
      </button>
    );
  }
  if (chainId !== robinhoodChain.id) {
    return (
      <button className="btn" onClick={() => switchChain({ chainId: robinhoodChain.id })}>
        switch to Robinhood Chain
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "0.6rem" }}>
      <span className="hand" style={{ fontSize: compact ? "1.15rem" : "1.4rem" }} title={address}>
        {shortAddr(address)}
      </span>
      {!compact && (
        <button className="btn-quiet" onClick={() => disconnect()} style={{ fontSize: "0.8rem" }}>
          close
        </button>
      )}
    </span>
  );
}
