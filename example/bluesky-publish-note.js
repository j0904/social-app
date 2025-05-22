'use strict'
// Example: Login to Bluesky and publish a note using the AT Protocol API
// Requires: yarn install axios
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value)
          })
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value))
        } catch (e) {
          reject(e)
        }
      }
      function rejected(value) {
        try {
          step(generator.throw(value))
        } catch (e) {
          reject(e)
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected)
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next())
    })
  }
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1]
          return t[1]
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create(
        (typeof Iterator === 'function' ? Iterator : Object).prototype,
      )
    return (
      (g.next = verb(0)),
      (g.throw = verb(1)),
      (g.return = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this
        }),
      g
    )
    function verb(n) {
      return function (v) {
        return step([n, v])
      }
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.')
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y.return
                  : op[0]
                  ? y.throw || ((t = y.return) && t.call(y), 0)
                  : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t
          if (((y = 0), t)) op = [op[0] & 2, t.value]
          switch (op[0]) {
            case 0:
            case 1:
              t = op
              break
            case 4:
              _.label++
              return {value: op[1], done: false}
            case 5:
              _.label++
              y = op[1]
              op = [0]
              continue
            case 7:
              op = _.ops.pop()
              _.trys.pop()
              continue
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0
                continue
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1]
                break
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1]
                t = op
                break
              }
              if (t && _.label < t[2]) {
                _.label = t[2]
                _.ops.push(op)
                break
              }
              if (t[2]) _.ops.pop()
              _.trys.pop()
              continue
          }
          op = body.call(thisArg, _)
        } catch (e) {
          op = [6, e]
          y = 0
        } finally {
          f = t = 0
        }
      if (op[0] & 5) throw op[1]
      return {value: op[0] ? op[1] : void 0, done: true}
    }
  }
Object.defineProperty(exports, '__esModule', {value: true})
var axios_1 = require('axios')
var BLUESKY_API = 'https://bsky.social'
var HANDLE = 'bigtangle.bsky.social' // Replace with your handle
var PASSWORD = 'hw6v-tsj6-oxjn-ouwp' // Use an App Password, not your main password
function login(handle, password) {
  return __awaiter(this, void 0, void 0, function () {
    var res
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          return [
            4 /*yield*/,
            axios_1.default.post(
              ''.concat(BLUESKY_API, '/xrpc/com.atproto.server.createSession'),
              {
                identifier: handle,
                password: password,
              },
            ),
          ]
        case 1:
          res = _a.sent()
          return [2 /*return*/, {token: res.data.accessJwt, did: res.data.did}]
      }
    })
  })
}
function publishNote(token, did, text) {
  return __awaiter(this, void 0, void 0, function () {
    var now, res
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          now = new Date().toISOString()
          return [
            4 /*yield*/,
            axios_1.default.post(
              ''.concat(BLUESKY_API, '/xrpc/com.atproto.repo.createRecord'),
              {
                repo: did,
                collection: 'app.bsky.feed.post',
                record: {
                  $type: 'app.bsky.feed.post',
                  text: text,
                  createdAt: now,
                },
              },
              {
                headers: {Authorization: 'Bearer '.concat(token)},
              },
            ),
          ]
        case 1:
          res = _a.sent()
          return [2 /*return*/, res.data]
      }
    })
  })
}
function listAllNotes(token, did) {
  return __awaiter(this, void 0, void 0, function () {
    var res
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          return [
            4 /*yield*/,
            axios_1.default.get(
              ''.concat(BLUESKY_API, '/xrpc/com.atproto.repo.listRecords'),
              {
                params: {
                  repo: did,
                  collection: 'app.bsky.feed.post',
                  limit: 100, // adjust as needed
                },
                headers: {Authorization: 'Bearer '.concat(token)},
              },
            ),
          ]
        case 1:
          res = _a.sent()
          return [2 /*return*/, res.data.records]
      }
    })
  })
}
function uploadVideo(token, did, videoPath) {
  return __awaiter(this, void 0, void 0, function () {
    var videoData, res
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          videoData = require('fs').readFileSync(videoPath)
          return [
            4 /*yield*/,
            axios_1.default.post(
              ''.concat(BLUESKY_API, '/xrpc/com.atproto.repo.uploadBlob'),
              videoData,
              {
                headers: {
                  Authorization: 'Bearer '.concat(token),
                  'Content-Type': 'application/octet-stream',
                },
              },
            ),
          ]
        case 1:
          res = _a.sent()
          return [2 /*return*/, res.data.blob]
      }
    })
  })
}
function publishVideo(token, did, text, videoPath) {
  return __awaiter(this, void 0, void 0, function () {
    var now, videoBlob, res
    return __generator(this, function (_a) {
      switch (_a.label) {
        case 0:
          now = new Date().toISOString()
          return [4 /*yield*/, uploadVideo(token, did, videoPath)]
        case 1:
          videoBlob = _a.sent()
          return [
            4 /*yield*/,
            axios_1.default.post(
              ''.concat(BLUESKY_API, '/xrpc/com.atproto.repo.createRecord'),
              {
                repo: did,
                collection: 'app.bsky.feed.post',
                record: {
                  $type: 'app.bsky.feed.post',
                  text: text,
                  createdAt: now,
                  embed: {
                    $type: 'app.bsky.embed.video',
                    video: videoBlob,
                  },
                },
              },
              {
                headers: {Authorization: 'Bearer '.concat(token)},
              },
            ),
          ]
        case 2:
          res = _a.sent()
          return [2 /*return*/, res.data]
      }
    })
  })
}
;(function () {
  return __awaiter(void 0, void 0, void 0, function () {
    var _a, token, did, note, videoNote, notes, err_1
    var _b
    return __generator(this, function (_c) {
      switch (_c.label) {
        case 0:
          _c.trys.push([0, 5, , 6])
          return [4 /*yield*/, login(HANDLE, PASSWORD)]
        case 1:
          ;(_a = _c.sent()), (token = _a.token), (did = _a.did)
          return [
            4 /*yield*/,
            publishNote(token, did, 'Hello from the Bluesky API!'),
          ]
        case 2:
          note = _c.sent()
          console.log('Note published:', note)
          return [
            4 /*yield*/,
            publishVideo(
              token,
              did,
              'Check out this video!',
              'E:/MiscE/VSCODE/BigTangle/social-app/social-app-1/ForBiggerEscapes.mp4',
            ),
          ]
        case 3:
          videoNote = _c.sent()
          console.log('Video note published:', videoNote)
          return [4 /*yield*/, listAllNotes(token, did)]
        case 4:
          notes = _c.sent()
          console.log('All published notes:')
          notes.forEach(function (n, i) {
            console.log(
              ''
                .concat(i + 1, '. ')
                .concat(n.value.text, ' (createdAt: ')
                .concat(n.value.createdAt, ')'),
            )
          })
          return [3 /*break*/, 6]
        case 5:
          err_1 = _c.sent()
          console.error(
            'Error:',
            ((_b = err_1.response) === null || _b === void 0
              ? void 0
              : _b.data) || err_1.message,
          )
          return [3 /*break*/, 6]
        case 6:
          return [2 /*return*/]
      }
    })
  })
})()
