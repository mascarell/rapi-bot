import { S3ClientConfig, S3 } from "@aws-sdk/client-s3";

export const s3ClientConfig: S3ClientConfig = {
    forcePathStyle: false,
    endpoint: "https://sfo3.digitaloceanspaces.com",
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.S3ACCESSKEYID as string,
        secretAccessKey: process.env.S3SECRETKEY as string
    }
};

export const s3Client = new S3(s3ClientConfig);
export const CDN_DOMAIN_URL = process.env.CDN_DOMAIN_URL as string;
export const S3_BUCKET = process.env.S3BUCKET as string; 