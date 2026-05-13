import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { filename, contentType } = req.query;
  if (!filename || !contentType) return res.status(400).json({ error: 'Missing filename or contentType' });

  const key = `${Date.now()}_${filename}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: 'carlisle-uploads',
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 } // 5 minutes
  );

  res.status(200).json({
    uploadUrl: url,
    publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
  });
}

export const config = { api: { bodyParser: false } };