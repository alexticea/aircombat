import { Connection, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

// The SKR Name Service / Seeker ID Program ID
// Based on current Solana Seeker ecosystem data
const SKR_PROGRAM_ID = new PublicKey("SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ");

const connection = new Connection("https://api.mainnet-beta.solana.com");

/**
 * Resolves a .skr domain for a given wallet address.
 * This performs a reverse lookup by searching for accounts owned by the wallet
 * on the SKR Name Service program.
 */
export async function getSkrDomainFromAddress(walletAddress: string): Promise<string | null> {
    if (!walletAddress) return null;

    try {
        const publicKey = new PublicKey(walletAddress);

        // Fetch accounts owned by this wallet in the SKR program
        // We use filters to find accounts where the owner field matches
        const accounts = await connection.getProgramAccounts(
            SKR_PROGRAM_ID,
            {
                filters: [
                    {
                        memcmp: {
                            offset: 32, // Standard owner offset for many name service programs
                            bytes: publicKey.toBase58(),
                        },
                    },
                ],
            }
        );

        if (accounts.length === 0) return null;

        // Sort by some criteria if multiple domains exist, or just take the first
        // Here we decode the first found domain
        const domain = decodeSkrDomain(accounts[0].account.data);

        return domain ? `${domain}.skr` : null;
    } catch (error) {
        console.error("Error resolving .skr domain:", error);
        return null;
    }
}

/**
 * Decodes the domain name from the account data buffer.
 * Standard implementation removes null bytes and trims whitespace.
 */
function decodeSkrDomain(data: Buffer): string {
    try {
        // Offset 64 is a common start for name data in SNS-like structures
        // but we'll try to find the printable string in the buffer
        const rawString = data.toString('utf8');

        // Remove non-printable characters and null bytes
        const cleanString = rawString.replace(/[^\x20-\x7E]/g, '').trim();

        // If it looks like a hex string or too short/long, it might be wrong
        if (cleanString.length < 3) return "";

        return cleanString;
    } catch (e) {
        console.error("Decoding error:", e);
        return "";
    }
}
