const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

exports.uploadFileToS3 = (filePath, fileName, bucketName) => {
  const fileContent = fs.readFileSync(filePath);
  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: fileContent,
    ACL: 'public-read', // Opcional: para que la imagen sea pública
  };
  return s3.upload(params).promise();
};
