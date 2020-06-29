/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const multiformats = require('multiformats').create()
const {
  setupMultiformats,
  setupBlocks,
  witnessCommitmentHashToCid,
  txHashToCid,
  findWitnessCommitment,
  fixtureNames,
  CODEC_TX_CODE,
  toHex
} = require('./util')

describe('transactions', () => {
  let blocks

  before(async () => {
    setupMultiformats(multiformats)
    blocks = await setupBlocks(multiformats)
  })

  for (const name of fixtureNames) {
    describe(`block "${name}"`, function () {
      this.timeout(5000)

      // known metadata of the transaction, its hash, txid and byte location in the block
      async function forEachTx (txcb) {
        for (let index = 0; index < blocks[name].meta.tx.length; index++) {
          const [txidExpected, start, end] = blocks[name].meta.tx[index]
          const txExpected = blocks[name].data.tx[index]
          const txRaw = blocks[name].raw.slice(start, end)
          await txcb({ index, txidExpected, start, end, txExpected, txRaw })
        }
      }

      test('decode', async () => {
        return forEachTx(async ({ index, txRaw, txExpected }) => {
          const decoded = await multiformats.decode(txRaw, 'zcash-tx')
          if (index === 0 && (blocks[name].meta.segwit || name === '450002')) {
            // this is a coinbase for segwit block, or the block (450002) has a faux witness commitment
            // but is not actuall segwit (we can't distinguish)
            // the coinbase for segwit blocks is decorated with a CID version of the witness commitment
            const expectedWitnessCommitment = findWitnessCommitment(blocks[name].data)
            txExpected.witnessCommitment = witnessCommitmentHashToCid(multiformats, toHex(expectedWitnessCommitment))
          }
          /* test setup, need to manually enter the joinSplit* entries, see https://github.com/zcash/zcash/pull/4579
            console.log(name)
            console.log('joinSplitPubKey', decoded.joinSplitPubKey)
            console.log('joinSplitSig', decoded.joinSplitSig)
          */
          assert.deepEqual(decoded, txExpected, 'got properly formed transaction')
        })
      })

      test('encode', async () => {
        return forEachTx(async ({ index, txRaw, txExpected, txidExpected }) => {
          // encode
          const encoded = await multiformats.encode(txExpected, 'zcash-tx')
          assert.strictEqual(toHex(encoded), toHex(txRaw), 'encoded raw bytes match')

          // generate CID from bytes, compare to known hash
          const hash = await multiformats.multihash.hash(encoded, 'dbl-sha2-256')
          const cid = new multiformats.CID(1, CODEC_TX_CODE, hash)
          const expectedCid = txHashToCid(multiformats, txidExpected)
          assert.strictEqual(cid.toString(), expectedCid.toString(), 'got expected CID from bytes')
        })
      })
    })
  }
})
