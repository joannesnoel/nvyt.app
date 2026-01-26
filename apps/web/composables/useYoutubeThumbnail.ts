/**
 * Extract video ID from various YouTube URL formats and return thumbnail URL
 */
export function useYoutubeThumbnail() {
  /**
   * Extract YouTube video ID from URL
   * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/embed/
   */
  function getVideoId(url: string | null | undefined): string | null {
    if (!url) return null

    // Match various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/, // Just the video ID
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match?.[1]) {
        return match[1]
      }
    }

    return null
  }

  /**
   * Get YouTube thumbnail URL from video URL
   * Returns maxresdefault (1280x720, 16:9) for best quality without letterbox bars
   */
  function getThumbnailUrl(videoUrl: string | null | undefined): string | null {
    const videoId = getVideoId(videoUrl)
    if (!videoId) return null

    // Use maxresdefault (1280x720, 16:9) - no black bars, matches aspect-video
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }

  /**
   * Get fallback thumbnail URL (lower quality but always available, 16:9)
   */
  function getFallbackThumbnailUrl(videoUrl: string | null | undefined): string | null {
    const videoId = getVideoId(videoUrl)
    if (!videoId) return null

    // mqdefault (320x180, 16:9) - always available, no black bars
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  }

  /**
   * Get the best available image for an event with fallback support
   * Priority: thumbnailImage > coverImage > YouTube thumbnail
   * Returns object with src and fallback for YouTube thumbnails
   */
  function getEventImage(event: { thumbnailImage?: string | null; coverImage?: string | null; promoVideoUrl?: string | null }): {
    src: string
    fallback?: string
    isYoutube: boolean
  } | null {
    // Priority 1: Thumbnail image (for cards/lists)
    if (event.thumbnailImage) {
      return {
        src: event.thumbnailImage,
        isYoutube: false,
      }
    }

    // Priority 2: Cover image (fallback)
    if (event.coverImage) {
      return {
        src: event.coverImage,
        isYoutube: false,
      }
    }

    // Priority 3: YouTube thumbnail (last resort)
    const thumbnailUrl = getThumbnailUrl(event.promoVideoUrl)
    if (thumbnailUrl) {
      return {
        src: thumbnailUrl,
        fallback: getFallbackThumbnailUrl(event.promoVideoUrl) ?? undefined,
        isYoutube: true,
      }
    }

    return null
  }

  return {
    getVideoId,
    getThumbnailUrl,
    getFallbackThumbnailUrl,
    getEventImage,
  }
}
