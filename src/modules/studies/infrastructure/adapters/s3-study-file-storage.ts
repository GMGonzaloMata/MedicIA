import "server-only";

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

import type { StoredObjectInfo, StudyFileStorage } from "../../application/ports/out/study-file-storage";

type S3Sender = Pick<S3Client, "send">;

// Los errores de S3 se propagan con su tipo y sin datos del estudio: la clave es un identificador opaco y
// el contenido nunca se incluye en un mensaje.
export function createS3StudyFileStorage({ client, bucket }: { client: S3Sender; bucket: string }): StudyFileStorage {
  return {
    async put(key, bytes) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "application/octet-stream",
          ServerSideEncryption: "AES256",
        }),
      );
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async list(prefix) {
      const objects: StoredObjectInfo[] = [];
      let continuationToken: string | undefined;

      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
        );

        for (const object of page.Contents ?? []) {
          if (object.Key && object.LastModified) {
            objects.push({ key: object.Key, lastModified: object.LastModified });
          }
        }

        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);

      return objects;
    },
  };
}
