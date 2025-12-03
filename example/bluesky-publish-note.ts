// Example: Login to Bluesky and publish a note using the AT Protocol API
// Requires: yarn install axios

import axios from 'axios'

const BLUESKY_API = 'https://bsky.social'
const HANDLE: string = 'bigtangle.bsky.social' // Replace with your handle
const PASSWORD: string = 'hw6v-tsj6-oxjn-ouwp' // Use an App Password, not your main password

interface LoginResponse {
  token: string
  did: string
}

interface NoteRecord {
  value: {
    text: string
    createdAt: string
  }
}

async function login(handle: string, password: string): Promise<LoginResponse> {
  const res = await axios.post(
    `${BLUESKY_API}/xrpc/com.atproto.server.createSession`,
    {
      identifier: handle,
      password: password,
    },
  )
  return {token: res.data.accessJwt, did: res.data.did}
}

async function publishNote(
  token: string,
  did: string,
  text: string,
): Promise<any> {
  const now = new Date().toISOString()
  const res = await axios.post(
    `${BLUESKY_API}/xrpc/com.atproto.repo.createRecord`,
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
      headers: {Authorization: `Bearer ${token}`},
    },
  )
  return res.data
}

async function listAllNotes(token: string, did: string): Promise<NoteRecord[]> {
  const res = await axios.get(
    `${BLUESKY_API}/xrpc/com.atproto.repo.listRecords`,
    {
      params: {
        repo: did,
        collection: 'app.bsky.feed.post',
        limit: 100, // adjust as needed
      },
      headers: {Authorization: `Bearer ${token}`},
    },
  )
  return res.data.records
}

async function uploadVideo(
  token: string,
  did: string,
  videoPath: string,
): Promise<string> {
  const videoData = require('fs').readFileSync(videoPath)
  const res = await axios.post(
    `${BLUESKY_API}/xrpc/com.atproto.repo.uploadBlob`,
    videoData,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
    },
  )
  return res.data.blob
}

async function publishVideo(
  token: string,
  did: string,
  text: string,
  videoPath: string,
): Promise<any> {
  const now = new Date().toISOString()
  const videoBlob = await uploadVideo(token, did, videoPath)
  const res = await axios.post(
    `${BLUESKY_API}/xrpc/com.atproto.repo.createRecord`,
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
      headers: {Authorization: `Bearer ${token}`},
    },
  )
  return res.data
}

;(async () => {
  try {
    const {token, did} = await login(HANDLE, PASSWORD)

    // Publish a text note
    const note = await publishNote(token, did, 'Hello from the Bluesky API!')
    console.log('Note published:', note)

    // Publish a video note
    const videoNote = await publishVideo(
      token,
      did,
      'Check out this video!',
      'E:/MiscE/VSCODE/BigTangle/social-app/social-app-1/ForBiggerEscapes.mp4',
    )
    console.log('Video note published:', videoNote)

    // List all notes
    const notes = await listAllNotes(token, did)
    console.log('All published notes:')
    notes.forEach((n, i) => {
      console.log(`${i + 1}. ${n.value.text} (createdAt: ${n.value.createdAt})`)
    })
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message)
  }
})()
