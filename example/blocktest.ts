import axios from 'axios'
import * as zlib from 'zlib'

export async function post(url: string, data: Buffer): Promise<Buffer> {
  console.debug('start:', url)

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/octet-stream; charset=utf-8',
      },
      responseType: 'arraybuffer', // crucial for binary data
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Server: ${url} HTTP Error: ${response.status} ${response.statusText}`,
      )
    }

    const decompressed = zlib.gunzipSync(Buffer.from(response.data))
    checkResponse(decompressed, url)
    return decompressed
  } catch (err) {
    console.error('POST error:', err)
    throw err
  }
}

function checkResponse(resp: Buffer, url: string): void {
  if (!resp) return

  let result: Record<string, any>

  result = JSON.parse(resp.toString('utf8'))

  const errorCode = result.errorcode
  if (errorCode != null && typeof errorCode === 'number' && errorCode > 0) {
    const message = result.message
    if (!message) {
      throw new Error(`Server: ${url} Server Error: ${errorCode}`)
    } else {
      throw new Error(`Server: ${url} Server Error: ${message}`)
    }
  }
}
