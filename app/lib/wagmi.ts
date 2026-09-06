import { http, createConfig, cookieStorage, createStorage } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

/** Robinhood Chain (spec 1.1). Le wallet sur le mauvais réseau reçoit un bouton de bascule vers 4663. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const EXPLORER = "https://robinhoodchain.blockscout.com";

/**
 * Connecteurs : le wallet injecté (MetaMask, Rabby, Coinbase…). Le wallet embarqué par passkey pour
 * les nouveaux (spec 3.3) se branche ici comme connecteur supplémentaire quand le fournisseur est choisi.
 */
export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: { [robinhoodChain.id]: http() },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
