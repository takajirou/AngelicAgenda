import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class XNotificationDataDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  uri?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  lang?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  scribe_target?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  impression_id?: string;
}

export class XNotificationWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  body?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  timestamp?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  tag?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => XNotificationDataDto)
  data?: XNotificationDataDto;
}

export class ListTweetContentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
