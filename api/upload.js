import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const chunks = [];
    let totalSize = 0;

    for await (const chunk of req) {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) {
        return res.status(413).json({ error: 'File too large — maximum 20MB' });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const filename = `${Date.now()}_${req.headers['x-filename'] || 'upload'}`;
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    await s3.send(new PutObjectCommand({
      Bucket: 'carlisle-uploads',
      Key: filename,
      Body: buffer,
      ContentType: contentType,
    }));

    res.status(200).json({ 
      url: `${process.env.R2_PUBLIC_URL}/${filename}` 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};