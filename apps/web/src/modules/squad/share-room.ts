export const shareRoom = async (code: string): Promise<'shared' | 'copied' | 'failed'> => {
  const url = `${window.location.origin}/squad/join?code=${code}`
  const text = `Join my Makan Squad room on LoBangers. Code: ${code}`
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: `Room ${code}`, text, url })
      return 'shared'
    }
    await navigator.clipboard.writeText(`${text} ${url}`)
    return 'copied'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    return 'failed'
  }
}
