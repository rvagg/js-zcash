/* eslint-env mocha */

const test = it
const { Buffer } = require('buffer')
const { assert } = require('chai')
const multiformats = require('multiformats').create()
const zcashTx = require('../src/zcash-tx')
const {
  setupMultiformats,
  setupBlocks,
  txHashToCid,
  fixtureNames,
  toHex
} = require('./util')

describe('merkle', () => {
  let blocks

  before(async () => {
    setupMultiformats(multiformats)
    blocks = await setupBlocks(multiformats)
  })

  async function verifyMerkle (name) {
    // how many nodes of this merkle do we expect to see?
    let expectedNodes = blocks[name].data.tx.length
    let last = expectedNodes
    while (last > 1) {
      last = Math.ceil(last / 2)
      expectedNodes += last
    }

    let index = 0
    let lastCid
    let lastLayer
    let thisLayer = []
    let thisLayerLength = blocks[name].data.tx.length
    let layer = 0

    for await (const { cid, binary } of zcashTx.encodeAll(multiformats, blocks[name].data)) {
      assert(Buffer.isBuffer(binary))

      const decoded = await multiformats.decode(binary, 'zcash-tx')
      const baseLayer = index < blocks[name].data.tx.length

      if (baseLayer) {
        // one of the base transactions
        const [txidExpected, start, end] = blocks[name].meta.tx[index] // eslint-disable-line
        const expectedCid = txHashToCid(multiformats, txidExpected)
        assert.strictEqual(binary.length, end - start, `got expected block length (${index})`)
        assert.deepEqual(decoded, blocks[name].data.tx[index], 'transaction decoded back into expected form')
        assert.deepEqual(cid, expectedCid, 'got expected transaction CID')
      } else {
        // one of the inner or root merkle nodes
        assert.strictEqual(binary.length, 64, 'correct binary form')
        assert(Array.isArray(decoded), 'correct decoded form')
        assert.strictEqual(decoded.length, 2, 'correct decoded form')

        const left = binary.slice(0, 32)
        const right = binary.slice(32)

        // now we do an awkward dance to verify the two nodes in the block were CIDs in the correct position
        // of the previous layer, accounting for duplicates on odd layers
        // debug: process.stdout.write(binary.slice(0, 3).toString('hex') + ',' + binary.slice(32, 32 + 3).toString('hex') + ',')
        const lastLeft = lastLayer[thisLayer.length * 2]
        assert.deepEqual(decoded[0], txHashToCid(multiformats, toHex(left)), 'decoded form left CID is correct')
        assert.deepEqual(decoded[1], txHashToCid(multiformats, toHex(right)), 'decoded form right CID is correct')
        assert.deepEqual(left, lastLeft, `left element in layer ${layer} node is CID in layer ${layer - 1}`)
        // debug: process.stdout.write(`${thisLayer.length} <> ${thisLayer.length * 2} : ${lastLayer.length} : ${thisLayerLength} `)
        // debug: process.stdout.write(`${left.slice(0, 6).toString('hex')} <> ${lastLayer[thisLayer.length * 2].slice(0, 6).toString('hex')} `)
        if (thisLayer.length === thisLayerLength - 1 && lastLayer.length % 2 !== 0) {
          assert.deepEqual(left, right, `last node in layer ${layer} has duplicate left & right`)
          // debug: process.stdout.write(`(dupe) ${right.slice(0, 6).toString('hex')} <> ${left.slice(0, 6).toString('hex')}`)
        } else {
          assert.deepEqual(right, lastLayer[thisLayer.length * 2 + 1], `right element in layer ${layer} node is CID in layer ${layer - 1}`)
          // debug: process.stdout.write(`${right.slice(0, 6).toString('hex')} <> ${lastLayer[thisLayer.length * 2 + 1].slice(0, 6).toString('hex')}`)
        }
        // debug: process.stdout.write('\n')
      }

      thisLayer.push(multiformats.multihash.decode(cid.multihash).digest)

      index++
      lastCid = cid
      if (thisLayer.length === thisLayerLength) {
        thisLayerLength = Math.ceil(thisLayerLength / 2)
        lastLayer = thisLayer
        thisLayer = []
        layer++
      }
    }

    assert.deepEqual(lastCid, blocks[name].expectedHeader.tx, 'got expected merkle root')
    assert.strictEqual(index, expectedNodes, 'got correct number of merkle nodes')

    return lastCid
  }

  for (const name of fixtureNames) {
    describe(`block "${name}"`, function () {
      this.timeout(10000)

      test('encode transactions into merkle', async () => {
        await verifyMerkle(name)
      })
    })
  }
})
