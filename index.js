import express from 'express';

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import bodyParser from 'body-parser';
import path from 'path';
import util from 'util';  // Import util for formatting
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import clph from 'caliph-api';
import FormData from 'form-data';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  convertImageToVideo
       }from "./convert.js"

const app = express();
const port = 3000; // You can set any port you prefer

// Middleware to parse JSON
app.use(express.json());


// API endpoint to create a collage
app.post('/createCollage', async (req, res) => {
    const { imageUrls, outputCollagePath } = req.body;

    try {
        await createCollage(imageUrls, outputCollagePath);
      const filepath = outputCollagePath//path.join(__dirname, 'output.png');          
      const URL = await uploadToGraphOrg(filepath);
      await fs.unlinkSync(filepath);
      
      res.status(200).json({
          status:true,
          message: 'Collage created successfully!',
          collageURL: URL
      });
      
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post("/convert", async (req, res) => {
  try {
    const imageURL = req.body.imageURL;
    const conversionResult = await convertImageToVideo(imageURL);

    const mp4path = conversionResult.padth;
    console.log(mp4path);

    // Assuming GraphOrg is an asynchronous function that returns a URL
    const URL = await uploadToGraphOrg(mp4path);

    // Send a success response to the client with conversion result and file paths
    res.json({
      status:true,
      message: 'Conversion successful',
      result: URL,
      filePaths: {
        originalFilePath: conversionResult.originalFilePath,
        mp4FilePath: conversionResult.mp4FilePath,
        logFilePath: conversionResult.logFilePath,
        savedVideoPath: conversionResult.savedVideoPath,
      },
    });

  await fs.unlinkSync(mp4path);

  } catch (error) {
    console.error(error);

    // Send an error response to the client with the error message
    return res.status(500).json({  status: false, message: 'Conversion failed', error: error.message });
  }
});



async function downloadAndGetDimensions(url) {
    const { data } = await axios.get(url, {
        responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(data, 'binary');
    const metadata = await sharp(imageBuffer).metadata();
    return metadata;
}

function calculateAutoAspectRatio(gridCols, gridRows) {
    return gridCols / gridRows;
}

// Use 'export' for the main function
async function createCollage(imageUrls, outputCollagePath) {
    let maxImageWidth = 0;
    let maxImageHeight = 0;
    const margin = 10; // Set your desired margin value

    const totalImages = imageUrls.length;

    const imagesMetadata = await Promise.all(imageUrls.map(downloadAndGetDimensions));

    imagesMetadata.forEach(({ width, height }) => {
        maxImageWidth = Math.max(maxImageWidth, width);
        maxImageHeight = Math.max(maxImageHeight, height);
    });

    // Calculate grid dimensions
    const gridCols = 3;
    const gridRows = 4;

    // Calculate auto aspect ratio
    const autoAspectRatio = calculateAutoAspectRatio(gridCols, gridRows);

    // Calculate cell dimensions and margin
  const cellWidth = maxImageWidth + margin;
  const cellHeight = maxImageHeight + margin; 

    // Calculate total width and height based on the grid, cell dimensions, and margin
    const totalWidth = gridCols * cellWidth - margin;
    const totalHeight = gridRows * cellHeight - margin;

    // Use 'import' and 'export' to handle modules
    const collage = sharp({
        create: {
            width: Math.round(totalWidth),
            height: Math.round(totalHeight),
            channels: 3,
            aspectRatio: autoAspectRatio,
            background: {
                r: 255,
                g: 255,
                b: 255,
            },
        },
    });

    const overlayPromises = [];

    // Overlay each image on the canvas with a calculated position and margin
  for (let i = 0; i < totalImages; i++) {
  const col = i % gridCols;
  const row = Math.floor(i / gridCols);

  const x = col * cellWidth;
  const y = row * cellHeight;

  const response = await axios({
      url: imageUrls[i],
      method: 'GET',
      responseType: 'arraybuffer',
  });


        const imageBuffer = Buffer.from(response.data, 'binary');

        // Adjust the image size to fit the cell
          const resizedImageBuffer = await sharp(imageBuffer)
              .resize({
                  width: Math.round(maxImageWidth),
                  height: Math.round(maxImageHeight),
                  fit: 'contain', // Keep the entire image within the specified dimensions
                  position: sharp.strategy.entropy, // Positioning strategy
              })
              .toBuffer();

          overlayPromises.push({
              input: resizedImageBuffer,
              left: Math.round(x),
              top: Math.round(y),
          });
      }

      collage.composite(overlayPromises);

    // Save the collage image to a file
    await collage.toFile(outputCollagePath);
    console.log('Collage created successfully!');
}

// Start the Express server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});







async function uploadToGraphOrg(Path) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(Path)) {
        return reject(new Error("File not found"));
      }

      const graphOrgUrl = "https://graph.org/upload";
      const form = new FormData();
      form.append("file", fs.createReadStream(Path));

      try {
        const response = await axios.post(graphOrgUrl, form, {
          headers: {
            ...form.getHeaders(),
          },
        });

        const imageUrl = "https://graph.org" + response.data[0].src;
        return resolve(imageUrl);
      } catch (uploadError) {
        console.error("Graph.org upload failed. Trying alternative method.");

        // Read the WebM file synchronously
        const media = fs.readFileSync(Path);

        try {
          const caliphResponse = await clph.tools.uploadFile(media);
          const caliphUrl = caliphResponse.result.url_file;

          console.log(caliphResponse);
          return resolve(caliphUrl);
        } catch (caliphError) {
          console.error("Alternative upload method failed:", caliphError);
          return reject(new Error("Both upload methods failed."));
        }
      }
    } catch (err) {
      return reject(new Error(String(err)));
    }
  });
}


