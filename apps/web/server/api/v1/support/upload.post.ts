import { uploadFile, isStorageConfigured } from '~/server/utils/storage'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export default defineEventHandler(async (event) => {
  if (!isStorageConfigured()) {
    throw createError({ statusCode: 503, message: 'File storage is not configured' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const fileField = formData.find((item) => item.name === 'file' || item.name === 'image')
  if (!fileField || !fileField.data) {
    throw createError({ statusCode: 400, message: 'No file found in request' })
  }

  const contentType = fileField.type || 'application/octet-stream'

  if (!ALLOWED_TYPES.includes(contentType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid file type: ${contentType}`,
    })
  }

  if (fileField.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    })
  }

  const result = await uploadFile(fileField.data, {
    filename: fileField.filename,
    contentType,
    folder: 'support-attachments',
  })

  if (!result.success) {
    throw createError({ statusCode: 500, message: result.error || 'Failed to upload file' })
  }

  return successResponse({
    url: result.url,
    key: result.key,
    filename: fileField.filename,
    contentType,
    size: fileField.data.length,
  })
})
