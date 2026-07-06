import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveKey, encryptWithKey, decryptWithKey } from "../src/lib/crypto-core";

test("wallet secret encryption round-trips", () => {
  const key = deriveKey("test-secret-key-material");
  const secret = "SC5KRAMZBPJ6HEWUUZJBCOPW67VB6XXFYW7IFOEPXGRF7IAJ4YJCFMQJ";
  const enc = encryptWithKey(key, secret);
  assert.ok(enc.startsWith("v1:"));
  assert.notEqual(enc, secret);
  assert.equal(decryptWithKey(key, enc), secret);
});

test("ciphertexts are non-deterministic (fresh IV per encryption)", () => {
  const key = deriveKey("test-secret-key-material");
  const a = encryptWithKey(key, "same-plaintext");
  const b = encryptWithKey(key, "same-plaintext");
  assert.notEqual(a, b);
});

test("tampered ciphertext fails authentication", () => {
  const key = deriveKey("test-secret-key-material");
  const enc = encryptWithKey(key, "sensitive");
  const parts = enc.split(":");
  // flip a character in the payload
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
  assert.throws(() => decryptWithKey(key, parts.join(":")));
});

test("wrong key cannot decrypt", () => {
  const enc = encryptWithKey(deriveKey("key-one"), "sensitive");
  assert.throws(() => decryptWithKey(deriveKey("key-two"), enc));
});

test("legacy plaintext passes through unchanged", () => {
  const key = deriveKey("k");
  assert.equal(decryptWithKey(key, "GPLAINTEXTLEGACY"), "GPLAINTEXTLEGACY");
});
