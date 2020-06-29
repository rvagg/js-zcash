const { ZcashBlock } = require('zcash-block')
const { encodeAll: encodeAllTx } = require('./zcash-tx')
const { HASH_ALG } = require('./constants')

async function mkblock (multiformats, obj, codec) {
  const { code } = multiformats.get(codec)
  const binary = await multiformats.encode(obj, code)
  const mh = await multiformats.multihash.hash(binary, HASH_ALG)
  return {
    cid: new multiformats.CID(1, code, mh),
    binary
  }
}

async function * encodeAll (multiformats, block) {
  if (typeof multiformats !== 'object' || typeof multiformats.multihash !== 'object' ||
      typeof multiformats.multihash.encode !== 'function' ||
      typeof multiformats.CID !== 'function') {
    throw new TypeError('multiformats argument must have multihash and CID capabilities')
  }

  const cidSet = new Set()
  const counts = {
    blocks: 1, // header
    tx: 0,
    witTx: 0,
    txMerkle: 0,
    witTxMerkle: 0,
    duplicates: 0
  }

  // header
  yield await mkblock(multiformats, block, 'zcash-block')
  counts.blocks++

  let lastCid
  for await (const { cid, binary } of encodeAllTx(multiformats, block)) {
    lastCid = cid
    if (cidSet.has(cid.toString())) {
      counts.duplicates++
      continue
    }
    cidSet.add(cid.toString())
    yield { cid, binary }
    counts.blocks++
    if (binary.length !== 64) {
      counts.witTx++
    } else {
      counts.witTxMerkle++
    }
  }

  if (!lastCid) {
    if (block.tx.length === 1) {
      lastCid = null
    } else {
      throw new Error('Unexpected missing witnessMerkleRoot!')
    }
  }

  // counts.blocks++
  // console.log(counts)
}

/**
 * Given a CID for a `zcash-block` Zcash block header and an IPLD block loader that can retrieve Zcash IPLD blocks by CID, re-assemble a full Zcash block graph into both object and binary forms.
 *
 * The loader should be able to return the binary form for `zcash-block` and `zcash-tx`
 *
 * @param {object} multiformats a multiformats object with the Zcash multicodec and multihash installed
 * @param {function} loader an IPLD block loader function that takes a CID argument and returns a `Buffer` or `Uint8Array` containing the binary block data for that CID
 * @param {CID} blockCID a CID of type `zcash-block` pointing to the Zcash block header for the block to be assembled
 * @returns {object} an object containing two properties, `deserialized` and `binary` where `deserialized` contains a full JavaScript instantiation of the Zcash block graph and `binary` contains a `Buffer` with the binary representation of the graph.
 * @function
 */
async function assemble (multiformats, loader, blockCid) {
  const merkleCache = {}
  async function loadTx (txCid) {
    const txCidStr = txCid.toString()
    if (merkleCache[txCidStr]) {
      return merkleCache[txCidStr]
    }
    const node = multiformats.decode(await loader(txCid), 'zcash-tx')
    merkleCache[txCidStr] = node
    return node
  }

  const block = multiformats.decode(await loader(blockCid), 'zcash-block')
  const merkleRootCid = block.tx

  async function * transactions (txCid) {
    const node = await loadTx(txCid)
    if (Array.isArray(node)) {
      if (node[0] !== null) { // coinbase will be missing for witness merkle
        yield * transactions(node[0])
      }
      if (node[0] === null || !node[0].equals(node[1])) { // wonky btc merkle rules
        yield * transactions(node[1])
      }
    } else {
      yield node
    }
  }

  const txs = []

  for await (const tx of transactions(merkleRootCid)) {
    txs.push(tx)
  }

  block.tx = txs

  const bb = ZcashBlock.fromPorcelain(block)
  return {
    deserialized: bb.toPorcelain(),
    binary: bb.encode()
  }
}

module.exports.encodeAll = encodeAll
module.exports.assemble = assemble
