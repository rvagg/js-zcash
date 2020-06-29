# IPLD for Zcash

**JavaScript Zcash data multiformats codecs and utilities for IPLD**

![CI](https://github.com/rvagg/js-zcash/workflows/CI/badge.svg)

## About

This codec is intended to be used with **[multiformats](https://github.com/multiformats/js-multiformats)** and **[@ipld/block](https://github.com/ipld/js-block)**. It provides decode and encode functionality for the Zcash native format to and from IPLD.

The primary usage of this library is as a codec added to a `multiformats` object:

```js
const multiformats = require('multiformats').create()
multiformats.add(require('@ipld/zcash'))
```

The following multicodecs are registered:

* `zcash-block` / `0xc0`: The Zcash block header, commonly identified by "Zcash block identifiers" (hashes with leading zeros).
* `zcash-tx` / `0xc1`: Zcash transactions _and_ nodes in a binary merkle tree, the tip of which is referenced by the Zcash block header.

These multicodecs support `encode()` and `decode()` functionality through `multiformats`.

The following multihash is registered:

* `dbl-sha2-256` / `0x56`: A double SHA2-256 hash: `SHA2-256(SHA2-256(bytes))`, used natively across all Zcash blocks, forming block identifiers, transaction identifiers and hashes and binary merkle tree nodes.

In addition to the multiformats codecs and hash, utilities are also provided to convert between Zcash hash identifiers and CIDs and to convert to and from full Zcash raw block data to a full collection of IPLD blocks. Additional conversion functionality for Zcash raw data and the `zcash-cli` JSON format is provided by the **[zcash-block](https://github.com/rvagg/js-zcash-block)** library.

See the **API** section below for details on the additional utility functions.

The previous incarnation of the Zcash codec for IPLD can be found at <https://github.com/ipld/js-ipld-zcash>.

## Example

```js
const multiformats = require('multiformats/basics')
multiformats.add(require('@ipld/zcash'))
const CarDatastore = require('datastore-car')(multiformats)

const carDs = await CarDatastore.readFileComplete('/path/to/bundle/of/blocks.car')
const headerCid = ipldZcash.blockHashToCID(multiformats, hash)
const header = multiformats.decode(await carDs.get(headerCid), 'zcash-block')

// navigate the transaction binary merkle tree to the first transaction, the coinbase
let txCid = header.tx
let tx
while (true) {
	tx = multiformats.decode(await carDs.get(txCid), 'zcash-tx')
	if (!Array.isArray(tx)) { // is not an inner merkle tree node
		break
	}
	txCid = tx[0] // leftmost side of the tx binary merkle
}

// convert the scriptSig to UTF-8 and cross our fingers that there's something
// interesting in there
console.log(Buffer.from(tx.vin[0].coinbase, 'hex').toString('utf8'))
```

## API

### Contents

 * [`deserializeFullZcashBinary(binary)`](#deserializeFullZcashBinary)
 * [`serializeFullZcashBinary(obj)`](#serializeFullZcashBinary)
 * [`async blockToCar(multiformats, carWriter, obj)`](#blockToCar)
 * [`cidToHash(multiformats, cid)`](#cidToHash)
 * [`async assemble(multiformats, loader, blockCID)`](#assemble)
 * [`blockHashToCID(multiformats)`](#blockHashToCID)
 * [`txHashToCID(multiformats)`](#txHashToCID)

<a name="deserializeFullZcashBinary"></a>
### `deserializeFullZcashBinary(binary)`

Instantiate a full object form from a full Zcash block graph binary representation. This binary form is typically extracted from a Zcash network node, such as with the Zcash `zcash-cli` `getblock <identifier> 0` command (which outputs hexadecimal form and therefore needs to be decoded prior to handing to this function). This full binary form can also be obtained from the utility [`assemble`](#assemble) function which can construct the full graph form of a Zcash block from the full IPLD block graph.

The object returned, if passed through `JSON.stringify()` should be identical to the JSON form provided by the Zcash `zcash-cli` `getblock <identifier> 2` command (minus some chain-context elements that are not possible to derive without the full blockchain).

**Parameters:**

* **`binary`** _(`Uint8Array|Buffer`)_: a binary form of a Zcash block graph

**Return value**  _(`object`)_: an object representation of the full Zcash block graph

<a name="serializeFullZcashBinary"></a>
### `serializeFullZcashBinary(obj)`

Encode a full object form of a Zcash block graph into its binary equivalent. This is the inverse of [`deserializeFullZcashBinary`](#deserializeFullZcashBinary) and should produce the exact binary representation of a Zcash block graph given the complete input.

The object form must include both the header and full transaction data for it to be properly serialized.

**Parameters:**

* **`obj`** _(`object`)_: a full JavaScript object form of a Zcash block graph

**Return value**  _(`Buffer`)_: a binary form of the Zcash block graph

<a name="blockToCar"></a>
### `async blockToCar(multiformats, carWriter, obj)`

Extract all IPLD blocks from a full Zcash block graph and write them to a CAR archive.

This operation requires a full deserialized Zcash block graph, where the transactions in their full form (with witness data intact post-segwit), as typically presented in JSON form with the Zcash `zcash-cli` command `getblock <identifier> 2` or using one of the utilities here to instantiate a full object form.

The CAR archive should be created using [datastore-car](https://github.com/ipld/js-datastore-car) and should be capable of write operations.

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with `dbl-sha2-256` multihash, `zcash-block` and `zcash-tx` multicodecs as well as the `dag-cbor` multicodec which is required for writing the CAR header.
* **`carWriter`** _(`object`)_: an initialized and writable `CarDatastore` instance.
* **`obj`** _(`object`)_: a full Zcash block graph.

**Return value**  _(`object`)_: a CID for the root block (the header `zcash-block`).

<a name="cidToHash"></a>
### `cidToHash(multiformats, cid)`

Convert a CID to a Zcash block or transaction identifier. This process is the reverse of [`blockHashToCID`](#blockHashToCID) and [`txHashToCID`](#txHashToCID) and involves extracting and decoding the multihash from the CID, reversing the bytes and presenting it as a big-endian hexadecimal string.

Works for both block identifiers and transaction identifiers.

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object
* **`cid`** _(`object`)_: a CID (`multiformats.CID`)

**Return value**  _(`string`)_: a hexadecimal big-endian representation of the identifier.

<a name="assemble"></a>
### `async assemble(multiformats, loader, blockCID)`

Given a CID for a `zcash-block` Zcash block header and an IPLD block loader that can retrieve Zcash IPLD blocks by CID, re-assemble a full Zcash block graph into both object and binary forms.

The loader should be able to return the binary form for `zcash-block` and `zcash-tx`

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with the Zcash multicodec and multihash installed
* **`loader`** _(`function`)_: an IPLD block loader function that takes a CID argument and returns a `Buffer` or `Uint8Array` containing the binary block data for that CID
* **`blockCID`** _(`CID`)_: a CID of type `zcash-block` pointing to the Zcash block header for the block to be assembled

**Return value**  _(`object`)_: an object containing two properties, `deserialized` and `binary` where `deserialized` contains a full JavaScript instantiation of the Zcash block graph and `binary` contains a `Buffer` with the binary representation of the graph.

<a name="blockHashToCID"></a>
### `blockHashToCID(multiformats)`

Convert a Zcash block identifier (hash) to a CID. The identifier should be in big-endian form, i.e. with leading zeros.

The process of converting to a CID involves reversing the hash (to little-endian form), encoding as a `dbl-sha2-256` multihash and encoding as a `bzcash-block` multicodec. This process is reversable, see [`cidToHash`](#cidToHash).

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with `dbl-sha2-256` multihash and `zcash-block` multicodec registered

**Return value**  _(`object`)_: a CID (`multiformats.CID`) object representing this block identifier.

<a name="txHashToCID"></a>
### `txHashToCID(multiformats)`

Convert a Zcash transaction identifier (hash) to a CID. The identifier should be in big-endian form as typically understood by Zcash applications.

The process of converting to a CID involves reversing the hash (to little-endian form), encoding as a `dbl-sha2-256` multihash and encoding as a `zcash-tx` multicodec. This process is reversable, see [`cidToHash`](#cidToHash).

**Parameters:**

* **`multiformats`** _(`object`)_: a multiformats object with `dbl-sha2-256` multihash and `zcash-tx` multicodec registered

**Return value**  _(`object`)_: A CID (`multiformats.CID`) object representing this transaction identifier.

## License

Licensed under either of

 * Apache 2.0, ([LICENSE-APACHE](LICENSE-APACHE) / http://www.apache.org/licenses/LICENSE-2.0)
 * MIT ([LICENSE-MIT](LICENSE-MIT) / http://opensource.org/licenses/MIT)

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.
