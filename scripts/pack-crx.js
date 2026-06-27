#!/usr/bin/env node
// Pack the NodeWorm Helper extension as a CRX3 file.
// Generates a new RSA-2048 key (or reuses extension-key.pem if present),
// derives the stable extension ID from it, builds a signed CRX3 archive,
// and writes it to public/agent/nodeworm-helper.crx.
//
// Run: node scripts/pack-crx.js
// Outputs: public/agent/nodeworm-helper.crx, extension-key.pem (save this!),
//          and prints the extension ID to stdout.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ZIP_PATH = path.join(ROOT, "public", "agent", "nodeworm-helper.zip");
const CRX_PATH = path.join(ROOT, "public", "agent", "nodeworm-helper.crx");
const KEY_PATH = path.join(ROOT, "extension-key.pem");

// Encode an unsigned integer as a protobuf varint.
function varint(n) {
  const out = [];
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n & 0x7f);
  return Buffer.from(out);
}

// Encode a bytes / embedded-message field (wire type 2).
function pbBytes(fieldNum, data) {
  const tag = (fieldNum << 3) | 2;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return Buffer.concat([varint(tag), varint(buf.length), buf]);
}

// Derive Chrome extension ID from a SubjectPublicKeyInfo DER buffer.
// Each nibble of the first 16 bytes of SHA256 maps to a-p (0=a, 1=b, ..., f=p).
function extensionId(spkiDer) {
  const hash = crypto.createHash("sha256").update(spkiDer).digest();
  return Array.from(hash.slice(0, 16))
    .flatMap((b) => [b >>> 4, b & 0xf])
    .map((n) => String.fromCharCode(97 + n))
    .join("");
}

// Load or generate the private key. Re-using the key keeps the extension ID stable.
let privKeyPem;
if (fs.existsSync(KEY_PATH)) {
  privKeyPem = fs.readFileSync(KEY_PATH, "utf8");
  console.log("Reusing existing key from extension-key.pem");
} else {
  const pair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  privKeyPem = pair.privateKey;
  fs.writeFileSync(KEY_PATH, privKeyPem);
  console.log("Generated new RSA-2048 key -> extension-key.pem (keep this file!)");
}

// Export the public key in SPKI DER format (what Chrome stores in the CRX header).
const pubKey = crypto.createPublicKey(privKeyPem);
const pubKeyDer = pubKey.export({ type: "spki", format: "der" });

const id = extensionId(pubKeyDer);
console.log("Extension ID:", id);

// Read the extension ZIP (used as the CRX payload).
if (!fs.existsSync(ZIP_PATH)) {
  console.error("ERROR: Missing", ZIP_PATH);
  console.error("Build it with: cd extension && zip -r ../public/agent/nodeworm-helper.zip .");
  process.exit(1);
}
const zip = fs.readFileSync(ZIP_PATH);

// Build the CRX3 file.
//
// CRX3 wire format:
//   magic[4]         = "Cr24"
//   version[4]       = 3 (little-endian uint32)
//   header_size[4]   = CrxFileHeader byte length (little-endian uint32)
//   CrxFileHeader protobuf
//   payload          = zip bytes
//
// CrxFileHeader proto fields:
//   2  sha256_with_rsa  = AsymmetricKeyProof { public_key=1, signature=2 }
//   10 signed_header_data = SignedData { crx_id=1 } serialized bytes
//
// Signature covers:
//   "CRX3 SignedData\x00" + uint32le(len(signedHeaderData)) + signedHeaderData + zip

// SignedData proto: crx_id = first 16 bytes of SHA256(pubkey DER).
const crxId = crypto.createHash("sha256").update(pubKeyDer).digest().slice(0, 16);
const signedHeaderData = pbBytes(1, crxId);

// Build the data that gets signed.
const signPrefix = Buffer.from("CRX3 SignedData\x00");
const signLenBuf = Buffer.allocUnsafe(4);
signLenBuf.writeUInt32LE(signedHeaderData.length);
const signTarget = Buffer.concat([signPrefix, signLenBuf, signedHeaderData, zip]);

// Sign with RSASSA-PKCS1-v1_5 + SHA-256.
const signer = crypto.createSign("SHA256");
signer.update(signTarget);
const signature = signer.sign(privKeyPem);

// AsymmetricKeyProof proto.
const proof = Buffer.concat([
  pbBytes(1, pubKeyDer),
  pbBytes(2, signature),
]);

// CrxFileHeader proto.
const header = Buffer.concat([
  pbBytes(2, proof),             // field 2: sha256_with_rsa
  pbBytes(10, signedHeaderData), // field 10: signed_header_data
]);

// Assemble the CRX3 file.
const magic = Buffer.from("Cr24");
const version = Buffer.from([3, 0, 0, 0]);
const headerSizeBuf = Buffer.allocUnsafe(4);
headerSizeBuf.writeUInt32LE(header.length);

const crx = Buffer.concat([magic, version, headerSizeBuf, header, zip]);
fs.writeFileSync(CRX_PATH, crx);

console.log(`CRX written to ${path.relative(ROOT, CRX_PATH)} (${crx.length} bytes)`);
console.log("");
console.log("Next steps:");
console.log(`  1. Set allowed_origins in install.cmd to: chrome-extension://${id}/`);
console.log(`  2. Update updates.xml with the new ID: ${id}`);
console.log(`  3. Re-deploy so the CRX and updates.xml are live.`);
