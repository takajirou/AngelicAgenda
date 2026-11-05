import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { XProfile } from './x-profile.model.js';
import { XProfileRepository } from './x-profile.repository.js';

interface XProfileRow {
  x_user_id: string;
  username: string;
  display_name: string;
  profile_image_url: string | null;
  fetched_at: Date;
}

@Injectable()
export class PostgresXProfileRepository extends XProfileRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async findByUsername(username: string): Promise<XProfile | undefined> {
    const result = await this.database.query<XProfileRow>(
      `SELECT
         x_user_id,
         username,
         display_name,
         profile_image_url,
         fetched_at
       FROM x_user_profiles
       WHERE lower(username) = lower($1)
       ORDER BY fetched_at DESC
       LIMIT 1`,
      [username],
    );

    const row = result.rows[0];
    return row ? this.mapRow(row) : undefined;
  }

  async upsert(profile: XProfile): Promise<XProfile> {
    const result = await this.database.query<XProfileRow>(
      `INSERT INTO x_user_profiles (
         x_user_id,
         username,
         display_name,
         profile_image_url,
         fetched_at
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (x_user_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         display_name = EXCLUDED.display_name,
         profile_image_url = EXCLUDED.profile_image_url,
         fetched_at = EXCLUDED.fetched_at,
         updated_at = now()
       RETURNING
         x_user_id,
         username,
         display_name,
         profile_image_url,
         fetched_at`,
      [
        profile.xUserId,
        profile.username,
        profile.displayName,
        profile.profileImageUrl,
        profile.fetchedAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to save X user profile');
    }

    return this.mapRow(row);
  }

  private mapRow(row: XProfileRow): XProfile {
    return {
      xUserId: row.x_user_id,
      username: row.username,
      displayName: row.display_name,
      profileImageUrl: row.profile_image_url,
      fetchedAt: row.fetched_at,
    };
  }
}
