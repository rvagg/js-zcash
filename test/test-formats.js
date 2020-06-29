/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const fs = require('fs')
const multiformats = require('multiformats').create()
multiformats.add(require('@ipld/dag-cbor'))
const CarDatastore = require('datastore-car')(multiformats)
const fixtures = require('./fixtures')
const { setupMultiformats, setupBlocks, roundDifficulty, cleanBlock } = require('./util')
const zcash = require('../')

describe('formats', () => {
  let blocks

  before(async () => {
    setupMultiformats(multiformats)
    blocks = await setupBlocks(multiformats)
  })

  describe('hash to CID utilities', () => {
    test('blockHashToCID', () => {
      for (const name of fixtures.names) {
        let actual = zcash.blockHashToCID(multiformats, fixtures.meta[name].hash)
        assert.deepEqual(actual.toString(), fixtures.meta[name].cid)
        if (!fixtures.meta[name].genesis) {
          actual = zcash.blockHashToCID(multiformats, blocks[name].data.previousblockhash)
          assert.deepEqual(actual.toString(), fixtures.meta[name].parentCid)
        }
      }
    })

    test('txHashToCID', () => {
      for (const name of fixtures.names) {
        const actual = zcash.txHashToCID(multiformats, blocks[name].data.merkleroot)
        assert.deepEqual(actual.toString(), fixtures.meta[name].txCid)
      }
    })

    test('cidToHash', () => {
      for (const name of fixtures.names) {
        let actual = zcash.cidToHash(multiformats, fixtures.meta[name].cid)
        assert.deepEqual(actual.toString(), fixtures.meta[name].hash)
        if (!fixtures.meta[name].genesis) {
          actual = zcash.cidToHash(multiformats, fixtures.meta[name].parentCid)
          assert.deepEqual(actual.toString(), blocks[name].data.previousblockhash)
        }
      }

      for (const name of fixtures.names) {
        const actual = zcash.cidToHash(multiformats, fixtures.meta[name].txCid)
        assert.deepEqual(actual.toString(), blocks[name].data.merkleroot)
      }
    })
  })

  describe('convertZcashBinary', () => {
    for (const name of fixtures.names) {
      test(name, async () => {
        let { data: expected, raw } = await fixtures(name)
        expected = roundDifficulty(cleanBlock(expected))

        let actual = zcash.deserializeFullZcashBinary(raw)
        actual = roundDifficulty(actual)

        // test transactions separately and then header so any failures don't result in
        // chai diff lockups or are just too big to be useful
        for (let i = 0; i < expected.tx.length; i++) {
          assert.deepEqual(actual[i], expected[i], `transaction #${i} successfully converted`)
        }

        const headerActual = Object.assign({}, actual, { tx: null })
        const headerExpected = Object.assign({}, expected, { tx: null })
        assert.deepEqual(headerActual, headerExpected, 'successfully converted from binary')
      })
    }
  })

  describe('convertZcashPorcelain', () => {
    for (const name of fixtures.names) {
      test(name, async () => {
        const { data, raw: expected } = await fixtures(name)

        const actual = zcash.serializeFullZcashBinary(data)
        assert.strictEqual(actual.toString('hex'), expected.toString('hex'), 'got same binary form')
      })
    }
  })

  describe('full block car file round-trip', function () {
    this.timeout(10000)

    for (const name of fixtures.names) {
      test(name, async () => {
        let { data: expected, meta, raw } = await fixtures(name)

        expected = roundDifficulty(cleanBlock(expected))
        const blockCid = new multiformats.CID(meta.cid)

        // write
        const outStream = fs.createWriteStream(`${name}.car`)
        const writeDs = await CarDatastore.writeStream(outStream)
        const rootCid = await zcash.blockToCar(multiformats, writeDs, expected)
        assert.deepStrictEqual(rootCid.toString(), blockCid.toString())

        // read

        // build an index from the car
        const index = {}
        let blockCount = 0
        const inStream = fs.createReadStream(`${name}.car`)
        const indexer = await CarDatastore.indexer(inStream)
        assert(Array.isArray(indexer.roots))
        assert.strictEqual(indexer.roots.length, 1)
        assert.deepStrictEqual(indexer.roots[0].toString(), blockCid.toString())
        for await (const blockIndex of indexer.iterator) {
          index[blockIndex.cid.toString()] = blockIndex
          blockCount++
        }

        // make a loder that can read blocks from the car
        const fd = await fs.promises.open(`${name}.car`)
        let reads = 0
        let failedReads = 0
        async function loader (cid) {
          const blockIndex = index[cid.toString()]
          if (!blockIndex) {
            failedReads++
            throw new Error(`Block not found: [${cid.toString()}]`)
          }
          reads++
          const block = await CarDatastore.readRaw(fd, blockIndex)
          return block.binary
        }

        // perform the reassemble!
        let { deserialized: actual, binary } = await zcash.assemble(multiformats, loader, blockCid)
        actual = roundDifficulty(actual)

        // test transactions separately and then header so any failures don't result in
        // chai diff lockups or are just too big to be useful
        for (let i = 0; i < expected.tx.length; i++) {
          assert.deepEqual(actual[i], expected[i], `transaction #${i} successfully converted`)
        }

        const headerActual = Object.assign({}, actual, { tx: null })
        const headerExpected = Object.assign({}, expected, { tx: null })
        assert.deepEqual(headerActual, headerExpected)

        if (!meta.segwit || expected.tx.length === 1) { // tx===1 doesn't require second merkle traversal
          assert.strictEqual(reads, blockCount)
        } else {
          // something less because we don't need to read the non-segwit transactions and maybe parts of the tx merkle
          assert(reads < blockCount)
        }
        assert.strictEqual(failedReads, 0)

        assert.strictEqual(binary.toString('hex'), raw.toString('hex'), 're-encoded full binary form matches')

        await fd.close()
      })
    }

    after(async () => {
      for (const name of fixtures.names) {
        try {
          await fs.promises.unlink(`${name}.car`)
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err
          }
        }
      }
    })
  })
})
