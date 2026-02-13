declare module '@solana-mobile/mobile-wallet-adapter-protocol-web3js' {
    import { Connection, PublicKey, Transaction, TransactionVersion, VersionedTransaction } from '@solana/web3.js';
    import { MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol';

    export interface Web3MobileWallet extends Omit<MobileWallet, 'signTransactions' | 'signAndSendTransactions'> {
        signTransactions<T extends Transaction | VersionedTransaction>(config: { transactions: T[] }): Promise<T[]>;
        signAndSendTransactions<T extends Transaction | VersionedTransaction>(config: { transactions: T[], minContextSlot?: number }): Promise<string[]>;
    }

    export function transact<R>(callback: (wallet: Web3MobileWallet) => Promise<R>): Promise<R>;
    export function transact<R>(callback: (wallet: Web3MobileWallet) => Promise<R>, config: { authorizationResult?: any }): Promise<R>;
}
