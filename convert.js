import fs from 'fs/promises';
import { promisify } from 'util';
import axios from 'axios';
import { exec } from 'child_process';
import path from 'path';

const __dirname = path.resolve();

const sleep = promisify(setTimeout);

const convertImageToVideo = async (url, format) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    const filename = `${Math.random().toString(36)}`;
    const originalFilePath =  `${filename}_original.${format}`
    const mp4FilePath = `${filename}.mp4`
    const logFilePath = `${filename}_conversion.log`

    // Save the original image
    await fs.writeFile(originalFilePath, imageBuffer);

    // Convert image to MP4 using FFmpeg with improved options
    await promisify(exec)(
      `ffmpeg -i ${originalFilePath} -c:v libx264 -crf 20 -movflags faststart -pix_fmt yuv420p -threads 4 -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" ${mp4FilePath} > ${logFilePath} 2>&1`
    );

    // Introduce a 4-second delay
    await sleep(4000);

    // Read the converted video into a buffer
    const videoBuffer = await fs.readFile(mp4FilePath);

    // Save the video file
    const savedVideoPath =`${filename}_saved.mp4` // path.join(__dirname, `${filename}_saved.mp4`);
    await fs.writeFile(savedVideoPath, videoBuffer);
    const padth = savedVideoPath

    // Delete temporary files
    await Promise.all([fs.unlink(originalFilePath), fs.unlink(mp4FilePath), fs.unlink(logFilePath)]);

    return {
      videoBuffer,
      originalFilePath,
      mp4FilePath,
      logFilePath,
      savedVideoPath,
      padth,
    };

    
  } catch (error) {
    console.error('Error during image to video conversion:', error.message);
    throw new Error('Error during image to video conversion.');
  }
};

export { convertImageToVideo };
