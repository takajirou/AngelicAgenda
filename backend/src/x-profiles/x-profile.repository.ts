import type { XProfile } from './x-profile.model.js';

export abstract class XProfileRepository {
  abstract findByUsername(username: string): Promise<XProfile | undefined>;

  abstract upsert(profile: XProfile): Promise<XProfile>;
}
