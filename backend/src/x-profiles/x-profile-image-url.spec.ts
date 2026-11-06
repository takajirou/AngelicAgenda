import { describe, expect, it } from 'vitest';
import { toHighResolutionXProfileImageUrl } from './x-profile-image-url.js';

describe('toHighResolutionXProfileImageUrl', () => {
  it('Xのnormalプロフィール画像を400x400版へ変換する', () => {
    expect(
      toHighResolutionXProfileImageUrl(
        'https://pbs.twimg.com/profile_images/987654321/icon_normal.jpg',
      ),
    ).toBe('https://pbs.twimg.com/profile_images/987654321/icon_400x400.jpg');
  });

  it('クエリ文字列を保持する', () => {
    expect(
      toHighResolutionXProfileImageUrl(
        'https://pbs.twimg.com/profile_images/987654321/icon_normal.png?format=png',
      ),
    ).toBe(
      'https://pbs.twimg.com/profile_images/987654321/icon_400x400.png?format=png',
    );
  });

  it.each([
    'https://pbs.twimg.com/profile_images/987654321/icon_400x400.jpg',
    'https://example.com/profile_images/987654321/icon_normal.jpg',
    'not-a-url',
  ])('対象外のURLは変更しない: %s', (url) => {
    expect(toHighResolutionXProfileImageUrl(url)).toBe(url);
  });
});
