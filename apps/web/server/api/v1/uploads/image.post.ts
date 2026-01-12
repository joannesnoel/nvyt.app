// Image upload endpoint
// Accepts multipart form data with an image file
// Returns the URL of the uploaded image

import { uploadFile, isStorageConfigured } from '~/server/utils/storage'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await getUserFromEvent(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'You must be logged in to upload images',
    })
  }

  // Check if storage is configured
  if (!isStorageConfigured()) {
    throw createError({
      statusCode: 503,
      message: 'Image storage is not configured',
    })
  }

  // Parse multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No file uploaded',
    })
  }

  // Find the image file in form data
  const imageFile = formData.find((item) => item.name === 'image' || item.name === 'file')
  if (!imageFile || !imageFile.data) {
    throw createError({
      statusCode: 400,
      message: 'No image file found in request',
    })
  }

  // Get content type
  const contentType = imageFile.type || 'application/octet-stream'

  // Validate file type
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw createError({
      statusCode: 400,
      message: `Invalid file type: ${contentType}. Allowed types: ${ALLOWED_TYPES.join(', ')}`,
    })
  }

  // Validate file size
  if (imageFile.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    })
  }

  // Get optional folder from form data
  const folderField = formData.find((item) => item.name === 'folder')
  const folder = folderField?.data?.toString() || 'images'

  // Upload to S3
  const result = await uploadFile(imageFile.data, {
    filename: imageFile.filename,
    contentType,
    folder,
  })

  if (!result.success) {
    throw createError({
      statusCode: 500,
      message: result.error || 'Failed to upload image',
    })
  }

  return successResponse({
    url: result.url,
    key: result.key,
  })
})
