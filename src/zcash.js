const dblSha2256 = require('./dbl-sha2-256')
const block = require('./zcash-block')
const tx = require('./zcash-tx')
const { ZcashBlock, toHashHex } = require('zcash-block')
const { encodeAll, assemble } = require('./complete')

/**
 * Instantiate a full object form from a full Zcash block graph binary representation. This binary form is typically extracted from a Zcash network node, such as with the Zcash `zcash-cli` `getblock <identifier> 0` command (which outputs hexadecimal form and therefore needs to be decoded prior to handing to this function). This full binary form can also be obtained from the utility {@link assemble} function which can construct the full graph form of a Zcash block from the full IPLD block graph.
 *
 * The object returned, if passed through `JSON.stringify()` should be identical to the JSON form provided by the Zcash `zcash-cli` `getblock <identifier> 2` command (minus some chain-context elements that are not possible to derive without the full blockchain).
 *
 * @param {Uint8Array|Buffer} binary a binary form of a Zcash block graph
 * @returns {object} an object representation of the full Zcash block graph
 * @function
 */
function deserializeFullZcashBinary (binary) {
  return ZcashBlock.decode(binary).toPorcelain()
}

/**
 * Encode a full object form of a Zcash block graph into its binary equivalent. This is the inverse of {@link deserializeFullZcashBinary} and should produce the exact binary representation of a Zcash block graph given the complete input.
 *
 * The object form must include both the header and full transaction data for it to be properly serialized.
 *
 * @param {object} obj a full JavaScript object form of a Zcash block graph
 * @returns {Buffer} a binary form of the Zcash block graph
 * @function
 */
function serializeFullZcashBinary (obj) {
  return ZcashBlock.fromPorcelain(obj).encode()
}

/**
 * Extract all IPLD blocks from a full Zcash block graph and write them to a CAR archive.
 *
 * This operation requires a full deserialized Zcash block graph, where the transactions in their full form (with witness data intact post-segwit), as typically presented in JSON form with the Zcash `zcash-cli` command `getblock <identifier> 2` or using one of the utilities here to instantiate a full object form.
 *
 * The CAR archive should be created using [datastore-car](https://github.com/ipld/js-datastore-car) and should be capable of write operations.
 *
 * @param {object} multiformats a multiformats object with `dbl-sha2-256` multihash, `zcash-block` and `zcash-tx` multicodecs as well as the `dag-cbor` multicodec which is required for writing the CAR header.
 * @param {object} carWriter an initialized and writable `CarDatastore` instance.
 * @param {object} obj a full Zcash block graph.
 * @returns {object} a CID for the root block (the header `zcash-block`).
 * @function
 */
async function blockToCar (multiformats, carWriter, obj) {
  let root
  for await (const { cid, binary } of encodeAll(multiformats, obj)) {
    if (!root) {
      root = cid
      await carWriter.setRoots(cid)
    }
    await carWriter.put(cid, binary)
  }

  await carWriter.close()
  return root
}

/**
 * Convert a CID to a Zcash block or transaction identifier. This process is the reverse of {@link blockHashToCID} and {@link txHashToCID} and involves extracting and decoding the multihash from the CID, reversing the bytes and presenting it as a big-endian hexadecimal string.
 *
 * Works for both block identifiers and transaction identifiers.
 *
 * @param {object} multiformats a multiformats object
 * @param {object} cid a CID (`multiformats.CID`)
 * @returns {string} a hexadecimal big-endian representation of the identifier.
 * @function
 */
function cidToHash (multiformats, cid) {
  if (!multiformats.CID.isCID(cid)) {
    cid = new multiformats.CID(cid)
  }
  const { digest } = multiformats.multihash.decode(cid.multihash)
  return toHashHex(digest)
}

module.exports = [
  dblSha2256,
  block,
  tx
]
module.exports.deserializeFullZcashBinary = deserializeFullZcashBinary
module.exports.serializeFullZcashBinary = serializeFullZcashBinary
module.exports.blockToCar = blockToCar
module.exports.assemble = assemble
module.exports.blockHashToCID = block.blockHashToCID
module.exports.cidToHash = cidToHash
module.exports.txHashToCID = tx.txHashToCID
