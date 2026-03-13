import { http } from 'wagmi';
import { base } from 'wagmi/chains';
import { createConfig } from '@privy-io/wagmi';

// ─── Privy App Config ──────────────────────────────────────
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || 'cmmlc7eyr00x60cl455o1sxe7';

export const privyConfig = {
    loginMethods: ['email', 'wallet'],
    appearance: {
        theme: '#0a0f0a',
        accentColor: '#00ff87',
        logo: '/brand/forge-mark.png',
        showWalletLoginFirst: true,
        walletChainType: 'ethereum-only',
    },
    embeddedWallets: {
        createOnLogin: 'users-without-wallets',
    },
    defaultChain: base,
    supportedChains: [base],
};

// ─── wagmi Config (via Privy) ──────────────────────────────
export const wagmiConfig = createConfig({
    chains: [base],
    transports: {
        [base.id]: http(import.meta.env.VITE_ALCHEMY_URL || 'https://base-mainnet.g.alchemy.com/v2/NQ6flEGFoCYhNQTT7FL3K'),
    },
});
