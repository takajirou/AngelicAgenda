const X_PROFILE_IMAGE_HOST = 'pbs.twimg.com';
const X_PROFILE_IMAGE_PATH_PREFIX = '/profile_images/';

/**
 * X APIは通常48px相当の`_normal`画像を返すため、Retina表示でも十分な
 * 400x400版へ切り替える。Xのプロフィール画像以外のURLは変更しない。
 */
export function toHighResolutionXProfileImageUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return value;
  }

  if (
    url.hostname !== X_PROFILE_IMAGE_HOST ||
    !url.pathname.startsWith(X_PROFILE_IMAGE_PATH_PREFIX)
  ) {
    return value;
  }

  const highResolutionPath = url.pathname.replace(
    /_normal(?=\.[^./]+$)/,
    '_400x400',
  );

  if (highResolutionPath === url.pathname) return value;

  url.pathname = highResolutionPath;
  return url.toString();
}
