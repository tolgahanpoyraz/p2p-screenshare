export function originOf(url: string | undefined) {
  try {
    return new URL(url ?? '').origin;
  } catch {
    return null;
  }
}
