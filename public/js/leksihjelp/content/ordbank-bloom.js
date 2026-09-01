'use strict';
// ── Ordbank membership Bloom filter (pure query + build helper) ──
//
// A compact, offline probabilistic set for "is this whole word in Ordbank?".
// The isolated extension popup can't reach the spellcheck seam's already-loaded
// validWords (different world), so it ships a Bloom filter built from
// validwords-{lang}.json and answers compound attestation from it. No false
// negatives (a real Ordbank word is always reported present); a tunable false-
// positive rate (an absent word may occasionally read present) — acceptable for
// the Tier-2/Tier-3 dictionary split, which only ever over-promises "known".
//
// Hashing: k bit positions per word via double-hashing —
//   pos_i = (h1 + i * h2) mod m,  i ∈ [0, k)
// with h1 = FNV-1a(word, 0x811c9dc5) and h2 = FNV-1a(word, seed) | 1
// (odd h2 so the step never collapses the probe sequence). Both hashes fold in
// the lowercased UTF-8-ish char codes; the same normalization is applied on
// build and query so multi-byte Norwegian letters (æ/ø/å) round-trip.
//
// Pure — no DOM, no chrome.*, no network. Dual-exported for Node tests + browser.
(function () {
  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;

  // FNV-1a 32-bit over a string's char codes, seeded by the initial basis.
  function fnv1a(str, seed) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i) & 0xff;
      h = Math.imul(h, FNV_PRIME);
      // Fold the high byte of multi-byte code units so æ/ø/å (>0xff) still mix.
      const hi = str.charCodeAt(i) >> 8;
      if (hi) { h ^= hi; h = Math.imul(h, FNV_PRIME); }
    }
    return h >>> 0;
  }

  // Yield the k bit positions for `word` given the filter params.
  function positions(word, m, k, seed) {
    const w = String(word).toLowerCase();
    const h1 = fnv1a(w, FNV_OFFSET);
    const h2 = (fnv1a(w, seed >>> 0) | 1) >>> 0;
    const out = new Array(k);
    let combined = h1 >>> 0;
    for (let i = 0; i < k; i++) {
      out[i] = combined % m;
      combined = (combined + h2) >>> 0;
    }
    return out;
  }

  // Bloom sizing for n items at target false-positive rate p.
  //   m = ceil(-n ln p / (ln2)^2),  k = round((m/n) ln2)
  function computeParams(n, fpRate) {
    const safeN = Math.max(1, n | 0);
    const p = fpRate > 0 && fpRate < 1 ? fpRate : 0.0001;
    const m = Math.ceil((-safeN * Math.log(p)) / (Math.LN2 ** 2));
    const k = Math.max(1, Math.round((m / safeN) * Math.LN2));
    return { m, k };
  }

  // Build the packed bit array (Uint8Array of ceil(m/8) bytes) with every
  // word's k bits set. Words are lowercased inside `positions`.
  function buildBits(words, opts) {
    const { m, k, seed } = opts;
    const bytes = new Uint8Array(Math.ceil(m / 8));
    for (const word of words) {
      if (typeof word !== 'string' || !word) continue;
      const pos = positions(word, m, k, seed);
      for (let i = 0; i < k; i++) {
        const bit = pos[i];
        bytes[bit >> 3] |= (1 << (bit & 7));
      }
    }
    return bytes;
  }

  // Wrap a packed bit array (Uint8Array or ArrayBuffer) as a queryable filter.
  function createBloom(buffer, opts) {
    const { m, k, seed } = opts;
    const bytes = buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer);
    return {
      has(word) {
        if (typeof word !== 'string' || !word) return false;
        const pos = positions(word, m, k, seed);
        for (let i = 0; i < k; i++) {
          const bit = pos[i];
          if ((bytes[bit >> 3] & (1 << (bit & 7))) === 0) return false;
        }
        return true;
      },
      m, k, seed,
    };
  }

  // ── On-disk format ──
  // 16-byte little-endian header — magic 'LKK1', then m, k, seed as uint32 —
  // followed by the packed bit array. serialize() and loadBloom() are the two
  // sides of the same contract, shared by the build script and the popup loader
  // so the header layout lives in exactly one place.
  const MAGIC = 0x314b4b4c; // 'LKK1' little-endian
  const HEADER_BYTES = 16;

  // Pack {m,k,seed}+bits into a single Uint8Array ready to write to disk.
  function serialize(bits, opts) {
    const { m, k, seed } = opts;
    const out = new Uint8Array(HEADER_BYTES + bits.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, MAGIC, true);
    dv.setUint32(4, m >>> 0, true);
    dv.setUint32(8, k >>> 0, true);
    dv.setUint32(12, seed >>> 0, true);
    out.set(bits, HEADER_BYTES);
    return out;
  }

  // Parse a serialized buffer (ArrayBuffer/Uint8Array) → queryable filter.
  // Throws on a bad magic so a truncated/wrong file fails loudly at load.
  function loadBloom(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint32(0, true) !== MAGIC) throw new Error('ordbank-bloom: bad magic');
    const m = dv.getUint32(4, true);
    const k = dv.getUint32(8, true);
    const seed = dv.getUint32(12, true);
    const bits = u8.subarray(HEADER_BYTES);
    return createBloom(bits, { m, k, seed });
  }

  const api = { createBloom, buildBits, computeParams, serialize, loadBloom, fnv1a, positions, MAGIC, HEADER_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiOrdbankBloom = api;
})();
