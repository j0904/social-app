"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var bip32_1 = require("bip32");
var ecc = require("tiny-secp256k1");
var bip32 = (0, bip32_1.BIP32Factory)(ecc);
var bip39 = require("bip39");
var bitcoin = require("bitcoinjs-lib");
var bitcoinjs_lib_1 = require("bitcoinjs-lib");
var crypto = require("crypto");
var fs = require("fs");
// Generate a new HD wallet
function createHDWallet() {
    return __awaiter(this, void 0, void 0, function () {
        var mnemonic, seed, root;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mnemonic = bip39.generateMnemonic(256);
                    return [4 /*yield*/, bip39.mnemonicToSeed(mnemonic)];
                case 1:
                    seed = _a.sent();
                    root = bip32.fromSeed(Buffer.from(seed), bitcoinjs_lib_1.networks.bitcoin);
                    return [2 /*return*/, { mnemonic: mnemonic, seed: seed, root: root }];
            }
        });
    });
}
// Encrypt and save to file
function saveWalletToFile(walletData, filePath, password) {
    // Convert wallet data to JSON
    var walletJson = JSON.stringify({
        mnemonic: walletData.mnemonic,
        xpriv: walletData.root.toBase58(), // Serialized extended private key
    });
    // Encryption
    var iv = crypto.randomBytes(16);
    var salt = crypto.randomBytes(16);
    var key = crypto.scryptSync(password, salt, 32);
    var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    var encrypted = cipher.update(walletJson, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    var authTag = cipher.getAuthTag().toString('hex');
    // Save encrypted data
    fs.writeFileSync(filePath, JSON.stringify({
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag,
    }));
    console.log("Wallet saved securely to ".concat(filePath));
}
function loadWalletFromFile(filePath, password) {
    // Read encrypted file
    var fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // Prepare decryption
    var iv = Buffer.from(fileData.iv, 'hex');
    var salt = Buffer.from(fileData.salt, 'hex');
    var key = crypto.scryptSync(password, salt, 32);
    var decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(fileData.authTag, 'hex'));
    // Decrypt
    var decrypted = decipher.update(fileData.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    var walletData = JSON.parse(decrypted);
    // Reconstruct HD wallet
    var root = bip32.fromBase58(walletData.xpriv, bitcoinjs_lib_1.networks.bitcoin);
    return {
        mnemonic: walletData.mnemonic,
        root: root,
    };
}
function encryptWithPublicKey(text, publicKey) {
    var eph = crypto.createECDH('secp256k1');
    eph.generateKeys();
    var sharedSecret = eph.computeSecret(publicKey);
    var derivedKey = crypto.hkdfSync('sha256', sharedSecret, '', '', 32);
    var iv = crypto.randomBytes(16);
    var cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(derivedKey), iv);
    var encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    var authTag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({
        ephemeralPublicKey: eph.getPublicKey().toString('hex'),
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag,
    });
}
function decryptWithPrivateKey(encryptedData, privateKey) {
    var data = JSON.parse(encryptedData);
    var ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(privateKey);
    var sharedSecret = ecdh.computeSecret(Buffer.from(data.ephemeralPublicKey, 'hex'));
    var derivedKey = crypto.hkdfSync('sha256', sharedSecret, '', '', 32);
    var iv = Buffer.from(data.iv, 'hex');
    var decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(derivedKey), iv);
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex')); // ✅ this was commented out
    var decrypted = decipher.update(data.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var wallet, password, loadedWallet, path, derivedKey, address, testMessage, encrypted, decrypted, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, createHDWallet()];
                case 1:
                    wallet = _a.sent();
                    console.log('New wallet mnemonic:', wallet.mnemonic);
                    password = 'strong-password-123';
                    saveWalletToFile({ mnemonic: wallet.mnemonic, root: wallet.root }, './wallet.enc', password);
                    loadedWallet = loadWalletFromFile('./wallet.enc', password);
                    console.log('Recovered mnemonic:', loadedWallet.mnemonic);
                    path = "m/84'/0'/0'/0/0";
                    derivedKey = loadedWallet.root.derivePath(path);
                    address = bitcoin.payments.p2wpkh({
                        pubkey: Buffer.from(derivedKey.publicKey),
                        network: bitcoin.networks.bitcoin,
                    }).address;
                    testMessage = 'This is a secret message!';
                    console.log('\nOriginal message:', testMessage);
                    encrypted = encryptWithPublicKey(testMessage, Buffer.from(derivedKey.publicKey));
                    console.log('Encrypted message:', encrypted);
                    // Decrypt with private key
                    if (!derivedKey.privateKey) {
                        throw new Error('Cannot decrypt - no private key available');
                    }
                    decrypted = decryptWithPrivateKey(encrypted, Buffer.from(derivedKey.privateKey));
                    console.log('Decrypted message:', decrypted);
                    console.log('\n=== Wallet Demo Results ===');
                    console.log('Generated mnemonic:', wallet.mnemonic);
                    console.log('Recovered mnemonic:', loadedWallet.mnemonic);
                    console.log('Derived Bitcoin address:', address);
                    console.log('Encryption/Decryption test:', testMessage === decrypted ? 'SUCCESS' : 'FAILED');
                    console.log('===========================');
                    return [3 /*break*/, 3];
                case 2:
                    err_1 = _a.sent();
                    console.error('Error:', err_1);
                    process.exit(1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error);
//# sourceMappingURL=hdwallet.js.map