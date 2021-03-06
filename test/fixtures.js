const { Buffer } = require('buffer')
const fs = require('fs')
const path = require('path')

// the 'tx' data found in fixtures/*.tx.js can be generated with some
// debugging code found near the bottom of zcash-block/classes/Transaction.js
// these files contain an array with one element per transaction, for each
// transaction we have:
//   1. txid
//   2. start byte in block
//   3. end byte in block

// one method of generating the fixture meta data if you trust the pieces involved (i.e. beware of relying on fixtures generated by the code you're testing)
// cid
//   new multiformats.CID(1, multiformats.get('zcash-block').code, multiformats.multihash.encode(fromHashHex(zcash.ZcashBlock.decode(Buffer.from(fs.readFileSync('./test/fixtures/500044.hex', 'ascii'), 'hex')).toPorcelain().hash.toString('hex')), 'dbl-sha2-256'))
// or directly:
//   new multiformats.CID(1, multiformats.get('zcash-block').code, multiformats.multihash.encode(fromHashHex('0000000000000000001f9ba01120351182680ceba085ffabeaa532cda35f2cc7'), 'dbl-sha2-256'))
// parentCid
//   new multiformats.CID(1, multiformats.get('zcash-block').code, multiformats.multihash.encode(fromHashHex(zcash.ZcashBlock.decode(Buffer.from(fs.readFileSync('./test/fixtures/500044.hex', 'ascii'), 'hex')).toPorcelain().previousblockhash.toString('hex')), 'dbl-sha2-256'))
// txCid
//   new multiformats.CID(1, multiformats.get('zcash-tx').code, multiformats.multihash.encode(fromHashHex(zcash.ZcashBlock.decode(Buffer.from(fs.readFileSync('./test/fixtures/500044.hex', 'ascii'), 'hex')).toPorcelain().merkleroot.toString('hex')), 'dbl-sha2-256'))
// the tx.js files can be generated by uncommenting a section in zcash-block/classes/Transaction.js#_customDecodeSize and decoding the block binary through it:
//   ZcashBlock.decode(Buffer.from(fs.readFileSync('./test/fixtures/500044.hex', 'ascii'), 'hex'))

const meta = {
  '00040fe8ec8471911baa1db1266ea15dd06b4a8a5c453883c000b031973dce08': {
    genesis: true,
    hash: '00040fe8ec8471911baa1db1266ea15dd06b4a8a5c453883c000b031973dce08',
    cid: 'bahaacvrabdhd3fzrwaambazyivoiustl2bo2c3rgweo2ug4rogcoz2apaqaa',
    parentCid: null,
    txCid: 'bahaqcvra3ngxvbnxnajd6hp7dvgez3hhacb3fut6cf5uvqxdduehtcff5lca',
    tx: require('./fixtures/00040fe8ec8471911baa1db1266ea15dd06b4a8a5c453883c000b031973dce08.tx')
  },
  '000000002c67a4a2351da58b0822193018e95abc94f243d4d9fdcefed81f45e1': {
    hash: '000000002c67a4a2351da58b0822193018e95abc94f243d4d9fdcefed81f45e1',
    cid: 'bahaacvra4fcr7wh6z365tvcd6kklywxjdaybsiqirosr2nncurtsyaaaaaaa',
    parentCid: 'bahaacvrasyauh7rmlyrmyc7qzvktjv7x6q2h6ttvei6qon43tl3riaaaaaaa',
    txCid: 'bahaqcvrasr4ghj6xvgakadxvjttwdxfxwipuxfp5v5ecf4lpg6qofxvimq7a',
    tx: require('./fixtures/000000002c67a4a2351da58b0822193018e95abc94f243d4d9fdcefed81f45e1.tx')
  }
}

const cache = {}

async function loadFixture (name) {
  if (!cache[name]) {
    const [data, rawHex] = await Promise.all(process.browser
      ? [
        (async () => (await import(`./fixtures/${name}.json`)).default)(),
        (async () => (await import(`!!raw-loader!./fixtures/${name}.hex`)).default)()
      ]
      : [
        (async () => JSON.parse(await fs.promises.readFile(path.join(__dirname, `fixtures/${name}.json`), 'utf8')))(),
        fs.promises.readFile(path.join(__dirname, `fixtures/${name}.hex`), 'ascii')
      ])

    cache[name] = { meta: meta[name], data, raw: Buffer.from(rawHex, 'hex') }
  }
  return cache[name]
}

module.exports = loadFixture
module.exports.names = Object.keys(meta)
module.exports.meta = meta
