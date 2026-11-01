import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

function NormalizeOptionalString(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value : undefined,
  );
}

function NormalizeOptionalTimestamp(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined,
  );
}

export class XNotificationDataDto {
  @NormalizeOptionalString()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @NormalizeOptionalString()
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

  @NormalizeOptionalString()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  tag?: string;
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

  @NormalizeOptionalTimestamp()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  timestamp?: number;

  @NormalizeOptionalString()
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
