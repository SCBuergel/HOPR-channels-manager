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
// ENS stores content hashes as ABI-encoded bytes with a codec prefix.
// For IPFS CIDv0 (Qm...) or CIDv1 (bafybei...) the prefix is 0xe3010170
// The simplest approach: use the raw hex encoding that ENS expects.

function encodeContentHash(cid) {
  // ipfs://CID → ENS content hash hex
  // We encode as: codec(ipfs=0xe3) + cid-version + multicodec + multihash
  // Easiest: use the content-hash library encoding manually for CIDv0
  // For a CIDv0 (starts with Qm), ENS uses: 0xe3010170 + sha2-256 multihash
  // For simplicity we'll use the `content-hash` npm package approach inline.

  const bs58 = require("bs58"); // available via ethers deps

  if (cid.startsWith("Qm")) {
    // CIDv0 → decode base58 → get the multihash bytes
    const decoded = bs58.decode(cid); // 34 bytes: [0x12, 0x20, ...32 bytes hash]
    // ENS content hash prefix for ipfs: 0xe3010170
    const prefix = Buffer.from([0xe3, 0x01, 0x01, 0x70]);
    const full = Buffer.concat([prefix, decoded]);
    return "0x" + full.toString("hex");
  } else {
    // CIDv1 — use content-hash package (install separately) or convert via API
    // For now, throw and let the user handle v1 with the content-hash package
    throw new Error(
      "CIDv1 detected. Add `content-hash` package and use contentHash.fromIpfs(cid)."
    );
  }
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
