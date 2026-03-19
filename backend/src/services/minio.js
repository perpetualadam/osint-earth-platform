import { Client } from "minio";

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_PORT || "9000", 10),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER || "osint_minio",
  secretKey: process.env.MINIO_ROOT_PASSWORD || "changeme_minio_password",
});

export const BUCKETS = {
  tiles: process.env.MINIO_BUCKET_TILES || "tiles",
  snapshots: process.env.MINIO_BUCKET_SNAPSHOTS || "snapshots",
  exports: process.env.MINIO_BUCKET_EXPORTS || "exports",
};
