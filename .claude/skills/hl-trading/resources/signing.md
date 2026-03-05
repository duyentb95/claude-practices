# EIP-712 Signing — Deep Dive

All Exchange endpoint actions require a phantom agent signature using EIP-712.
This document explains the full signing flow used in this codebase.

---

## Overview

```
action (object)
    ↓ msgpack.encode()
actionBytes (Buffer)
    ↓ + nonce_bytes (8 bytes big-endian) + suffix
payload (Buffer)
    ↓ keccak256()
connectionId (bytes32)
    ↓ EIP-712 signTypedData (phantom agent domain)
signature { r, s, v }
```

---

## Dependencies

```bash
npm install ethers msgpackr
```

```typescript
import { ethers } from 'ethers';
import * as msgpack from 'msgpackr';
```

---

## Full Implementation

```typescript
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

async function signAction(
  action: object,
  nonce: number,
  vaultAddress?: string,
): Promise<{ r: string; s: string; v: number }> {
  // Step 1: Encode action with msgpack
  const actionBytes = Buffer.from(msgpack.encode(action));

  // Step 2: Nonce as 8-byte big-endian
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64BE(BigInt(nonce));

  // Step 3: Vault suffix
  // 0x00 = trading from main account
  // 0x01 + vaultAddress bytes = trading from vault
  const suffix = vaultAddress
    ? Buffer.concat([
        Buffer.from([1]),
        Buffer.from(vaultAddress.slice(2), 'hex'),
      ])
    : Buffer.from([0]);

  // Step 4: Build hash payload
  const payload = Buffer.concat([actionBytes, nonceBytes, suffix]);
  const connectionId = ethers.keccak256(payload);

  // Step 5: EIP-712 phantom agent domain (Hyperliquid-specific)
  const domain = {
    name: 'Exchange',
    version: '1',
    chainId: 1337,                                                  // fixed
    verifyingContract: '0x0000000000000000000000000000000000000000', // fixed zero address
  };

  const types = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  };

  const value = {
    source: vaultAddress ? 'b' : 'a',  // 'a' = main, 'b' = vault
    connectionId,
  };

  // Step 6: Sign
  const sig = await wallet.signTypedData(domain, types, value);
  const { r, s, v } = ethers.Signature.from(sig);

  return { r, s, v };
}
```

---

## Full Request Sender

```typescript
async function postExchange<T = unknown>(
  action: object,
  nonce: number,
  vaultAddress?: string,
): Promise<T> {
  const signature = await signAction(action, nonce, vaultAddress);

  const body: Record<string, unknown> = { action, nonce, signature };
  if (vaultAddress) body.vaultAddress = vaultAddress;

  const res = await fetch('https://api.hyperliquid.xyz/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Exchange HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
```

---

## Nonce Rules

- **Type**: Unix milliseconds (integer)
- **Source**: `Date.now()` — always fresh, never cached
- **Uniqueness**: Each request needs a unique nonce; if sending multiple quickly, add `i` to timestamp:
  ```typescript
  const nonce = Date.now() + i;   // i = 0, 1, 2, ... for batch
  ```
- **Expiry**: Nonces expire after ~10 seconds; never reuse

---

## Transfer Signing (Different Pattern)

Transfers (`withdraw3`, `spotSend`) use a different signing approach — L1 action signing:

```typescript
async function signL1Action(action: object, nonce: number): Promise<{ r: string; s: string; v: number }> {
  const domain = {
    name: 'Exchange',
    version: '1',
    chainId: 421614,   // Arbitrum Sepolia for testnet; 42161 for mainnet
    verifyingContract: '0x...',
  };
  // types and value depend on specific action type
  // Refer to official Hyperliquid SDK for L1 signing
}
```

For production transfer implementations, use the official `@nktkas/hyperliquid` or `hyperliquid-ts` SDK which handles L1 signing correctly.

---

## Testnet

Replace URLs for testing:
```typescript
const API_URL = process.env.NODE_ENV === 'test'
  ? 'https://api.hyperliquid-testnet.xyz'
  : 'https://api.hyperliquid.xyz';
```

Testnet uses a separate state — testnet funds are not real.
Get testnet USDC from the Hyperliquid testnet UI.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `JSON.stringify` for msgpack | Use `msgpack.encode(action)` |
| Wrong chainId in domain | Always 1337 for Exchange signing |
| Reusing nonce | Always `Date.now()` — never cache |
| Missing `vaultAddress` in body | Include when `vaultAddress` is set |
| Wrong source byte | `'a'` for main, `'b'` for vault |
| Missing `Buffer.from()` around hex | `Buffer.from(address.slice(2), 'hex')` |
