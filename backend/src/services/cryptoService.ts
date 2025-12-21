import crypto from 'crypto';
import { config } from '../config/env';

/**
 * CryptoService provides utility functions for generating hashes and 
 * digital signatures for the Integrity Ledger.
 */
class CryptoService {
    private readonly algorithm = 'sha256';
    private privateKey: string | null = null;
    private publicKey: string | null = null;

    constructor() {
        // Load keys from environment if available
        this.privateKey = process.env.INTEGRITY_PRIVATE_KEY || null;
        this.publicKey = process.env.INTEGRITY_PUBLIC_KEY || null;
    }

    /**
     * Generates a SHA-256 hash of a JSON payload.
     */
    public hashPayload(payload: any): string {
        const str = typeof payload === 'string' ? payload : JSON.stringify(this.sortKeys(payload));
        return crypto.createHash(this.algorithm).update(str).digest('hex');
    }

    /**
     * Signs a message using Ed25519.
     * The message is usually a combination of payload_hash and prev_hash.
     */
    public signMessage(message: string): string {
        if (!this.privateKey) {
            console.warn('[Crypto] No private key found, using dummy signature for development.');
            return `signed_${crypto.randomBytes(8).toString('hex')}`;
        }

        try {
            const signature = crypto.sign(
                null,
                Buffer.from(message),
                crypto.createPrivateKey({
                    key: this.privateKey,
                    format: 'pem',
                    type: 'pkcs8'
                })
            );
            return signature.toString('hex');
        } catch (error) {
            console.error('[Crypto] Signing failed:', error);
            throw new Error('Cryptographic signing failed');
        }
    }

    /**
     * Verifies a signature using Ed25519.
     */
    public verifySignature(message: string, signature: string): boolean {
        if (!this.publicKey) return false;

        try {
            return crypto.verify(
                null,
                Buffer.from(message),
                crypto.createPublicKey({
                    key: this.publicKey,
                    format: 'pem',
                    type: 'spki'
                }),
                Buffer.from(signature, 'hex')
            );
        } catch (error) {
            console.error('[Crypto] Verification failed:', error);
            return false;
        }
    }

    /**
     * Deterministic key sorting to ensure consistent hashes for the same object structure.
     */
    private sortKeys(obj: any): any {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(item => this.sortKeys(item));

        return Object.keys(obj).sort().reduce((sorted: any, key: string) => {
            sorted[key] = this.sortKeys(obj[key]);
            return sorted;
        }, {});
    }

    /**
     * Generates a new Ed25519 key pair (for initial setup).
     */
    public generateKeyPair() {
        return crypto.generateKeyPairSync('ed25519', {
            privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
            publicKeyEncoding: { format: 'pem', type: 'spki' }
        });
    }
}

export const cryptoService = new CryptoService();
