// Separate entry point for HD wallet functionality.
// Pulls in @scure/bip32 — browser apps using Keplr/Leap don't need this.
// Server apps import from '@rebarxyz/rivet/wallet' for mnemonic support.

export { HDWallet } from './wallet/hd.js';

// Re-export types for convenience
export type { OfflineDirectSigner, AccountData, DirectSignResponse } from './wallet/types.js';
export { Secp256k1Wallet } from './wallet/secp256k1.js';
