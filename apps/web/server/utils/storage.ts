// S3-compatible storage utility (works with AWS S3, MinIO, Garage, etc.)
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { nanoid } from 'nanoid'

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (s3Client) return s3Client

  const config = useRuntimeConfig()

  // For AWS S3: only region and bucket are required (uses IAM role)
  // For S3-compatible services (MinIO, Garage): endpoint and access keys are required
  const isAwsS3 = !config.s3Endpoint || (config.s3Endpoint as string).includes('amazonaws.com')

  if (isAwsS3) {
    // Use AWS S3 with IAM role credentials (default credential provider)
    if (!config.s3Region) {
      throw new Error('S3 storage not configured: S3_REGION is required')
    }
    s3Client = new S3Client({
      region: config.s3Region as string,
      // No explicit credentials - uses IAM role from ECS task
    })
  } else {
    // Use S3-compatible service with explicit credentials
    if (!config.s3Endpoint || !config.s3AccessKeyId || !config.s3SecretAccessKey) {
      throw new Error('S3 storage not configured: endpoint and credentials required for S3-compatible services')
    }
    s3Client = new S3Client({
      endpoint: config.s3Endpoint as string,
      region: config.s3Region as string || 'garage',
      credentials: {
        accessKeyId: config.s3AccessKeyId as string,
        secretAccessKey: config.s3SecretAccessKey as string,
      },
      forcePathStyle: true, // Required for Garage, MinIO, and other S3-compatible services
    })
  }

  return s3Client
}

export function isStorageConfigured(): boolean {
  const config = useRuntimeConfig()
  const isAwsS3 = !config.s3Endpoint || (config.s3Endpoint as string).includes('amazonaws.com')

  if (isAwsS3) {
    // AWS S3 with IAM role - only need region and bucket
    return !!(config.s3Region && config.s3Bucket)
  }
  // S3-compatible services need endpoint and credentials
  return !!(config.s3Endpoint && config.s3AccessKeyId && config.s3SecretAccessKey)
}

export interface UploadResult {
  success: boolean
  key?: string
  url?: string
  error?: string
}

/**
 * Upload a file to S3 storage
 */
export async function uploadFile(
  file: Buffer,
  options: {
    filename?: string
    contentType: string
    folder?: string
  }
): Promise<UploadResult> {
  try {
    const config = useRuntimeConfig()
    const client = getS3Client()
    const bucket = config.s3Bucket as string

    // Generate unique filename
    const ext = options.filename?.split('.').pop() || getExtensionFromMime(options.contentType)
    const key = options.folder
      ? `${options.folder}/${nanoid(12)}.${ext}`
      : `${nanoid(12)}.${ext}`

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file,
        ContentType: options.contentType,
      })
    )

    // Construct URL through proxy to avoid mixed content issues
    // The proxy endpoint serves files over the same HTTPS domain
    const appUrl = config.public.appUrl as string
    const url = `${appUrl}/api/v1/uploads/${key}`

    console.log(`[Storage] Uploaded file: ${key}`)
    return { success: true, key, url }
  } catch (error) {
    console.error('[Storage] Upload error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Delete a file from S3 storage
 */
export async function deleteFile(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const config = useRuntimeConfig()
    const client = getS3Client()
    const bucket = config.s3Bucket as string

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )

    console.log(`[Storage] Deleted file: ${key}`)
    return { success: true }
  } catch (error) {
    console.error('[Storage] Delete error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Check if a file exists in S3 storage
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const config = useRuntimeConfig()
    const client = getS3Client()
    const bucket = config.s3Bucket as string

    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )

    return true
  } catch {
    return false
  }
}

/**
 * Generate a presigned URL for direct upload (useful for large files)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<{ url: string; key: string }> {
  const config = useRuntimeConfig()
  const client = getS3Client()
  const bucket = config.s3Bucket as string

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  const url = await getSignedUrl(client, command, { expiresIn })

  return { url, key }
}

/**
 * Extract key from a full URL
 */
export function getKeyFromUrl(url: string): string | null {
  try {
    const config = useRuntimeConfig()
    const publicUrl = config.public.s3PublicUrl as string

    if (publicUrl && url.startsWith(publicUrl)) {
      return url.replace(`${publicUrl}/`, '')
    }

    // Try to extract from S3-style URL
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    // Remove bucket name from path if present
    if (pathParts[1] === config.s3Bucket) {
      return pathParts.slice(2).join('/')
    }
    return pathParts.slice(1).join('/')
  } catch {
    return null
  }
}

function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
  }
  return mimeToExt[mimeType] || 'bin'
}
