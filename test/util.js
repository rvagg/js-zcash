const { Buffer } = require('buffer')
const base32 = require('multiformats/bases/base32.js')
const zcash = require('../')
const { fromHashHex } = require('zcash-block')
const fixtures = require('./fixtures')

const CODEC_TX_CODE = 0xc1
// the begining of a dbl-sha2-256 multihash, prepend to hash or txid
const MULTIHASH_DBLSHA2256_LEAD = '5620'

function setupMultiformats (multiformats) {
  multiformats.multibase.add(base32)
  multiformats.add(zcash)
}

function txHashToCid (multiformats, hash) {
  return new multiformats.CID(1, CODEC_TX_CODE, Buffer.from(`${MULTIHASH_DBLSHA2256_LEAD}${hash}`, 'hex'))
}

function cleanBlock (block) {
  block = Object.assign({}, block)
  // chain-context data that can't be derived
  'anchor chainhistoryroot root valuePools confirmations chainwork height nextblockhash'.split(' ').forEach((p) => delete block[p])
  return block
}

// round difficulty to 2 decimal places, it's a calculated value
function roundDifficulty (obj) {
  const ret = Object.assign({}, obj)
  ret.difficulty = Math.round(obj.difficulty * 100) / 100
  return ret
}

function blockDataToHeader (block) {
  const header = cleanBlock(block)
  // data that can't be derived without transactions
  'anchor chainhistoryroot valuePools tx size'.split(' ').forEach((p) => delete header[p])
  return header
}

let blocks = null
async function setupBlocks (multiformats) {
  if (blocks) {
    return blocks
  }
  blocks = {}

  for (const name of fixtures.names) {
    blocks[name] = await fixtures(name)
    blocks[name].expectedHeader = blockDataToHeader(blocks[name].data)
    blocks[name].expectedHeader.parent = blocks[name].meta.parentCid ? new multiformats.CID(blocks[name].meta.parentCid) : null
    blocks[name].expectedHeader.tx = new multiformats.CID(blocks[name].meta.txCid)
    for (const tx of blocks[name].data.tx) {
      // manually ammend expected to include vin links (CIDs) to previous transactions
      for (const vin of tx.vin) {
        if (vin.txid) {
          // this value comes out of the json, so it's already a BE hash string, we need to reverse it
          vin.tx = txHashToCid(multiformats, fromHashHex(vin.txid).toString('hex'))
        }
      }
    }
  }

  return blocks
}

// manually find the witness commitment inside the coinbase.
// it's in _one of_ the vout's, one that's 38 bytes long and starts with a special prefix
// which we need to strip out to find a 32-byte hash
function findWitnessCommitment (block) {
  const coinbase = block.tx[0]
  for (const vout of coinbase.vout) {
    const spk = vout.scriptPubKey.hex
    if (spk.length === 38 * 2 && spk.startsWith('6a24aa21a9ed')) {
      return Buffer.from(spk.slice(12), 'hex')
    }
  }
}

function toHex (d) {
  return d.reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
}

module.exports = {
  setupMultiformats,
  txHashToCid,
  setupBlocks,
  findWitnessCommitment,
  fixtureNames: fixtures.names,
  cleanBlock,
  roundDifficulty,
  CODEC_TX_CODE,
  toHex
}
