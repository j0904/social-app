# Bigtangle-ts Integration Guide

This document describes how `bigtangle-ts` is integrated into the social-app project.

## Development Setup

For development, `social-app` references the local `bigtangle-ts` library directly. This allows changes in `bigtangle-ts` to be immediately available without needing to publish or reinstall.

### Directory Structure

```
/home/jcui/git/
├── social-app/          # This project
└── bigtangle-ts/        # Local bigtangle-ts library
```

### package.json Configuration

```json
{
  "dependencies": {
    "bigtangle-ts": "file:../bigtangle-ts"
  }
}
```

### Symlink Setup

To enable live changes from `bigtangle-ts` without reinstalling:

```bash
cd /home/jcui/git/social-app
rm -rf node_modules/bigtangle-ts
ln -s ../../bigtangle-ts node_modules/bigtangle-ts
```

This creates a symlink so that `node_modules/bigtangle-ts` points directly to `../bigtangle-ts`.

### Verifying the Symlink

```bash
ls -la node_modules/bigtangle-ts
# Should show: bigtangle-ts -> ../../bigtangle-ts

readlink -f node_modules/bigtangle-ts
# Should show: /home/jcui/git/bigtangle-ts
```

### After `yarn install`

**Note:** Running `yarn install` may replace the symlink with a copy. If this happens, re-run the symlink command:

```bash
rm -rf node_modules/bigtangle-ts && ln -s ../../bigtangle-ts node_modules/bigtangle-ts
```

## Production Setup

For production, change the dependency to use the npm package:

### package.json Configuration

```json
{
  "dependencies": {
    "bigtangle-ts": "^1.0.2"
  }
}
```

### NPM Package

- **Package:** [bigtangle-ts on npm](https://www.npmjs.com/package/bigtangle-ts)
- **Install:** `yarn add bigtangle-ts` or `npm install bigtangle-ts`

## Jest Configuration

The `package.json` includes module name mapping for Jest to resolve bigtangle-ts imports:

```json
{
  "jest": {
    "moduleNameMapper": {
      "^bigtangle-ts$": "<rootDir>/../bigtangle-ts/dist/index.js",
      "^bigtangle-ts/dist/net/bigtangle/core/ECKey\\.js$": "<rootDir>/../bigtangle-ts/dist/net/bigtangle/core/ECKey.js",
      "^bigtangle-ts/dist/net/bigtangle/core/Address\\.js$": "<rootDir>/../bigtangle-ts/dist/net/bigtangle/core/Address.js",
      "^bigtangle-ts/dist/net/bigtangle/params/TestParams\\.js$": "<rootDir>/../bigtangle-ts/dist/net/bigtangle/params/TestParams.js",
      "^bigtangle-ts/dist/net/bigtangle/core/Utils\\.js$": "<rootDir>/../bigtangle-ts/dist/net/bigtangle/core/Utils.js",
      "^bigtangle-ts/dist/net/bigtangle/crypto/KeyCrypterScrypt\\.js$": "<rootDir>/../bigtangle-ts/dist/net/bigtangle/crypto/KeyCrypterScrypt.js"
    }
  }
}
```

For production, update these mappings to point to `node_modules/bigtangle-ts`.

## Usage

### WalletHelper

The `WalletHelper.ts` provides wallet creation utilities:

```typescript
import { createBigtangleWallet, getDefaultContextRoot } from '#/screens/wallet/WalletHelper'

// Create wallet from wallet file
const wallet = await createBigtangleWallet(walletFile, getDefaultContextRoot())

// Use wallet methods
const tokens = await wallet.calculateAllSpendCandidatesUTXO(aesKey)
await wallet.payToList(aesKey, addressMap, tokenId, memo)
```

### Default Context Root

```typescript
// Development/Testing
const contextRoot = 'http://localhost:8088/'
```

## Switching Between Development and Production

### To Development (Local Library)

1. Update `package.json`:
   ```json
   "bigtangle-ts": "file:../bigtangle-ts"
   ```

2. Create symlink:
   ```bash
   rm -rf node_modules/bigtangle-ts && ln -s ../../bigtangle-ts node_modules/bigtangle-ts
   ```

### To Production (NPM Package)

1. Update `package.json`:
   ```json
   "bigtangle-ts": "^1.0.2"
   ```

2. Create a patch file `patches/bigtangle-ts+1.0.2.patch` if the npm package doesn't have the `./dist/*` exports:
   ```diff
   diff --git a/package.json b/package.json
   --- a/package.json
   +++ b/package.json
   @@ -6,10 +6,14 @@
      "exports": {
        ".": {
          "import": "./dist/index.js",
          "types": "./dist/index.d.ts"
   +    },
   +    "./dist/*": {
   +      "import": "./dist/*",
   +      "require": "./dist/*"
        }
      },
   ```

3. Install:
   ```bash
   yarn install
   ```

4. Update Jest moduleNameMapper in `package.json` to use `node_modules` paths.

### Important: bigtangle-ts package.json exports

The bigtangle-ts package must have `./dist/*` exports for submodule imports to work:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./dist/*": {
      "import": "./dist/*",
      "require": "./dist/*"
    }
  }
}
```

For local development, this was added directly to `/home/jcui/git/bigtangle-ts/package.json`.
For production, create a patch file or ensure the npm package includes these exports.


pkill -f "yarn web" 2>/dev/null;

rm -rf node_modules/bigtangle-ts && yarn add file:/home/jcui/git/bigtangle-ts

yarn test src/screens/wallet/__tests__/hdwallet.test.ts