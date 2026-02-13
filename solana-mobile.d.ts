declare module '@solana-mobile/mobile-wallet-adapter-protocol-web3js' {
    import { Transaction, VersionedTransaction, SendOptions } from '@solana/web3.js';
    import { MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol';

    export interface Web3MobileWallet extends Omit<MobileWallet, 'signTransactions' | 'signAndSendTransactions'> {
        signTransactions<T extends Transaction | VersionedTransaction>(config: { transactions: T[] }): Promise<T[]>;
        signAndSendTransactions<T extends Transaction | VersionedTransaction>(config: { transactions: T[], minContextSlot?: number, options?: SendOptions }): Promise<string[]>;
    }

    export function transact<R>(callback: (wallet: Web3MobileWallet) => Promise<R>): Promise<R>;
    export function transact<R>(callback: (wallet: Web3MobileWallet) => Promise<R>, config: { authorizationResult?: any }): Promise<R>;
}
