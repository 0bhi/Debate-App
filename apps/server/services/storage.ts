import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";
import { logger } from "../utils/logger";

export class StorageService {
  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true, // Required for R2 and some S3-compatible services
    });
  }

  async uploadAudio(
    buffer: Buffer,
    filename: string,
    contentType: string = "audio/mpeg"
  ): Promise<string> {
    const key = `audio/${Date.now()}-${filename}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000", // 1 year cache
        })
      );

      const url = `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

      logger.info("Audio uploaded to storage", {
        key,
        url,
        size: buffer.length,
        contentType,
      });

      return url;
    } catch (error) {
      logger.error("Failed to upload audio", { error, key });
      throw error;
    }
  }

  async uploadVideo(
    buffer: Buffer,
    filename: string,
    contentType: string = "video/mp4"
  ): Promise<string> {
    const key = `videos/${Date.now()}-${filename}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000",
        })
      );

      const url = `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

      logger.info("Video uploaded to storage", {
        key,
        url,
        size: buffer.length,
        contentType,
      });

      return url;
    } catch (error) {
      logger.error("Failed to upload video", { error, key });
      throw error;
    }
  }

  async getSignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
      });

      const url = await getSignedUrl(this.s3, command, { expiresIn });

      logger.debug("Generated signed URL", { key, expiresIn });

      return url;
    } catch (error) {
      logger.error("Failed to generate signed URL", { error, key });
      throw error;
    }
  }
}

export const storageService = new StorageService();
