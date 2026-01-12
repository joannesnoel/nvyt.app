// Proxy endpoint to serve images from S3 storage over HTTPS
// This avoids mixed content issues when the main site is HTTPS but storage is HTTP

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (s3Client) return s3Client

  const config = useRuntimeConfig()

  if (!config.s3Endpoint || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
    throw new Error('S3 storage not configured')
  }

  s3Client = new S3Client({
    endpoint: config.s3Endpoint as string,
    region: config.s3Region as string || 'garage',
    credentials: {
      accessKeyId: config.s3AccessKeyId as string,
      secretAccessKey: config.s3SecretAccessKey as string,
    },
    forcePathStyle: true,
  })

  return s3Client
}

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path')

  if (!path) {
    throw createError({
      statusCode: 400,
      message: 'Path is required',
    })
  }

  const config = useRuntimeConfig()
  const client = getS3Client()
  const bucket = config.s3Bucket as string

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: path,
    })

    const response = await client.send(command)

    if (!response.Body) {
      throw createError({
        statusCode: 404,
        message: 'File not found',
      })
    }

    // Set content type
    const contentType = response.ContentType || 'application/octet-stream'
    setHeader(event, 'Content-Type', contentType)

    // Set cache headers (cache for 1 year since filenames are unique)
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

    // Stream the response
    const bytes = await response.Body.transformToByteArray()
    return bytes
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      throw createError({
        statusCode: 404,
        message: 'File not found',
      })
    }
    console.error('[Storage Proxy] Error:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch file',
    })
  }
})
