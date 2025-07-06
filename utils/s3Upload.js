const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

/**
 * Sube un archivo a S3 usando AWS SDK v3.
 * @param {string} filePath - Ruta local del archivo.
 * @param {string} fileName - Nombre del archivo en S3 (incluye carpeta, ej: uploads/archivo.webp).
 * @param {string} bucketName - Nombre del bucket.
 * @returns {Promise<{ Location: string }>} - URL pública del archivo subido.
 */
exports.uploadFileToS3 = async (filePath, fileName, bucketName) => {
  const fileBuffer = fs.readFileSync(filePath);
  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: fileBuffer,
    ContentType: 'image/webp',
    ACL: 'public-read'
  };
  await s3.send(new PutObjectCommand(params));
  // Construye la URL pública manualmente
  const region = process.env.AWS_REGION;
  const url = `https://${bucketName}.s3.${region}.amazonaws.com/${fileName}`;
  return { Location: url };
};
