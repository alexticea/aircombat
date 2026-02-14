import nacl from 'tweetnacl';
import bs58 from 'bs58';
import * as Linking from 'expo-linking';
import { PublicKey } from '@solana/web3.js';
import 'react-native-url-polyfill/auto'; // Ensure URL is polyfilled

// Basic interface for the shared secret / session
export interface PhantomSession {
    dappKeyPair: nacl.BoxKeyPair;
    sharedSecret?: Uint8Array;
    session?: string;
    phantomPublicKey?: Uint8Array;
}

// Store session in memory (or persist if you want)
// For simplicity in this example, we re-generate keys on app restart or keep in global state
let sessionState: PhantomSession | null = null;

export const initSession = (): PhantomSession => {
    const keyPair = nacl.box.keyPair();
    sessionState = { dappKeyPair: keyPair };
    console.log("[SolanaLogin] Session initialized with new keypair");
    return sessionState;
};

export const clearSession = () => {
    sessionState = null;
    console.log("[SolanaLogin] Session cleared");
};

// Helper to encrypt payload
export const encryptPayload = (payload: any, sharedSecret: Uint8Array) => {
    const nonce = nacl.randomBytes(24);
    const payloadJson = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadJson);
    const encrypted = nacl.box.after(payloadBytes, nonce, sharedSecret);
    return [nonce, encrypted];
};

// Helper to decrypt payload
const decryptPayload = (data: string, nonce: string, sharedSecret: Uint8Array) => {
    const dataBytes = bs58.decode(data);
    const nonceBytes = bs58.decode(nonce);
    const decrypted = nacl.box.open.after(dataBytes, nonceBytes, sharedSecret);
    if (!decrypted) throw new Error('Decryption failed');
    return JSON.parse(new TextDecoder().decode(decrypted));
};


export const buildConnectUrl = (redirectLink: string) => {
    // Always start fresh on a new connect attempt to avoid state confusion
    initSession();
    const { dappKeyPair } = sessionState!;

    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
        cluster: 'devnet',
        app_url: 'https://aircombat.onrender.com',
        redirect_link: redirectLink,
    });

    return `https://solflare.com/ul/v1/connect?${params.toString()}`;
};

export const handleConnectCallback = (url: string): { publicKey: PublicKey, session: string } | null => {
    if (!sessionState) return null;

    const parsed = Linking.parse(url);
    console.log("[SolanaLogin] Parsed path:", parsed.path);
    // Explicitly check path to avoid cross-fire with signMessage callback
    if (parsed.path !== 'solflare-login') return null;

    const queryParams = parsed.queryParams;
    console.log("[SolanaLogin] Connect Callback:", url);

    if (!queryParams) return null;

    if (queryParams.errorCode) {
        console.error("[SolanaLogin] Connection Error:", queryParams.errorMessage);
        return null;
    }

    const phantomPublicKeyStr = (queryParams.phantom_encryption_public_key || queryParams.solflare_encryption_public_key) as string;
    const dataStr = queryParams.data as string;
    const nonceStr = queryParams.nonce as string;

    if (phantomPublicKeyStr && dataStr && nonceStr) {
        try {
            console.log("[SolanaLogin] Key found, attempting decrypt...");
            const phantomPublicKey = bs58.decode(phantomPublicKeyStr);
            const dataBytes = bs58.decode(dataStr);
            const nonceBytes = bs58.decode(nonceStr);

            const sharedSecret = nacl.box.before(phantomPublicKey, sessionState.dappKeyPair.secretKey);
            sessionState.sharedSecret = sharedSecret;
            sessionState.phantomPublicKey = phantomPublicKey;

            const decryptedBox = nacl.box.open.after(dataBytes, nonceBytes, sharedSecret);
            if (!decryptedBox) {
                console.error("Decryption failed");
                return null;
            }

            const decryptedPayload = JSON.parse(new TextDecoder().decode(decryptedBox));

            if (decryptedPayload.public_key) {
                sessionState.session = decryptedPayload.session;
                return {
                    publicKey: new PublicKey(decryptedPayload.public_key),
                    session: decryptedPayload.session
                };
            }
        } catch (e) {
            console.error("Error handling connect callback", e);
        }
    }
    return null;
};

export const buildSignMessageUrl = (message: string, redirectLink: string) => {
    if (!sessionState || !sessionState.sharedSecret || !sessionState.session) {
        throw new Error("No active session. Connect first.");
    }

    const payload = {
        session: sessionState.session,
        message: bs58.encode(new TextEncoder().encode(message)),
    };

    const [nonce, encryptedPayload] = encryptPayload(payload, sessionState.sharedSecret);

    const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(sessionState.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        payload: bs58.encode(encryptedPayload),
        redirect_link: redirectLink,
    });

    return `https://solflare.com/ul/v1/signMessage?${params.toString()}`;
};

export const handleSignMessageCallback = (url: string): { signature: string } | null => {
    if (!sessionState || !sessionState.sharedSecret) return null;

    const parsed = Linking.parse(url);
    console.log("[SolanaLogin] Sign path:", parsed.path);
    if (parsed.path !== 'solflare-sign') return null;

    const queryParams = parsed.queryParams;
    console.log("[SolanaLogin] SignMessage Callback:", url);

    if (!queryParams || queryParams.errorCode) {
        if (queryParams?.errorCode) console.error("[SolanaLogin] Sign Error:", queryParams.errorMessage);
        return null;
    }

    const dataStr = queryParams.data as string;
    const nonceStr = queryParams.nonce as string;

    if (dataStr && nonceStr) {
        try {
            const dataBytes = bs58.decode(dataStr);
            const nonceBytes = bs58.decode(nonceStr);

            const decryptedBox = nacl.box.open.after(dataBytes, nonceBytes, sessionState.sharedSecret);
            if (!decryptedBox) return null;

            const decryptedPayload = JSON.parse(new TextDecoder().decode(decryptedBox));
            return { signature: decryptedPayload.signature };
        } catch (e) {
            console.error("Error handling signMessage callback", e);
        }
    }
    return null;
};
