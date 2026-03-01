const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const PINATA_JWT = process.env.PINATA_JWT;
const ENS_PRIVATE_KEY = process.env.ENS_PRIVATE_KEY;
const ENS_NAME = process.env.ENS_NAME;
const RPC_URL = process.env.RPC_URL;

// ── 1. Upload to Pinata ──────────────────────────────────────────────────────

async function uploadToPinata() {
  const filePath = path.resolve("index.html");
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  form.append("name", ENS_NAME + " – " + new Date().toISOString());
  form.append("network", "public");

  const res = await axios.post(
    "https://uploads.pinata.cloud/v3/files",
    form,
    {
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        ...form.getHeaders(),
      },
    }
  );

  const cid = res.data.data.cid;
  console.log("Pinned CID:", cid);
  return cid;
}

// ── 2. Encode the IPFS CID as an ENS content hash ───────────────────────────
// ENS content hash format: IPFS namespace varint (0xe3 0x01) + raw CID bytes.
// CIDv0 (Qm...): base58btc-encoded multihash → promote to CIDv1 bytes.
// CIDv1 (b...):  base32 multibase-encoded → strip 'b' prefix and decode.

function base58Decode(str) {
  const alpha = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = [0];
  for (const ch of str) {
    let carry = alpha.indexOf(ch);
    if (carry < 0) throw new Error("Invalid base58 character: " + ch);
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of str) { if (ch === "1") bytes.push(0); else break; }
  return Buffer.from(bytes.reverse());
}

function base32Decode(str) {
  const alpha = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str.toLowerCase()) {
    const idx = alpha.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 character: " + ch);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function encodeContentHash(cid) {
  const IPFS_NS = Buffer.from([0xe3, 0x01]); // varint for IPFS namespace codec
  let cidBytes;
  if (cid.startsWith("Qm")) {
    // CIDv0: base58btc multihash — wrap as CIDv1 (version=1, codec=dag-pb=0x70)
    cidBytes = Buffer.concat([Buffer.from([0x01, 0x70]), base58Decode(cid)]);
  } else if (cid.startsWith("b")) {
    // CIDv1: multibase base32 — strip the 'b' multibase prefix then decode
    cidBytes = base32Decode(cid.slice(1));
  } else {
    throw new Error("Unsupported CID format: " + cid);
  }
  return "0x" + Buffer.concat([IPFS_NS, cidBytes]).toString("hex");
}

// ── 3. Update ENS content record ────────────────────────────────────────────

// ENS Public Resolver on mainnet
const RESOLVER_ABI = [
  "function setContenthash(bytes32 node, bytes calldata hash) external",
];

async function updateENS(cid) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(ENS_PRIVATE_KEY, provider);

  // Resolve the namehash for yourname.eth
  const node = ethers.namehash(ENS_NAME);
  console.log("Namehash:", node);

  // Get the resolver address for this name
  const registryABI = [
    "function resolver(bytes32 node) view returns (address)",
  ];
  const registry = new ethers.Contract(
    "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // ENS Registry (mainnet)
    registryABI,
    provider
  );
  const resolverAddress = await registry.resolver(node);
  console.log("Resolver:", resolverAddress);

  const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, wallet);
  const contentHash = encodeContentHash(cid);
  console.log("Encoded content hash:", contentHash);

  const tx = await resolver.setContenthash(node, contentHash);
  console.log("Tx sent:", tx.hash);
  await tx.wait();
  console.log("✅ ENS content record updated!");
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const cid = await uploadToPinata();
    await updateENS(cid);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
