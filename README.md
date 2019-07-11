# safe-web-Id-Manager-js for Solid

## Overview
This is a fork of SAFE WebID Manager, a proof of concept web application which can create and edit WebIDs for use on SAFE Network. It uses the SAFE RDF APIs (currently experimental).

When creating a WebID using RDF APIs, this version also creates a conventional SAFE public name with web / SAFE NFS storage container and publicises this as `storage` in whe WebID profile. Thus a Solid app can discover this storage by examining the WebID profile when the user selects the WebID in the SAFE Browser UI.

This is suitable for Solid apps that are enabled to run on SAFE Network by using this [solid-auth-client](https://github.com/theWebalyst/solid-auth-client) (on branch `add-safe-compatibility`).

## License

This SAFE Network application is dual-licensed under the Modified BSD ([LICENSE-BSD](LICENSE-BSD) https://opensource.org/licenses/BSD-3-Clause) or the MIT license ([LICENSE-MIT](LICENSE-MIT) https://opensource.org/licenses/MIT) at your option.

## Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the
work by you, as defined in the MaidSafe Contributor Agreement ([CONTRIBUTOR](CONTRIBUTOR)), shall be
dual licensed as above, and you agree to be bound by the terms of the MaidSafe Contributor Agreement.
