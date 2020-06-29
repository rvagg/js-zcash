/* eslint-env mocha */

const test = it
const { assert } = require('chai')
const multiformats = require('multiformats').create()
const { setupMultiformats, setupBlocks, fixtureNames, toHex, roundDifficulty } = require('./util')

const HEADER_BYTES = 1487

describe('header', () => {
  let blocks

  before(async () => {
    setupMultiformats(multiformats)
    blocks = await setupBlocks(multiformats)
  })

  for (const name of fixtureNames) {
    describe(`block "${name}"`, () => {
      test('decode block, header only', async () => {
        const decoded = await multiformats.decode(blocks[name].raw.slice(0, HEADER_BYTES), 'zcash-block')
        assert.deepEqual(roundDifficulty(decoded), roundDifficulty(blocks[name].expectedHeader), 'decoded header correctly')
      })

      test('don\'t allow decode full raw', async () => {
        try {
          await multiformats.decode(blocks[name].raw, 'zcash-block')
        } catch (err) {
          assert(/did not consume all available bytes as expected/.test(err.message))
          return
        }
        assert.fail('should throw')
      })

      test('encode', async () => {
        const encoded = await multiformats.encode(blocks[name].expectedHeader, 'zcash-block')
        assert.strictEqual(toHex(encoded), toHex(blocks[name].raw.slice(0, HEADER_BYTES)), 'raw bytes match')
      })
    })
  }
})
