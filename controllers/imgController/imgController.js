const multer = require('multer');
const os = require('os');
const path = require('path');
const tmp = require('tmp');
const fs = require('fs');
const { execFile } = require('child_process');
const { uploadFileToS3 } = require('../../utils/s3Upload');
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

// Configuración de multer para almacenamiento temporal local
const upload = multer({ dest: os.tmpdir() });

// Middleware/handler para subir imagen, optimizar con Squoosh y subir a S3
exports.uploadImageOptimizedS3 = [
  upload.single('file'),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No se subió ningún archivo' });

      // Genera un archivo temporal para la imagen webp optimizada
      const webpPath = tmp.tmpNameSync({ postfix: '.webp' });

      // Ejecuta squoosh-cli para convertir y optimizar a webp
      await new Promise((resolve, reject) => {
        execFile(
          'squoosh-cli',
          [
            file.path,
            '--webp',
            '{"quality":80}',
            '-d',
            path.dirname(webpPath)
          ],
          (error, stdout, stderr) => {
            if (error) return reject(error);
            resolve();
          }
        );
      });

      // El archivo convertido tendrá el mismo nombre base pero con .webp
      const webpFileName = path.basename(file.path, path.extname(file.path)) + '.webp';
      const webpFullPath = path.join(path.dirname(webpPath), webpFileName);

      // Sube el archivo webp optimizado a S3
      const result = await uploadFileToS3(webpFullPath, webpFileName, BUCKET_NAME);

      // Borra los archivos temporales
      fs.unlinkSync(file.path);
      fs.unlinkSync(webpFullPath);

      res.json({ imageUrl: result.Location });
    } catch (err) {
      res.status(500).json({ error: 'Error al procesar o subir la imagen a S3' });
    }
  }
];
